import { buildDiscordComponentEmbedPayload, type ComponentEmbedOpts } from "@/lib/og";

/** JSON Component Embed Discord (link preview) — incluso nell’HTML statico. */
export function DiscordComponentEmbed(opts: ComponentEmbedOpts) {
  const json = JSON.stringify(buildDiscordComponentEmbedPayload(opts));
  return (
    <script
      id="discord:component-embed"
      type="application/json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
