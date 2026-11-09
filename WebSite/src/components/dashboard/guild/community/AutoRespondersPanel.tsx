"use client";

import { useMemo, useState } from "react";
import { MessageSquareReply, Plus, Smile, Trash2, X } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { MultiSelect, Select } from "@/components/ui/Select";
import { NumberField } from "@/components/ui/NumberField";
import { cn } from "@/lib/cn";
import { communityApi, emptyDraft, type AutoResponder } from "@/lib/dashboard-community";
import { EditorHeader, Field, FormGroup, Notice, RowsSkeleton, SettingRow, StatusBadge, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { DiscordMessagePreview, DraftEditor, EditorWithPreview, EmojiButton, EmojiGlyph, MEMBER_PLACEHOLDERS, roleOptions, sampleVars, useCommunity } from "./shared";

const MATCH = [
  { value: "contains", label: "Il messaggio contiene la parola" },
  { value: "word", label: "Contiene la parola intera" },
  { value: "startsWith", label: "Il messaggio inizia con" },
  { value: "exact", label: "Il messaggio è esattamente" },
];

const PLACEHOLDERS = [...MEMBER_PLACEHOLDERS.slice(0, 4), { token: "{channel}", hint: "il canale del messaggio" }];

const blank = (): AutoResponder => ({
  id: "",
  name: "",
  enabled: true,
  triggers: [],
  match: "contains",
  replyEnabled: true,
  reply: true,
  draft: emptyDraft({ embed: { ...emptyDraft().embed, enabled: false } }),
  reactions: [],
  channelIds: [],
  requiredRoleIds: [],
  ignoredRoleIds: [],
  cooldownSeconds: 10,
  deleteTrigger: false,
});

export function AutoRespondersPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, setData, error } = useCommunity(guildId, token);
  const [edit, setEdit] = useState<AutoResponder | null>(null);
  const [triggerInput, setTriggerInput] = useState("");
  const [busy, setBusy] = useState(false);
  const vars = useMemo(() => sampleVars(data), [data]);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <RowsSkeleton rows={4} />;
  const rows = data.autoResponders || [];
  const setRows = (next: AutoResponder[]) => setData((d) => (d ? { ...d, autoResponders: next } : d));

  const addTriggers = () => {
    if (!edit) return;
    const parts = triggerInput.split(",").map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2);
    if (!parts.length) return;
    setEdit({ ...edit, triggers: [...new Set([...edit.triggers, ...parts])].slice(0, 10) });
    setTriggerInput("");
  };

  const save = async () => {
    if (!edit) return;
    const pending = triggerInput.split(",").map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2);
    const body = { ...edit, id: edit.id || undefined, triggers: [...new Set([...edit.triggers, ...pending])] };
    setBusy(true);
    const r = await communityApi.saveAutoResponder(token, guildId, body);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    const a = r.data.autoResponder;
    setRows(rows.some((x) => x.id === a.id) ? rows.map((x) => (x.id === a.id ? a : x)) : [...rows, a]);
    setEdit(a);
    setTriggerInput("");
    onToast("Risposta automatica salvata.");
  };

  const toggle = async (a: AutoResponder, enabled: boolean) => {
    const r = await communityApi.saveAutoResponder(token, guildId, { ...a, enabled });
    if (!r.ok) return onToast(r.message, true);
    setRows(rows.map((x) => (x.id === a.id ? r.data.autoResponder : x)));
  };

  const remove = async (a: AutoResponder) => {
    if (!a.id) return setEdit(null);
    setBusy(true);
    const r = await communityApi.deleteAutoResponder(token, guildId, a.id);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    setRows(rows.filter((x) => x.id !== a.id));
    setEdit(null);
    onToast("Risposta automatica eliminata.");
  };

  if (edit) {
    return (
      <div className="space-y-4">
        <EditorHeader
          backLabel="Risposte automatiche"
          onBack={() => setEdit(null)}
          title={edit.name || edit.triggers[0] || "Nuova risposta"}
          actions={
            <button type="button" className={primaryMini} disabled={busy} onClick={() => void save()}>
              Salva
            </button>
          }
        />
        <EditorWithPreview
          editor={
            <div className="space-y-4">
              <FormGroup title="Quando scatta" description="Le parole non distinguono maiuscole e minuscole.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome (solo per te)">
                    <input value={edit.name} maxLength={80} placeholder="es. IP del server" onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={fieldClass} />
                  </Field>
                  <Field label="Regola">
                    <Select value={edit.match} onChange={(v) => setEdit({ ...edit, match: v as AutoResponder["match"] })} options={MATCH} className={fieldClass} />
                  </Field>
                </div>
                <div className="mt-3">
                  <span className="text-[0.8rem] font-semibold text-crema/80">Parole o frasi ({edit.triggers.length}/10)</span>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      value={triggerInput}
                      onChange={(e) => setTriggerInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTriggers();
                        }
                      }}
                      placeholder="es. ip, come entro  (Invio per aggiungere)"
                      className={cn(fieldClass, "mt-0")}
                    />
                    <button type="button" className={miniBtn} onClick={addTriggers}>
                      <Plus className="size-3.5" /> Aggiungi
                    </button>
                  </div>
                  {edit.triggers.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {edit.triggers.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-caramel/12 px-2 py-1 text-xs font-semibold text-ember ring-1 ring-caramel/25">
                          {t}
                          <button type="button" aria-label={`Togli ${t}`} onClick={() => setEdit({ ...edit, triggers: edit.triggers.filter((x) => x !== t) })}>
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </FormGroup>

              <FormGroup title="Reazioni" description="Emoji che il bot mette sotto al messaggio (fino a 5).">
                <div className="flex flex-wrap items-center gap-2">
                  {edit.reactions.map((r) => (
                    <button
                      key={r}
                      type="button"
                      title="Togli"
                      onClick={() => setEdit({ ...edit, reactions: edit.reactions.filter((x) => x !== r) })}
                      className="inline-flex items-center gap-1 rounded-lg bg-crema/[0.06] px-2 py-1.5 text-base ring-1 ring-sand/10 hover:ring-[#a83a2c]/40"
                    >
                      <EmojiGlyph value={r} />
                      <X className="size-3 text-crema/50" />
                    </button>
                  ))}
                  {edit.reactions.length < 5 ? (
                    <EmojiButton emojis={data.pickers.emojis} onPick={(t) => setEdit({ ...edit, reactions: [...new Set([...edit.reactions, t])].slice(0, 5) })} label="Aggiungi reazione">
                      <Smile className="size-3.5" /> Aggiungi
                    </EmojiButton>
                  ) : null}
                </div>
              </FormGroup>

              <FormGroup title="Risposta">
                <SettingRow title="Rispondi con un messaggio" description="Spegnilo se vuoi solo le reazioni.">
                  <Toggle size="sm" checked={edit.replyEnabled} onChange={(replyEnabled) => setEdit({ ...edit, replyEnabled })} label="Rispondi con un messaggio" />
                </SettingRow>
                {edit.replyEnabled ? (
                  <div className="mt-3">
                    <DraftEditor value={edit.draft} onChange={(draft) => setEdit({ ...edit, draft })} emojis={data.pickers.emojis} placeholders={PLACEHOLDERS} maxButtons={data.limits.buttons} />
                  </div>
                ) : null}
              </FormGroup>

              <FormGroup title="Opzioni">
                <div className="divide-y divide-sand/[0.08]">
                  <SettingRow title="Cita il messaggio" description="La risposta appare come risposta al messaggio.">
                    <Toggle size="sm" checked={edit.reply} onChange={(reply) => setEdit({ ...edit, reply })} label="Cita il messaggio" />
                  </SettingRow>
                  <SettingRow title="Cancella il messaggio che l'ha fatta scattare">
                    <Toggle size="sm" checked={edit.deleteTrigger} onChange={(deleteTrigger) => setEdit({ ...edit, deleteTrigger })} label="Cancella il messaggio" />
                  </SettingRow>
                  <SettingRow title="Attesa tra una risposta e l'altra" description="Secondi, per canale. Evita lo spam.">
                    <div className="w-24">
                      <NumberField value={edit.cooldownSeconds} min={0} max={3600} onChange={(v) => setEdit({ ...edit, cooldownSeconds: Number(v) || 0 })} aria-label="Secondi di attesa" />
                    </div>
                  </SettingRow>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Solo in questi canali" hint="Vuoto = tutti. Puoi scegliere anche una categoria.">
                    <MultiSelect
                      value={edit.channelIds}
                      onChange={(channelIds) => setEdit({ ...edit, channelIds })}
                      options={[...data.pickers.categories.map((c) => ({ value: c.id, label: `📁 ${c.name}` })), ...data.pickers.textChannels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
                      placeholder="Tutti i canali"
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Solo chi ha questi ruoli" hint="Vuoto = tutti. Basta averne uno.">
                    <MultiSelect
                      value={edit.requiredRoleIds || []}
                      onChange={(requiredRoleIds) => setEdit({ ...edit, requiredRoleIds })}
                      options={roleOptions(data.pickers.roles, guildId)}
                      placeholder="Tutti"
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Ignora chi ha questi ruoli" hint="Ha priorità sui ruoli richiesti.">
                    <MultiSelect value={edit.ignoredRoleIds} onChange={(ignoredRoleIds) => setEdit({ ...edit, ignoredRoleIds })} options={roleOptions(data.pickers.roles, guildId)} placeholder="Nessuno" className={fieldClass} />
                  </Field>
                </div>
              </FormGroup>

              {edit.id ? (
                <button type="button" className={dangerBtn} disabled={busy} onClick={() => void remove(edit)}>
                  <Trash2 className="size-3.5" /> Elimina
                </button>
              ) : null}
            </div>
          }
          preview={
            edit.replyEnabled ? (
              <DiscordMessagePreview draft={edit.draft} vars={vars} roles={data.pickers.roles} channels={data.pickers.textChannels} bot={data.bot} />
            ) : (
              <Notice>Solo reazioni: il bot non scrive niente.</Notice>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-crema/60">Il bot risponde da solo quando qualcuno scrive certe parole, senza bisogno di comandi.</p>
        <button
          type="button"
          className={primaryMini}
          disabled={rows.length >= data.limits.autoResponders}
          onClick={() => {
            setEdit(blank());
            setTriggerInput("");
          }}
        >
          <Plus className="size-3.5" /> Nuova risposta
        </button>
      </div>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setEdit(a);
                  setTriggerInput("");
                }}
              >
                <span className="block truncate font-semibold text-crema">{a.name}</span>
                <span className="block truncate text-xs text-crema/55">
                  {a.triggers.map((t) => `“${t}”`).join(", ")}
                  {a.reactions.length ? ` · ${a.reactions.length} reazioni` : ""}
                </span>
              </button>
              {a.channelIds.length ? <StatusBadge>Canali scelti</StatusBadge> : null}
              <Toggle size="sm" checked={a.enabled} onChange={(v) => void toggle(a, v)} label={`Attiva ${a.name}`} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={MessageSquareReply} title="Nessuna risposta automatica" text="Es. quando qualcuno scrive “ip” il bot risponde con l'indirizzo del server." />
      )}
    </div>
  );
}
