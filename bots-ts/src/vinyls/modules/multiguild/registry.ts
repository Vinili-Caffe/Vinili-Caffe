import { logger } from "../../../shared";

export interface TenantConfig {
  guildId: string;
  label: string;
  prefix?: string;
  features: string[];
}

const tenants = new Map<string, TenantConfig>();

/** Carica tenant da `VC_TS_TENANTS` JSON array. */
export function loadTenantsFromEnv(raw = process.env.VC_TS_TENANTS || ""): number {
  tenants.clear();
  if (!raw.trim()) {
    logger.info("[multiguild] nessun VC_TS_TENANTS — single-guild mode");
    return 0;
  }
  try {
    const arr = JSON.parse(raw) as TenantConfig[];
    for (const t of arr) {
      if (!t?.guildId) continue;
      tenants.set(String(t.guildId), {
        guildId: String(t.guildId),
        label: t.label || t.guildId,
        prefix: t.prefix,
        features: Array.isArray(t.features) ? t.features.map(String) : [],
      });
    }
  } catch (err) {
    logger.warn("[multiguild] VC_TS_TENANTS JSON invalido", err);
  }
  logger.info(`[multiguild] ${tenants.size} tenant caricati`);
  return tenants.size;
}

export function getTenant(guildId: string): TenantConfig | undefined {
  return tenants.get(guildId);
}

export function listTenants(): TenantConfig[] {
  return [...tenants.values()];
}

export function tenantHasFeature(guildId: string, feature: string): boolean {
  const t = tenants.get(guildId);
  if (!t) return true; // no registry → allow (main guild)
  if (!t.features.length) return true;
  return t.features.includes(feature) || t.features.includes("*");
}
