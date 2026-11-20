/**
 * Bacheche: passaggio di una scheda server a un altro utente.
 * Il proprietario lo propone, il destinatario accetta (deve poter gestire il server) o rifiuta.
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { snowflakeOk } = require("./boardSanitize") as typeof import("./boardSanitize");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, featureGate, emitBoardsChanged, invalidateListingsListCache } = require("./boardReviews") as typeof import("./boardReviews");
const { assertCanClaimServer } = require("./boardInvites") as typeof import("./boardInvites");

const TRANSFER_TTL_MS = 7 * 24 * 3600_000;

function avatarUrlOf(user?) {
  if (!user?.id) return "";
  if (typeof user.displayAvatarURL === "function") return user.displayAvatarURL({ size: 128 });
  return user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : "";
}

async function fetchUser(client?, id?) {
  const uid = String(id || "").trim();
  if (!snowflakeOk(uid)) return null;
  return client?.users?.cache?.get(uid) || (await client?.users?.fetch?.(uid).catch(() => null)) || null;
}

function userCard(user?) {
  if (!user?.id) return null;
  return { id: String(user.id), name: String(user.globalName || user.username || "Utente"), username: String(user.username || ""), avatarUrl: avatarUrlOf(user) };
}

function activeTransfer(doc?) {
  const t = doc?.boardTransfer;
  if (!t || typeof t !== "object" || !t.toUserId) return null;
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return null;
  return t;
}

async function notify(userId?, title?, body?, dedupeKey?) {
  try {
    const { enqueueSiteInAppNotification } = require("../notifications/notifEnqueue") as typeof import("../notifications/notifEnqueue");
    await enqueueSiteInAppNotification({
      guildId: String(IDs.guilds?.main || ""),
      userId: String(userId || ""),
      title,
      body: String(body || "").slice(0, 500),
      kind: "info",
      channel: "personal",
      openUrl: "/vetrina/le-mie/",
      dedupeKey,
      dedupeWindowMs: 3_600_000,
    });
  } catch (_) {}
}

async function loadOwned(client?, accessToken?, listingId?) {
  const gate = featureGate(client);
  if (!gate.ok) return { err: gate };
  const auth: any = await resolveBoardsUser(accessToken);
  if (!auth.ok) return { err: auth };
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { err: { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." } };
  const doc: any = await SiteDocument.findOne({ _id: id, docType: BL });
  if (!doc) return { err: { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." } };
  return { auth, doc };
}

/** Anteprima del destinatario (per conferma prima dell'invio). */
async function lookupTransferUser(client?, payload: Record<string, any> = {}) {
  const auth: any = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const user = await fetchUser(client, payload.userId);
  if (!user) return { ok: false, status: 404, error: "user_not_found", message: "Utente Discord non trovato: controlla l'ID." };
  if (user.bot) return { ok: false, status: 400, error: "is_bot", message: "Non puoi passare la scheda a un bot." };
  return { ok: true, status: 200, user: userCard(user) };
}

async function requestTransfer(client?, payload: Record<string, any> = {}) {
  const { err, auth, doc } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  if (String(doc.userId) !== String(auth.userId)) return { ok: false, status: 403, error: "forbidden", message: "Solo il proprietario può passare la scheda." };
  if (String(doc.boardKind || "") === "bot") return { ok: false, status: 400, error: "unsupported_kind", message: "Per ora si possono passare solo le schede server." };
  const toUserId = String(payload.toUserId || "").trim();
  if (!snowflakeOk(toUserId)) return { ok: false, status: 400, error: "invalid_user", message: "ID utente non valido." };
  if (toUserId === String(auth.userId)) return { ok: false, status: 400, error: "same_user", message: "La scheda è già tua." };
  const user = await fetchUser(client, toUserId);
  if (!user || user.bot) return { ok: false, status: 404, error: "user_not_found", message: "Utente Discord non trovato." };

  const now = new Date();
  doc.boardTransfer = {
    toUserId,
    toName: String(user.globalName || user.username || ""),
    toAvatarUrl: avatarUrlOf(user),
    fromUserId: String(auth.userId),
    fromName: String(auth.globalName || auth.username || ""),
    requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TRANSFER_TTL_MS).toISOString(),
  };
  doc.markModified("boardTransfer");
  await doc.save();
  const name = String(doc.title || "una scheda");
  await notify(toUserId, "Ti vogliono passare una scheda", `${doc.boardTransfer.fromName || "Un utente"} vuole passarti la scheda «${name}» della Vetrina. Accetta o rifiuta da Le mie schede entro 7 giorni.`, `boards:transfer:${doc._id}:${toUserId}`);
  return { ok: true, status: 200, transfer: doc.boardTransfer, message: "Richiesta inviata: la scheda passa quando l'utente accetta." };
}

