import { getLiveCaps } from "@/lib/device-fx";

/**
 * CDN Discord: size esplicita + GIF→still se mediaHeavy off.
 * Usare su avatar/icone remoto, non su asset locali.
 */
export function sizedDiscordCdn(
  url: string | null | undefined,
  size = 128,
  opts?: { animate?: boolean },
): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, typeof location !== "undefined" ? location.origin : "https://www.viniliecaffe.it");
    const host = u.hostname.toLowerCase();
    if (!host.includes("discordapp.com") && !host.includes("discord.com")) return raw;

    const caps = getLiveCaps();
    const want = Math.min(size || 128, caps.imageSizeCap || 256);
    const pow = Math.min(512, Math.max(16, 2 ** Math.round(Math.log2(want))));
    u.searchParams.set("size", String(pow));

    const allowAnim = opts?.animate ?? caps.mediaHeavy;
    if (!allowAnim && /\.gif$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\.gif$/i, ".png");
    }
    return u.toString();
  } catch {
    return raw;
  }
}
