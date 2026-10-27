import type { Client, Message, TextBasedChannel } from "discord.js";
import { logger } from "../../../shared";
import { listPersistedGuildIds, loadCorpusFromDisk, saveCorpusToDisk } from "./persist";

const linesByGuild = new Map<string, string[]>();
const MAX_LINES = 2000;
const dirtyGuilds = new Set<string>();

interface GuildAutoState {
  messagesSinceLastGen: number;
  nextThreshold: number;
  lastAutoSendAt: number;
}

const autoState = new Map<string, GuildAutoState>();

function channelAllowed(channelId: string): boolean {
  const allow = String(process.env.VC_TS_MARKOV_CHANNELS || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allow.length) return true;
  return allow.includes(channelId);
}

function remember(guildId: string, content: string): void {
  const t = content.trim();
  if (t.length < 8 || t.length > 400) return;
  if (t.startsWith("+") || t.startsWith("!") || t.startsWith("/")) return;
  if (/https?:\/\//i.test(t) && process.env.VC_TS_MARKOV_FILTER_LINKS === "1") return;
  const list = linesByGuild.get(guildId) || [];
  list.push(t);
  if (list.length > MAX_LINES) list.splice(0, list.length - MAX_LINES);
  linesByGuild.set(guildId, list);
  dirtyGuilds.add(guildId);
}

export function corpusSize(guildId: string): number {
  return linesByGuild.get(guildId)?.length || 0;
}

export function sampleLine(guildId: string): string | null {
  const pool = linesByGuild.get(guildId);
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function buildMarkovModel(lines: string[], keySize = 2): Map<string, string[]> {
  const model = new Map<string, string[]>();
  for (const line of lines) {
    const words = String(line || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length <= keySize) continue;
    for (let i = 0; i < words.length - keySize; i += 1) {
      const key = words.slice(i, i + keySize).join(" ");
      const next = words[i + keySize]!;
      if (!model.has(key)) model.set(key, []);
      model.get(key)!.push(next);
    }
  }
  return model;
}

export interface GenerateOptions {
  maxSymbols?: number;
  targetSymbols?: number;
  count?: number;
  keySize?: number;
  begin?: string;
}

/** Port di `generateLocalMarkov` (Coffee markovGeneratorService). */
export function generateLocalMarkov(lines: string[], options: GenerateOptions = {}): string[] {
  const hardMax = Math.min(Math.max(Number(options.maxSymbols) || 180, 1), 500);
  const minTarget = Math.max(40, Math.floor(hardMax * 0.4));
  const targetLen = Number.isFinite(Number(options.targetSymbols))
    ? Math.min(hardMax, Math.max(minTarget, Number(options.targetSymbols)))
    : minTarget + Math.floor(Math.random() * (hardMax - minTarget + 1));
  const count = Math.min(Math.max(Number(options.count) || 1, 1), 5);
  const keySize = Math.min(Math.max(Number(options.keySize) || 2, 1), 3);
  const begin = String(options.begin || "").trim();
  const model = buildMarkovModel(lines, keySize);
  if (!model.size) return [];
  const out: string[] = [];
  for (let n = 0; n < count; n += 1) {
    let words = begin ? begin.split(/\s+/).filter(Boolean) : [];
    if (!words.length) {
      const starter = pickRandom(lines);
      if (!starter) continue;
      words = starter.split(/\s+/).filter(Boolean).slice(0, keySize);
    }
    while (words.length < keySize) {
      const seed = pickRandom(lines);
      if (!seed) break;
      words = seed.split(/\s+/).filter(Boolean).slice(0, keySize);
    }
    let text = words.join(" ");
    let guard = 0;
    while (text.length < targetLen && guard < hardMax) {
      guard += 1;
      const key = words.slice(-keySize).join(" ");
      const nextWords = model.get(key);
      if (!nextWords?.length) break;
      const next = pickRandom(nextWords);
      if (!next) break;
      const candidate = `${text} ${next}`;
      if (candidate.length > hardMax) break;
      words.push(next);
      text = candidate;
    }
    const trimmed = text.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

export function generateForGuild(guildId: string, options: GenerateOptions = {}): string[] {
  const pool = linesByGuild.get(guildId) || [];
  return generateLocalMarkov(pool, options);
}

function autosendEnabled(): boolean {
  return process.env.VC_TS_MARKOV_AUTOSEND === "1";
}

function minCorpus(): number {
  const n = Number(process.env.VC_TS_MARKOV_MIN_CORPUS || 30);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

function pickThreshold(): number {
  const min = Math.max(5, Number(process.env.VC_TS_MARKOV_MIN_GAP || 15));
  const max = Math.max(min, Number(process.env.VC_TS_MARKOV_MAX_GAP || 40));
  return min + Math.floor(Math.random() * (max - min + 1));
}

function getAuto(guildId: string): GuildAutoState {
  let s = autoState.get(guildId);
  if (!s) {
    s = { messagesSinceLastGen: 0, nextThreshold: pickThreshold(), lastAutoSendAt: 0 };
    autoState.set(guildId, s);
  }
  return s;
}

async function maybeAutosend(message: Message): Promise<void> {
  if (!autosendEnabled() || !message.guild || !message.channel.isSendable()) return;
  const guildId = message.guild.id;
  const corpus = linesByGuild.get(guildId) || [];
  if (corpus.length < minCorpus()) return;

  const state = getAuto(guildId);
  state.messagesSinceLastGen += 1;
  if (state.messagesSinceLastGen < state.nextThreshold) return;
  const gapMs = Math.max(10_000, Number(process.env.VC_TS_MARKOV_MIN_SEND_GAP_MS || 45_000));
  if (Date.now() - state.lastAutoSendAt < gapMs) return;

  const lines = generateLocalMarkov(corpus, { count: 1, maxSymbols: 180 });
  const text = lines[0];
  if (!text) return;

  state.messagesSinceLastGen = 0;
  state.nextThreshold = pickThreshold();
  state.lastAutoSendAt = Date.now();

  try {
    await (message.channel as TextBasedChannel & { send: (c: string) => Promise<unknown> }).send(text);
  } catch (err) {
    logger.warn("[markov] autosend", err);
  }
}

export function registerMarkovModule(client: Client): void {
  for (const gid of listPersistedGuildIds()) {
    const lines = loadCorpusFromDisk(gid);
    if (lines.length) linesByGuild.set(gid, lines);
  }
  client.on("messageCreate", (message: Message) => {
    if (message.author.bot || !message.guild || !message.content) return;
    if (!channelAllowed(message.channel.id)) return;
    remember(message.guild.id, message.content);
    void maybeAutosend(message);
  });
  setInterval(() => {
    for (const gid of [...dirtyGuilds]) {
      dirtyGuilds.delete(gid);
      saveCorpusToDisk(gid, linesByGuild.get(gid) || []);
    }
  }, 30_000).unref?.();
  logger.info(
    `[markov] collector + disk persist + generateLocal` +
      (autosendEnabled() ? " + autosend" : " (autosend off)"),
  );
}
