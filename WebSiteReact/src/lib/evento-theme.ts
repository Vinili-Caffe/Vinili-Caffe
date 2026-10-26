/** Tema immersivo Star Wars — colori, path, BGM (YouTube VOD). */

export const SW = {
  void: "#05070f",
  deep: "#0a1020",
  navy: "#121a32",
  panel: "rgba(12, 18, 36, 0.82)",
  parchment: "#f0e6c8",
  gold: "#c9a227",
  goldSoft: "#e4c76b",
  laser: "#2ea8ff",
  saber: "#4ade80",
  sith: "#e11d48",
  separatist: "#7c3aed",
  republic: "#38bdf8",
} as const;

/**
 * BGM SW: catena fallback (Topic channel spesso error 150 in embed).
 * Primario = DisneyMusicVEVO audio-only (embed ok).
 */
export const EVENTO_YT_FALLBACKS = [
  {
    id: "y8ac1Qg-r-8",
    url: "https://www.youtube.com/watch?v=y8ac1Qg-r-8",
    title: "Star Wars · Main Title",
  },
  {
    id: "u_OO9taOvG8",
    url: "https://www.youtube.com/watch?v=u_OO9taOvG8",
    title: "Star Wars · Main Title",
  },
  {
    id: "e9lapdvLSGw",
    url: "https://www.youtube.com/watch?v=e9lapdvLSGw",
    title: "Star Wars · Main Title",
  },
] as const;

export const EVENTO_YT = EVENTO_YT_FALLBACKS[0]!;

export const EVENTO_BGM_VOL_KEY = "vc_evento_sw_bgm_vol_v1";
export const EVENTO_BGM_ON_KEY = "vc_evento_sw_bgm_on_v1";

export function isEventoChromePath(pathname: string): boolean {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  if (p === "/evento" || p.startsWith("/evento/")) return true;
  if (p === "/puzzle" || p.startsWith("/puzzle/")) return true;
  return false;
}
