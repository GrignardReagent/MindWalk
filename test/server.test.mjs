import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import OpenAI from "openai";
import { createOpenAIBackend, createServer } from "../server.mjs";

async function withServer(organize, run) {
  const transcribe = async (audio, extension) => ({ text: `${audio.length} ${extension}`, duration: 9 });
  const server = createServer({ organize, transcribe });
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
    assert.deepEqual(await (await send("webm")).json(), { text: "5 webm", duration: 9 });
  });
});

test("the OpenAI backend sends the expected requests and reads the replies", async () => {
  const seen = {};
  const fake = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen[req.url] = { type: req.headers["content-type"], body: Buffer.concat(chunks).toString("latin1") };
      res.setHeader("content-type", "application/json");
      if (req.url === "/audio/transcriptions") return res.end(JSON.stringify({ text: "你好", duration: 12.5 }));
      const content = JSON.stringify({ title: "T", ideas: [] });
      res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] }));
    });
  });
  await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
  const client = new OpenAI({ apiKey: "test", baseURL: `http://127.0.0.1:${fake.address().port}` });
  const backend = createOpenAIBackend(client);
  try {
    assert.deepEqual(await backend.transcribe(Buffer.from("abc"), "webm", "audio/webm"), { text: "你好", duration: 12.5 });
    const upload = seen["/audio/transcriptions"];
    assert.match(upload.type, /^multipart\/form-data/);
    assert.match(upload.body, /filename="recording\.webm"/);
    assert.match(upload.body, /whisper-1/);
    assert.match(upload.body, /verbose_json/);

    assert.equal((await backend.organize({ title: "T", nodes: [] }, "hi")).title, "T");
    const chat = JSON.parse(seen["/chat/completions"].body);
    assert.equal(chat.response_format.json_schema.strict, true);
  } finally {
    fake.close();
  }
});
