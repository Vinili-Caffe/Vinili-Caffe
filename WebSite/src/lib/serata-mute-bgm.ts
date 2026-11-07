/** Durante countdown/film su /seratafilm silenzia VinylMusicRoot / EventoMusic. */
export const SERATA_MUTE_BGM_ATTR = "data-vc-serata-mute-bgm";

export function setSerataMuteBgm(on: boolean) {
  try {
    document.documentElement.toggleAttribute(SERATA_MUTE_BGM_ATTR, on);
  } catch {
    /* ignore */
  }
}

export function readSerataMuteBgm() {
  try {
    return document.documentElement.hasAttribute(SERATA_MUTE_BGM_ATTR);
  } catch {
    return false;
  }
}

export function subscribeSerataMuteBgm(onChange: (on: boolean) => void) {
  const sync = () => onChange(readSerataMuteBgm());
  sync();
  const mo = new MutationObserver(sync);
  try {
    mo.observe(document.documentElement, { attributes: true, attributeFilter: [SERATA_MUTE_BGM_ATTR] });
  } catch {
    /* ignore */
  }
  return () => mo.disconnect();
}
