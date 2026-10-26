// Personalizza: site-custom-profile (+ /emojis), site-profile-extras, site-rank-card (+ preview).
// Handler: Vinyls/Utils/Web/siteCustomProfileApi.js, siteProfileExtrasApi.js, siteRankCardApi.js

export const HOLO_PRIMARY = "#a9c0ff";
export const HOLO_SECONDARY = "#ffc0ec";

export type PersTab =
  | "rank"
  | "primary"
  | "secondary"
  | "voice"
  | "roles"
  | "birthday"
  | "privacy"
  | "reactions"
  | "response";

export const PERS_TABS: { id: PersTab; label: string }[] = [
  { id: "rank", label: "Rank card" },
  { id: "primary", label: "Principale" },
  { id: "secondary", label: "Secondario" },
  { id: "voice", label: "Vocale" },
  { id: "roles", label: "Ruoli" },
  { id: "birthday", label: "Compleanno" },
  { id: "privacy", label: "Privacy" },
  { id: "reactions", label: "Reactions" },
  { id: "response", label: "Response" },
];

export const CUSTOM_TABS = new Set<PersTab>(["primary", "secondary", "voice"]);
export const EXTRAS_TABS = new Set<PersTab>(["roles", "birthday", "privacy", "reactions", "response"]);

export type ColorMode = "solid" | "gradient" | "holo";

export type SharedMember = {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isOwner?: boolean;
};

export type CustomRoleEntity = {
  id: string;
  name: string;
  color?: string;
  color2?: string;
  colorMode?: ColorMode | string;
  emoji?: string;
  iconUrl?: string;
  createdAt?: string;
  memberCount?: number;
  sharedMembers?: SharedMember[];
  sharedMembersCount?: number;
};

export type CustomVoiceEntity = {
  id: string;
  name: string;
  emoji?: string;
  createdAt?: string;
  memberCount?: number;
  sharedMembers?: SharedMember[];
  sharedMembersCount?: number;
};

export type FeatureAccess = {
  customRolePrimary?: boolean;
  customRoleSecondary?: boolean;
  customVoc?: boolean;
};

export type RequirementsMeta = {
  rolePrimary?: { anyOf: string[]; note: string };
  roleSecondary?: { anyOf: string[]; note: string };
  voice?: {
    anyOf: string[];
    weeklyMinHours?: number;
    maxFailedWeeks?: number;
    deleteAtLabel?: string;
    note: string;
  };
};

export type VoiceActivity = {
  weeklySeconds?: number;
  weeklyHours?: number;
  weeklyMinSeconds?: number;
  underThreshold?: boolean;
  failedWeekStreak?: number;
  maxFailedWeeks?: number;
  recreationBlocked?: boolean;
  recreationBlockedLabel?: string;
  cooldownRemainingLabel?: string;
  deleteAtLabel?: string;
  note?: string;
};

export type CustomProfileState = {
  userId: string;
  featureAccess: FeatureAccess;
  permissions: { gradientHolo?: boolean };
  requirements: RequirementsMeta | null;
  voiceActivity: VoiceActivity | null;
  primary: CustomRoleEntity | null;
  secondary: CustomRoleEntity | null;
  voice: CustomVoiceEntity | null;
  expiresAt?: string;
};

export type GuildEmoji = { id: string; name: string; animated?: boolean; url?: string };

export type RankTheme = {
  overlayOpacity: number;
  wallpaperKey: string;
  wallpaperUrl: string;
  fontKey: string;
  panelColor: string;
  primaryTextColor: string;
  secondaryTextColor?: string;
  multiplierColor: string;
  valueColor: string;
  labelColor: string;
  progressStartColor?: string;
  progressEndColor?: string;
  ringColor?: string;
  rankBoxBorderColor?: string;
  wallpaperUrlOmitted?: boolean;
};

export type RankWallpaper = { key: string; label: string; previewUrl?: string };
export type RankFont = { key: string; label: string; family?: string };

