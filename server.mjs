// Serves the phone page, transcribes recordings and organizes them with OpenAI.
import { File } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import OpenAI, { toFile } from "openai";
import mindwalk from "./app/organize.js";

// The OpenAI SDK uploads through the global File, which Node 18 lacks.
globalThis.File ??= File;

const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "app");
const MAX_JSON_BYTES = 256 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(["m4a", "mp3", "mp4", "ogg", "wav", "webm"]);
const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-sol";
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const TRANSCRIBE_VOCAB = process.env.TRANSCRIBE_VOCAB || "";
const LANGUAGES = new Set(["zh", "en"]);
const MIN_KEY_LENGTH = 16;

const HEAD = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#d9480f"><meta name="apple-mobile-web-app-capable" content="yes">
<link rel="manifest" href="manifest.webmanifest">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box}
*,*::before,*::after{box-sizing:inherit}body{margin:0}[hidden]{display:none!important}</style></head><body>`;

const MANIFEST = JSON.stringify({
  name: "MindWalk",
  short_name: "MindWalk",
  start_url: ".",
  display: "standalone",
  background_color: "#0d1c1e",
  theme_color: "#d9480f",
  icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }],
});

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#d9480f"/><g fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round"><path d="M256 256L130 140M256 256l140-90M256 256l-120 130M256 256l150 110"/></g><circle cx="256" cy="256" r="58" fill="#fff"/></svg>`;

export function createOpenAIBackend(client) {
  async function complete(content, name, schema) {
    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      max_completion_tokens: 16000,
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      messages: [{ role: "user", content }],
    });
    const choice = response.choices[0];
    if (choice?.message.refusal) throw new OrganizeError(422, "refused");
    if (choice?.finish_reason !== "stop" || !choice.message.content) throw new OrganizeError(502, "upstream_error");
    return JSON.parse(choice.message.content);
  }

  return {
    organize: (map, text) => complete(mindwalk.buildPrompt(map, text), "mind_map_update", mindwalk.RESULT_SCHEMA),
    tidy: (map) => complete(mindwalk.buildTidyPrompt(map), "mind_map_tidy", mindwalk.TIDY_SCHEMA),

    // Naming the language and passing the map's words as a prompt are the two
    // cheapest accuracy gains. whisper-1 also reports the audio's length, which
    // lets the page spot gaps.
    async transcribe(audio, extension, type, { language, hint, previous } = {}) {
      const prompt = mindwalk.transcriptionPrompt(language, hint, TRANSCRIBE_VOCAB, previous);
      const result = await client.audio.transcriptions.create({
        file: await toFile(audio, `recording.${extension}`, { type }),
        model: TRANSCRIBE_MODEL,
        response_format: TRANSCRIBE_MODEL === "whisper-1" ? "verbose_json" : "json",
        ...(language && { language }),
        ...(prompt && { prompt }),
      });
      return { text: cleanTranscript(result, prompt), duration: result.duration };
    },
  };
}

// Whisper invents text for silence: video-subtitle credits, "谢谢观看", "you",
// or the prompt read back. Short clips cut at pauses make this common, so drop
// segments Whisper itself marks as non-speech and whole replies that match.
const BARE_HALLUCINATIONS = new Set(["谢谢", "谢谢观看", "谢谢收看", "谢谢大家", "you", "thankyou", "thankyouforwatching", "thanksforwatching", "bye"]);
const HALLUCINATION_PARTS = ["请不吝点赞", "订阅转发", "明镜与点点", "字幕由", "字幕提供", "amaraorg", "likeandsubscribe", "pleasesubscribe"];
const bare = (s) => String(s || "").replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();

export function cleanTranscript(result, prompt = "") {
  let text = String(result.text || "");
  if (Array.isArray(result.segments) && result.segments.length) {
    text = result.segments
      .filter((s) => !(s.no_speech_prob > 0.6 && s.avg_logprob < -1) && !(s.compression_ratio > 2.4))
      .map((s) => s.text)
      .join("");
  }
  text = text.trim();
  const plain = bare(text);
  if (BARE_HALLUCINATIONS.has(plain)) return "";
  if (plain.length < 40 && HALLUCINATION_PARTS.some((part) => plain.includes(part))) return "";
  if (plain.length >= 6 && bare(prompt).includes(plain)) return "";
  return text;
}

function hashKey(key) {
  return createHash("sha256").update(String(key)).digest();
}

class OrganizeError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new OrganizeError(413, "too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  try {
    return JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString("utf8"));
  } catch (error) {
    throw error instanceof OrganizeError ? error : new OrganizeError(400, "bad_request");
  }
}

