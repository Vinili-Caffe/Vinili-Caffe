"use client";

import { useMemo, useState } from "react";
import { Plus, TerminalSquare, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { MultiSelect } from "@/components/ui/Select";
import { communityApi, emptyDraft, type CustomCommand } from "@/lib/dashboard-community";
import { EditorHeader, Field, FormGroup, Notice, RowsSkeleton, SettingRow, StatusBadge, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { DiscordMessagePreview, DraftEditor, EditorWithPreview, MEMBER_PLACEHOLDERS, roleOptions, sampleVars, useCommunity } from "./shared";

const PLACEHOLDERS = [
  ...MEMBER_PLACEHOLDERS,
  { token: "{channel}", hint: "il canale dove è stato usato" },
  { token: "{args}", hint: "il testo scritto dopo il comando" },
];

const blank = (): CustomCommand => ({
  id: "",
  name: "",
  aliases: [],
  description: "",
  enabled: true,
  deleteTrigger: false,
  reply: true,
  allowedRoleIds: [],
  draft: emptyDraft({ embed: { ...emptyDraft().embed, enabled: false }, content: "" }),
  uses: 0,
});

export function CustomCommandsPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, setData, error } = useCommunity(guildId, token);
  const [edit, setEdit] = useState<CustomCommand | null>(null);
  const [aliasText, setAliasText] = useState("");
  const [busy, setBusy] = useState(false);
  const vars = useMemo(() => sampleVars(data, { args: "testo di esempio" }), [data]);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <RowsSkeleton rows={4} />;
  const prefix = data.prefix || "+";

  const open = (c: CustomCommand | null) => {
    const v = c || blank();
    setEdit(v);
    setAliasText(v.aliases.join(", "));
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const aliases = aliasText.split(/[,\s]+/).map((a) => a.trim()).filter(Boolean);
    const r = await communityApi.saveCommand(token, guildId, { ...edit, id: edit.id || undefined, aliases });
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    const c = r.data.command;
    setData((d) => (d ? { ...d, commands: (d.commands.some((x) => x.id === c.id) ? d.commands.map((x) => (x.id === c.id ? c : x)) : [...d.commands, c]).sort((a, b) => a.name.localeCompare(b.name, "it")) } : d));
    setEdit(c);
    setAliasText(c.aliases.join(", "));
    onToast(`Comando ${prefix}${c.name} salvato.`);
  };

  const toggle = async (c: CustomCommand, enabled: boolean) => {
    const r = await communityApi.saveCommand(token, guildId, { ...c, enabled });
    if (!r.ok) return onToast(r.message, true);
    setData((d) => (d ? { ...d, commands: d.commands.map((x) => (x.id === c.id ? r.data.command : x)) } : d));
  };

  const remove = async (c: CustomCommand) => {
    if (!c.id) return setEdit(null);
    setBusy(true);
    const r = await communityApi.deleteCommand(token, guildId, c.id);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    setData((d) => (d ? { ...d, commands: d.commands.filter((x) => x.id !== c.id) } : d));
    setEdit(null);
    onToast("Comando eliminato.");
  };

  if (edit) {
    return (
      <div className="space-y-4">
        <EditorHeader
          backLabel="Comandi personalizzati"
          onBack={() => setEdit(null)}
          title={edit.name ? `${prefix}${edit.name}` : "Nuovo comando"}
          actions={
            <div className="flex items-center gap-2">
              {edit.id ? <StatusBadge>{Number(edit.uses) || 0} usi</StatusBadge> : null}
              <button type="button" className={primaryMini} disabled={busy} onClick={() => void save()}>
                Salva
              </button>
            </div>
          }
        />
        <EditorWithPreview
          editor={
            <div className="space-y-4">
              <FormGroup title="Comando">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome" hint={`Si usa scrivendo ${prefix}${edit.name || "nome"} in chat.`}>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 mt-[3px] -translate-y-1/2 font-mono text-sm text-crema/50">{prefix}</span>
                      <input
                        value={edit.name}
                        maxLength={32}
                        placeholder="regole"
                        onChange={(e) => setEdit({ ...edit, name: e.target.value.toLowerCase().replace(/\s+/g, "") })}
                        className={fieldClass}
                        style={{ paddingLeft: `${0.75 + prefix.length * 0.6}rem` }}
                      />
                    </div>
                  </Field>
                  <Field label="Altri nomi (facoltativi)" hint="Separati da virgola, es. rules, r">
                    <input value={aliasText} onChange={(e) => setAliasText(e.target.value)} className={fieldClass} />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="Descrizione (per lo staff)">
                    <input value={edit.description} maxLength={100} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className={fieldClass} />
                  </Field>
                </div>
              </FormGroup>
              <FormGroup title="Risposta">
                <DraftEditor value={edit.draft} onChange={(draft) => setEdit({ ...edit, draft })} emojis={data.pickers.emojis} placeholders={PLACEHOLDERS} maxButtons={data.limits.buttons} />
              </FormGroup>
              <FormGroup title="Opzioni">
                <div className="divide-y divide-sand/[0.08]">
                  <SettingRow title="Rispondi al messaggio" description="La risposta cita il messaggio di chi ha usato il comando.">
                    <Toggle size="sm" checked={edit.reply} onChange={(reply) => setEdit({ ...edit, reply })} label="Rispondi al messaggio" />
                  </SettingRow>
                  <SettingRow title="Cancella il comando" description="Elimina il messaggio con il comando dopo aver risposto.">
                    <Toggle size="sm" checked={edit.deleteTrigger} onChange={(deleteTrigger) => setEdit({ ...edit, deleteTrigger })} label="Cancella il comando" />
                  </SettingRow>
                </div>
                <div className="mt-3">
                  <Field label="Solo per questi ruoli" hint="Vuoto = tutti possono usarlo.">
                    <MultiSelect
                      value={edit.allowedRoleIds}
                      onChange={(allowedRoleIds) => setEdit({ ...edit, allowedRoleIds })}
                      options={roleOptions(data.pickers.roles, guildId)}
                      placeholder="Tutti"
                      className={fieldClass}
                    />
                  </Field>
                </div>
              </FormGroup>
              {edit.id ? (
                <button type="button" className={dangerBtn} disabled={busy} onClick={() => void remove(edit)}>
                  <Trash2 className="size-3.5" /> Elimina comando
                </button>
              ) : null}
            </div>
          }
          preview={<DiscordMessagePreview bot={data.bot} draft={edit.draft} vars={vars} roles={data.pickers.roles} channels={data.pickers.textChannels} />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-crema/60">
          Comandi tipo <code className="rounded bg-crema/[0.06] px-1 font-mono">{prefix}regole</code> o <code className="rounded bg-crema/[0.06] px-1 font-mono">{prefix}ip</code> che rispondono sempre con lo stesso messaggio.
        </p>
        <button type="button" className={primaryMini} disabled={data.commands.length >= data.limits.commands} onClick={() => open(null)}>
          <Plus className="size-3.5" /> Nuovo comando
        </button>
      </div>
      {data.commands.length ? (
        <ul className="space-y-2">
          {data.commands.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10">
              <button type="button" onClick={() => open(c)} className="min-w-0 flex-1 text-left">
                <span className="block font-mono font-semibold text-crema">
                  {prefix}
                  {c.name}
                  {c.aliases.length ? <span className="ml-2 font-sans text-xs font-normal text-crema/50">anche {c.aliases.map((a) => prefix + a).join(", ")}</span> : null}
                </span>
                <span className="block truncate text-xs text-crema/55">{c.description || c.draft.embed.title || c.draft.content || "—"}</span>
              </button>
              {c.allowedRoleIds.length ? <StatusBadge>Ruoli limitati</StatusBadge> : null}
              <StatusBadge>{Number(c.uses) || 0} usi</StatusBadge>
              <Toggle size="sm" checked={c.enabled} onChange={(v) => void toggle(c, v)} label={`Attiva ${c.name}`} />
              <button type="button" className={miniBtn} onClick={() => open(c)}>
                Modifica
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={TerminalSquare} title="Nessun comando personalizzato" text="Crea un comando con una risposta fissa: regole, IP del server, link utili…" />
      )}
    </div>
  );
}
