import type { PrefixCommand } from "./types";

const byName = new Map<string, PrefixCommand>();

/** Rimuove nome + alias di un comando già registrato. */
function unregisterCommand(command: PrefixCommand): void {
  for (const [k, v] of [...byName.entries()]) {
    if (v === command) byName.delete(k);
  }
}

export function resetPrefixRegistry(): void {
  byName.clear();
}

/**
 * Registra un comando. Se nome/alias già presi dallo stesso comando → no-op.
 * Se presi da un altro → replace (HMR / re-boot stesso processo).
 */
export function registerPrefixCommand(command: PrefixCommand): void {
  const key = command.name.trim().toLowerCase();
  if (!key) throw new Error("PrefixCommand.name vuoto");

  const existing = byName.get(key);
  if (existing && existing !== command) {
    unregisterCommand(existing);
  }

  byName.set(key, command);
  for (const alias of command.aliases || []) {
    const a = String(alias || "")
      .trim()
      .toLowerCase();
    if (!a) continue;
    const prev = byName.get(a);
    if (prev && prev !== command) unregisterCommand(prev);
    byName.set(a, command);
  }
}

export function getPrefixCommand(name: string): PrefixCommand | undefined {
  return byName.get(String(name || "").trim().toLowerCase());
}

export function listPrefixCommands(): PrefixCommand[] {
  const seen = new Set<PrefixCommand>();
  const out: PrefixCommand[] = [];
  for (const cmd of byName.values()) {
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    out.push(cmd);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
