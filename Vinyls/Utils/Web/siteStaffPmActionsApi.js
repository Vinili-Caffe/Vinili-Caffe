const IDs = require("../Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { memberIsPm } = require("./siteStaffRosterCache");
const {
  addPartnerPoints,
  removePartnerPoints,
  formatPartnerPointsChange,
} = require("../Staff/partnerPointsUtils");
const { resolvePartnerPointsShown } = require("../Staff/partnerPointsDisplayUtils");
const {
  addPartnershipBlacklistGuild,
  removePartnershipBlacklistGuild,
  normalizeGuildId,
} = require("../../Services/Partner/partnershipBlacklistService");
const { fetchInviteGuildMeta } = require("../Partner/partnershipBlacklistDisplay");

const MAX_POINTS = 500;

async function handleSiteStaffPmActionsPost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken);
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "").trim().toLowerCase();
    const guildId = String(IDs.guilds.main || "").trim();
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const isPm = memberIsPm(access.member);
    let isHighStaff = false;
    try {
      const { memberIsHighStaffEligible } = require("../Staff/staffRoleHierarchy");
      isHighStaff = memberIsHighStaffEligible(access.member);
    } catch (_) {
      isHighStaff = false;
    }

    if (action === "blacklist_add" || action === "blacklist_remove") {
      if (!isHighStaff) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Solo High Staff può modificare la blacklist partnership.",
        });
      }
      const invite = String(body.invite || body.inviteUrl || "").trim();
      const meta = await fetchInviteGuildMeta(client, invite).catch(() => null);
      const targetGuildId = normalizeGuildId(meta?.guildId || body.guildId);
      if (!targetGuildId) {
        return res.status(400).json({ ok: false, error: "invalid_invite", message: "Invite o guild ID non valido." });
      }
      if (action === "blacklist_add") {
        const note = String(body.note || "").trim().slice(0, 200);
        await addPartnershipBlacklistGuild(targetGuildId, access.member.id, note, {
          guildName: meta?.guildName || "",
          inviteCode: meta?.inviteCode || "",
        });
        return res.status(200).json({ ok: true, message: "Server aggiunto alla blacklist partnership." });
      }
      const removed = await removePartnershipBlacklistGuild(targetGuildId);
      return res.status(200).json({
        ok: true,
        message: removed ? "Server rimosso dalla blacklist." : "Server non era in blacklist.",
      });
    }

    if (action === "points_add" || action === "points_remove") {
      if (!isHighStaff) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Solo High Staff può modificare i punti PM.",
        });
      }
      const userId = String(body.userId || "").trim();
      const amount = Number.parseInt(String(body.amount ?? "1"), 10);
      const reason = String(body.reason || body.motivo || "").trim().slice(0, 400);
      if (!/^\d{16,20}$/.test(userId)) {
        return res.status(400).json({ ok: false, error: "invalid_user", message: "Utente non valido." });
      }
      if (!Number.isInteger(amount) || amount < 1 || amount > MAX_POINTS) {
        return res.status(400).json({ ok: false, error: "invalid_amount", message: `Importo tra 1 e ${MAX_POINTS}.` });
      }
      const targetMember = await guild.members.fetch(userId).catch(() => null);
      if (!targetMember || !memberIsPm(targetMember)) {
        return res.status(400).json({ ok: false, error: "not_pm", message: "L'utente non è Partner Manager." });
      }
      let updated = null;
      if (action === "points_add") {
        updated = await addPartnerPoints(guildId, userId, amount, { client, guild });
      } else {
        updated = await removePartnerPoints(guildId, userId, amount);
      }
      if (!updated) {
        return res.status(400).json({ ok: false, error: "failed", message: "Operazione non riuscita." });
      }
      const points = resolvePartnerPointsShown(updated.staff);
      let pointsRemovedLogged = false;
      if (action === "points_remove") {
        try {
          const { logPmPointsRemoved } = require("../Partner/pmPointsRemovedStore");
          const { getPartnershipLogChannelIds } = require("../Partner/partnershipConfigResolver");
          const { isDiscordStaffChannelPostsEnabled } = require("./discordWorkflowUiGate");
          const channelIds = getPartnershipLogChannelIds(guild.id);
          const hardFallback = isDiscordStaffChannelPostsEnabled()
            ? String(IDs.channels?.puntiTolti || "").trim()
            : "";
          let mirrorChannel = null;
          if (isDiscordStaffChannelPostsEnabled()) {
            for (const cid of [channelIds.primary, channelIds.fallback, hardFallback]) {
              if (!cid) continue;
              mirrorChannel = guild.channels.cache.get(cid) || null;
              if (mirrorChannel?.isTextBased?.()) break;
              mirrorChannel = null;
            }
          }
          const removedAmount = Math.max(
            0,
            Math.floor(Number(updated._partnerPointsRemoved ?? amount) || 0),
          );
          const ruleText = reason || "Punti rimossi da High Staff (sito)";
          const mention = `<@${userId}>`;
          const logLines = [
            `<:VC_PartnerManager:1494286911286808576> ${mention}`,
            `<:VC_reason:1478517122929004544> ${ruleText}`,
            `<:VC_Dot:1482532364222595303> −${removedAmount} punti (sito)`,
          ];
          const entry = await logPmPointsRemoved({
            guild,
            pmUserId: userId,
            rule: ruleText,
            actorUserId: String(access.member?.id || ""),
            status: "logged",
            source: "site_hs_manual",
            mirrorChannel,
            mirrorContent: logLines.join("\n"),
          });
          pointsRemovedLogged = Boolean(entry);
        } catch (logErr) {
          global.logger?.warn?.(
            "[WEBHOOK] site-staff-pm-actions punti tolti log failed:",
            logErr?.message || logErr,
          );
        }
      }
      return res.status(200).json({
        ok: true,
        message: formatPartnerPointsChange(action === "points_add" ? "add" : "remove", amount),
        points,
        pointsRemovedLogged,
      });
    }

    return res.status(400).json({ ok: false, error: "bad_action", message: "Azione non valida." });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pm-actions POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = { handleSiteStaffPmActionsPost };