export type RankCardState = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  theme: RankTheme;
  defaults: RankTheme;
  wallpapers: RankWallpaper[];
  fonts: RankFont[];
  permissions: {
    canUseCustomWallpaper?: boolean;
    wallpaperCustomRoles?: string[];
    activeWallpaperRoles?: string[];
  };
  stats: {
    level: number;
    totalExp: number;
    currentLevelExp: number;
    nextLevelExp: number;
    progressPercent: number;
    weeklyExp: number;
    weeklyRank: number | null;
    allTimeRank: number | null;
    multiplier: number;
  };
};

export type RoleOption = {
  value: string;
  label: string;
  iconUrl?: string;
  iconAnimated?: boolean;
  emoji?: string;
  unlocked?: boolean;
};

export type RolePanelCategory = {
  key: string;
  label: string;
  selected: string;
  selectedIds: string[];
  multi: boolean;
  options: RoleOption[];
  canPickPlus?: boolean;
  level?: number;
};

export type MentionReactionDisplay = { token?: string; markup?: string; url?: string; name?: string };

export type ProfileExtras = {
  userId: string;
  birthday: { day: number | null; month: number | null; birthYear: number | null; showAge: boolean };
  privacy: { kinds: { key: string; label: string; blocked: boolean }[] };
  mentionReaction: {
    access: boolean;
    max: number;
    reactions: string[];
    display: (string | MentionReactionDisplay)[];
  };
  mentionResponse: { access: boolean; accessHint: string; text: string };
  rolePanel: {
    categories: { key: string; label: string }[];
    byKey: Record<string, RolePanelCategory>;
  };
};

export type ApiResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; status: number; error?: string; message: string };

const RANK_COLOR_FIELDS = [
  { key: "panelColor" as const, title: "Sfondo", subtitle: "Colore dei box della rank card" },
  { key: "primaryTextColor" as const, title: "Testo principale", subtitle: "Username, progress bar e stats" },
  { key: "multiplierColor" as const, title: "Moltiplicatore", subtitle: "Testo moltiplicatore XP" },
  { key: "valueColor" as const, title: "Valori", subtitle: "Server rank e weekly rank" },
  { key: "labelColor" as const, title: "Etichette", subtitle: 'Separator nome|livello, label "RANK", ecc…' },
];
export { RANK_COLOR_FIELDS };

/** Famiglia CSS dei font della rank card (stesso catalogo di rankCardTheme.js); `g` = da Google Fonts. */
const RANK_FONT_CSS: Record<string, { family: string; g?: boolean; fallback?: string }> = {
  arial: { family: "Arial" },
  sans: { family: "Noto Sans", g: true },
  serif: { family: "Georgia", fallback: "serif" },
  mono: { family: "DejaVu Sans Mono", fallback: "monospace" },
  display: { family: "UnifrakturMaguntia", g: true },
  mplus: { family: "M PLUS Rounded 1c", g: true },
  dela: { family: "Dela Gothic One", g: true },
  dot: { family: "DotGothic16", g: true },
  pop: { family: "Hachi Maru Pop", g: true },
  rampart: { family: "Rampart One", g: true },
  reggae: { family: "Reggae One", g: true },
  rocknroll: { family: "RocknRoll One", g: true },
  yuji: { family: "Yuji Syuku", g: true },
  yusei: { family: "Yusei Magic", g: true },
  jiyu: { family: "JiyunoTsubasa", fallback: "cursive" },
  shippori: { family: "Shippori Mincho", g: true },
  bruno: { family: "Bruno Ace SC", g: true },
  castoro: { family: "Castoro Titling", g: true },
  poltawski: { family: "Poltawski Nowy", g: true },
  vina: { family: "Vina Sans", g: true },
  exo2: { family: "Exo 2", g: true },
  inconsolata: { family: "Inconsolata", g: true, fallback: "monospace" },
  script: { family: "Dancing Script", g: true, fallback: "cursive" },
  verdana: { family: "Verdana" },
  tahoma: { family: "Tahoma" },
  helvetica: { family: "Helvetica" },
  times: { family: "Times New Roman", fallback: "serif" },
  impact: { family: "Impact" },
  comic: { family: "Comic Sans MS", fallback: "cursive" },
};

