import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { closeCase, listCasesForUser } from "./modCaseStore";
import { formatDurationMs, parseDurationMs } from "./parseDuration";
import { memberHas } from "./permissions";
import { recordModAction } from "./record";
import { extractUserId, resolveTargetMember } from "./resolveTarget";

function splitDurationAndReason(args: string[]): { durationMs: number; reason: string } {
  const withoutTarget = extractUserId(args[0])
    ? args.slice(1)
    : args.filter((a) => !/^<@!?\d+>$/.test(a));
  const maybeDur = withoutTarget[0];
  const looksDur = /^\d+\s*[smhd]?$/i.test(String(maybeDur || ""));
  if (looksDur) {
    return {
      durationMs: parseDurationMs(maybeDur),
      reason: withoutTarget.slice(1).join(" ").trim() || "Nessun motivo specificato",
    };
  }
  return {
    durationMs: parseDurationMs(undefined),
    reason: withoutTarget.join(" ").trim() || "Nessun motivo specificato",
  };
}

export const muteCommand: PrefixCommand = {
  name: "mute",
  description: "Timeout (mute) un membro. Durata es. 10m, 2h, 1d (default 10m).",
  usage: "+mute <@utente|id> [durata] [motivo]",
  category: "moderation",
  aliases: ["timeout"],
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve il permesso **Moderare i membri**.");
      return;
    }
    const target = await resolveTargetMember(message, args);
    if ("error" in target) {
      await replyErr(message, target.error);
      return;
    }
    if (!target.member.moderatable) {
      await replyErr(message, "Non posso mettere in timeout questo membro.");
      return;
    }
    const { durationMs, reason } = splitDurationAndReason(args);
    await target.member.timeout(durationMs, reason);
    const c = await recordModAction(message, {
      type: "mute",
      userId: target.user.id,
      reason,
      durationMs,
      targetTag: target.user.tag,
    });
    await replyOk(
      message,
      `Timeout **${target.user.tag}** per **${formatDurationMs(durationMs)}** · caso \`${c.id}\`.\nMotivo: ${reason}`,
    );
  },
};

export const unmuteCommand: PrefixCommand = {
  name: "unmute",
  description: "Rimuove il timeout da un membro.",
  usage: "+unmute <@utente|id> [motivo]",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve il permesso **Moderare i membri**.");
      return;
    }
    const target = await resolveTargetMember(message, args);
    if ("error" in target) {
      await replyErr(message, target.error);
      return;
    }
    const reason = extractUserId(args[0])
      ? args.slice(1).join(" ").trim() || "Unmute"
      : args.filter((a) => !/^<@!?\d+>$/.test(a)).join(" ").trim() || "Unmute";
    await target.member.timeout(null, reason);
    for (const active of listCasesForUser(message.guild!.id, target.user.id, "mute")) {
      if (active.active) closeCase(message.guild!.id, active.id, "unmuted");
    }
    const c = await recordModAction(message, {
      type: "unmute",
      userId: target.user.id,
      reason,
      targetTag: target.user.tag,
    });
    await replyOk(message, `Timeout rimosso da **${target.user.tag}** · caso \`${c.id}\`.`);
  },
};
