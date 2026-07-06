function cosineSimilarity(a, b) {
  const va = Array.isArray(a) ? a : [];
  const vb = Array.isArray(b) ? b : [];
  if (!va.length || va.length !== vb.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < va.length; i += 1) {
    const x = Number(va[i]) || 0;
    const y = Number(vb[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function chunkText(raw, opts = {}) {
  const maxLen = Math.max(200, Number(opts.maxLen || 900));
  const overlap = Math.max(0, Math.min(200, Number(opts.overlap || 120)));
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxLen);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
      if (lastBreak > maxLen * 0.4) end = start + lastBreak + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function rankByEmbedding(queryEmbedding, docs, limit = 6) {
  const q = Array.isArray(queryEmbedding) ? queryEmbedding : [];
  if (!q.length) return [];
  const scored = (docs || [])
    .map((doc) => ({
      doc,
      score: cosineSimilarity(q, doc?.embedding),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, limit));
}

module.exports = { cosineSimilarity, chunkText, rankByEmbedding };