export function rankFontStack(f: RankFont): string {
  const m = RANK_FONT_CSS[f.key];
  const fam = m?.family || f.family || f.label;
  return `"${fam}", ${m?.fallback || "sans-serif"}`;
}

/** Un solo foglio Google Fonts con i soli glifi che servono (parametro `text`). */
export function rankFontsCssUrl(fonts: RankFont[], text: string): string {
  const fams = fonts.map((f) => RANK_FONT_CSS[f.key]).filter((m) => m?.g).map((m) => `family=${m!.family.replace(/ /g, "+")}`);
  if (!fams.length) return "";
  const glyphs = [...new Set(`Aa${text}`)].join("");
  return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap&text=${encodeURIComponent(glyphs)}`;
}

function authHeaders(token: string, json = false): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const t = await res.text();
    if (!t) return null;
    return JSON.parse(t.replace(/^\uFEFF/, "").trim());
  } catch {
    return null;
  }
}

function fail(res: Response, body: Record<string, unknown> | null, fallback: string): ApiResult<never> {
  return {
    ok: false,
    status: res.status || Number(body?.status) || 500,
    error: String(body?.error || ""),
    message: String(body?.message || fallback),
  };
}

export function parsePersTab(raw: string | null | undefined): PersTab {
  const t = String(raw || "")
    .trim()
    .toLowerCase();
  if (t === "vocale") return "voice";
  if (t === "primary" || t === "secondary" || t === "voice") return t;
  if (t === "ruoli" || t === "rolepanel" || t === "colors" || t === "colori") return "roles";
  if (t === "mention" || t === "mention_reaction") return "reactions";
  if (t === "mention_response") return "response";
  if (EXTRAS_TABS.has(t as PersTab) || t === "birthday" || t === "privacy" || t === "reactions" || t === "response" || t === "roles") {
    return t as PersTab;
  }
  if (t === "rank" || t === "wallpaper") return "rank";
  return "rank";
}

export function normalizeHex(value: string | null | undefined, fallback = "#202225"): string {
  let raw = String(value || "").trim();
  if (!raw) raw = fallback;
  if (raw.charAt(0) !== "#") raw = `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
    let alt = String(fallback || "").trim();
    if (alt && alt.charAt(0) !== "#") alt = `#${alt}`;
    raw = /^#[0-9a-fA-F]{6}$/.test(alt) ? alt : "#202225";
  }
  return raw.toUpperCase();
}

export function inferColorMode(hex?: string, hex2?: string, mode?: string): ColorMode {
  const m = String(mode || "").toLowerCase();
  if (m === "gradient" || m === "holo" || m === "solid") return m;
  const h1 = normalizeHex(hex, "");
  const h2 = normalizeHex(hex2, "");
  if (h1 === HOLO_PRIMARY.toUpperCase() && h2 === HOLO_SECONDARY.toUpperCase()) return "holo";
  if (h2 && h2 !== "#202225") return "gradient";
  return "solid";
}

function mapCustomRole(raw: unknown): CustomRoleEntity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(r.name || ""),
    color: r.color != null ? String(r.color) : undefined,
    color2: r.color2 != null ? String(r.color2) : undefined,
    colorMode: r.colorMode != null ? String(r.colorMode) : undefined,
    emoji: r.emoji != null ? String(r.emoji) : undefined,
    iconUrl: r.iconUrl != null ? String(r.iconUrl) : undefined,
    createdAt: r.createdAt != null ? String(r.createdAt) : undefined,
    memberCount: Number(r.memberCount) || undefined,
    sharedMembers: Array.isArray(r.sharedMembers) ? (r.sharedMembers as SharedMember[]) : undefined,
    sharedMembersCount: Number(r.sharedMembersCount) || undefined,
  };
}

