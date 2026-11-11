"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ListChecks, MousePointerClick, Plus, Send, Smile, SmilePlus, Tags, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { NumberField } from "@/components/ui/NumberField";
import { MultiSelect, Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, emptyDraft, type PickerRole, type RoleOption, type RolePanel } from "@/lib/dashboard-community";
import { EditorHeader, Field, FormGroup, Notice, RowsSkeleton, SettingRow, StatusBadge, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import {
  ChannelField,
  DiscordMessagePreview,
  DraftEditor,
  EditorWithPreview,
  EmojiButton,
  EmojiGlyph,
  sampleVars,
  useCommunity,
  type PreviewRow,
} from "./shared";

const STYLES = [
  { value: "1", label: "Blu" },
  { value: "2", label: "Grigio" },
  { value: "3", label: "Verde" },
  { value: "4", label: "Rosso" },
];

const MODES: { id: RolePanel["mode"]; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "buttons", label: "Pulsanti", hint: "fino a 25, con colore ed emoji", icon: <MousePointerClick className="size-4" /> },
  { id: "menu", label: "Menu a tendina", hint: "fino a 25 voci con descrizione", icon: <ListChecks className="size-4" /> },
  { id: "reactions", label: "Reazioni", hint: "fino a 20, un'emoji per ruolo", icon: <SmilePlus className="size-4" /> },
];

const BEHAVIORS = [
  { value: "toggle", label: "Dà e toglie il ruolo" },
  { value: "give", label: "Dà soltanto (es. verifica, regole accettate)" },
  { value: "remove", label: "Toglie soltanto" },
];

const DEFAULTS = {
  behavior: "toggle" as const,
  maxRoles: 0,
  requiredRoleIds: [] as string[],
  blockedRoleIds: [] as string[],
  replyEphemeral: true,
  buttonsPerRow: 5,
  menuMin: 0,
  menuMax: 0,
  clearReaction: false,
};

/** I pannelli salvati prima delle opzioni nuove non hanno questi campi. */
const withDefaults = (p: RolePanel): RolePanel => ({ ...DEFAULTS, ...p });

const blank = (): RolePanel => ({
  id: "",
  name: "Scegli i tuoi ruoli",
  channelId: null,
  mode: "buttons",
  unique: false,
  placeholder: "",
  roles: [],
  draft: emptyDraft({
    embed: { ...emptyDraft().embed, title: "Scegli i tuoi ruoli", description: "Clicca un pulsante per prendere o togliere il ruolo." },
  }),
  messageId: null,
  sentChannelId: null,
  ...DEFAULTS,
});

const emojiKey = (raw: string) => {
  const m = String(raw || "").match(/^<a?:[\w~]+:(\d+)>$/);
  return m ? m[1] : String(raw || "").replace(/️/g, "");
};

