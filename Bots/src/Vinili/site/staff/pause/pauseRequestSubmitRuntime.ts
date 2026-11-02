const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");
const { EPHEMERAL_TTL_NORMAL_MS, scheduleMessageDeletion } = require("../../../../shared/utils/ephemeralMessageTtl") as typeof import("../../../../shared/utils/ephemeralMessageTtl");
const { createPauseRequest, PAUSE_REQUEST_ROLE_IDS } = require("./pauseRequestRuntime") as typeof import("./pauseRequestRuntime");

const PAUSE_ROLE_PICK_PREFIX = "pause_rolepick:";
const PAUSE_ROLE_PICK_PM = `${PAUSE_ROLE_PICK_PREFIX}pm`;
const PAUSE_ROLE_PICK_STAFF = `${PAUSE_ROLE_PICK_PREFIX}staff`;
const PAUSE_ROLE_PICK_BOTH = `${PAUSE_ROLE_PICK_PREFIX}both`;

const pendingPauseRolePick = new Map();

function memberCanRequestPause(member?) {
  const allowedRoleIds = new Set(PAUSE_REQUEST_ROLE_IDS.map(String));
  return Array.from(allowedRoleIds).some((roleId?) => member?.roles?.cache?.has(roleId));
}

function storePendingPauseRolePick(userId?, payload?) {
  pendingPauseRolePick.set(String(userId), { ...payload, at: Date.now() });
}

async function resolveRequestedPauseRole(member?, channel?, authorMention?) {
  const hasStaff = Boolean(member?.roles?.cache?.has(IDs.roles.Staff));
  const hasPm = Boolean(member?.roles?.cache?.has(IDs.roles.PartnerManager));
  if (hasStaff && hasPm) {
    return { ok: false, needsRolePick: true };
  }
  if (hasPm && !hasStaff) return { ok: true, requestedRole: "PartnerManager" };
  return { ok: true, requestedRole: "Staff" };
}

async function submitPauseRequestForMember({ guild, member, rawStart, rawEnd, reason, requestedRole = null, replyChannel = null, halfDay = null }) {
  if (!guild || !member?.id) {
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Richiesta non valida." };
  }
  if (!memberCanRequestPause(member)) {
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Non hai i permessi per richiedere una pausa." };
  }
  const authorMention =
    typeof member?.toString === "function" ? String(member) : `<@${member.id}>`;
  const safeMention = /<@!?\d+>/.test(authorMention) ? authorMention : `<@${member.id}>`;
  let role = requestedRole;
  if (!role) {
    const channel = replyChannel || guild.channels.cache.get(IDs.channels?.pause);
    if (!channel?.isTextBased?.()) {
      return { ok: false, error: "<a:VC_Alert:1482706673176150077> Canale pause non disponibile." };
    }
    const rolePick = await resolveRequestedPauseRole(member, channel, safeMention);
    if (rolePick.needsRolePick) {
      storePendingPauseRolePick(member.id, {
        guildId: guild.id,
        rawStart,
        rawEnd,
        reason,
        halfDay,
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(PAUSE_ROLE_PICK_PM).setLabel("PM").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(PAUSE_ROLE_PICK_STAFF).setLabel("Staff").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(PAUSE_ROLE_PICK_BOTH).setLabel("Entrambi").setStyle(ButtonStyle.Primary),
      );
      await channel
        .send({
          content: `${safeMention} scegli per quale ruolo vuoi chiedere la pausa:`,
          components: [row],
          __skipNoticeEmbed: true,
        })
        .catch(() => null);
      return {
        ok: false,
        pendingRolePick: true,
        error: "Scegli il ruolo dai bottoni sotto per completare la richiesta.",
      };
    }
    if (!rolePick.ok) return rolePick;
    role = rolePick.requestedRole;
  }
  const result = await createPauseRequest({
    guild,
    userId: member.id,
    requesterMention: safeMention,
    rawStart,
    rawEnd,
    reason,
    member,
    requestedRole: role,
    halfDay,
  });
  if (result.ok && replyChannel) {
  }
  return result;
}

export = {
  memberCanRequestPause,
  submitPauseRequestForMember,
};