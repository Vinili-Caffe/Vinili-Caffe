import type { ComponentEmbedOpts } from "@/lib/og";

/**
 * Marker semantico per pagina (title/desc restano in pageSocialMeta / <title>).
 * Il payload reale va in `<head>` via `scripts/inject-discord-component-embeds.mjs`
 * dopo `next build` (static export: niente API `/embeds/ce`).
 */
export function DiscordComponentEmbed(_opts: ComponentEmbedOpts) {
  return null;
}