// The backend is injectable so tests can run without an API key. With an
// accessKey, every /api/ call must carry it in x-access-key (URI-encoded).
export function createServer({ organize, transcribe, tidy, accessKey = "" }) {
  const expected = accessKey ? hashKey(accessKey) : null;
  const allowed = (req) => {
    if (!expected) return true;
    let given;
    try { given = decodeURIComponent(String(req.headers["x-access-key"] || "")); } catch { return false; }
    return Boolean(given) && timingSafeEqual(hashKey(given), expected);
  };

  return http.createServer(async (req, res) => {
    const send = (status, type, body) => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(body);
    };
    const sendJson = (status, value) => send(status, "application/json", JSON.stringify(value));

    try {
      const url = new URL(req.url, "http://localhost");
      const { pathname } = url;
      if (pathname.startsWith("/api/") && !allowed(req)) {
        req.resume();
        return sendJson(401, { code: "locked" });
      }
      if (req.method === "GET" && pathname === "/api/auth") {
        res.writeHead(204, { "cache-control": "no-store" });
        return res.end();
      }
      if (req.method === "GET" && pathname === "/") {
        const page = await readFile(path.join(APP_DIR, "index.html"), "utf8");
        return send(200, "text/html; charset=utf-8", `${HEAD}${page}</body></html>`);
      }
      if (req.method === "GET" && pathname === "/organize.js") {
        return send(200, "text/javascript; charset=utf-8", await readFile(path.join(APP_DIR, "organize.js")));
      }
      if (req.method === "GET" && pathname === "/manifest.webmanifest") {
        return send(200, "application/manifest+json", MANIFEST);
      }
      if (req.method === "GET" && pathname === "/icon.svg") return send(200, "image/svg+xml", ICON);
      if (req.method === "POST" && pathname === "/api/transcribe") {
        const extension = String(req.headers["x-file-extension"]);
        if (!AUDIO_EXTENSIONS.has(extension)) return sendJson(400, { code: "bad_audio" });
        const audio = await readBody(req, MAX_AUDIO_BYTES);
        if (!audio.length) return sendJson(400, { code: "bad_audio" });
        const language = url.searchParams.get("lang");
        return sendJson(200, await transcribe(audio, extension, req.headers["content-type"], {
          language: LANGUAGES.has(language) ? language : undefined,
          hint: (url.searchParams.get("hint") || "").slice(0, 200),
          previous: (url.searchParams.get("prev") || "").slice(-200),
        }));
      }
      if (req.method === "POST" && pathname === "/api/organize") {
        const { map, text } = await readJson(req);
        if (typeof text !== "string" || !text.trim() || !Array.isArray(map?.nodes)) {
          return sendJson(400, { code: "bad_request" });
        }
        return sendJson(200, await organize(map, text));
      }
      if (req.method === "POST" && pathname === "/api/tidy") {
        const { map } = await readJson(req);
        if (!Array.isArray(map?.nodes) || !map.nodes.length) return sendJson(400, { code: "bad_request" });
        return sendJson(200, await tidy(map));
      }
      return sendJson(404, { code: "not_found" });
    } catch (error) {
      if (error instanceof OrganizeError) return sendJson(error.status, { code: error.code });
      if (error instanceof OpenAI.AuthenticationError) return sendJson(503, { code: "no_api_key" });
      if (error instanceof OpenAI.RateLimitError) {
        return sendJson(429, { code: error.code === "insufficient_quota" ? "quota" : "rate_limited" });
      }
      if (error instanceof OpenAI.BadRequestError && req.url.startsWith("/api/transcribe")) {
        return sendJson(400, { code: "bad_audio" });
      }
      console.error(error);
      return sendJson(502, { code: "upstream_error" });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || "127.0.0.1";
  const accessKey = process.env.ACCESS_KEY || "";
  if (accessKey && accessKey.length < MIN_KEY_LENGTH) {
    console.error(`ACCESS_KEY must be at least ${MIN_KEY_LENGTH} characters. Try: openssl rand -hex 16`);
    process.exit(1);
  }
  if (!accessKey && !["127.0.0.1", "localhost", "::1"].includes(host)) {
    console.error(`Set ACCESS_KEY before listening on ${host}, or anyone could spend your API quota.`);
    process.exit(1);
  }
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  const missingKey = async () => {
    throw new OrganizeError(503, "no_api_key");
  };
  const backend = hasKey
    ? createOpenAIBackend(new OpenAI())
    : { organize: missingKey, transcribe: missingKey, tidy: missingKey };
  createServer({ ...backend, accessKey }).listen(port, host, () => {
    console.log(`MindWalk: http://localhost:${port}/`);
    console.log(accessKey ? "Access key required." : "No ACCESS_KEY set: anyone who can reach this server can use it.");
    if (!hasKey) console.log("OPENAI_API_KEY is not set, so transcribing and organizing will fail until you set it.");
  });
}
