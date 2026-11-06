import { cdnUrl } from "@/lib/site";

/** Icone ufficiali truppe evento (PNG su fondo nero). */
export const TROOP_ICON_V = "20261106f6";

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

/** Fazioni con cartella dedicata sotto `/images/starwars/truppe/{faction}/`. */
export const TROOP_FACTION_FOLDERS = [
  "repubblica",
  "separatisti",
  "ribellione",
  "impero",
  "nuova_repubblica",
  "nuovo_ordine",
] as const;

export type TroopFactionFolder = (typeof TROOP_FACTION_FOLDERS)[number];

export function isTroopUnitId(id: string): id is TroopUnitId {
  return (TROOP_UNIT_IDS as readonly string[]).includes(id);
}

/** Normalizza alias fazione → cartella asset. */
export function troopFactionFolder(factionId?: string | null): TroopFactionFolder | null {
  const f = String(factionId || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!f) return null;
  if (f === "primo_ordine" || f === "first_order") return "nuovo_ordine";
  if (f === "republic") return "repubblica";
  if (f === "separatist" || f === "cis") return "separatisti";
  if (f === "rebels" || f === "alliance") return "ribellione";
  if (f === "empire" || f === "imperial") return "impero";
  if ((TROOP_FACTION_FOLDERS as readonly string[]).includes(f)) return f as TroopFactionFolder;
  return null;
}

function sharedUrl(id: string): string {
  return cdnUrl(`/images/starwars/truppe/${id}.png?v=${TROOP_ICON_V}`);
}

function factionUrl(folder: TroopFactionFolder, id: string): string {
  return cdnUrl(`/images/starwars/truppe/${folder}/${id}.png?v=${TROOP_ICON_V}`);
}

/**
 * Candidati icona: sempre `/truppe/{fazione}/{id}.png` se c’è fazione, poi shared.
 */
export function troopIconCandidates(unitId: string, factionId?: string | null): string[] {
  const id = String(unitId || "").trim();
  if (!isTroopUnitId(id)) return [];
  const folder = troopFactionFolder(factionId);
  const shared = sharedUrl(id);
  if (!folder) return [shared];
  return [factionUrl(folder, id), shared];
}

/** Icona truppa primaria per fazione (`/truppe/{fazione}/{id}.png`). */
export function troopIconUrl(unitId: string, factionId?: string | null): string {
  return troopIconCandidates(unitId, factionId)[0] || "";
}

/** Fallback shared (senza cartella fazione). */
export function troopIconUrlShared(unitId: string): string {
  return troopIconUrl(unitId, null);
}
