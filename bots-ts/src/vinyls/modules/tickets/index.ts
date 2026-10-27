import { logger } from "../../../shared";
import { hydrateTickets } from "./store";

/**
 * Tickets backend only (store + /api/ts/tickets).
 * Nessun prefix Discord: UI ticket Discord = Kill (sito).
 */
export async function registerTicketsModule(): Promise<void> {
  await hydrateTickets();
  logger.info("[tickets] backend on (store/API only, no Discord prefix)");
}
