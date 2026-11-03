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

  const TIDY_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["nodes"],
    properties: {
      nodes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "parent", "text", "merged"],
          properties: {
            id: { type: "string" },
            parent: { type: "string" },
            text: { type: "string" },
            merged: { type: "array", items: { type: "string" } },
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

  const STYLE = `- 节点写成关键词短语，不写完整句子：中文不超过 12 个字，英文不超过 6 个词。去掉"我觉得""我想""就是"、句末标点和多余修饰。保留他说话用的语言，不要翻译。
- 一个节点只放一个想法；一句话里并列了几点就拆开。
- 层级：第一层是主题，第二层是要点，第三层是细节、理由或例子，一般不超过三层。`;

  function buildPrompt(map, text) {
    return `你在帮一个人把他走路或跑步时的口述整理成思维导图。口述来自语音识别，可能有同音错字、重复、口头禅和说到一半改口，中英文可能混杂。

目标：导图准确、简洁，一眼能看懂。

规则：
- 只提取有信息量的想法。丢掉语气词、口头禅、寒暄、过渡句，以及和想法无关的周围情况（比如"红灯了""有点累"）。
- 他改口时以最后的说法为准。同一个意思说了几遍只记一次。
${STYLE}
- 修正明显的语音识别错误（同音字、专有名词、英文术语），依据上下文和现有导图里的用词；拿不准就保留原词。不要添加他没说过的内容。
- 优先挂到现有节点下，不要新建意思相近的分支。已经在导图里的想法不要重复添加，只把新的细节作为子节点加进去。
- 每个新想法的 id 用 new1、new2 这样的临时编号。parent 可以是现有节点的 id、"${ROOT}"，或者本次排在它前面的新想法的 id。
- quote 原样摘录识别文本里对应的那部分，只摘这个想法的。
- title：导图当前标题是"${DEFAULT_TITLE}"时，起一个不超过 10 个字的标题，语言与口述一致；否则原样返回当前标题。
- 如果整段口述没有任何有信息量的内容，ideas 返回空数组。

只返回 JSON，格式为：
{"title": "...", "ideas": [{"id": "new1", "parent": "${ROOT}", "text": "...", "quote": "..."}]}

当前标题：${map.title}

现有导图（id | 父节点 | 内容）：
${describeMap(map)}

<transcript>
${text}
</transcript>`;
  }

  function buildTidyPrompt(map) {
    return `下面是一张由口述生成的思维导图。重新整理它，让它更准确、更简洁。

规则：
- 合并重复或意思相近的节点，把放错分支的节点移到合适的位置。
- 第一层主题尽量控制在 3 到 7 个。需要时可以新建一个概括性的主题，把相关节点归到它下面。
${STYLE}
- 不能丢掉任何实质内容，也不要添加原导图里没有的信息。

返回整张新导图，每个节点：
- id：沿用原节点的 id；新建的概括节点用 new1、new2 这样的编号。
- parent："${ROOT}"，或另一个节点的 id。
- text：节点内容。
- merged：被合并进这个节点的其他原节点 id，没有就是空数组。
每个原节点的 id 必须恰好出现一次：要么作为某个节点的 id，要么在某个节点的 merged 里。

只返回 JSON，格式为：
{"nodes": [{"id": "n1", "parent": "${ROOT}", "text": "...", "merged": []}]}

导图标题：${map.title}

原导图（id | 父节点 | 内容）：
${describeMap(map)}`;
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

  // Applies a restructured map. Nothing is lost: an original node the reply
  // forgot is kept, and merged nodes pass their quotes to the node they joined.
  function applyTidy(map, result, now) {
    const replies = Array.isArray(result && result.nodes) ? result.nodes : [];
    const old = new Map(map.nodes.map((n) => [n.id, n]));
    const next = { ...map, nodes: [] };
    const replyId = new Map(); // id in the reply -> final id
    const movedTo = new Map(); // original id -> final id of the node now holding it
    const entries = [];

    for (const reply of replies) {
      const text = typeof reply.text === "string" ? reply.text.trim() : "";
      if (!text || replyId.has(reply.id)) continue;
      let id = reply.id;
      if (!old.has(id) || movedTo.has(id)) {
        next.seq += 1;
        id = `n${next.seq}`;
      }
      const merged = Array.isArray(reply.merged) ? reply.merged : [];
      const sources = [reply.id, ...merged].map((m) => old.get(m)).filter((n) => n && !movedTo.has(n.id));
      sources.forEach((n) => movedTo.set(n.id, id));
      replyId.set(reply.id, id);
      const quotes = [...new Set(sources.map((n) => n.quote).filter(Boolean))];
      const times = sources.map((n) => n.at).filter(Number.isFinite);
      entries.push({ wants: reply.parent, node: { id, parent: ROOT, text, quote: quotes.join(" / "), at: times.length ? Math.min(...times) : now } });
    }
    if (!entries.length) return map;

    for (const n of map.nodes) {
      if (!movedTo.has(n.id)) {
        movedTo.set(n.id, n.id);
        entries.push({ kept: true, wants: n.parent, node: { ...n } });
      }
    }
    for (const { kept, wants, node } of entries) {
      const parent = kept ? movedTo.get(wants) : replyId.get(wants) || movedTo.get(wants);
      node.parent = parent && parent !== node.id ? parent : ROOT;
    }
    next.nodes = entries.map((e) => e.node);

    // Break any parent loop the reply created by lifting one of its nodes to the root.
    const byId = new Map(next.nodes.map((n) => [n.id, n]));
    for (const n of next.nodes) {
      const seen = new Set([n.id]);
      for (let p = byId.get(n.parent); p; p = byId.get(p.parent)) {
        if (seen.has(p.id)) {
          if (p.id === n.id) n.parent = ROOT;
          break;
        }
        seen.add(p.id);
      }
    }
    next.updatedAt = now;
    return next;
  }

  // Words already on the map, so the transcriber spells names and terms the same way.
  function vocabularyHint(map, limit = 120) {
    const words = [];
    let length = 0;
    const depth1 = map.nodes.filter((n) => n.parent === ROOT);
    const top = new Set(depth1.map((n) => n.id));
    for (const n of [...depth1, ...map.nodes.filter((m) => top.has(m.parent))]) {
      if (length + n.text.length > limit) break;
      words.push(n.text);
      length += n.text.length + 1;
    }
    return words.join("、");
  }

  // The transcriber treats this as the text spoken just before the audio, so it
  // copies its script, punctuation and spellings, and the last words heard
  // carry a sentence across clip boundaries. Whisper keeps only the prompt's
  // last 224 tokens, so the closest context goes last and everything is short.
  function transcriptionPrompt(language, hint, vocabulary, previous) {
    const terms = [vocabulary, hint].map((s) => (s || "").trim()).filter(Boolean).join("、").slice(0, 80);
    const before = (previous || "").trim().slice(-80);
    let lead = terms;
    if (language === "zh") lead = `以下是普通话口述的想法，使用简体中文和标点符号。${terms ? `会提到：${terms}。` : ""}`;
    if (language === "en") lead = `Ideas dictated on a walk, with punctuation.${terms ? ` Terms: ${terms}.` : ""}`;
    if (language === "mix") lead = `以下是中英文夹杂的口述想法，中文用简体，英文词保持英文，带标点。${terms ? `会提到：${terms}。` : ""}`;
    return [lead, before].filter(Boolean).join(" ");
  }

  // gpt-transcribe takes names and terms as a separate keyword list.
  function transcriptionKeywords(vocabulary, hint) {
    const words = `${vocabulary || ""},${hint || ""}`.split(/[,，、;；\n]/).map((w) => w.trim()).filter((w) => w && w.length <= 40);
    return [...new Set(words)].slice(0, 50);
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

  return {
    ROOT, DEFAULT_TITLE, RESULT_SCHEMA, TIDY_SCHEMA, emptyMap, buildPrompt, buildTidyPrompt, applyResult, applyTidy,
    vocabularyHint, transcriptionPrompt, transcriptionKeywords, removeSubtree, toMarkdown,
  };
});
