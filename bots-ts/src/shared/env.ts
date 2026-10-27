import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export type BotLabel = "vinyls" | "coffee" | string;

export interface BotEnv {
  botLabel: BotLabel;
  discordToken: string;
  mongoUri: string;
  logLevel: string;
}

/**
 * Carica env: prima `bots-ts/.env`, poi fallback monorepo root `.env`
 * (token OFFICIAL/TEST come i bot JS) senza override dei valori già set.
 */
export function loadBotsTsEnv(cwd = process.cwd()): void {
  const local = path.join(cwd, ".env");
  if (fs.existsSync(local)) dotenv.config({ path: local });
  const root = path.resolve(cwd, "..", ".env");
  if (fs.existsSync(root)) dotenv.config({ path: root, override: false });
}

function resolveDiscordToken(botLabel: string): string {
  const explicit = String(process.env.DISCORD_TOKEN || "").trim();
  if (explicit) return explicit;
  const label = botLabel.toLowerCase();
  // Allineato a live: Vinyls → OFFICIAL, Coffee → TEST
  if (label.includes("coffee")) {
    return String(process.env.DISCORD_TOKEN_TEST || process.env.DISCORD_TOKEN_COFFEE || "").trim();
  }
  return String(
    process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN_VINYLS || "",
  ).trim();
}

export function readBotEnv(): BotEnv {
  const botLabel = String(process.env.BOT_LABEL || "vinyls-ts").trim() || "vinyls-ts";
  return {
    botLabel,
    discordToken: resolveDiscordToken(botLabel),
    mongoUri: String(process.env.MONGODB_URI || process.env.MONGO_URL || "").trim(),
    logLevel: String(process.env.LOG_LEVEL || "info").trim() || "info",
  };
}

export function assertTokenForLiveLogin(token: string, label: string): void {
  if (!token) {
    throw new Error(`[${label}] Missing DISCORD_TOKEN — stub boot only (no login).`);
  }
}

/**
 * Evita doppio gateway sullo stesso token del JS live.
 * - `DISCORD_TOKEN` esplicito in bots-ts/.env → ok (token dedicato/dev)
 * - token ereditato da OFFICIAL/TEST → solo con `VC_TS_CUTOVER=1` (JS spento)
 */
export function canLoginWithResolvedToken(label: string): { ok: boolean; reason?: string } {
  if (String(process.env.DISCORD_TOKEN || "").trim()) return { ok: true };
  if (process.env.VC_TS_CUTOVER === "1") return { ok: true };
  return {
    ok: false,
    reason:
      `[${label}] Token da root (OFFICIAL/TEST) bloccato: fermare i bot JS (PM2) e settare VC_TS_CUTOVER=1, ` +
      `oppure metti un DISCORD_TOKEN dedicato in bots-ts/.env.`,
  };
}
