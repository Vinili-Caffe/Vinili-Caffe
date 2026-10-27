import fs from "node:fs";
import path from "node:path";
import { logger } from "../../../shared";

const DATA_DIR = path.join(process.cwd(), "data", "markov");

function fileFor(guildId: string): string {
  return path.join(DATA_DIR, `${guildId}.json`);
}

export function loadCorpusFromDisk(guildId: string): string[] {
  try {
    const p = fileFor(guildId);
    if (!fs.existsSync(p)) return [];
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { lines?: string[] };
    return Array.isArray(raw.lines) ? raw.lines.map(String) : [];
  } catch (err) {
    logger.warn("[markov] load disk", err);
    return [];
  }
}

export function saveCorpusToDisk(guildId: string, lines: string[]): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(fileFor(guildId), JSON.stringify({ lines, updatedAt: Date.now() }));
  } catch (err) {
    logger.warn("[markov] save disk", err);
  }
}

export function listPersistedGuildIds(): string[] {
  try {
    if (!fs.existsSync(DATA_DIR)) return [];
    return fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}
