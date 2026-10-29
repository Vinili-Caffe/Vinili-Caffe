const { assertServerEconomyAccess, economyConfig, parseCurrencyArg, defaultBetCurrency, peekRobCooldown, clearRobCooldown, resolveEconomyMode, isRobBankTarget } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
const { attemptRob, buildRobGuiPayload, extractUserId, isSoftRobTargetBlock, makeSession, pushRobHitAnimation, preflightRobAttempt, resetForNewAttempt, resolveTargetUser, setSession, warmupRobPanel } = require("../../Utils/Economy/robGuiRuntime") as typeof import("../../Utils/Economy/robGuiRuntime");
const { EMOJI_DENY, postGuiPanel, replyDeny, resolveEconomyUserArg, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers") as typeof import("../../Utils/Economy/economyCommandHelpers");

export = {
  name: "rob",
  allowEmptyArgs: true,
  description: "Tenta un furto contro la cassaforte o un altro utente.",
  usage: "+rob [@utente] [vinili|caffe]",
  examples: ["+rob", "+rob @utente", "+rob caffe", "+ruba vinili"],
  async execute(message?, args?, client?) {
    await runEconomyPanelCommand(message, client, "ROB", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const access = await assertServerEconomyAccess(msg, c);
      if (!access.ok) {
        await deny(msg, access.message);
        return;
      }
      const cooldown = await peekRobCooldown(c, msg.guild.id, msg.author.id);
      if (!cooldown.ok) {
        await deny(msg, cooldown.message);
        return;
      }
      const cfg = economyConfig(c);
      const rawArgs = Array.isArray(args) ? args.map((v?) => String(v || "").trim()).filter(Boolean) : [];
      const galeoniMode = resolveEconomyMode(c) === "galeoni";
      let currency = defaultBetCurrency();
      let targetArgs = rawArgs;
      if (!galeoniMode) {
        const lastCur = rawArgs.length ? parseCurrencyArg(rawArgs[rawArgs.length - 1]) : null;
        currency = lastCur?.ok && lastCur.currency ? lastCur.currency : defaultBetCurrency();
        targetArgs = lastCur?.ok && lastCur.currency && rawArgs.length ? rawArgs.slice(0, -1) : rawArgs;
      }
      const rawTarget = String(targetArgs?.[0] || "").trim();
      const rawTargetJoined = targetArgs.join(" ").trim();
      let targetId = msg.mentions.users.first()?.id || extractUserId(rawTarget);
      if (rawTarget && !targetId && !isRobBankTarget(rawTarget)) {
                const byFullName = rawTargetJoined && rawTargetJoined !== rawTarget
          ? await resolveEconomyUserArg(msg, rawTargetJoined)
          : null;
        const byName = byFullName || (await resolveEconomyUserArg(msg, rawTarget));
        if (byName?.id) targetId = byName.id;
      }
      
      if ((rawTarget || rawTargetJoined) && !targetId && !isRobBankTarget(rawTarget) && !isRobBankTarget(rawTargetJoined)) {
        await deny(
          msg,
          galeoniMode
            ? "Indica un utente valido: `+rob @utente` / `+rob username` (oppure `+rob` per Gringott)."
            : "Indica un utente valido: `+rob @utente` / `+rob username` (oppure `+rob` per la cassaforte).",
        );
        return;
      }
      const resolved: any = await resolveTargetUser(c, msg, targetId, cfg, currency);
      let softNotice = "";
      let sessionTarget: any = resolved;
      if (!resolved || resolved.error) {
        if (targetId && isSoftRobTargetBlock(resolved) && resolved.id) {
          softNotice = `${EMOJI_DENY} ${resolved.error}`;
          await clearRobCooldown(c, msg.guild.id, msg.author.id).catch(() => {});
                    sessionTarget = {
            id: resolved.id,
            name: resolved.name || "Bersaglio",
            user: resolved.user || null,
            isBank: false,
          };
        } else {
          await deny(
            msg,
            resolved?.error || (galeoniMode
              ? "Nessun bersaglio idoneo: serve un utente con Galeoni sufficienti e smistamento completato."
              : "Nessun bersaglio idoneo: serve un utente con saldo sufficiente in Vinili o Caffè."),
          );
          return;
        }
      }
      const session: any = await makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        targetId: sessionTarget.id,
        targetName: sessionTarget.name,
        isBank: sessionTarget.isBank,
        cfg,
        client: c,
        currency,
      });
      if (softNotice) session.softBlocked = true;
            if (softNotice) {
        const payload = await buildRobGuiPayload(session, softNotice, false, { bypassCache: true });
        await post(msg, { payload, session, setSession, label: "furto" });
        return;
      }
      warmupRobPanel({ wait: false });
      await warmupRobPanel({ maxMs: 3500 });
      const payload = await buildRobGuiPayload(session, "", false, {});
      const sent = await post(msg, { payload, session, setSession, label: "furto" });
      if (!sent || !targetId) return;
      const hit = await pushRobHitAnimation(
        sent,
        session,
        () => attemptRob(c, msg, session, cfg),
        { preflightFn: () => preflightRobAttempt(c, msg, session, cfg) },
      );
      if (!hit.ok) {
        if (isSoftRobTargetBlock(hit)) {
          await clearRobCooldown(c, msg.guild.id, msg.author.id).catch(() => {});
          session.softBlocked = true;
          resetForNewAttempt(session);
          setSession(sent.id, session);
          const errPayload = await buildRobGuiPayload(session, `${EMOJI_DENY} ${hit.message}`, false, { bypassCache: true });
          await sent.edit(errPayload).catch(() => {});
        } else {
          const errPayload = await buildRobGuiPayload(session, `${EMOJI_DENY} ${hit.message}`, false, {});
          await sent.edit(errPayload).catch(() => {});
        }
      }
    });
  },
};
