import type { Client } from "discord.js";
/**
 * Plugin stagionali (Hogwarts / Star Wars / Halloween).
 * Off di default — si abilitano con VC_PLUGINS=hogwarts,starwars,halloween
 */
export type PluginId = "hogwarts" | "starwars" | "halloween";

export interface BotPlugin {
  id: PluginId;
  register(client: Client): void | Promise<void>;
}

const plugins = new Map<PluginId, BotPlugin>();

export function definePlugin(plugin: BotPlugin): void {
  plugins.set(plugin.id, plugin);
}

export function resolveEnabledPluginIds(raw = process.env.VC_PLUGINS || ""): Set<PluginId> {
  const out = new Set<PluginId>();
  for (const part of String(raw)
    .split(/[,+\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)) {
    if (part === "hogwarts" || part === "starwars" || part === "halloween") out.add(part);
  }
  return out;
}

async function ensurePluginModulesLoaded(): Promise<void> {
  await Promise.all([
    import("./hogwarts.js"),
    import("./starwars.js"),
    import("./halloween.js"),
  ]);
}

export async function loadEnabledPlugins(client: Client): Promise<PluginId[]> {
  await ensurePluginModulesLoaded();
  const enabled = resolveEnabledPluginIds();
  const loaded: PluginId[] = [];
  for (const id of enabled) {
    const plugin = plugins.get(id);
    if (!plugin) continue;
    await plugin.register(client);
    loaded.push(id);
  }
  return loaded;
}