function mapCustomVoice(raw: unknown): CustomVoiceEntity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(r.name || ""),
    emoji: r.emoji != null ? String(r.emoji) : undefined,
    createdAt: r.createdAt != null ? String(r.createdAt) : undefined,
    memberCount: Number(r.memberCount) || undefined,
    sharedMembers: Array.isArray(r.sharedMembers) ? (r.sharedMembers as SharedMember[]) : undefined,
    sharedMembersCount: Number(r.sharedMembersCount) || undefined,
  };
}

function mapCustomState(body: Record<string, unknown>): CustomProfileState {
  return {
    userId: String(body.userId || ""),
    featureAccess: (body.featureAccess as FeatureAccess) || {},
    permissions: (body.permissions as { gradientHolo?: boolean }) || {},
    requirements: (body.requirements as RequirementsMeta) || null,
    voiceActivity: (body.voiceActivity as VoiceActivity) || null,
    primary: mapCustomRole(body.primary),
    secondary: mapCustomRole(body.secondary),
    voice: mapCustomVoice(body.voice),
    expiresAt: body.expiresAt != null ? String(body.expiresAt) : undefined,
  };
}

export async function loadCustomProfile(token: string): Promise<ApiResult<CustomProfileState>> {
  try {
    const res = await fetch("/webhooks/site-custom-profile", {
      headers: authHeaders(token),
      cache: "no-store",
      credentials: "omit",
    });
    const body = await readJson(res);
    if (!res.ok || !body?.ok) return fail(res, body, "Non riesco a caricare i ruoli custom.");
    return { ok: true, data: mapCustomState(body) };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

export async function mutateCustomProfile(
  token: string,
  payload: {
    target: "primary" | "secondary" | "voice";
    action: string;
    name?: string;
    baseName?: string;
    mode?: string;
    hex?: string;
    hex2?: string;
    value?: string;
    emoji?: string;
    memberId?: string;
  },
): Promise<ApiResult<CustomProfileState>> {
  try {
    const res = await fetch("/webhooks/site-custom-profile", {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify(payload),
      credentials: "omit",
    });
    const body = await readJson(res);
    if (!res.ok || !body?.ok) return fail(res, body, "Operazione non riuscita.");
    return { ok: true, data: mapCustomState(body), message: String(body.message || "Salvato.") };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

export async function loadGuildEmojis(token: string, force = false): Promise<GuildEmoji[]> {
  try {
    const q = force ? "?fresh=1" : "";
    const res = await fetch(`/webhooks/site-custom-profile/emojis${q}`, {
      headers: authHeaders(token),
      cache: "no-store",
      credentials: "omit",
    });
    const body = await readJson(res);
    if (!res.ok || !body?.ok || !Array.isArray(body.emojis)) return [];
    return body.emojis as GuildEmoji[];
  } catch {
    return [];
  }
}

export async function loadRankCard(token: string): Promise<ApiResult<RankCardState>> {
  try {
    const res = await fetch("/webhooks/site-rank-card", {
      headers: authHeaders(token),
      cache: "no-store",
      credentials: "omit",
    });
    const body = await readJson(res);
    if (!res.ok || !body?.ok) return fail(res, body, "Non riesco a caricare la rank card.");
    return {
      ok: true,
      data: {
        userId: String(body.userId || ""),
        username: String(body.username || ""),
        displayName: String(body.displayName || body.username || ""),
        avatarUrl: body.avatarUrl ? String(body.avatarUrl) : undefined,
        theme: (body.theme as RankTheme) || (body.defaults as RankTheme),
        defaults: (body.defaults as RankTheme) || (body.theme as RankTheme),
        wallpapers: Array.isArray(body.wallpapers) ? (body.wallpapers as RankWallpaper[]) : [],
        fonts: Array.isArray(body.fonts) ? (body.fonts as RankFont[]) : [],
        permissions: (body.permissions as RankCardState["permissions"]) || {},
        stats: (body.stats as RankCardState["stats"]) || {
          level: 0,
          totalExp: 0,
          currentLevelExp: 0,
          nextLevelExp: 0,
          progressPercent: 0,
          weeklyExp: 0,
          weeklyRank: null,
          allTimeRank: null,
          multiplier: 1,
        },
      },
    };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

export async function saveRankCard(token: string, theme: RankTheme): Promise<ApiResult<RankTheme>> {
  try {
    const res = await fetch("/webhooks/site-rank-card", {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ mode: "save", theme }),
      credentials: "omit",
    });
    const body = await readJson(res);
    if (!res.ok || !body?.ok) return fail(res, body, "Non sono riuscito a salvare la rank card.");
    return { ok: true, data: (body.theme as RankTheme) || theme, message: String(body.message || "Salvato.") };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

export async function resetRankCard(token: string): Promise<ApiResult<RankTheme>> {
  try {
    const res = await fetch("/webhooks/site-rank-card", {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ mode: "reset" }),
      credentials: "omit",
    });
    const body = await readJson(res);
    if (!res.ok || !body?.ok) return fail(res, body, "Reset non riuscito.");
    return { ok: true, data: body.theme as RankTheme, message: String(body.message || "Resettata.") };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

/** Anteprima live: restituisce object URL (da revocare) della PNG. */
export async function previewRankCard(token: string, theme: RankTheme, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/webhooks/site-rank-card-preview", {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ theme }),
      credentials: "omit",
      signal,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob?.size) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function loadProfileExtras(token: string, section?: string): Promise<ApiResult<ProfileExtras>> {
  try {
    const q = section ? `?section=${encodeURIComponent(section)}` : "";
    const res = await fetch(`/webhooks/site-profile-extras${q}`, {
      headers: authHeaders(token),
      cache: "no-store",
      credentials: "omit",
    });
    const body = await readJson(res);
    if (!res.ok || !body?.ok) return fail(res, body, "Non riesco a caricare le impostazioni.");
    return {
      ok: true,
      data: {
        userId: String(body.userId || ""),
        birthday: (body.birthday as ProfileExtras["birthday"]) || {
          day: null,
          month: null,
          birthYear: null,
          showAge: true,
        },
        privacy: (body.privacy as ProfileExtras["privacy"]) || { kinds: [] },
        mentionReaction: (body.mentionReaction as ProfileExtras["mentionReaction"]) || {
          access: false,
          max: 0,
          reactions: [],
          display: [],
        },
        mentionResponse: (body.mentionResponse as ProfileExtras["mentionResponse"]) || {
          access: false,
          accessHint: "",
          text: "",
        },
        rolePanel: (body.rolePanel as ProfileExtras["rolePanel"]) || { categories: [], byKey: {} },
      },
    };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

export async function mutateProfileExtras(
  token: string,
  payload: Record<string, unknown>,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch("/webhooks/site-profile-extras", {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify(payload),
      credentials: "omit",
    });
    const body = await readJson(res);
    if (!res.ok || !body?.ok) return fail(res, body, "Operazione non riuscita.");
    return { ok: true, data: body, message: String(body.message || "Salvato.") };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete." };
  }
}

export function reactionTokenFromPick(pick: { type?: string; id?: string; text?: string; markup?: string }): string {
  if (!pick) return "";
  if (pick.type === "custom" && pick.id) return `custom:${pick.id}`;
  const ch = String(pick.text || pick.markup || "").trim();
  return ch ? `unicode:${ch}` : "";
}

export function customEmojiUrl(id: string, animated = false, size = 48): string {
  const ext = animated ? "gif" : "png";
  return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=${size}`;
}

export function featureUnlocked(state: CustomProfileState | null, target: "primary" | "secondary" | "voice"): boolean {
  if (!state) return false;
  const fa = state.featureAccess || {};
  if (target === "primary") return Boolean(fa.customRolePrimary);
  if (target === "secondary") return Boolean(fa.customRoleSecondary);
  return Boolean(fa.customVoc);
}

export function requirementsFor(state: CustomProfileState | null, target: "primary" | "secondary" | "voice") {
  const req = state?.requirements;
  if (!req) return null;
  if (target === "primary") return req.rolePrimary || null;
  if (target === "secondary") return req.roleSecondary || null;
  return req.voice || null;
}
