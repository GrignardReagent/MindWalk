import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import OpenAI from "openai";
import { cleanTranscript, createOpenAIBackend, createServer } from "../server.mjs";

async function withServer(organize, run, options = {}) {
  const transcribe = async (audio, extension, type, hints) => ({ text: `${audio.length} ${extension}`, duration: 9, hints });
  const tidy = async (map) => ({ nodes: map.nodes });
  const server = createServer({ organize, transcribe, tidy, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    server.close();
  }
}

const post = (base, body) =>
  fetch(`${base}/api/organize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("the page is served as a complete document", async () => {
  await withServer(async () => ({}), async (base) => {
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<script src="organize.js">/);
  });
});

test("a valid request returns the organizer's result", async () => {
  await withServer(async (map, text) => ({ echoed: text }), async (base) => {
    const res = await post(base, { map: { nodes: [] }, text: "hi" });
    assert.deepEqual(await res.json(), { echoed: "hi" });
  });
});

test("an empty note is rejected", async () => {
  await withServer(async () => ({}), async (base) => {
    assert.equal((await post(base, { map: { nodes: [] }, text: "  " })).status, 400);
  });
});

test("audio is transcribed", async () => {
  await withServer(async () => ({}), async (base) => {
    const send = (extension) => fetch(`${base}/api/transcribe`, {
      method: "POST",
      headers: { "content-type": "audio/webm", "x-file-extension": extension },
      body: new Uint8Array(5),
    });
    assert.equal((await send("exe")).status, 400);
    assert.deepEqual(await (await send("webm")).json(), { text: "5 webm", duration: 9, hints: { hint: "", previous: "" } });
    const hinted = await fetch(`${base}/api/transcribe?lang=zh&hint=${encodeURIComponent("跑步")}&prev=${encodeURIComponent("上一句。")}`, {
      method: "POST",
      headers: { "content-type": "audio/webm", "x-file-extension": "webm" },
      body: new Uint8Array(5),
    });
    assert.deepEqual((await hinted.json()).hints, { language: "zh", hint: "跑步", previous: "上一句。" });
  });
});

test("with an access key, the API needs it but the page does not", async () => {
  const key = "长城-correct-horse-battery";
  await withServer(async () => ({ ok: true }), async (base) => {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/api/auth`)).status, 401);
    const wrong = await fetch(`${base}/api/auth`, { headers: { "x-access-key": "nope" } });
    assert.deepEqual([wrong.status, await wrong.json()], [401, { code: "locked" }]);
    const right = { "x-access-key": encodeURIComponent(key) };
    assert.equal((await fetch(`${base}/api/auth`, { headers: right })).status, 204);
    const res = await fetch(`${base}/api/organize`, {
      method: "POST",
      headers: { ...right, "content-type": "application/json" },
      body: JSON.stringify({ map: { nodes: [] }, text: "hi" }),
    });
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal((await fetch(`${base}/api/auth`, { headers: { "x-access-key": "%E0%A4%A" } })).status, 401);
  }, { accessKey: key });
});

test("tidy needs a map with nodes", async () => {
  await withServer(async () => ({}), async (base) => {
    const tidy = (map) => fetch(`${base}/api/tidy`, { method: "POST", body: JSON.stringify({ map }) });
    assert.equal((await tidy({ nodes: [] })).status, 400);
    assert.deepEqual(await (await tidy({ nodes: [{ id: "n1" }] })).json(), { nodes: [{ id: "n1" }] });
  });
});

// A stand-in for the OpenAI API. `models` lists the transcription models it offers.
async function withFakeApi(models, run) {
  const uploads = [];
  let chat = null;
  const fake = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      res.setHeader("content-type", "application/json");
      if (req.url === "/audio/transcriptions") {
        const model = body.match(/name="model"\r\n\r\n([^\r]+)/)[1];
        uploads.push({ type: req.headers["content-type"], body, model });
        if (!models.includes(model)) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: { message: `The model ${model} does not exist`, code: "model_not_found" } }));
        }
        return res.end(JSON.stringify(model === "whisper-1" ? { text: "你好", duration: 12.5 } : { text: "你好" }));
      }
      chat = JSON.parse(body);
      const content = JSON.stringify({ title: "T", ideas: [] });
      res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] }));
    });
  });
  await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
  const client = new OpenAI({ apiKey: "test", baseURL: `http://127.0.0.1:${fake.address().port}`, maxRetries: 0 });
  try {
    await run(client, uploads, () => chat);
  } finally {
    fake.close();
  }
}

const field = (body, name) => [...body.matchAll(new RegExp(`name="${name.replace(/[[\]]/g, "\\$&")}"\r\n\r\n([^\r]*)`, "g"))].map((m) => m[1]);

