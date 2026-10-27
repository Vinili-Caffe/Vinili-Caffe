import { getDb, isMongoConnected, TS_COLLECTIONS } from "../../../shared/mongo";
import { logger } from "../../../shared";

export type TicketStatus = "open" | "claimed" | "closed";

export interface Ticket {
  id: string;
  guildId: string;
  openerId: string;
  claimerId: string | null;
  status: TicketStatus;
  subject: string;
  createdAt: number;
  closedAt: number | null;
}

const tickets = new Map<string, Ticket>();
let seq = 0;

export function createTicket(guildId: string, openerId: string, subject: string): Ticket {
  seq += 1;
  const t: Ticket = {
    id: `T${seq}-${Date.now().toString(36)}`,
    guildId,
    openerId,
    claimerId: null,
    status: "open",
    subject: subject.slice(0, 200) || "Supporto",
    createdAt: Date.now(),
    closedAt: null,
  };
  tickets.set(t.id, t);
  persist(t);
  return t;
}

export function claimTicket(id: string, claimerId: string): Ticket | null {
  const t = tickets.get(id);
  if (!t || t.status === "closed") return null;
  t.status = "claimed";
  t.claimerId = claimerId;
  persist(t);
  return t;
}

export function closeTicket(id: string): Ticket | null {
  const t = tickets.get(id);
  if (!t || t.status === "closed") return null;
  t.status = "closed";
  t.closedAt = Date.now();
  persist(t);
  return t;
}

export function listOpenTickets(guildId: string): Ticket[] {
  return [...tickets.values()].filter((t) => t.guildId === guildId && t.status !== "closed");
}

export function getTicket(id: string): Ticket | undefined {
  return tickets.get(id);
}

function persist(t: Ticket): void {
  if (!isMongoConnected()) return;
  const database = getDb();
  if (!database) return;
  void database
    .collection(TS_COLLECTIONS.tickets)
    .updateOne(
      { id: t.id },
      { $set: { ...t, updatedAt: new Date() }, $setOnInsert: { createdAtDoc: new Date(t.createdAt) } },
      { upsert: true },
    )
    .catch((err) => logger.error("[tickets] persist", err));
}

export async function hydrateTickets(): Promise<void> {
  if (!isMongoConnected()) return;
  const database = getDb();
  if (!database) return;
  const docs = await database
    .collection(TS_COLLECTIONS.tickets)
    .find({ status: { $ne: "closed" } })
    .limit(500)
    .toArray()
    .catch(() => [] as Record<string, unknown>[]);
  for (const raw of docs) {
    const id = String(raw.id || "");
    if (!id || tickets.has(id)) continue;
    tickets.set(id, {
      id,
      guildId: String(raw.guildId || ""),
      openerId: String(raw.openerId || ""),
      claimerId: raw.claimerId ? String(raw.claimerId) : null,
      status: (raw.status as TicketStatus) || "open",
      subject: String(raw.subject || "Supporto"),
      createdAt: Number(raw.createdAt) || Date.now(),
      closedAt: raw.closedAt != null ? Number(raw.closedAt) : null,
    });
  }
}
