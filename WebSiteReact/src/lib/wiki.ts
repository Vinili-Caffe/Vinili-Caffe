import coffeeSnapshot from "./wiki-coffee.json";
import prodSnapshot from "./wiki-prod.json";
import { SITE_ORIGIN } from "./site";

// Comandi dei bot: GET /webhooks/site-wiki-help?bot=prod|coffee (catalogo "ospite", senza login).
// wiki-*.json = copia di riserva se l'API non risponde in build.

export type BotId = "prod" | "coffee";
export type WikiCommand = {
  invoke: string;
  type: string;
  description: string;
  aliases: string[];
  roles: string[];
  usage: string;
  example: string;
};
export type WikiCategory = { id: string; title: string; commands: WikiCommand[] };
export type WikiBot = { bot: BotId; guest?: boolean; vipRoleId?: string; categories: WikiCategory[] };

export const BOTS: { id: BotId; name: string; prefix: string; tagline: string }[] = [
  { id: "prod", name: "Vinili", prefix: "+", tagline: "Musica, livelli, statistiche e minigames" },
  { id: "coffee", name: "Caffè", prefix: ",", tagline: "Musica e TTS per il server" },
];

const SNAPSHOTS: Record<BotId, WikiBot> = {
  prod: prodSnapshot as WikiBot,
  coffee: coffeeSnapshot as WikiBot,
};

type ApiCommand = Partial<WikiCommand>;
type ApiResponse = {
  ok?: boolean;
  guest?: boolean;
  vipRoleId?: string;
  catalog?: { categories?: { id: string; title: string; commands?: ApiCommand[] }[] };
};

/** Con il token Discord il bot restituisce anche i comandi dei tuoi ruoli (VIP, staff…). */
export async function loadWikiBot(bot: BotId, origin = "", token?: string | null): Promise<WikiBot | null> {
  try {
    const r = await fetch(`${origin}/webhooks/site-wiki-help?bot=${bot}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const raw = (await r.text()).replace(/^\uFEFF/, "");
    const j = JSON.parse(raw) as ApiResponse;
    const cats = j.catalog?.categories;
    if (!j.ok || !Array.isArray(cats)) return null;
    return {
      bot,
      guest: j.guest !== false,
      vipRoleId: j.vipRoleId,
      categories: cats.map((c) => ({
        id: c.id,
        title: c.title,
        commands: (c.commands ?? []).map((x) => ({
          invoke: x.invoke ?? "",
          type: x.type ?? "prefix",
          description: x.description ?? "",
          aliases: x.aliases ?? [],
          roles: x.roles ?? [],
          usage: x.usage ?? x.invoke ?? "",
          example: x.example ?? x.invoke ?? "",
        })),
      })),
    };
  } catch {
    return null;
  }
}

export async function loadBuildWiki(): Promise<Record<BotId, WikiBot>> {
  const [prod, coffee] = await Promise.all([loadWikiBot("prod", SITE_ORIGIN), loadWikiBot("coffee", SITE_ORIGIN)]);
  return { prod: prod ?? SNAPSHOTS.prod, coffee: coffee ?? SNAPSHOTS.coffee };
}

/** "+next up" → "cmd-prod-next-up" (id per i link diretti) */
export const commandAnchor = (bot: BotId, invoke: string) =>
  `cmd-${bot}-${invoke.replace(/^[^a-z0-9]+/i, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
