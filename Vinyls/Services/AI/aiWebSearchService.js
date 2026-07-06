const axios = require("axios");

async function searchWebTavily(query, opts = {}) {
  const apiKey = String(process.env.AI_WEB_SEARCH_API_KEY || process.env.TAVILY_API_KEY || "").trim();
  if (!apiKey) return null;
  const res = await axios.post(
    "https://api.tavily.com/search",
    {
      api_key: apiKey,
      query: String(query || "").slice(0, 400),
      search_depth: "basic",
      max_results: Math.max(1, Math.min(6, Number(opts.limit || 4))),
      include_answer: true,
    },
    { timeout: 20000 },
  );
  const results = Array.isArray(res?.data?.results) ? res.data.results : [];
  const answer = String(res?.data?.answer || "").trim();
  const lines = [];
  if (answer) lines.push(`Sintesi: ${answer}`);
  for (const row of results) {
    const title = String(row?.title || "").trim();
    const url = String(row?.url || "").trim();
    const content = String(row?.content || "").trim();
    if (!title && !content) continue;
    lines.push(`- ${title}${url ? ` (${url})` : ""}: ${content.slice(0, 280)}`);
  }
  return lines.length ? lines.join("\n") : null;
}

async function searchWebBrave(query, opts = {}) {
  const apiKey = String(process.env.BRAVE_SEARCH_API_KEY || "").trim();
  if (!apiKey) return null;
  const res = await axios.get("https://api.search.brave.com/res/v1/web/search", {
    timeout: 20000,
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
    params: { q: String(query || "").slice(0, 400), count: Math.max(1, Math.min(6, Number(opts.limit || 4))) },
  });
  const results = Array.isArray(res?.data?.web?.results) ? res.data.web.results : [];
  const lines = results.map((row) => {
    const title = String(row?.title || "").trim();
    const url = String(row?.url || "").trim();
    const desc = String(row?.description || "").trim();
    return `- ${title}${url ? ` (${url})` : ""}: ${desc.slice(0, 280)}`;
  });
  return lines.length ? lines.join("\n") : null;
}

async function searchWeb(query, opts = {}) {
  const q = String(query || "").trim();
  if (!q) return null;
  try {
    const tavily = await searchWebTavily(q, opts);
    if (tavily) return tavily;
  } catch (err) {
    global.logger?.warn?.("[AI] Tavily search failed:", err?.message || err);
  }
  try {
    const brave = await searchWebBrave(q, opts);
    if (brave) return brave;
  } catch (err) {
    global.logger?.warn?.("[AI] Brave search failed:", err?.message || err);
  }
  return null;
}

module.exports = { searchWeb };