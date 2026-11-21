import { apiUrl } from "./api";

export type GuildMentionRole = {
  id: string;
  name: string;
  color?: string;
  iconUrl?: string;
  iconAnimated?: boolean;
  emoji?: string;
};

export type GuildMentionChannel = {
  id: string;
  name: string;
  type?: number;
  parentId?: string | null;
};

export type GuildMentionsCatalog = {
  roles: Record<string, string>;
  channels: Record<string, string>;
  roleMeta: Record<string, GuildMentionRole>;
  fetchedAt: number;
};

const EMPTY: GuildMentionsCatalog = { roles: {}, channels: {}, roleMeta: {}, fetchedAt: 0 };

/** Catalogo live nomi Discord (ruoli + canali) per menzioni sul sito. */
export async function loadGuildMentionsCatalog(signal?: AbortSignal): Promise<GuildMentionsCatalog> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-roles?catalog=mentions"), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });
    const j = await r.json().catch(() => null);
    if (!(r.ok && j?.ok)) return EMPTY;
    const roles: Record<string, string> = {};
    const roleMeta: Record<string, GuildMentionRole> = {};
    for (const row of Array.isArray(j.roles) ? j.roles : []) {
      const id = String(row?.id || "").trim();
      const name = String(row?.name || "").trim();
      if (!id || !name) continue;
      roles[id] = name;
      roleMeta[id] = {
        id,
        name,
        color: row.color ? String(row.color) : undefined,
        iconUrl: row.iconUrl ? String(row.iconUrl) : undefined,
        iconAnimated: Boolean(row.iconAnimated),
        emoji: row.emoji ? String(row.emoji) : undefined,
      };
    }
    const channels: Record<string, string> = {};
    for (const row of Array.isArray(j.channels) ? j.channels : []) {
      const id = String(row?.id || "").trim();
      const name = String(row?.name || "").trim().replace(/^#/, "");
      if (!id || !name) continue;
      channels[id] = name;
    }
    return { roles, channels, roleMeta, fetchedAt: Date.now() };
  } catch {
    return EMPTY;
  }
}

export function resolveRoleLabel(idOrLabel: string, catalog: GuildMentionsCatalog | null | undefined, fallback?: string): string {
  const raw = String(idOrLabel || "").trim();
  if (!raw) return fallback || "";
  const snowflake = raw.match(/^(?:@&|role:)?(\d{16,22})$/)?.[1];
  if (snowflake && catalog?.roles?.[snowflake]) return catalog.roles[snowflake];
  if (snowflake) return fallback || raw;
  return fallback || raw;
}