async function cancelTransfer(client?, payload: Record<string, any> = {}) {
  const { err, auth, doc } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  if (String(doc.userId) !== String(auth.userId)) return { ok: false, status: 403, error: "forbidden", message: "Solo il proprietario può annullare." };
  doc.boardTransfer = null;
  doc.markModified("boardTransfer");
  await doc.save();
  return { ok: true, status: 200, message: "Richiesta annullata." };
}

/** Richieste di passaggio ricevute dall'utente collegato. */
async function listIncomingTransfers(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth: any = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const docs: any[] = await SiteDocument.find({ docType: BL, "boardTransfer.toUserId": String(auth.userId) })
    .select({ title: 1, boardKind: 1, boardDiscordId: 1, boardIconUrl: 1, boardTransfer: 1, slug: 1 })
    .limit(50)
    .lean();
  const transfers = docs
    .filter((d) => activeTransfer(d))
    .map((d) => ({
      listingId: String(d._id),
      name: String(d.title || ""),
      iconUrl: String(d.boardIconUrl || ""),
      fromName: String(d.boardTransfer.fromName || ""),
      fromUserId: String(d.boardTransfer.fromUserId || ""),
      requestedAt: d.boardTransfer.requestedAt || null,
      expiresAt: d.boardTransfer.expiresAt || null,
    }));
  return { ok: true, status: 200, transfers };
}

async function respondTransfer(client?, payload: Record<string, any> = {}) {
  const { err, auth, doc } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const t = activeTransfer(doc);
  if (!t || String(t.toUserId) !== String(auth.userId)) {
    return { ok: false, status: 404, error: "no_transfer", message: "Nessuna richiesta di passaggio per te su questa scheda (o è scaduta)." };
  }
  const name = String(doc.title || "la scheda");
  const accept = payload.accept === true;
  if (accept) {
    /* il nuovo proprietario deve poter gestire il server */
    const claim: any = await assertCanClaimServer(client, payload.accessToken, String(doc.boardDiscordId || ""));
    if (!claim.ok) {
      return {
        ...claim,
        message: claim.error === "not_owner" ? "Per accettare devi poter gestire questo server su Discord." : claim.message,
      };
    }
    const prevOwner = String(doc.userId || "");
    doc.userId = String(auth.userId);
    doc.authorName = String(auth.globalName || auth.username || "");
    doc.authorAvatar = "";
    doc.authorAvatarUrl = "";
    doc.boardTransfer = null;
    doc.markModified("boardTransfer");
    await doc.save();
    try {
      invalidateListingsListCache();
    } catch (_) {}
    emitBoardsChanged("transfer", { listingId: String(doc._id) });
    await notify(prevOwner, "Scheda passata", `${doc.authorName || "L'utente"} ha accettato: la scheda «${name}» ora è sua.`, `boards:transfer:done:${doc._id}`);
    return { ok: true, status: 200, accepted: true, message: `«${name}» ora è tua.` };
  }
  const from = String(t.fromUserId || doc.userId || "");
  doc.boardTransfer = null;
  doc.markModified("boardTransfer");
  await doc.save();
  await notify(from, "Passaggio rifiutato", `${String(auth.globalName || auth.username || "L'utente")} ha rifiutato la scheda «${name}».`, `boards:transfer:no:${doc._id}`);
  return { ok: true, status: 200, accepted: false, message: "Richiesta rifiutata." };
}

/** Stato del passaggio in corso, per la pagina di modifica del proprietario. */
function transferForOwner(doc?) {
  const t = activeTransfer(doc);
  return t ? { toUserId: t.toUserId, toName: t.toName || "", toAvatarUrl: t.toAvatarUrl || "", expiresAt: t.expiresAt || null } : null;
}

export = { lookupTransferUser, requestTransfer, cancelTransfer, listIncomingTransfers, respondTransfer, transferForOwner };
