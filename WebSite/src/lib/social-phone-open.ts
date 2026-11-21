/** Sample iPhone promo aperto → MusicDock si nasconde (stesso angolo in basso a destra). */

const ATTR = "data-vc-social-phone";
const EVENT = "vc:social-phone-open";

export function setSocialPhoneOpen(open: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.toggleAttribute(ATTR, open);
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { open } }));
  } catch {
    /* ignore */
  }
}

export function isSocialPhoneOpen() {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute(ATTR);
}

/** Subscribe to social-phone open changes; returns unsubscribe. Not a React Hook. */
export function listenSocialPhoneOpen(onChange: (open: boolean) => void) {
  if (typeof window === "undefined") return () => {};
  const sync = () => onChange(isSocialPhoneOpen());
  sync();
  window.addEventListener(EVENT, sync);
  return () => window.removeEventListener(EVENT, sync);
}
