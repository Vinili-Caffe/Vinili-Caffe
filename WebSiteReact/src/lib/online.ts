/** Online/offline browser: evita fetch che riempiono la console di ERR_INTERNET_DISCONNECTED. */

export function isOnline(): boolean {
  try {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}

/** true se torniamo online (o già online). */
export function onOnlineChange(cb: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const up = () => cb(true);
  const down = () => cb(false);
  window.addEventListener("online", up);
  window.addEventListener("offline", down);
  return () => {
    window.removeEventListener("online", up);
    window.removeEventListener("offline", down);
  };
}
