const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const NO_ROLE_GRACE_MS = 24 * 60 * 60 * 1000;
const NO_ROLE_SWEEP_INTERVAL_MS = Number(process.env.NO_ROLE_KICK_SWEEP_INTERVAL_MS) || 30 * 60 * 1000;
const NO_ROLE_KICK_REASON = "Membro senza ruoli dopo 24h dall'ingresso.";
const NO_ROLE_FETCH_PAGE_LIMIT = Math.max(10, Math.min(1000, Number(process.env.NO_ROLE_KICK_FETCH_PAGE_LIMIT || 1000)));
const NO_ROLE_FETCH_PAGE_DELAY_MS = Math.max(150, Math.min(5000, Number(process.env.NO_ROLE_KICK_FETCH_PAGE_DELAY_MS || 700)));

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, Math.max(0, Number(ms || 0)));
    t.unref?.();
  });
}

function extractRateLimitWaitMs(err) {
  if (!err) return 0;
  const retryAfter = Number(err?.retryAfter ?? err?.retry_after ?? err?.data?.retry_after ?? err?.rawError?.retry_after);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter > 1000 ? retryAfter : Math.ceil(retryAfter * 1000);
  }
  const msg = String(err?.message || err || "");
  const m = msg.match(/retry\s+after\s+([0-9.]+)\s*second/i);
  if (m) {
    const sec = Number(m[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000);
  }
  return 0;
}

async function fetchMembersPagedRest(guild, onMember) {
  if (typeof guild?.members?.list !== "function") return { ok: false, scanned: 0, pages: 0 };
  let after;
  let scanned = 0;
  let pages = 0;
  while (true) {
    let batch;
    try {
      const opts = { limit: NO_ROLE_FETCH_PAGE_LIMIT, cache: true };
      if (after) opts.after = after;
      batch = await guild.members.list(opts);
    } catch (err) {
      const waitMs = extractRateLimitWaitMs(err);
      if (waitMs > 0) {
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
    pages += 1;
    if (!batch?.size) break;
    for (const member of batch.values()) {
      scanned += 1;
      await onMember(member);
    }
    const last = batch.last();
    if (!last?.id) break;
    after = String(last.id);
    if (batch.size < NO_ROLE_FETCH_PAGE_LIMIT) break;
    await sleep(NO_ROLE_FETCH_PAGE_DELAY_MS);
  }
  return { ok: true, scanned, pages };
}

function memberHasAnyAssignedRole(member) {
  if (!member?.roles?.cache) return true;
  for (const role of member.roles.cache.values()) {
    if (String(role?.id || "") !== String(member.guild?.id || "")) return true;
  }
  return false;
}

function isNoRoleKickCandidate(member, now = Date.now()) {
  if (!member?.guild || !member?.user || member.user.bot) return false;
  if (MAIN_GUILD_ID && String(member.guild.id) !== MAIN_GUILD_ID) return false;
  if (memberHasAnyAssignedRole(member)) return false;
  const joinedMs = Number(member.joinedTimestamp || member.joinedAt?.getTime?.() || 0);
  if (!Number.isFinite(joinedMs) || joinedMs <= 0) return false;
  return now - joinedMs >= NO_ROLE_GRACE_MS;
}

function buildNoRoleKickDm(guild) {
  const invite = String(IDs.links?.invite || "").trim();
  const inviteLine = invite ? `\n\nPuoi rientrare qui: ${invite}` : "";
  return {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(`Inserimento non completato su ${guild?.name || "Vinili & Caffe"}`)
        .setDescription(
          "Sei stato rimosso dal server perché dopo 24 ore non avevi ancora completato l'inserimento e non avevi alcun ruolo.\n\n" +
            "Per restare nel server devi completare la verifica/introduzione e ottenere i ruoli richiesti." +
            inviteLine,
        )
        .setTimestamp(),
    ],
  };
}

async function kickNoRoleMember(member) {
  if (!isNoRoleKickCandidate(member)) return false;
  const me = member.guild?.members?.me || (await member.guild?.members?.fetchMe?.().catch(() => null));
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.KickMembers)) {
    global.logger?.warn?.("[NO ROLE KICK] Missing KickMembers permission", member.guild.id);
    return false;
  }
  if (!member.kickable) {
    global.logger?.warn?.("[NO ROLE KICK] Member not kickable", member.guild.id, member.id);
    return false;
  }
  await member.send(buildNoRoleKickDm(member.guild)).catch(() => null);
  const fresh = await member.guild.members.fetch(member.id).catch(() => member);
  if (!isNoRoleKickCandidate(fresh)) return false;
  await fresh.kick(NO_ROLE_KICK_REASON);
  return true;
}

async function runNoRoleKickSweep(client) {
  if (!client || !MAIN_GUILD_ID) return { scanned: 0, kicked: 0 };
  const jobsDebug = String(process.env.DEBUG_JOBS || "").trim() === "1";
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await getClientGuildCached(client, MAIN_GUILD_ID));
  if (!guild) return { scanned: 0, kicked: 0 };

  let scanned = 0;
  let kicked = 0;
  try {
    const res = await fetchMembersPagedRest(guild, async (member) => {
      if (!member) return;
      scanned += 1;
      if (!isNoRoleKickCandidate(member)) return;
      const ok = await kickNoRoleMember(member).catch((err) => {
        global.logger?.warn?.("[NO ROLE KICK] Kick failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
      if (ok) kicked += 1;
    });
    if (jobsDebug) global.logger?.info?.("[NO ROLE KICK] Member list scan done", { guildId: guild.id, scanned: res.scanned, pages: res.pages, kicked });
  } catch (err) {
    const msg = String(err?.message || err || "");
    global.logger?.warn?.("[NO ROLE KICK] Fetch members failed:", msg || err);
  }
  if (jobsDebug && kicked > 0) {
    global.logger?.info?.("[NO ROLE KICK] Sweep completed", { guildId: guild.id, scanned, kicked });
  }
  return { scanned, kicked };
}

function startNoRoleKickLoop(client) {
  if (!client || client._noRoleKickLoopStarted) return;
  client._noRoleKickLoopStarted = true;
  runNoRoleKickSweep(client).catch((err) => {
    global.logger?.warn?.("[NO ROLE KICK] Startup sweep failed:", err?.message || err);
  });
  const timer = setInterval(() => {
    runNoRoleKickSweep(client).catch((err) => {
      global.logger?.warn?.("[NO ROLE KICK] Periodic sweep failed:", err?.message || err);
    });
  }, NO_ROLE_SWEEP_INTERVAL_MS);
  timer.unref?.();
  client._noRoleKickInterval = timer;
  return timer;
}

module.exports = {
  memberHasAnyAssignedRole,
  isNoRoleKickCandidate,
  runNoRoleKickSweep,
  startNoRoleKickLoop,
};