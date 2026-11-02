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