test("transcription uses gpt-transcribe with keywords, languages and a context prompt", async () => {
  await withFakeApi(["gpt-transcribe", "gpt-4o-transcribe", "whisper-1"], async (client, uploads) => {
    const backend = createOpenAIBackend(client);
    const heard = await backend.transcribe(Buffer.from("abc"), "webm", "audio/webm", { language: "zh", hint: "跑步、配速", previous: "上一句。" });
    assert.deepEqual(heard, { text: "你好", duration: undefined });
    const [upload] = uploads;
    assert.match(upload.type, /^multipart\/form-data/);
    assert.match(upload.body, /filename="recording\.webm"/);
    assert.equal(upload.model, "gpt-transcribe");
    assert.deepEqual(field(upload.body, "response_format"), ["json"]);
    assert.deepEqual(field(upload.body, "language"), ["zh"]);
    assert.deepEqual(field(upload.body, "keywords[]"), ["跑步", "配速"]);
    assert.deepEqual(field(upload.body, "languages[]"), []);
    assert.match(field(upload.body, "prompt")[0], /^以下是普通话.*上一句。$/);
    assert.doesNotMatch(field(upload.body, "prompt")[0], /跑步/);
    assert.doesNotMatch(upload.body, /chunking_strategy/);

    await backend.transcribe(Buffer.alloc(3 * 1024 * 1024), "m4a", "audio/mp4", { language: "mix" });
    assert.deepEqual(field(uploads[1].body, "languages[]"), ["zh", "en"]);
    assert.deepEqual(field(uploads[1].body, "language"), []);
    assert.deepEqual(field(uploads[1].body, "chunking_strategy"), ["auto"]);
  });
});

test("a provider without gpt-transcribe gets gpt-4o-transcribe, then whisper-1", async () => {
  await withFakeApi(["gpt-4o-transcribe", "whisper-1"], async (client, uploads) => {
    const backend = createOpenAIBackend(client);
    await backend.transcribe(Buffer.from("abc"), "webm", "audio/webm", { language: "zh", hint: "跑步" });
    await backend.transcribe(Buffer.from("abc"), "webm", "audio/webm");
    assert.deepEqual(uploads.map((u) => u.model), ["gpt-transcribe", "gpt-4o-transcribe", "gpt-4o-transcribe"]);
    assert.deepEqual(field(uploads[1].body, "keywords[]"), []);
    assert.match(field(uploads[1].body, "prompt")[0], /会提到：跑步/);
  });
  await withFakeApi(["whisper-1"], async (client, uploads) => {
    const backend = createOpenAIBackend(client);
    assert.deepEqual(await backend.transcribe(Buffer.from("abc"), "webm", "audio/webm"), { text: "你好", duration: 12.5 });
    await backend.transcribe(Buffer.from("abc"), "webm", "audio/webm");
    assert.deepEqual(uploads.map((u) => u.model), ["gpt-transcribe", "gpt-4o-transcribe", "whisper-1", "whisper-1"]);
    assert.deepEqual(field(uploads[2].body, "response_format"), ["verbose_json"]);
  });
});

test("a configured model is used without trying newer ones", async () => {
  await withFakeApi(["gpt-transcribe", "whisper-1"], async (client, uploads) => {
    await createOpenAIBackend(client, { transcribeModel: "whisper-1" }).transcribe(Buffer.from("abc"), "webm", "audio/webm");
    assert.deepEqual(uploads.map((u) => u.model), ["whisper-1"]);
  });
});

test("the OpenAI backend organizes and tidies with strict JSON schemas", async () => {
  await withFakeApi([], async (client, uploads, lastChat) => {
    const backend = createOpenAIBackend(client);
    assert.equal((await backend.organize({ title: "T", nodes: [] }, "hi")).title, "T");
    assert.equal(lastChat().response_format.json_schema.strict, true);
    await backend.tidy({ title: "T", nodes: [{ id: "n1", parent: "root", text: "A" }] });
    assert.equal(lastChat().response_format.json_schema.name, "mind_map_tidy");
  });
});

test("silence hallucinations and prompt echoes are dropped, real words are kept", () => {
  assert.equal(cleanTranscript({ text: "谢谢观看！" }), "");
  assert.equal(cleanTranscript({ text: " Thank you for watching. " }), "");
  assert.equal(cleanTranscript({ text: "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目" }), "");
  assert.equal(cleanTranscript({ text: "我想取消这个订阅" }), "我想取消这个订阅");
  assert.equal(cleanTranscript({ text: "以下是普通话口述的想法" }, "以下是普通话口述的想法，使用简体中文和标点符号。"), "");
  const segments = [
    { text: "先慢跑十分钟。", no_speech_prob: 0.1, avg_logprob: -0.3, compression_ratio: 1.2 },
    { text: "字幕by索兰娅", no_speech_prob: 0.9, avg_logprob: -1.4, compression_ratio: 1 },
    { text: "好好好好好好好好好好", no_speech_prob: 0.1, avg_logprob: -0.2, compression_ratio: 3.1 },
  ];
  assert.equal(cleanTranscript({ text: "ignored", segments }), "先慢跑十分钟。");
});
