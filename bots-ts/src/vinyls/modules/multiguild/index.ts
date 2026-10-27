import { logger } from "../../../shared";
import { loadTenantsFromEnv } from "./registry";
import { registerTenantButtons } from "./tenantButtons";

/** Registry tenant da env + button tenant* live. */
export function registerMultiGuildModule(): void {
  loadTenantsFromEnv();
  registerTenantButtons();
  logger.info("[multiguild] registry + tenant buttons on");
}
