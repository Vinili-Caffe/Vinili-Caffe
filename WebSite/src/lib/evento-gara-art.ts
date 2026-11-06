import { cdnUrl } from "@/lib/site";

/** Ritratti piloti Podracing Championship. */
export const GARA_POD_ICON_V = "20261106g3";

export const GARA_POD_IDS = ["sebulba", "anakin", "gasgano", "teemto", "ben"] as const;

export type GaraPodId = (typeof GARA_POD_IDS)[number];

/** File CDN scambiati: i jpg erano invertiti rispetto ai nomi. */
const GARA_POD_ICON_FILE: Record<GaraPodId, string> = {
  sebulba: "gasgano",
  anakin: "anakin",
  gasgano: "sebulba",
  teemto: "teemto",
  ben: "ben",
};

export function isGaraPodId(id: string): id is GaraPodId {
  return (GARA_POD_IDS as readonly string[]).includes(id);
}

export function garaPodIconUrl(podId: string): string {
  const id = String(podId || "").trim();
  if (!isGaraPodId(id)) return "";
  return cdnUrl(`/images/starwars/gara/${GARA_POD_ICON_FILE[id]}.jpg?v=${GARA_POD_ICON_V}`);
}
