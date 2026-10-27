import type { IncomingMessage, ServerResponse } from "node:http";
import { getUserExpStats, getLevelInfo, getUserRank } from "../vinyls/modules/activity/exp";
import { getBalance, getInventory } from "../vinyls/modules/economy/wallet";
import { listCasesForUser } from "../vinyls/modules/moderation/modCaseStore";
import { getStaffPoints, listStaffLeaderboard } from "../vinyls/modules/staff/points";
import { listOpenTickets, getTicket } from "../vinyls/modules/tickets/store";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/**
 * Route interne 127.0.0.1 per staff/tickets/economy (no auth: solo loopback).
 * Prefisso /api/ts/
 */
export function handleInternalApi(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method !== "GET" || !url.pathname.startsWith("/api/ts/")) return false;

  const parts = url.pathname.split("/").filter(Boolean); // api, ts, ...
  // /api/ts/staff/:guildId/:userId
  if (parts[2] === "staff" && parts[3] && parts[4]) {
    const guildId = parts[3];
    const userId = parts[4];
    json(res, 200, {
      guildId,
      userId,
      points: getStaffPoints(guildId, userId),
      leaderboard: listStaffLeaderboard(guildId, 10),
    });
    return true;
  }
  // /api/ts/tickets/:guildId
  if (parts[2] === "tickets" && parts[3] && !parts[4]) {
    json(res, 200, { guildId: parts[3], open: listOpenTickets(parts[3]) });
    return true;
  }
  // /api/ts/tickets/:guildId/:id
  if (parts[2] === "tickets" && parts[3] && parts[4]) {
    const t = getTicket(parts[4]);
    if (!t || t.guildId !== parts[3]) {
      json(res, 404, { error: "not_found" });
      return true;
    }
    json(res, 200, t);
    return true;
  }
  // /api/ts/user/:guildId/:userId
  if (parts[2] === "user" && parts[3] && parts[4]) {
    const guildId = parts[3];
    const userId = parts[4];
    const exp = getUserExpStats(guildId, userId);
    json(res, 200, {
      guildId,
      userId,
      exp,
      level: getLevelInfo(exp.totalExp),
      rank: getUserRank(guildId, userId),
      balance: getBalance(guildId, userId),
      inventory: getInventory(guildId, userId),
      staffPoints: getStaffPoints(guildId, userId),
      modCases: listCasesForUser(guildId, userId).slice(-20),
    });
    return true;
  }

  json(res, 404, {
    error: "unknown_route",
    routes: [
      "/api/ts/staff/:guildId/:userId",
      "/api/ts/tickets/:guildId",
      "/api/ts/tickets/:guildId/:id",
      "/api/ts/user/:guildId/:userId",
      "/api/ts/gdpr/export/:guildId/:userId",
    ],
  });
  return true;
}
