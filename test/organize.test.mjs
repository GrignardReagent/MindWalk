import assert from "node:assert/strict";
import test from "node:test";
import mindwalk from "../app/organize.js";

const { ROOT, DEFAULT_TITLE, emptyMap, applyResult, removeSubtree, toMarkdown, buildPrompt } = mindwalk;

test("new ideas can hang under existing nodes and under each other", () => {
  const start = applyResult(emptyMap(), { title: "跑步", ideas: [{ id: "new1", parent: ROOT, text: "A", quote: "" }] }, "a", 1);
  const next = applyResult(start, {
    title: "别的标题",
    ideas: [
      { id: "new1", parent: "n1", text: "B", quote: "b" },
      { id: "new2", parent: "new1", text: "C", quote: "c" },
    ],
  }, "b c", 2);
  assert.deepEqual(next.nodes.map((n) => [n.id, n.parent]), [["n1", ROOT], ["n2", "n1"], ["n3", "n2"]]);
  assert.equal(next.title, "跑步");
  assert.equal(next.updatedAt, 2);
});

test("a temporary id that collides with a real id resolves to the new node", () => {
  const start = { ...emptyMap(), nodes: [{ id: "new1", parent: ROOT, text: "old" }] };
  const next = applyResult(start, {
    ideas: [
      { id: "new1", parent: ROOT, text: "fresh", quote: "" },
      { id: "new2", parent: "new1", text: "child", quote: "" },
    ],
  }, "x", 1);
  assert.equal(next.nodes.at(-1).parent, next.nodes.at(-2).id);
});

test("an unknown parent falls back to the root", () => {
  const next = applyResult(emptyMap(), { ideas: [{ id: "new1", parent: "ghost", text: "A", quote: "" }] }, "a", 1);
  assert.equal(next.nodes[0].parent, ROOT);
});

test("a reply with no usable ideas keeps the spoken words", () => {
  for (const reply of [{ ideas: [] }, { ideas: [{ id: "new1", parent: ROOT, text: "  " }] }, null]) {
    const next = applyResult(emptyMap(), reply, "我想到一件事", 1);
    assert.equal(next.nodes.length, 1);
    assert.equal(next.nodes[0].quote, "我想到一件事");
    assert.equal(next.title, DEFAULT_TITLE);
  }
});

test("applying a reply does not mutate the old map", () => {
  const start = emptyMap();
  applyResult(start, { ideas: [{ id: "new1", parent: ROOT, text: "A", quote: "" }] }, "a", 1);
  assert.equal(start.nodes.length, 0);
  assert.equal(start.seq, 0);
});

test("removing a node removes its whole subtree", () => {
  const map = {
    ...emptyMap(),
    nodes: [
      { id: "c", parent: "b", text: "C" },
      { id: "a", parent: ROOT, text: "A" },
      { id: "b", parent: "a", text: "B" },
      { id: "d", parent: ROOT, text: "D" },
    ],
  };
  assert.deepEqual(removeSubtree(map, "a", 1).nodes.map((n) => n.id), ["d"]);
});

test("markdown keeps the hierarchy", () => {
  const map = { ...emptyMap(), title: "T", nodes: [{ id: "a", parent: ROOT, text: "A" }, { id: "b", parent: "a", text: "B" }] };
  assert.equal(toMarkdown(map), "# T\n\n- A\n  - B");
});

test("the prompt carries the map and the transcript", () => {
  const map = { ...emptyMap(), nodes: [{ id: "n1", parent: ROOT, text: "已有想法" }] };
  const prompt = buildPrompt(map, "新的话");
  assert.match(prompt, /n1 \| 父节点 root \| 已有想法/);
  assert.match(prompt, /<transcript>\n新的话\n<\/transcript>/);
});

test("tidying merges nodes, keeps their quotes and adds group nodes", () => {
  const map = {
    ...emptyMap(),
    seq: 3,
    nodes: [
      { id: "n1", parent: ROOT, text: "跑步配速", quote: "配速要慢", at: 5 },
      { id: "n2", parent: ROOT, text: "配速放慢", quote: "慢一点跑", at: 3 },
      { id: "n3", parent: ROOT, text: "买跑鞋", quote: "鞋", at: 7 },
    ],
  };
  const next = mindwalk.applyTidy(map, {
    nodes: [
      { id: "new1", parent: ROOT, text: "跑步", merged: [] },
      { id: "n1", parent: "new1", text: "放慢配速", merged: ["n2"] },
      { id: "n3", parent: "new1", text: "买跑鞋", merged: [] },
    ],
  }, 9);
  assert.deepEqual(next.nodes.map((n) => [n.id, n.parent, n.text]), [
    ["n4", ROOT, "跑步"], ["n1", "n4", "放慢配速"], ["n3", "n4", "买跑鞋"],
  ]);
  assert.equal(next.nodes[1].quote, "配速要慢 / 慢一点跑");
  assert.equal(next.nodes[1].at, 3);
  assert.equal(next.seq, 4);
  assert.equal(map.nodes.length, 3);
});

test("tidying never loses a node the reply forgot, and breaks parent loops", () => {
  const map = {
    ...emptyMap(),
    seq: 3,
    nodes: [
      { id: "n1", parent: ROOT, text: "A" },
      { id: "n2", parent: "n1", text: "B" },
      { id: "n3", parent: "n2", text: "C" },
    ],
  };
  const next = mindwalk.applyTidy(map, {
    nodes: [
      { id: "n1", parent: "n2", text: "A", merged: [] },
      { id: "n2", parent: "n1", text: "B", merged: [] },
    ],
  }, 1);
  const byId = Object.fromEntries(next.nodes.map((n) => [n.id, n.parent]));
  assert.equal(byId.n3, "n2");
  assert.ok(byId.n1 === ROOT || byId.n2 === ROOT);
  assert.equal(mindwalk.applyTidy(map, { nodes: [] }, 1), map);
});

test("the transcription prompt names the script and the map's words", () => {
  const map = { ...emptyMap(), nodes: [{ id: "a", parent: ROOT, text: "MindWalk" }, { id: "b", parent: "a", text: "录音" }] };
  const hint = mindwalk.vocabularyHint(map);
  assert.equal(hint, "MindWalk、录音");
  assert.match(mindwalk.transcriptionPrompt("zh", hint, "ELM"), /简体中文.*ELM、MindWalk、录音/);
  assert.match(mindwalk.transcriptionPrompt("en", "", ""), /^Ideas dictated/);
  assert.equal(mindwalk.transcriptionPrompt(undefined, "", ""), "");
  assert.match(mindwalk.transcriptionPrompt("zh", "", "", "前面说到配速。"), /标点符号。 前面说到配速。$/);
});
