/** Chat del workflow: chi può leggere e scrivere (staff o persona invitata). */
const { assertWebsiteStaffAccess, normalizeHeaderSecret, memberCanViewResocontiInbox } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { resolveWebsiteGuildMember } = require("../../Web/siteRoleRequestApi") as typeof import("../../Web/siteRoleRequestApi");
const { memberIsHighStaffEligible, memberCanReviewAppelli } = require("../../Utils/Staff/staffRoleHierarchy") as typeof import("../../Utils/Staff/staffRoleHierarchy");
const { memberHasCandidatureReviewAccess } = require("../../Events/interaction/candidatureApplicationHandlers") as typeof import("../../Events/interaction/candidatureApplicationHandlers");
const { resolveMainGuild } = require("./workflowChatAuthors") as typeof import("./workflowChatAuthors");
const { loadWorkflowDoc, isInviteOnlyQueue, normalizeSubjectChat, subjectChatHasActive, subjectChatEverInvited, ensurePauseWorkflowFromKey, ensureInviteQueueWorkflowFromKey, withTimeout } = require("./workflowChatSubject") as typeof import("./workflowChatSubject");

const QUEUES = new Set(["pause", "candidature", "appelli", "resoconti", "revisione"]);

function bearerFromRequest(req?) {
  const header = normalizeHeaderSecret(req?.headers?.authorization);
  if (header) return header;
  return normalizeHeaderSecret(req?.query?.accessToken || req?.query?.token);
}

function parseQueueFromDedupe(dedupeKey?) {
  const key = String(dedupeKey || "").trim();
  /* boardsInbox: dedupe canonico = boards:revisione:<listingId> */
  if (/^boards:revisione:/i.test(key)) return "revisione";
  const q = key.split(":")[0];
  return QUEUES.has(q) ? q : "";
}

function canonicalizeWorkflowChatKey(dedupeKey?) {
  const key = String(dedupeKey || "").trim();
  if (!key) return "";
  if (/^boards:revisione:/i.test(key)) return key;
  const m = key.match(/^revisione:([a-f0-9]{24})$/i);
  if (m) return `boards:revisione:${m[1]}`;
  return key;
}

function memberCanAccessQueue(member?, guild?, queue?) {
  const q = String(queue || "").trim().toLowerCase();
  if (q === "pause") return memberIsHighStaffEligible(member);
  if (q === "appelli") return memberCanReviewAppelli(member);
  if (q === "candidature") return memberHasCandidatureReviewAccess(member, guild);
  if (q === "resoconti") {
    return memberCanViewResocontiInbox(member);
  }
  /* boardsRevHsOnly1: coda bacheca solo High Staff */
  if (q === "revisione") return memberIsHighStaffEligible(member);
  return false;
}

async function resolveOAuthIdentity(accessToken?) {
  const token = normalizeHeaderSecret(accessToken);
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Token mancante." };
  }
  try {
    const meRes = await withTimeout(
      fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      8000,
      "oauth_timeout",
    );
    if (!meRes.ok) {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
      };
    }
    const meJson: any = await meRes.json();
    const userId = String(meJson?.id || "").trim();
    if (!/^\d{17,20}$/.test(userId)) {
      return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
    }
    return { ok: true, userId, meJson };
  } catch (err) {
    const timedOut = /timeout/i.test(String(err?.message || err || ""));
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      error: timedOut ? "oauth_timeout" : "discord_unreachable",
      message: timedOut
        ? "Verifica sessione Discord troppo lenta. Riprova."
        : "Impossibile contattare Discord.",
    };
  }
}

function syntheticMemberFromOauth(oauth?) {
  const userId = String(oauth?.userId || "").trim();
  const me = oauth?.meJson || {};
  const username = String(me.username || me.global_name || "Utente").trim() || "Utente";
  const globalName = String(me.global_name || "").trim();
  const avatar = me.avatar
    ? `https://cdn.discordapp.com/avatars/${userId}/${me.avatar}.png?size=128`
    : "";
  return {
    id: userId,
    displayName: globalName || username,
    user: {
      id: userId,
      username,
      globalName: globalName || null,
      avatar: me.avatar || null,
      displayAvatarURL: () => avatar,
    },
  };
}

async function resolveSubjectChatMember(client, guild, accessToken, { inviteOnly }) {
      if (inviteOnly) {
    const oauth = await resolveOAuthIdentity(accessToken);
    if (!oauth.ok) return oauth;
    let member = guild?.members?.cache?.get?.(oauth.userId) || null;
    if (!member) {
      member = await withTimeout(guild.members.fetch(oauth.userId).catch(() => null), 3500, "member_timeout").catch(
        () => null,
      );
    }
    return {
      ok: true,
      userId: oauth.userId,
      member: member || syntheticMemberFromOauth(oauth),
    };
  }

  const userRes = await resolveWebsiteGuildMember(client, accessToken);
  if (!userRes.ok) {
    return {
      ok: false,
      status: userRes.status || 403,
      error: userRes.error || "forbidden",
      message: userRes.message || "Non autorizzato.",
    };
  }
  return { ok: true, userId: userRes.userId, member: userRes.member };
}