/** Gli stessi controlli del bot, per segnalare i problemi mentre si scrive. */
function panelProblems(p: RolePanel): { message: string; roleIds: string[] }[] {
  const out: { message: string; roleIds: string[] }[] = [];
  const linkRows = p.draft.buttons.length ? 1 : 0;
  if (p.mode === "reactions") {
    const missing = p.roles.filter((o) => !o.emoji);
    if (missing.length) out.push({ message: "Ogni ruolo ha bisogno della sua reazione.", roleIds: missing.map((o) => o.roleId) });
    const byKey = new Map<string, string[]>();
    for (const o of p.roles) if (o.emoji) byKey.set(emojiKey(o.emoji), [...(byKey.get(emojiKey(o.emoji)) || []), o.roleId]);
    const dup = [...byKey.values()].filter((ids) => ids.length > 1).flat();
    if (dup.length) out.push({ message: "Due o più ruoli hanno la stessa reazione.", roleIds: dup });
    if (p.roles.length > 20) out.push({ message: "Con le reazioni Discord permette al massimo 20 ruoli.", roleIds: [] });
  }
  if (p.mode === "buttons") {
    const byLabel = new Map<string, string[]>();
    for (const o of p.roles) {
      const k = `${o.label.trim().toLowerCase()}|${emojiKey(o.emoji)}`;
      if (k !== "|") byLabel.set(k, [...(byLabel.get(k) || []), o.roleId]);
    }
    const dup = [...byLabel.values()].filter((ids) => ids.length > 1).flat();
    if (dup.length) out.push({ message: "Due pulsanti hanno lo stesso testo ed emoji.", roleIds: dup });
    const cap = p.buttonsPerRow * (5 - linkRows);
    if (p.roles.length > cap) out.push({ message: `Con ${p.buttonsPerRow} pulsanti per riga${linkRows ? " e i pulsanti link" : ""} ci stanno al massimo ${cap} ruoli.`, roleIds: [] });
  }
  if (p.mode === "menu") {
    const byLabel = new Map<string, string[]>();
    for (const o of p.roles) {
      const k = (o.label || o.roleId).trim().toLowerCase();
      byLabel.set(k, [...(byLabel.get(k) || []), o.roleId]);
    }
    const dup = [...byLabel.values()].filter((ids) => ids.length > 1).flat();
    if (dup.length) out.push({ message: "Due voci del menu hanno lo stesso testo.", roleIds: dup });
    if (p.menuMax && p.menuMin > p.menuMax) out.push({ message: "Le scelte minime superano le massime.", roleIds: [] });
  }
  const overlap = p.requiredRoleIds.filter((id) => p.blockedRoleIds.includes(id));
  if (overlap.length) out.push({ message: "Un ruolo è sia richiesto sia bloccato.", roleIds: [] });
  const blockedInPanel = p.roles.filter((o) => p.blockedRoleIds.includes(o.roleId));
  if (blockedInPanel.length) out.push({ message: "Un ruolo del pannello è anche tra quelli bloccati.", roleIds: blockedInPanel.map((o) => o.roleId) });
  return out;
}

