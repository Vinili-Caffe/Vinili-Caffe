const { MessageFlags } = require("discord.js") as typeof import("discord.js");
const { clearRobCooldown } = require("../Services/Community/activeEconomyService") as typeof import("../Services/Community/activeEconomyService");
const { attemptRob, buildRobGuiPayload, deleteSession, economyConfig, getSession, interactionMessageAdapter, isRobGuiCustomId, isSoftRobTargetBlock, makeBankTarget, parseRobGuiCustomId, pickRandomTarget, preflightRobAttempt, resetForNewAttempt, pushRobHitAnimation, setSession } = require("../Utils/Economy/robGuiRuntime") as typeof import("../Utils/Economy/robGuiRuntime");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction?) {
  return Boolean(interaction?.isButton?.() && isRobGuiCustomId(interaction.customId));
}

async function replyPrivate(interaction?, content?) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function execute(interaction?, client?) {
  const parsed = parseRobGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo piano non è tuo.");
    return true;
  }
  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+rob`.");
    return true;
  }
  const msg = interactionMessageAdapter(interaction);

  if (parsed.action === "user" || parsed.action === "reroll" || parsed.action === "bank") {
    if (session.phase === "done") resetForNewAttempt(session);
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const cfg = economyConfig(client);
    const wantBank = parsed.action === "bank" || (parsed.action === "reroll" && !session.isBank);
    if (wantBank) {
      const bank = makeBankTarget(client);
      session.targetId = bank.id;
      session.targetName = bank.name;
      session.isBank = true;
    } else {
      const pick = await pickRandomTarget(client, interaction.message, interaction.user.id, cfg, session.currency, {
        alsoExclude: session.isBank ? [] : [session.targetId],
      });
      if (!pick) {
        await interaction.followUp({
          content: session.isBank
            ? "<:vegax:1443934876440068179> Nessun giocatore idoneo. Resta sulla cassaforte o usa `+rob @utente`."
            : "<:vegax:1443934876440068179> Nessun altro giocatore idoneo. Prova la cassaforte o `+rob @utente`.",
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return true;
      }
      session.targetId = pick.id;
      session.targetName = pick.name;
      session.isBank = false;
    }
    session.lastResult = null;
    session.phase = "idle";
    session.softBlocked = false;
    setSession(interaction.message.id, session);
    const payload = await buildRobGuiPayload(session, "", false, {});
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (parsed.action === "hit") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    if (session.phase === "done") {
      await replyPrivate(interaction, "<:vegax:1443934876440068179> Hai già tentato il colpo. Usa di nuovo `+rob` quando il cooldown è finito.");
      return true;
    }
    if (session.softBlocked) {
      const payload = await buildRobGuiPayload(
        session,
        "<:vegax:1443934876440068179> Furto bloccato: questo utente è protetto. Cambia bersaglio.",
        false,
        { bypassCache: true },
      );
      await interaction.message?.edit?.(payload).catch(() => {});
      await interaction.followUp({
        content: "<:vegax:1443934876440068179> Furto bloccato su questo utente (scudo/casata). Cambia bersaglio.",
        flags: PRIVATE_FLAG,
      }).catch(() => {});
      return true;
    }
    const cfg = economyConfig(client);
    const hit = await pushRobHitAnimation(
      interaction.message,
      session,
      () => attemptRob(client, msg, session, cfg),
      { preflightFn: () => preflightRobAttempt(client, msg, session, cfg) },
    );
    if (!hit.ok) {
      if (isSoftRobTargetBlock(hit)) {
        await clearRobCooldown(client, interaction.guild?.id, interaction.user?.id).catch(() => {});
        session.softBlocked = true;
        resetForNewAttempt(session);
        setSession(interaction.message?.id, session);
        const payload = await buildRobGuiPayload(session, `<:vegax:1443934876440068179> ${hit.message}`, false, { bypassCache: true });
        await interaction.message?.edit?.(payload).catch(() => {});
      }
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${hit.message}`, flags: PRIVATE_FLAG }).catch(() => {});
    }
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    deleteSession(interaction.message?.id);
    resetForNewAttempt(session);
    const payload = await buildRobGuiPayload(session, "", true, (false as any));
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  return false;
}

export = { name: "robGui", order: 25, match, execute };
