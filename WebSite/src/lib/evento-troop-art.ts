import { cdnUrl } from "@/lib/site";

/** Icone ufficiali truppe evento (PNG su fondo nero). */
export const TROOP_ICON_V = "20261105t5";

export const TROOP_UNIT_IDS = [
  "cloni_droidi",
  "tx130_gat",
  "arc170_vulture",
  "atte_aat",
  "jedi_cacciatore",
  "atot_mtt",
  "laat_hmp",
  "havw_ig227",
  "acclamator_munificent",
  "venator_providence",
  "ribelli_storm",
  "atte_aat_cw",
  "ywings_tie",
  "htt_itt",
  "xwing_interceptor",
  "gr75_gozanti",
  "mc80_imperial",
  "ribelli_storm_sq",
  "colonnello",
  "generale",
  "ewings_tie_ssf",
  "endurance_resurgent",
] as const;

export type TroopUnitId = (typeof TROOP_UNIT_IDS)[number];

export function isTroopUnitId(id: string): id is TroopUnitId {
  return (TROOP_UNIT_IDS as readonly string[]).includes(id);
}

export function troopIconUrl(unitId: string): string {
  const id = String(unitId || "").trim();
  if (!isTroopUnitId(id)) return "";
  return cdnUrl(`/images/starwars/truppe/${id}.png?v=${TROOP_ICON_V}`);
}