export function RolePanelsPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, setData, error } = useCommunity(guildId, token);
  const [edit, setEditRaw] = useState<RolePanel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const vars = useMemo(() => sampleVars(data), [data]);
  const setEdit = (p: RolePanel | null) => setEditRaw(p ? withDefaults(p) : null);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <RowsSkeleton rows={4} />;

  const roles = data.pickers.roles;
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const assignable = roles.filter((r) => !r.managed && r.id !== guildId);
  const chName = (id: string | null) => data.pickers.textChannels.find((c) => c.id === id)?.name;
  const roleOpts = (list: PickerRole[], exclude: string[] = []) => list.filter((r) => !exclude.includes(r.id)).map((r) => ({ value: r.id, label: `@${r.name}` }));

  const upsertLocal = (p: RolePanel) =>
    setData((d) => (d ? { ...d, rolePanels: d.rolePanels.some((x) => x.id === p.id) ? d.rolePanels.map((x) => (x.id === p.id ? p : x)) : [...d.rolePanels, p] } : d));

  const save = async (quiet = false): Promise<RolePanel | null> => {
    if (!edit) return null;
    setBusy("save");
    const r = await communityApi.saveRolePanel(token, guildId, { ...edit, id: edit.id || undefined });
    setBusy(null);
    if (!r.ok) {
      onToast(r.message, true);
      return null;
    }
    upsertLocal(r.data.panel);
    setEdit(r.data.panel);
    if (r.data.warnings?.length) onToast(r.data.warnings[0].replace(/<@&(\d+)>/g, (_, id: string) => `@${roleById.get(id)?.name || "ruolo"}`));
    else if (!quiet) onToast("Pannello salvato.");
    return r.data.panel;
  };

  const publish = async () => {
    const saved = await save(true);
    if (!saved) return;
    setBusy("publish");
    const r = await communityApi.publishRolePanel(token, guildId, saved.id);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    upsertLocal(r.data.panel);
    setEdit(r.data.panel);
    if (r.data.reactionWarning) onToast(r.data.reactionWarning, true);
    else onToast(r.data.edited ? "Pannello aggiornato su Discord." : `Pannello pubblicato in #${chName(r.data.panel.channelId) || "canale"}.`);
  };

  const remove = async (p: RolePanel) => {
    if (!p.id) return setEdit(null);
    setBusy("delete");
    const r = await communityApi.deleteRolePanel(token, guildId, p.id);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setData((d) => (d ? { ...d, rolePanels: d.rolePanels.filter((x) => x.id !== p.id) } : d));
    setEdit(null);
    onToast("Pannello eliminato anche da Discord.");
  };

  if (edit) {
    const setRole = (i: number, p: Partial<RoleOption>) => setEdit({ ...edit, roles: edit.roles.map((o, j) => (j === i ? { ...o, ...p } : o)) });
    const move = (i: number, dir: -1 | 1) => {
      const next = [...edit.roles];
      const j = i + dir;
      if (j < 0 || j >= next.length) return;
      [next[i], next[j]] = [next[j], next[i]];
      setEdit({ ...edit, roles: next });
    };
    const unused = assignable.filter((r) => !edit.roles.some((o) => o.roleId === r.id) && !edit.blockedRoleIds.includes(r.id));
    const problems = panelProblems(edit);
    const badRoles = new Set(problems.flatMap((p) => p.roleIds));
    const otherPanels = data.rolePanels.filter((p) => p.id !== edit.id);
    const alsoIn = (roleId: string) => otherPanels.find((p) => p.roles.some((o) => o.roleId === roleId))?.name;
    const roleCap = edit.mode === "reactions" ? 20 : data.limits.panelRoles;
    const label = (o: RoleOption) => o.label || roleById.get(o.roleId)?.name || "Ruolo";

    const previewRows: PreviewRow[] = !edit.roles.length
      ? []
      : edit.mode === "reactions"
        ? edit.roles.some((o) => o.emoji)
          ? [{ kind: "reactions", emojis: edit.roles.map((o) => o.emoji).filter(Boolean) }]
          : []
        : edit.mode === "menu"
          ? [{ kind: "select", placeholder: edit.placeholder || "Scegli i tuoi ruoli" }]
          : Array.from({ length: Math.ceil(edit.roles.length / edit.buttonsPerRow) }, (_, r) => ({
              kind: "buttons" as const,
              items: edit.roles.slice(r * edit.buttonsPerRow, (r + 1) * edit.buttonsPerRow).map((o) => ({ label: label(o), emoji: o.emoji, style: o.style })),
            }));
    const published = Boolean(edit.messageId);

    return (
      <div className="space-y-4">
        <EditorHeader
          backLabel="Ruoli automatici"
          onBack={() => setEdit(null)}
          title={edit.name}
          subtitle={published ? <StatusBadge tone="ok">Pubblicato in #{chName(edit.sentChannelId) || "canale"}</StatusBadge> : "Non pubblicato"}
          actions={
            <>
              <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void save()}>
                Salva
              </button>
              <button type="button" className={primaryMini} disabled={!!busy || problems.length > 0} onClick={() => void publish()}>
                <Send className="size-3.5" />
                {published && edit.channelId === edit.sentChannelId ? "Aggiorna su Discord" : "Pubblica"}
              </button>
            </>
          }
        />
        {problems.length ? (
          <div className="rounded-xl bg-[#a83a2c]/[0.08] p-3 ring-1 ring-[#a83a2c]/30">
            <p className="flex items-center gap-2 text-sm font-semibold text-crema">
              <AlertTriangle className="size-4 text-[#f0a493] light:text-[#a83a2c]" /> Da sistemare prima di pubblicare
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-6 text-xs text-crema/75">
              {problems.map((p) => (
                <li key={p.message}>{p.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <EditorWithPreview
          editor={
            <div className="space-y-4">
              <FormGroup title="Pannello">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome (solo per te)">
                    <input value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={fieldClass} />
                  </Field>
                  <ChannelField label="Canale" value={edit.channelId} channels={data.pickers.textChannels} onChange={(channelId) => setEdit({ ...edit, channelId })} />
                </div>
                <span className="mt-3 block text-[0.8rem] font-semibold text-crema/80">Tipo</span>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo di pannello">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={edit.mode === m.id}
                      onClick={() => setEdit({ ...edit, mode: m.id })}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl p-3 text-left ring-1 transition",
                        edit.mode === m.id ? "bg-caramel/12 ring-caramel/45" : "bg-espresso/40 ring-sand/10 hover:ring-sand/25",
                      )}
                    >
                      <span className={cn("mt-0.5", edit.mode === m.id ? "text-ember" : "text-crema/55")}>{m.icon}</span>
                      <span>
                        <span className="block text-sm font-semibold text-crema">{m.label}</span>
                        <span className="block text-xs text-crema/55">{m.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </FormGroup>

              <FormGroup title="Comportamento">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Cosa fa il pannello">
                    <Select value={edit.behavior} onChange={(v) => setEdit({ ...edit, behavior: v as RolePanel["behavior"] })} options={BEHAVIORS} className={fieldClass} />
                  </Field>
                  <Field label="Ruoli massimi insieme" hint="0 = nessun limite. Con “un solo ruolo” vale 1.">
                    <NumberField
                      value={edit.unique ? 1 : edit.maxRoles}
                      min={0}
                      max={25}
                      disabled={edit.unique}
                      onChange={(v) => setEdit({ ...edit, maxRoles: Number(v) || 0 })}
                      aria-label="Ruoli massimi"
                    />
                  </Field>
                </div>
                <div className="mt-2 divide-y divide-sand/[0.08]">
                  <SettingRow title="Un solo ruolo alla volta" description="Scegliendone uno, gli altri di questo pannello vengono tolti (colori, fasce d'età…).">
                    <Toggle size="sm" checked={edit.unique} onChange={(unique) => setEdit({ ...edit, unique })} label="Un solo ruolo alla volta" />
                  </SettingRow>
                  {edit.mode !== "reactions" ? (
                    <SettingRow title="Risposta privata" description="Dopo il clic il bot dice in privato cosa è cambiato. Spenta: silenzio (gli errori si vedono comunque).">
                      <Toggle size="sm" checked={edit.replyEphemeral} onChange={(replyEphemeral) => setEdit({ ...edit, replyEphemeral })} label="Risposta privata" />
                    </SettingRow>
                  ) : (
                    <SettingRow title="Togli la reazione dopo il clic" description="Il pannello resta pulito: si clicca la reazione una volta per prendere il ruolo e di nuovo per toglierlo.">
                      <Toggle size="sm" checked={edit.clearReaction} onChange={(clearReaction) => setEdit({ ...edit, clearReaction })} label="Togli la reazione dopo il clic" />
                    </SettingRow>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Solo per chi ha questi ruoli" hint="Vuoto = tutti. Utile per pannelli dopo la verifica.">
                    <MultiSelect
                      value={edit.requiredRoleIds}
                      onChange={(requiredRoleIds) => setEdit({ ...edit, requiredRoleIds })}
                      options={roleOpts(assignable, edit.blockedRoleIds)}
                      placeholder="Tutti"
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Bloccato per chi ha questi ruoli">
                    <MultiSelect
                      value={edit.blockedRoleIds}
                      onChange={(blockedRoleIds) => setEdit({ ...edit, blockedRoleIds })}
                      options={roleOpts(assignable, [...edit.requiredRoleIds, ...edit.roles.map((o) => o.roleId)])}
                      placeholder="Nessuno"
                      className={fieldClass}
                    />
                  </Field>
                </div>
              </FormGroup>

              <FormGroup
                title={edit.mode === "buttons" ? "Pulsanti" : edit.mode === "menu" ? "Menu a tendina" : "Reazioni"}
                description={
                  edit.mode === "reactions"
                    ? "Il bot mette una reazione per ogni ruolo. Scrivi nel messaggio quale emoji dà quale ruolo."
                    : edit.mode === "menu"
                      ? "I membri scelgono uno o più ruoli dal menu."
                      : "Un pulsante per ogni ruolo, con testo, emoji e colore."
                }
              >
                {edit.mode === "buttons" ? (
                  <div className="max-w-xs">
                    <Field label="Pulsanti per riga">
                      <Select value={String(edit.buttonsPerRow)} onChange={(v) => setEdit({ ...edit, buttonsPerRow: Number(v) })} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} className={fieldClass} />
                    </Field>
                  </div>
                ) : null}
                {edit.mode === "menu" ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Testo del menu">
                      <input value={edit.placeholder} maxLength={150} placeholder="Scegli i tuoi ruoli" onChange={(e) => setEdit({ ...edit, placeholder: e.target.value })} className={fieldClass} />
                    </Field>
                    <Field label="Scelte minime">
                      <NumberField value={edit.menuMin} min={0} max={Math.max(0, edit.roles.length)} onChange={(v) => setEdit({ ...edit, menuMin: Number(v) || 0 })} aria-label="Scelte minime" />
                    </Field>
                    <Field label="Scelte massime" hint="0 = tutte">
                      <NumberField value={edit.unique ? 1 : edit.menuMax} min={0} max={Math.max(0, edit.roles.length)} disabled={edit.unique} onChange={(v) => setEdit({ ...edit, menuMax: Number(v) || 0 })} aria-label="Scelte massime" />
                    </Field>
                  </div>
                ) : null}
              </FormGroup>

              <FormGroup title={`Ruoli (${edit.roles.length}/${roleCap})`} description="Il ruolo del bot deve stare sopra questi ruoli nelle impostazioni del server.">
                {edit.roles.length ? (
                  <ul className="space-y-2">
                    {edit.roles.map((o, i) => {
                      const r = roleById.get(o.roleId);
                      const bad = badRoles.has(o.roleId);
                      const other = alsoIn(o.roleId);
                      return (
                        <li key={o.roleId} className={cn("rounded-lg p-2 ring-1", bad ? "bg-[#a83a2c]/[0.08] ring-[#a83a2c]/40" : "bg-espresso/40 ring-sand/10")}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: r?.color || "#99aab5" }} aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-crema">@{r?.name || "ruolo cancellato"}</span>
                            {other ? <StatusBadge>anche in «{other}»</StatusBadge> : null}
                            <button type="button" aria-label="Sposta su" className={miniBtn} disabled={i === 0} onClick={() => move(i, -1)}>
                              <ArrowUp className="size-3.5" />
                            </button>
                            <button type="button" aria-label="Sposta giù" className={miniBtn} disabled={i === edit.roles.length - 1} onClick={() => move(i, 1)}>
                              <ArrowDown className="size-3.5" />
                            </button>
                            <button type="button" aria-label="Togli il ruolo" className={miniBtn} onClick={() => setEdit({ ...edit, roles: edit.roles.filter((_, j) => j !== i) })}>
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <EmojiButton
                              emojis={data.pickers.emojis}
                              onPick={(emoji) => setRole(i, { emoji })}
                              label={edit.mode === "reactions" ? "Reazione (obbligatoria)" : "Emoji"}
                              className={edit.mode === "reactions" && !o.emoji ? "text-[#f0a493] light:text-[#a83a2c] ring-[#a83a2c]/50" : undefined}
                            >
                              {o.emoji ? <EmojiGlyph value={o.emoji} /> : <Smile className="size-3.5" />}
                              {edit.mode === "reactions" && !o.emoji ? <span>Scegli reazione</span> : null}
                            </EmojiButton>
                            {o.emoji ? (
                              <button type="button" className="text-xs text-crema/50 hover:text-crema" onClick={() => setRole(i, { emoji: "" })}>
                                togli
                              </button>
                            ) : null}
                            {edit.mode === "reactions" ? (
                              <span className="text-xs text-crema/55">{o.emoji ? <>reazione → @{r?.name || "ruolo"}</> : "ogni ruolo ha bisogno della sua reazione"}</span>
                            ) : (
                              <input
                                value={o.label}
                                maxLength={80}
                                placeholder={r?.name || "Testo"}
                                onChange={(e) => setRole(i, { label: e.target.value })}
                                aria-label="Testo"
                                className={cn(fieldClass, "mt-0 w-40 flex-1 py-1.5")}
                              />
                            )}
                            {edit.mode === "buttons" ? (
                              <div className="w-28">
                                <Select size="sm" value={String(o.style)} onChange={(v) => setRole(i, { style: Number(v) as RoleOption["style"] })} options={STYLES} aria-label="Colore del pulsante" />
                              </div>
                            ) : null}
                            {edit.mode === "menu" ? (
                              <input
                                value={o.description}
                                maxLength={100}
                                placeholder="Descrizione (facoltativa)"
                                onChange={(e) => setRole(i, { description: e.target.value })}
                                aria-label="Descrizione"
                                className={cn(fieldClass, "mt-0 min-w-40 flex-[2] py-1.5")}
                              />
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-crema/55">Nessun ruolo: aggiungine uno qui sotto.</p>
                )}
                {edit.roles.length < roleCap ? (
                  <div className="mt-3 max-w-sm">
                    <Select
                      value=""
                      onChange={(id) => id && setEdit({ ...edit, roles: [...edit.roles, { roleId: id, label: "", emoji: "", description: "", style: 2 }] })}
                      options={[{ value: "", label: unused.length ? "+ Aggiungi un ruolo…" : "Nessun altro ruolo disponibile" }, ...unused.map((r) => ({ value: r.id, label: `@${r.name}` }))]}
                      className={fieldClass}
                    />
                  </div>
                ) : null}
              </FormGroup>

              <FormGroup title="Messaggio del pannello">
                <DraftEditor key={edit.id || "new"} value={edit.draft} onChange={(draft) => setEdit({ ...edit, draft })} emojis={data.pickers.emojis} maxButtons={data.limits.buttons} />
              </FormGroup>

              {edit.id ? (
                <button type="button" className={dangerBtn} disabled={!!busy} onClick={() => void remove(edit)}>
                  <Trash2 className="size-3.5" /> Elimina pannello
                </button>
              ) : null}
            </div>
          }
          preview={<DiscordMessagePreview draft={edit.draft} vars={vars} roles={roles} channels={data.pickers.textChannels} rows={previewRows} bot={data.bot} />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-crema/60">Pannelli con pulsanti, menu o reazioni dove i membri si prendono da soli i ruoli: notifiche, colori, giochi…</p>
        <button type="button" className={primaryMini} disabled={data.rolePanels.length >= data.limits.rolePanels} onClick={() => setEdit(blank())}>
          <Plus className="size-3.5" /> Nuovo pannello
        </button>
      </div>
      {data.rolePanels.length ? (
        <ul className="space-y-2">
          {data.rolePanels.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setEdit(p)} className="flex w-full items-center gap-3 rounded-xl bg-espresso/45 p-3 text-left ring-1 ring-sand/10 transition hover:ring-sand/25">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-caramel/12 text-ember">
                  <Tags className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-crema">{p.name}</span>
                  <span className="block truncate text-xs text-crema/55">
                    {p.roles.length} ruoli · {p.mode === "menu" ? "menu" : p.mode === "reactions" ? "reazioni" : "pulsanti"}
                    {p.unique ? " · uno solo" : p.maxRoles ? ` · max ${p.maxRoles}` : ""}
                    {p.behavior === "give" ? " · dà soltanto" : p.behavior === "remove" ? " · toglie soltanto" : ""}
                  </span>
                </span>
                {p.messageId ? <StatusBadge tone="ok">#{chName(p.sentChannelId) || "pubblicato"}</StatusBadge> : <StatusBadge>Bozza</StatusBadge>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Tags} title="Nessun pannello ruoli" text="Crea un pannello “scegli i tuoi ruoli” e pubblicalo nel canale che vuoi." />
      )}
    </div>
  );
}