async function resolveWorkflowChatAccess(client?, accessToken?, dedupeKey?, opts: Record<string, any> = {}) {
  const token = normalizeHeaderSecret(accessToken);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      message: "Header Authorization: Bearer <token> richiesto.",
    };
  }

  const guild = await resolveMainGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server non disponibile." };
  }

  let key = canonicalizeWorkflowChatKey(dedupeKey);
  if (!key) {
    return { ok: false, status: 400, error: "bad_key", message: "dedupeKey mancante." };
  }

  const queue = parseQueueFromDedupe(key);
  if (!queue) {
    return { ok: false, status: 400, error: "bad_key", message: "Pratica non valida." };
  }

  let workflow =
    (await loadWorkflowDoc(guild.id, key)) ||
    (queue === "pause" ? await ensurePauseWorkflowFromKey(client, guild.id, key) : null);
  if (!workflow && (queue === "appelli" || queue === "candidature")) {
    workflow = await ensureInviteQueueWorkflowFromKey(client, guild.id, key, queue);
  }
  /* staffRevChatKey1: client a volte manda revisione:<id> invece di boards:revisione:<id> */
  if (!workflow && queue === "revisione") {
    const alt = canonicalizeWorkflowChatKey(key);
    if (alt && alt !== key) {
      workflow = await loadWorkflowDoc(guild.id, alt);
      if (workflow) key = alt;
    }
    const raw = String(dedupeKey || "").trim();
    if (!workflow && raw && raw !== key && raw !== alt) {
      workflow = await loadWorkflowDoc(guild.id, raw);
      if (workflow) key = String(workflow.dedupeKey || raw);
    }
  }
  if (!workflow) {
    return { ok: false, status: 404, error: "not_found", message: "Pratica non trovata." };
  }
  if (workflow.dedupeKey) key = String(workflow.dedupeKey);

  const subjectUserId = String(workflow.userId || "").trim();
  const status = String(workflow.status || "pending").toLowerCase();
  const pending = status === "pending";
  const inviteOnly = isInviteOnlyQueue(queue);
  const subjectChat = normalizeSubjectChat(workflow?.workflowFields?.subjectChat);
  const subjectActive = subjectChatHasActive(subjectChat);
  const subjectEverInvited = subjectChatEverInvited(subjectChat);
  const subjectMayJoin = inviteOnly && subjectEverInvited;

  const staffAccess = await assertWebsiteStaffAccess(client, token, {
    req: opts.req,
    viewAs: opts.viewAs,
  });
  if (staffAccess.ok && memberCanAccessQueue(staffAccess.member, guild, queue)) {
    const memberId = String(staffAccess.member?.id || "").trim();
    const isSubject = Boolean(subjectUserId && memberId && subjectUserId === memberId);
    /* boardsRevSelfChat1: reviewer website-staff SEMPRE entra come staff.
       Prima: se eri anche mittente (es. scheda bacheca propria) →
       "Questa chat è riservata allo staff" 🤡 */
    return {
      ok: true,
      guild,
      workflow,
      queue,
      dedupeKey: key,
      member: staffAccess.member,
      isStaffReviewer: true,
      isSubject,
      authorKind: "staff",
      canSend: pending,
      status,
      subjectUserId,
      inviteOnly,
      subjectChat,
      subjectActive,
      subjectMayJoin,
    };
  }

  if (!subjectMayJoin) {
    return {
      ok: false,
      status: 403,
      error: inviteOnly ? "not_invited" : "forbidden",
      message: inviteOnly
        ? "Non sei ancora stato aggiunto a questa discussione."
        : "Questa chat è riservata allo staff.",
    };
  }

  const userRes: any = await resolveSubjectChatMember(client, guild, token, { inviteOnly });
  if (!userRes.ok) {
    return {
      ok: false,
      status: userRes.status || 403,
      error: userRes.error || "forbidden",
      message: userRes.message || "Non autorizzato.",
    };
  }

  if (!subjectUserId || String(userRes.userId) !== subjectUserId) {
    return { ok: false, status: 403, error: "forbidden", message: "Non autorizzato." };
  }

  return {
    ok: true,
    guild,
    workflow,
    queue,
    dedupeKey: key,
    member: userRes.member,
    isStaffReviewer: false,
    isSubject: true,
    authorKind: "user",
    canSend: pending && (!inviteOnly || subjectActive),
    status,
    subjectUserId,
    inviteOnly,
    subjectChat,
    subjectActive,
    subjectMayJoin,
  };
}

export = { bearerFromRequest, resolveWorkflowChatAccess };
