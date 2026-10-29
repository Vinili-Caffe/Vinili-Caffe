import snapshot from "./rules-snapshot.json";
import { SITE_ORIGIN } from "./site";

// Il regolamento vive nel bot: GET /webhooks/site-rules. rules-snapshot.json = copia di riserva.

export type RuleLink = { label: string; href: string };
export type Rule = { id: string; category: string; tag?: string; title: string; body: string; icon?: string; links?: RuleLink[] };
export type RuleCategory = { id: string; label: string; icon?: string };
export type RulesData = { disclaimer: string; categories: RuleCategory[]; rules: Rule[] };

export const RULES_SNAPSHOT: RulesData = snapshot as RulesData;

function valid(d: unknown): d is RulesData & { ok: boolean } {
  const x = d as { ok?: boolean; rules?: unknown; categories?: unknown };
  return !!x && x.ok === true && Array.isArray(x.rules) && Array.isArray(x.categories);
}

export async function loadRules(origin = ""): Promise<RulesData | null> {
  try {
    const r = await fetch(`${origin}/webhooks/site-rules`, { cache: "no-store" });
    const d = await r.json();
    return valid(d) ? { disclaimer: d.disclaimer, categories: d.categories, rules: d.rules } : null;
  } catch {
    return null;
  }
}

/** In build: regole aggiornate dal bot, altrimenti la copia di riserva. */
export async function loadBuildRules(): Promise<RulesData> {
  return (await loadRules(SITE_ORIGIN)) ?? RULES_SNAPSHOT;
}

/** "1.1" → "r-1-1" (id HTML pulito per i link diretti) */
export const ruleAnchor = (id: string) => `r-${id.replace(/[^a-z0-9]+/gi, "-")}`;
