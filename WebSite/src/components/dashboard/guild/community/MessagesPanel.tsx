"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Megaphone, Plus, Send, Trash2 } from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, emptyDraft, type SavedMessage } from "@/lib/dashboard-community";
import { EditorHeader, Field, FormGroup, Notice, RowsSkeleton, SettingRow, StatusBadge, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, EditorWithPreview, formatWhen, useCommunity, useSampleVars } from "./shared";
import { ChatRemindersSection } from "./ChatRemindersSection";

const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return { value: `${h}:${m}`, label: `${h}:${m}` };
});

const PLACEHOLDERS = [
  { token: "{server}", hint: "nome del server" },
  { token: "{membercount}", hint: "numero di membri" },
];

function toLocalParts(ms: number | null) {
  const d = ms ? new Date(ms) : new Date(Date.now() + 3_600_000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const mins = Math.ceil((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
  const h = Math.min(23, Math.floor(mins / 60));
  const m = mins >= 24 * 60 ? 45 : mins % 60;
  return { date, time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

const REPEAT_OPTIONS = [
  { value: "none", label: "Una volta sola" },
  { value: "daily", label: "Ogni giorno" },
  { value: "weekly", label: "Ogni settimana" },
  { value: "monthly", label: "Ogni mese" },
];
const REPEAT_SHORT: Record<string, string> = { daily: "ogni giorno", weekly: "ogni settimana", monthly: "ogni mese" };

function statusBadge(m: SavedMessage) {
  if (m.status === "scheduled")
    return (
      <StatusBadge tone="accent">
        {m.repeat && m.repeat !== "none" ? `Ripete ${REPEAT_SHORT[m.repeat]}` : "Programmato"} · {formatWhen(m.scheduledAt)}
      </StatusBadge>
    );
  if (m.status === "sent") return <StatusBadge tone="ok">Pubblicato · {formatWhen(m.sentAt)}</StatusBadge>;
  if (m.status === "failed") return <StatusBadge tone="warn">Non inviato</StatusBadge>;
  return <StatusBadge>Bozza</StatusBadge>;
}

export function MessagesPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, setData, error } = useCommunity(guildId, token);
  const [edit, setEdit] = useState<SavedMessage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [when, setWhen] = useState(() => toLocalParts(null));
  const [today] = useState(() => toLocalParts(Date.now()).date);
  const [confirmDel, setConfirmDel] = useState(false);
  const [reminderEditing, setReminderEditing] = useState(false);

  const vars = useSampleVars(data);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <RowsSkeleton rows={4} />;

  const channels = data.pickers.textChannels;
  const chName = (id: string | null) => channels.find((c) => c.id === id)?.name;

  const upsertLocal = (m: SavedMessage) =>
    setData((d) => (d ? { ...d, messages: d.messages.some((x) => x.id === m.id) ? d.messages.map((x) => (x.id === m.id ? m : x)) : [m, ...d.messages] } : d));

  const open = (m: SavedMessage | null) => {
    const base: SavedMessage = m || {
      id: "",
      name: "Nuovo messaggio",
      channelId: null,
      draft: emptyDraft({ embed: { ...emptyDraft().embed, title: "Annuncio", description: "Scrivi qui il tuo messaggio…" } }),
      messageId: null,
      sentChannelId: null,
      sentAt: null,
      scheduledAt: null,
      status: "draft",
      error: null,
      updatedAt: 0,
    };
    setEdit(base);
    setConfirmDel(false);
    setWhen(toLocalParts(base.scheduledAt));
  };

  const save = async (quiet = false): Promise<SavedMessage | null> => {
    if (!edit) return null;
    setBusy("save");
    const r = await communityApi.saveMessage(token, guildId, { id: edit.id || undefined, name: edit.name, channelId: edit.channelId, draft: edit.draft, scheduledAt: edit.scheduledAt });
    setBusy(null);
    if (!r.ok) {
      onToast(r.message, true);
      return null;
    }
    upsertLocal(r.data.message);
    setEdit(r.data.message);
    if (!quiet) onToast("Messaggio salvato.");
    return r.data.message;
  };

  const send = async (asNew = false) => {
    if (!edit?.channelId) return onToast("Scegli prima il canale.", true);
    const saved = await save(true);
    if (!saved) return;
    setBusy("send");
    const r = await communityApi.sendMessage(token, guildId, saved.id, asNew);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    upsertLocal(r.data.message);
    setEdit(r.data.message);
    onToast(r.data.edited ? "Messaggio aggiornato su Discord." : `Pubblicato in #${chName(r.data.message.channelId) || "canale"}.`);
  };

  const schedule = async (off = false) => {
    if (!off && !edit?.channelId) return onToast("Scegli prima il canale.", true);
    const saved = await save(true);
    if (!saved) return;
    const [y, mo, d] = when.date.split("-").map(Number);
    const [h, mi] = when.time.split(":").map(Number);
    const at = off ? null : new Date(y, mo - 1, d, h, mi).getTime();
    setBusy("schedule");
    const r = await communityApi.scheduleMessage(token, guildId, saved.id, at, off ? "none" : edit?.repeat || "none", edit?.repeatDeletePrevious === true);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    upsertLocal(r.data.message);
    setEdit(r.data.message);
    onToast(off ? "Programmazione annullata." : `Verrà pubblicato ${formatWhen(at)}.`);
  };

  const remove = async (m: SavedMessage, alsoDiscord: boolean) => {
    if (!m.id) return setEdit(null);
    setBusy("delete");
    const r = await communityApi.deleteMessage(token, guildId, m.id, alsoDiscord);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setData((d) => (d ? { ...d, messages: d.messages.filter((x) => x.id !== m.id) } : d));
    setEdit(null);
    setConfirmDel(false);
    onToast(alsoDiscord ? "Messaggio eliminato, anche da Discord." : m.messageId ? "Messaggio eliminato dalla dashboard (su Discord resta)." : "Messaggio eliminato.");
  };

  if (edit) {
    const published = Boolean(edit.messageId);
    return (
      <div className="space-y-4">
        <EditorHeader
          backLabel="Messaggi"
          onBack={() => setEdit(null)}
          title={edit.name || "Messaggio"}
          subtitle={edit.id ? statusBadge(edit) : "Non ancora salvato"}
          actions={
            <>
              <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void save()}>
                Salva
              </button>
              <button type="button" className={primaryMini} disabled={!!busy} onClick={() => void send(false)}>
                <Send className="size-3.5" />
                {published && edit.channelId === edit.sentChannelId ? "Aggiorna su Discord" : "Pubblica ora"}
              </button>
            </>
          }
        />
        {edit.status === "failed" && edit.error ? <Notice error>Ultimo invio non riuscito: {edit.error}</Notice> : null}
        {edit.panelKey && !edit.managed ? (
          <Notice>
            Questo è il pannello del bot, importato com&apos;è adesso. Finché non lo pubblichi da qui lo gestisce ancora il bot; dopo la prima pubblicazione lo gestisci solo dalla dashboard. Sarà un embed classico al posto del layout a blocchi attuale.
          </Notice>
        ) : null}
        <EditorWithPreview
          editor={
            <div className="space-y-4">
              <FormGroup title="Dove">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome (solo per te)">
                    <input value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={fieldClass} />
                  </Field>
                  <ChannelField label="Canale" value={edit.channelId} channels={channels} onChange={(channelId) => setEdit({ ...edit, channelId })} />
                </div>
              </FormGroup>
              <FormGroup title="Contenuto">
                <DraftEditor key={edit.id || "new"} value={edit.draft} onChange={(draft) => setEdit({ ...edit, draft })} emojis={data.pickers.emojis} placeholders={PLACEHOLDERS} maxButtons={data.limits.buttons} />
              </FormGroup>
              <FormGroup title="Programma" description="Il bot lo pubblica da solo all'ora scelta (ora italiana).">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-44">
                    <DateField value={when.date} onChange={(date) => setWhen((w) => ({ ...w, date }))} min={today} aria-label="Giorno" />
                  </div>
                  <div className="w-28">
                    <Select value={when.time} onChange={(time) => setWhen((w) => ({ ...w, time }))} options={TIMES} className={cn(fieldClass, "mt-0")} aria-label="Ora" />
                  </div>
                  <div className="w-44">
                    <Select
                      value={edit.repeat || "none"}
                      onChange={(v) => setEdit({ ...edit, repeat: v as SavedMessage["repeat"] })}
                      options={REPEAT_OPTIONS}
                      className={cn(fieldClass, "mt-0")}
                      aria-label="Ripeti"
                    />
                  </div>
                  <button type="button" className={primaryMini} disabled={!!busy} onClick={() => void schedule(false)}>
                    <CalendarClock className="size-3.5" />
                    {edit.status === "scheduled" ? "Cambia orario" : "Programma"}
                  </button>
                  {edit.status === "scheduled" ? (
                    <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void schedule(true)}>
                      Annulla programmazione
                    </button>
                  ) : null}
                </div>
                {edit.repeat && edit.repeat !== "none" ? (
                  <div className="mt-3">
                    <SettingRow title="Cancella il messaggio precedente" description="A ogni ripetizione toglie quello della volta prima, così nel canale ne resta uno solo.">
                      <Toggle size="sm" checked={edit.repeatDeletePrevious === true} onChange={(v) => setEdit({ ...edit, repeatDeletePrevious: v })} label="Cancella il messaggio precedente" />
                    </SettingRow>
                  </div>
                ) : null}
              </FormGroup>
              <div className="flex flex-wrap gap-2">
                {published ? (
                  <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void send(true)}>
                    Pubblica come nuovo messaggio
                  </button>
                ) : null}
                {edit.id && !confirmDel ? (
                  <button type="button" className={dangerBtn} disabled={!!busy} onClick={() => (published ? setConfirmDel(true) : void remove(edit, false))}>
                    <Trash2 className="size-3.5" /> Elimina
                  </button>
                ) : null}
              </div>
              {edit.id && confirmDel ? (
                <div className="rounded-xl bg-[#a83a2c]/[0.07] p-3 ring-1 ring-[#a83a2c]/30">
                  <p className="text-sm font-semibold text-crema">Eliminare il messaggio?</p>
                  <p className="mt-0.5 text-xs text-crema/60">È pubblicato in #{chName(edit.sentChannelId) || "canale"}. Puoi toglierlo anche da Discord o lasciarlo lì.</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" className={dangerBtn} disabled={!!busy} onClick={() => void remove(edit, true)}>
                      <Trash2 className="size-3.5" /> Elimina anche da Discord
                    </button>
                    <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void remove(edit, false)}>
                      Solo dalla dashboard
                    </button>
                    <button type="button" className={miniBtn} disabled={!!busy} onClick={() => setConfirmDel(false)}>
                      Annulla
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          }
          preview={<DiscordMessagePreview bot={data.bot} draft={edit.draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
        />
      </div>
    );
  }

  const reminders = data.isMainGuild ? (
    <ChatRemindersSection guildId={guildId} token={token} data={data} onToast={onToast} onEditingChange={setReminderEditing} />
  ) : null;
  return (
    <div className="space-y-3">
      {/* la sezione promemoria resta sempre nello stesso punto: mentre la modifichi il resto si nasconde */}
      {reminderEditing ? null : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-crema/60">
          Annunci, regolamenti e avvisi: scrivi il messaggio, scegli il canale e pubblicalo subito o a un&apos;ora precisa. Poi puoi modificarlo quando vuoi.
        </p>
        <button type="button" className={primaryMini} disabled={data.messages.length >= data.limits.messages} onClick={() => open(null)}>
          <Plus className="size-3.5" /> Nuovo messaggio
        </button>
      </div>
      {data.messages.length ? (
        <ul className="space-y-2">
          {data.messages.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => open(m)}
                className="flex w-full items-center gap-3 rounded-xl bg-espresso/45 p-3 text-left ring-1 ring-sand/10 transition hover:ring-sand/25"
              >
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: m.draft.embed.enabled ? m.draft.embed.color : "#4e5058" }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-crema">{m.name}</span>
                  <span className="block truncate text-xs text-crema/55">
                    {m.channelId ? `#${chName(m.channelId) || "canale"}` : "Nessun canale"} · {m.draft.embed.title || m.draft.content || "—"}
                  </span>
                </span>
                {statusBadge(m)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Megaphone} title="Nessun messaggio" text="Crea il primo annuncio o regolamento: lo vedi in anteprima prima di pubblicarlo." />
      )}
      </>
      )}
      {reminders ? <div className={reminderEditing ? undefined : "pt-4"}>{reminders}</div> : null}
    </div>
  );
}
