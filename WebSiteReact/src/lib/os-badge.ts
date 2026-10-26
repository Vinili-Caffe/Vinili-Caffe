/** Badge icona PWA / OS (setAppBadge). Allineato a unread inbox. */

export function setOsAppBadge(unread: number) {
  if (typeof navigator === "undefined") return;
  const n = Math.max(0, Math.min(99, Math.floor(Number(unread) || 0)));
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (c?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (n > 0 && typeof nav.setAppBadge === "function") {
      void nav.setAppBadge(n).catch(() => {});
    } else if (n <= 0 && typeof nav.clearAppBadge === "function") {
      void nav.clearAppBadge().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
