const { AuditLogEvent, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { ARROW, toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Utils/Logging/channelRolesLogUtils");
const { handleThreadCreationAction: antiNukeHandleThreadCreationAction } = require("../Services/Moderation/antiNukeService");
const { addAllRoleMembersToThread } = require("../Utils/Discord/threadRoleMembers");

const THREAD_CREATE_ACTION = AuditLogEvent?.ThreadCreate ?? 110;

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveResponsibleWithRetry(guild, threadId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit=await resolveResponsible(guild,THREAD_CREATE_ACTION,(entry) => String(entry?.target?.id||"")===String(threadId||""),);
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

function threadTypeLabel(threadType) {
  if (threadType === ChannelType.PrivateThread) return "Thread privato";
  if (threadType === ChannelType.PublicThread) return "Thread pubblico";
  if (threadType === ChannelType.AnnouncementThread) return "Thread annuncio";
  return `Sconosciuto (${Number(threadType || 0)})`;
}

async function resolveForumParent(thread) {
  let t = thread;
  if (t.partial) {
    t = await t.fetch().catch(() => thread);
  }
  let parent = t.parent;
  if (!parent && t.parentId) {
    parent = await t.guild.channels.fetch(t.parentId).catch(() => null);
  }
  return { thread: t, parent };
}

async function pingForumRoleInNewThread(thread, forumRoleId) {
  const guild = thread.guild;
  await thread.join().catch(() => {});
  if (guild) {
    await addAllRoleMembersToThread(thread, guild, forumRoleId, { logTag: "[threadCreate forum]" });
  }
  await thread
    .send({
      content: `<@&${forumRoleId}>`,
      allowedMentions: { roles: [forumRoleId] },
    })
    .catch((error) => {
      global.logger?.error?.("[threadCreate] forum role mention failed:", error);
    });
}

module.exports = {
  name: "threadCreate",
  async execute(thread) {
    try {
      if (!thread?.guild || !thread?.id) return;
      const audit = await resolveResponsibleWithRetry(thread.guild, thread.id);
      const executorId = String(audit?.executor?.id || "");
      const responsible = formatAuditActor(audit.executor);

      const forumRoleId = String(IDs.roles.Forum || "").trim();
      if (forumRoleId) {
        const { thread: resolvedThread, parent } = await resolveForumParent(thread);
        if (parent?.type === ChannelType.GuildForum) {
          await pingForumRoleInNewThread(resolvedThread, forumRoleId);
        }
      }

      const logChannel = await resolveChannelRolesLogChannel(thread.guild);
      if (logChannel?.isTextBased?.()) {
        const lines = [
          `${ARROW} **Responsible:** ${responsible}`,
          `${ARROW} **Target:** ${thread} \`${thread.id}\``,
          `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          "**Settings**",
          `${ARROW} **Name:** ${thread.name || "sconosciuto"}`,
          `${ARROW} **Type:** ${threadTypeLabel(thread.type)}`,
          `${ARROW} **Archived:** ${yesNo(Boolean(thread.archived))}`,
          `${ARROW} **Bloccato:** ${yesNo(Boolean(thread.locked))}`,
          `${ARROW} **Durata auto-archiviazione:** ${Number(thread.autoArchiveDuration || 0) ? `${thread.autoArchiveDuration} minuti` : "Nessuna"}`,
          `${ARROW} **Slowmode per utente:** ${Number(thread.rateLimitPerUser || 0) || "Nessuna"}`,
        ];

        if (Array.isArray(thread.appliedTags) && thread.appliedTags.length) {
          lines.push(`${ARROW} **Tag applicati:** \`${thread.appliedTags.map((id) => String(id)).join(", ")}\``);
        }
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type", "archived", "locked", "auto_archive_duration", "rate_limit_per_user", "applied_tags"]));

        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("Creazione thread")
          .setDescription(lines.join("\n"));

        const payload = { embeds: [embed] };
        if (thread.url) {
          payload.components = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel("Vai al thread")
                .setURL(thread.url),
            ),
          ];
        }

        await logChannel.send(payload).catch(() => {});
      }
      await antiNukeHandleThreadCreationAction({
        guild: thread.guild,
        executorId,
        threadId: String(thread.id || ""),
        thread,
      });
    } catch (error) {
      global.logger?.error?.("[threadCreate] failed:", error);
    }
  },
};