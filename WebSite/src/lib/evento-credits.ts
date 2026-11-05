import { cdnUrl } from "@/lib/site";

/** Icona ufficiale crediti evento Star Wars (Galactic Credit). */
export const CREDITI_ICON_V = "20261105cr1";

export function creditiIconUrl(): string {
  return cdnUrl(`/images/starwars/crediti.gif?v=${CREDITI_ICON_V}`);
}
