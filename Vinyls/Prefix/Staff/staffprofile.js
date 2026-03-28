const IDs = require("../../Utils/Config/ids");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { memberHasStaffRole } = require("../../Utils/Community/staffListUtils");
const { buildStaffProfilePayload, SECTION_HOME } = require("../../Utils/Staff/staffProfilePanelRuntime");

async function resolveTargetUser(message, rawArg) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;
  const raw = String(rawArg || "").trim();
  if (!raw) return message.author;
  const id = raw.replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    return message.client.users.fetch(id).catch(() => null);
  }
  const wanted = raw.toLowerCase();
  let member = message.guild.members.cache.find((item) => {
    const username = String(item.user?.username || "").toLowerCase();
    const displayName = String(item.displayName || "").toLowerCase();
    const tag = String(item.user?.tag || "").toLowerCase();
    return username === wanted || displayName === wanted || tag === wanted;
  });
  if (!member && typeof message.guild.members.fetch === "function") {
    try {
      const fetched = await message.guild.members.fetch({ query: raw.slice(0, 32), limit: 10 });
      member =
        fetched.find((m) => {
          const u = String(m.user?.username || "").toLowerCase();
          const d = String(m.displayName || "").toLowerCase();
          return u === wanted || d === wanted;
        }) || fetched.first();
    } catch (_) {}
  }
  return member?.user || null;
}

module.exports = {
  name: "staffprofile",
  allowEmptyArgs: true,
  usage: "`+staffprofile` · `+staffprofile @staffer`",
  examples: ["+staffprofile", "+sprofilo @Mod"],

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    await message.channel.sendTyping().catch(() => {});
    const targetUser = await resolveTargetUser(message, args.join(" "));
    if (!targetUser) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Utente non trovato.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember || !memberHasStaffRole(targetMember)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Il target non è uno staffer (o ruolo staff non rilevato).",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const isSelf = String(message.author.id) === String(targetUser.id);
    const isHighStaff = Boolean(message.member.roles?.cache?.has(IDs.roles.HighStaff));
    const viewerStaff = memberHasStaffRole(message.member);
    if (!viewerStaff && !isHighStaff) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Devi essere **staff** o **High Staff** per usare questo comando.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (!isSelf && !isHighStaff) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Puoi aprire solo **il tuo** profilo staff. Gli altri: solo **High Staff**.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const payload = await buildStaffProfilePayload(
      message.guild,
      targetUser.id,
      message.author.id,
      message.client,
      SECTION_HOME,
    );
    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};