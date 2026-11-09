/**
 * Pannelli "scegli i tuoi ruoli" pubblicati dalla dashboard.
 *   pulsante  vcrp:<panelId>:<roleId>  → dà/toglie il ruolo (secondo il comportamento del pannello)
 *   menu      vcrp:<panelId>           → i ruoli del pannello diventano quelli scelti
 */
const T = require("../../core/tenantCommunityTools") as typeof import("../../core/tenantCommunityTools");

const EPHEMERAL = 64;

async function say(interaction: any, content: string) {
  if (interaction.deferred && !interaction.replied && interaction.__vcEphemeralDefer) {
    return interaction.editReply({ content, allowedMentions: { parse: [] } }).catch(() => null);
  }
  const payload = { content, flags: EPHEMERAL, allowedMentions: { parse: [] } };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

function canManage(guild?, roleId?: string) {
  const role = guild?.roles?.cache?.get(roleId);
  const me = guild?.members?.me;
  if (!role || !me) return { ok: false, why: "Questo ruolo non esiste più." };
  if (role.managed) return { ok: false, why: "Questo ruolo è gestito da un'integrazione." };
  if (!me.permissions?.has?.(268435456n)) return { ok: false, why: "Al bot manca il permesso Gestire i ruoli." };
  if (role.position >= me.roles.highest.position) return { ok: false, why: `Il ruolo del bot è sotto @${role.name}: chiedi allo staff di spostarlo più in alto.` };
  return { ok: true, role };
}

export = {
  name: "tenantRolePanel",
  order: 40,
  match(interaction?) {
    if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) return false;
    return Boolean(T.parseRolePanelCustomId(interaction.customId));
  },
  async execute(interaction?) {
    const parsed = T.parseRolePanelCustomId(interaction.customId);
    const guild = interaction.guild;
    if (!parsed || !guild) return;
    const panels = await T.listRolePanels(guild.id);
    const panel = panels.find((p) => p.id === parsed.panelId);
    if (!panel) return say(interaction, "Questo pannello non è più attivo.");

    /* con la risposta privata spenta il clic resta silenzioso (errori a parte) */
    if (panel.replyEphemeral === false) {
      await interaction.deferUpdate().catch(() => null);
    } else {
      await interaction.deferReply({ flags: EPHEMERAL }).catch(() => null);
      interaction.__vcEphemeralDefer = true;
    }

    const member = interaction.member?.roles?.cache ? interaction.member : await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return say(interaction, "Non riesco a leggere i tuoi ruoli, riprova.");
    const held = new Set<string>([...member.roles.cache.keys()].map(String));

    const denied = T.rolePanelAccessError(panel, held);
    if (denied) return say(interaction, denied);

    const panelRoleIds = panel.roles.map((r) => r.roleId);
    if (parsed.roleId && !panelRoleIds.includes(parsed.roleId)) return say(interaction, "Questo ruolo non fa più parte del pannello.");
    const decision = parsed.roleId
      ? T.decideRolePanel(panel, held, { type: "click", roleId: parsed.roleId })
      : T.decideRolePanel(panel, held, { type: "select", values: (interaction.values || []).map(String) });
    if (decision.error) return say(interaction, decision.error);

    const added: string[] = [];
    const removed: string[] = [];
    const errors: string[] = [];
    for (const id of panelRoleIds) {
      const has = held.has(id);
      const should = decision.want.has(id);
      if (has === should) continue;
      const check = canManage(guild, id);
      if (!check.ok) {
        errors.push(check.why);
        continue;
      }
      try {
        if (should) {
          await member.roles.add(id, "Pannello ruoli");
          added.push(id);
        } else {
          await member.roles.remove(id, "Pannello ruoli");
          removed.push(id);
        }
      } catch {
        errors.push(`Non sono riuscito a modificare <@&${id}>.`);
      }
    }

    if (panel.replyEphemeral === false && !errors.length) return;
    const lines: string[] = [];
    if (added.length) lines.push(`Aggiunto: ${added.map((id) => `<@&${id}>`).join(", ")}`);
    if (removed.length) lines.push(`Tolto: ${removed.map((id) => `<@&${id}>`).join(", ")}`);
    if (errors.length) lines.push(...[...new Set(errors)].slice(0, 3));
    if (!lines.length) lines.push("Nessun cambiamento.");
    return say(interaction, lines.join("\n"));
  },
};
