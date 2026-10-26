export const FAQ_USEFUL_KEY = "vc_faq_useful_v1";

export type FaqUsefulVote = "yes" | "no";

type Map = Record<string, FaqUsefulVote>;

function readMap(): Map {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FAQ_USEFUL_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return {};
    return j as Map;
  } catch {
    return {};
  }
}

export function getFaqUsefulVote(faqId: string): FaqUsefulVote | null {
  const v = readMap()[faqId];
  return v === "yes" || v === "no" ? v : null;
}

export function setFaqUsefulVote(faqId: string, vote: FaqUsefulVote) {
  if (typeof window === "undefined") return;
  const map = readMap();
  map[faqId] = vote;
  try {
    localStorage.setItem(FAQ_USEFUL_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}
