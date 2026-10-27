import type { IncomingMessage, ServerResponse } from "node:http";
import { getUserExpStats, getLevelInfo } from "../activity/exp";
import { getBalance, getInventory } from "../economy/wallet";
import { listCasesForUser } from "../moderation/modCaseStore";
import { getStaffPoints } from "../staff/points";

/**
 * GDPR export Keep — montato su /api/ts/gdpr/* (loopback health).
 * Erase resta gated VC_TS_GDPR_ERASE=1.
 */
export function handleGdprApi(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (!url.pathname.startsWith("/api/ts/gdpr/")) return false;
  const parts = url.pathname.split("/").filter(Boolean); // api ts gdpr ...
  const action = parts[3];
  const guildId = parts[4];
  const userId = parts[5];
  if (!guildId || !userId || !/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(userId)) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad_ids" }));
    return true;
  }
  if (action === "export" && req.method === "GET") {
    const exp = getUserExpStats(guildId, userId);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        guildId,
        userId,
        exportedAt: new Date().toISOString(),
        exp,
        level: getLevelInfo(exp.totalExp),
        balance: getBalance(guildId, userId),
        inventory: getInventory(guildId, userId),
        staffPoints: getStaffPoints(guildId, userId),
        modCases: listCasesForUser(guildId, userId),
      }),
    );
    return true;
  }
  if (action === "erase" && req.method === "POST") {
    if (process.env.VC_TS_GDPR_ERASE !== "1") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "erase_disabled" }));
      return true;
    }
    res.writeHead(501, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "erase_not_wired_to_live_mongo" }));
    return true;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "unknown" }));
  return true;
}
