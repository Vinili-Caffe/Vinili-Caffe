/**
 * Invio di benvenuto e DM configurati dalla dashboard.
 * Usato dagli eventi MultiGuild (tutti i server) e dal flusso del server principale
 * (che mantiene i suoi controlli d'ingresso e l'invite tracker, ma usa i testi della dashboard).
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

function welcomeVarsForMember(member?) {
  const vars = T.memberVars(member?.guild, member?.user);
  try {
    const { buildMemberWelcomePhrase } = require("../../Vinili/Community/utils/pronounWelcomeUtils") as typeof import("../../Vinili/Community/utils/pronounWelcomeUtils");
    const p: any = buildMemberWelcomePhrase(member);
    if (p?.word) {
      vars.benvenuto = String(p.word);
      vars.Benvenuto = String(p.capitalized || p.word);
    }
  } catch {
    /* parola neutra */
  }
  if (member?.displayName) vars.username = String(member.displayName);
  return vars;
}

/** Manda il benvenuto della dashboard. Ritorna il messaggio inviato, `false` se spento, `null` se fallito. */
async function sendDashboardWelcome(member?) {
  const guild = member?.guild;
  if (!guild) return null;
  if (!(require("../core/moduleSwitches") as typeof import("../core/moduleSwitches")).isModuleOn(guild.id, "benvenuto")) return false;
  const cfg = await T.getWelcome(guild.id, true);
  /* tenant senza canale/welcome: skip silenzioso (non è un errore) */
  if (!cfg.welcome.enabled || !cfg.welcome.channelId) return false;
  /* gateway: member.client.rest — worker REST: global.botClient._rest (il member non porta il client completo) */
  const rest =
    member.client?._rest ||
    member.client?.rest ||
    member.guild?.client?._rest ||
    member.guild?.client?.rest ||
    (global as any).botClient?._rest ||
    (global as any).botClient?.rest ||
    (global as any).__vinylsDiscordClient?.rest;
  if (!rest?.post) {
    global.logger?.warn?.("[WELCOME] skip: no REST client", guild.id);
    return null;
  }
  const body = T.buildMessageBody(cfg.welcome.draft, welcomeVarsForMember(member), [], { mentionUserId: String(member.id) });
  if (!body || (typeof body === "object" && !body.content && !body.embeds?.length && !body.components?.length)) {
    global.logger?.warn?.("[WELCOME] skip: empty body", guild.id);
    return null;
  }
  return rest.post(Routes.channelMessages(cfg.welcome.channelId), { body }).catch((err?) => {
    global.logger?.warn?.("[WELCOME] send:", guild.id, err?.message || err, err?.rawError || err?.code || "");
    return null;
  });
}

/** DM di benvenuto della dashboard. `dmClosed` = l'utente ha i DM chiusi. */
async function sendDashboardWelcomeDm(member?) {
  const guild = member?.guild;
  if (!guild || member.user?.bot) return { sent: false, dmClosed: false };
  if (!(require("../core/moduleSwitches") as typeof import("../core/moduleSwitches")).isModuleOn(guild.id, "benvenuto")) return { sent: false, dmClosed: false };
  const cfg = await T.getWelcome(guild.id);
  if (!cfg.dm.enabled) return { sent: false, dmClosed: false };
  const rest = member.client?.rest;
  try {
    const dm: any = await member.user.createDM();
    await rest.post(Routes.channelMessages(dm.id), { body: T.buildMessageBody(cfg.dm.draft, welcomeVarsForMember(member)) });
    return { sent: true, dmClosed: false };
  } catch (err) {
    const code = Number(err?.code || err?.rawError?.code);
    return { sent: false, dmClosed: code === 50007 };
  }
}

export = { welcomeVarsForMember, sendDashboardWelcome, sendDashboardWelcomeDm };
