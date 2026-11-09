"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Send, Smile, Tags, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, emptyDraft, type RoleOption, type RolePanel } from "@/lib/dashboard-community";
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
});

export function RolePanelsPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, setData, error } = useCommunity(guildId, token);
  const [edit, setEdit] = useState<RolePanel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const vars = useMemo(() => sampleVars(data), [data]);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <RowsSkeleton rows={4} />;

  const roles = data.pickers.roles;
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const assignable = roles.filter((r) => !r.managed && r.id !== guildId);
  const chName = (id: string | null) => data.pickers.textChannels.find((c) => c.id === id)?.name;

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
    if (!quiet) onToast("Pannello salvato.");
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
    onToast(r.data.edited ? "Pannello aggiornato su Discord." : `Pannello pubblicato in #${chName(r.data.panel.channelId) || "canale"}.`);
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
    const unused = assignable.filter((r) => !edit.roles.some((o) => o.roleId === r.id));
    const rows: PreviewRow[] =
      edit.mode === "menu"
        ? edit.roles.length
          ? [{ kind: "select", placeholder: edit.placeholder || "Scegli i tuoi ruoli" }]
          : []
        : edit.roles.length
          ? [{ kind: "buttons", items: edit.roles.map((o) => ({ label: o.label || roleById.get(o.roleId)?.name || "Ruolo", emoji: o.emoji, style: o.style })) }]
          : [];
    const published = Boolean(edit.messageId);

    return (
      <div className="space-y-4">
        <EditorHeader
          backLabel="Pannelli ruoli"
          onBack={() => setEdit(null)}
          title={edit.name}
          subtitle={published ? <StatusBadge tone="ok">Pubblicato in #{chName(edit.sentChannelId) || "canale"}</StatusBadge> : "Non pubblicato"}
          actions={
            <>
              <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void save()}>
                Salva
              </button>
              <button type="button" className={primaryMini} disabled={!!busy} onClick={() => void publish()}>
                <Send className="size-3.5" />
                {published && edit.channelId === edit.sentChannelId ? "Aggiorna su Discord" : "Pubblica"}
              </button>
            </>
          }
        />
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
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Tipo">
                    <Select
                      value={edit.mode}
                      onChange={(v) => setEdit({ ...edit, mode: v === "menu" ? "menu" : "buttons" })}
                      options={[
                        { value: "buttons", label: "Pulsanti (fino a 25)" },
                        { value: "menu", label: "Menu a tendina" },
                      ]}
                      className={fieldClass}
                    />
                  </Field>
                  {edit.mode === "menu" ? (
                    <Field label="Testo del menu">
                      <input value={edit.placeholder} maxLength={150} placeholder="Scegli i tuoi ruoli" onChange={(e) => setEdit({ ...edit, placeholder: e.target.value })} className={fieldClass} />
                    </Field>
                  ) : null}
                </div>
                <div className="mt-3">
                  <SettingRow title="Un solo ruolo alla volta" description="Scegliendone uno, gli altri di questo pannello vengono tolti (utile per colori o fasce d'età).">
                    <Toggle size="sm" checked={edit.unique} onChange={(unique) => setEdit({ ...edit, unique })} label="Un solo ruolo alla volta" />
                  </SettingRow>
                </div>
              </FormGroup>

              <FormGroup title={`Ruoli (${edit.roles.length}/${data.limits.panelRoles})`} description="Il ruolo del bot deve stare sopra questi ruoli nelle impostazioni del server.">
                {edit.roles.length ? (
                  <ul className="space-y-2">
                    {edit.roles.map((o, i) => {
                      const r = roleById.get(o.roleId);
                      return (
                        <li key={o.roleId} className="rounded-lg bg-espresso/40 p-2 ring-1 ring-sand/10">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: r?.color || "#99aab5" }} aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-crema">@{r?.name || "ruolo cancellato"}</span>
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
                            <EmojiButton emojis={data.pickers.emojis} onPick={(emoji) => setRole(i, { emoji })} label="Emoji">
                              {o.emoji ? <EmojiGlyph value={o.emoji} /> : <Smile className="size-3.5" />}
                            </EmojiButton>
                            {o.emoji ? (
                              <button type="button" className="text-xs text-crema/50 hover:text-crema" onClick={() => setRole(i, { emoji: "" })}>
                                togli
                              </button>
                            ) : null}
                            <input value={o.label} maxLength={80} placeholder={r?.name || "Testo"} onChange={(e) => setRole(i, { label: e.target.value })} className={cn(fieldClass, "mt-0 w-40 flex-1 py-1.5")} />
                            {edit.mode === "buttons" ? (
                              <div className="w-28">
                                <Select size="sm" value={String(o.style)} onChange={(v) => setRole(i, { style: Number(v) as RoleOption["style"] })} options={STYLES} aria-label="Colore del pulsante" />
                              </div>
                            ) : (
                              <input value={o.description} maxLength={100} placeholder="Descrizione (facoltativa)" onChange={(e) => setRole(i, { description: e.target.value })} className={cn(fieldClass, "mt-0 min-w-40 flex-[2] py-1.5")} />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-crema/55">Nessun ruolo: aggiungine uno qui sotto.</p>
                )}
                {edit.roles.length < data.limits.panelRoles ? (
                  <div className="mt-3 max-w-sm">
                    <Select
                      value=""
                      onChange={(id) => id && setEdit({ ...edit, roles: [...edit.roles, { roleId: id, label: "", emoji: "", description: "", style: 2 }] })}
                      options={[{ value: "", label: "+ Aggiungi un ruolo…" }, ...unused.map((r) => ({ value: r.id, label: `@${r.name}` }))]}
                      className={fieldClass}
                    />
                  </div>
                ) : null}
              </FormGroup>

              <FormGroup title="Messaggio del pannello">
                <DraftEditor value={edit.draft} onChange={(draft) => setEdit({ ...edit, draft })} emojis={data.pickers.emojis} allowButtons={false} />
              </FormGroup>

              {edit.id ? (
                <button type="button" className={dangerBtn} disabled={!!busy} onClick={() => void remove(edit)}>
                  <Trash2 className="size-3.5" /> Elimina pannello
                </button>
              ) : null}
            </div>
          }
          preview={<DiscordMessagePreview draft={edit.draft} vars={vars} roles={roles} channels={data.pickers.textChannels} rows={rows} />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-crema/60">Pannelli con pulsanti o menu dove i membri si prendono da soli i ruoli: notifiche, colori, giochi…</p>
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
                    {p.roles.length} ruoli · {p.mode === "menu" ? "menu" : "pulsanti"}
                    {p.unique ? " · uno solo" : ""}
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
