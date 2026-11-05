import { cdnUrl } from "@/lib/site";

/** Icone ufficiali oggetti utility evento (PNG trasparente). */
export const UTILITY_ICON_V = "20261105u2";

export const UTILITY_ITEM_IDS = [
  "bacta",
  "festival_ancestors",
  "riciclaggio_hutt",
  "sconto_mercato_nero",
] as const;

export type UtilityItemId = (typeof UTILITY_ITEM_IDS)[number];

export function isUtilityItemId(id: string): id is UtilityItemId {
  return (UTILITY_ITEM_IDS as readonly string[]).includes(id);
}

export function utilityIconUrl(itemId: string): string {
  const id = String(itemId || "").trim();
  if (!isUtilityItemId(id)) return "";
  return cdnUrl(`/images/starwars/oggetti/${id}.png?v=${UTILITY_ICON_V}`);
}
