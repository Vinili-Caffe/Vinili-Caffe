function extractMovieNightProposalTitle(raw) {
  let text = String(raw || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return "";

  text = text.replace(/^(?:film|movie|titolo)\s*[:\-]\s*/iu, "");

  while (true) {
    const next = text.replace(/\s*[\(\[][^\(\)\[\]]*[\)\]]\s*$/u, "").trim();
    if (next === text) break;
    text = next;
  }

  return text.trim();
}

function normalizeMovieNightProposalForCompare(raw) {
  const title = extractMovieNightProposalTitle(raw);
  return String(title || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  extractMovieNightProposalTitle,
  normalizeMovieNightProposalForCompare,
};