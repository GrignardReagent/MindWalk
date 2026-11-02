// Map logic shared by the page and the server. No DOM, no network.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MindWalk = api;
})(globalThis, function () {
  const ROOT = "root";
  const DEFAULT_TITLE = "我的想法";

  const RESULT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["title", "ideas"],
    properties: {
      title: { type: "string" },
      ideas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "parent", "text", "quote"],
          properties: {
            id: { type: "string" },
            parent: { type: "string" },
            text: { type: "string" },
            quote: { type: "string" },
          },
        },
      },
    },
  };

  function emptyMap() {
    return { title: DEFAULT_TITLE, nodes: [], pending: [], seq: 0, updatedAt: 0 };
  }

  function describeMap(map) {
    if (!map.nodes.length) return "(空)";
    return map.nodes.map((n) => `${n.id} | 父节点 ${n.parent} | ${n.text}`).join("\n");
  }

  function buildPrompt(map, text) {
    return `你在帮一个人整理他走路或跑步时口述的想法。下面的口述来自语音识别，可能有错字、重复和语气词，中英文可能混杂。

把口述拆成独立的想法，并放进现有的思维导图。

规则：
- 每个想法写成一条简短的陈述，尽量不超过 18 个字（英文不超过 10 个词）。保留他说话用的语言，不要翻译。
- 根据上下文修正明显的语音识别错误，但不要添加他没说过的内容。
- 新主题挂在 "${ROOT}" 下。细节、理由、例子挂在它们所属的想法下。优先挂到现有节点，不要新建意思相近的分支。
- 已经在导图里的想法不要重复添加。如果有新的细节，作为子节点添加。
- 每个新想法的 id 用 new1、new2 这样的临时编号。parent 可以是现有节点的 id、"${ROOT}"，或者本次排在它前面的新想法的 id。
- quote 摘录他的原话，只摘这个想法对应的部分。
- title：导图当前标题是"${DEFAULT_TITLE}"时，起一个不超过 10 个字的标题，语言与口述一致；否则原样返回当前标题。

只返回 JSON，格式为：
{"title": "...", "ideas": [{"id": "new1", "parent": "root", "text": "...", "quote": "..."}]}

当前标题：${map.title}

现有导图（id | 父节点 | 内容）：
${describeMap(map)}

<transcript>
${text}
</transcript>`;
  }

  // Applies Claude's reply to a map and returns a new map. Words are never
  // dropped: a reply with no usable ideas keeps the note as one raw node.
  function applyResult(map, result, noteText, now) {
    const next = { ...map, nodes: [...map.nodes] };
    const known = new Set(next.nodes.map((n) => n.id));
    const renamed = new Map();
    const ideas = Array.isArray(result && result.ideas) ? result.ideas : [];
    const newNode = (parent, text, quote) => {
      next.seq += 1;
      const id = `n${next.seq}`;
      next.nodes.push({ id, parent, text, quote, at: now });
      known.add(id);
      return id;
    };

    for (const idea of ideas) {
      const text = typeof idea.text === "string" ? idea.text.trim() : "";
      if (!text) continue;
      const parent = renamed.get(idea.parent) || (known.has(idea.parent) ? idea.parent : ROOT);
      const quote = typeof idea.quote === "string" ? idea.quote.trim() : "";
      renamed.set(idea.id, newNode(parent, text, quote));
    }
    if (!renamed.size) {
      const raw = noteText.trim();
      newNode(ROOT, raw.length > 40 ? `${raw.slice(0, 40)}…` : raw, raw);
    }

    const title = result && typeof result.title === "string" ? result.title.trim() : "";
    if (next.title === DEFAULT_TITLE && title) next.title = title;
    next.updatedAt = now;
    return next;
  }

  function removeSubtree(map, id, now) {
    const gone = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of map.nodes) {
        if (gone.has(n.parent) && !gone.has(n.id)) {
          gone.add(n.id);
          grew = true;
        }
      }
    }
    return { ...map, nodes: map.nodes.filter((n) => !gone.has(n.id)), updatedAt: now };
  }

  function toMarkdown(map) {
    const lines = [`# ${map.title}`, ""];
    const walk = (parent, depth) => {
      for (const n of map.nodes) {
        if (n.parent !== parent) continue;
        lines.push(`${"  ".repeat(depth)}- ${n.text}`);
        walk(n.id, depth + 1);
      }
    };
    walk(ROOT, 0);
    return lines.join("\n");
  }

  return { ROOT, DEFAULT_TITLE, RESULT_SCHEMA, emptyMap, buildPrompt, applyResult, removeSubtree, toMarkdown };
});
