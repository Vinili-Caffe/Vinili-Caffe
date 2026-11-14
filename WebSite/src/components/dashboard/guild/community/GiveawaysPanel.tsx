"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Dices, Gift, Pencil, Play, Plus, Search, Square, Trash2, Trophy, Users, X } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { communityApi, type Giveaway, type ScheduledGiveaway } from "@/lib/dashboard-community";
import { searchTicketMembers, type MemberHit } from "@/lib/dashboard-guild-ops";
import { Field, FormGroup, Notice, Pills, RowsSkeleton, StatusBadge, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { ChannelField, formatWhen, useCommunity } from "./shared";

const UNITS = [
  { value: "60000", label: "minuti" },
  { value: "3600000", label: "ore" },
  { value: "86400000", label: "giorni" },
];

/** valore per <input type="datetime-local"> (ora locale) */
function toLocalInput(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "2 giorni", "3 ore", "45 minuti" (la durata scelta nel form è sempre un'unità sola) */
function durationText(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m % 1440 === 0) return `${m / 1440} ${m / 1440 === 1 ? "giorno" : "giorni"}`;
  if (m % 60 === 0) return `${m / 60} ${m / 60 === 1 ? "ora" : "ore"}`;
  return `${m} ${m === 1 ? "minuto" : "minuti"}`;
}

export function GiveawaysPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, error } = useCommunity(guildId, token);
  const [list, setList] = useState<Giveaway[] | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledGiveaway[]>([]);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [startAt, setStartAt] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [form, setForm] = useState({ prize: "", channelId: null as string | null, amount: 1, unit: "86400000", winners: 1, minLevel: 0, host: null as MemberHit | null });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ prize: "", amount: 1, unit: "86400000", winners: 1, minLevel: 0, host: null as MemberHit | null });
  const [busy, setBusy] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void communityApi.listGiveaways(token, guildId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setList(r.data.giveaways);
        setScheduled(r.data.scheduled || []);
        setListError(null);
      } else setListError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <RowsSkeleton rows={4} />;
  const chName = (id: string) => data.pickers.textChannels.find((c) => c.id === id)?.name || "canale";

  const create = async () => {
    if (!form.prize.trim()) return onToast("Scrivi il premio.", true);
    if (!form.channelId) return onToast("Scegli il canale.", true);
    const startMs = when === "later" ? new Date(startAt).getTime() : NaN;
    if (when === "later" && !(startMs > Date.now())) return onToast("Scegli una data futura per l'inizio.", true);
    setBusy("create");
    const r = await communityApi.createGiveaway(token, guildId, {
      prize: form.prize.trim(),
      channelId: form.channelId,
      durationMs: Math.max(1, form.amount) * Number(form.unit),
      winnerCount: form.winners,
      minLevel: form.minLevel,
      ...(form.host ? { hostId: form.host.id } : {}),
      ...(when === "later" ? { startAt: new Date(startMs).toISOString() } : {}),
    });
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setForm((f) => ({ ...f, prize: "" }));
    onToast(when === "later" ? `Giveaway programmato per ${formatWhen(startMs)} in #${chName(form.channelId)}.` : `Giveaway pubblicato in #${chName(form.channelId)}.`);
    reload();
  };

  const actScheduled = async (s: ScheduledGiveaway, action: "start" | "cancel") => {
    setBusy(`${s.id}:${action}`);
    const r = await communityApi.scheduledGiveawayAction(token, guildId, s.id, action);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    onToast(action === "start" ? `Giveaway pubblicato in #${chName(s.channelId)}.` : "Giveaway programmato annullato.");
    reload();
  };

  const act = async (g: Giveaway, action: "end" | "reroll" | "delete") => {
    if (!g.messageId) return;
    setBusy(`${g.id}:${action}`);
    const r = await communityApi.giveawayAction(token, guildId, g.messageId, action);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    onToast(action === "end" ? "Giveaway terminato: vincitori estratti." : action === "reroll" ? "Nuovo vincitore estratto." : "Giveaway annullato.");
    reload();
  };

  const openEdit = (g: Giveaway) => {
    setEditId(g.id);
    setEditForm({
      prize: g.prize,
      amount: 1,
      unit: "86400000",
      winners: g.winnerCount || 1,
      minLevel: g.minLevel || 0,
      host: null,
    });
  };

  const saveEdit = async (g: Giveaway) => {
    if (!g.messageId) return;
    if (!editForm.prize.trim()) return onToast("Scrivi il premio.", true);
    setBusy(`${g.id}:edit`);
    const body: { prize: string; winnerCount: number; minLevel: number; durationMs?: number; hostId?: string } = {
      prize: editForm.prize.trim(),
      winnerCount: editForm.winners,
      minLevel: editForm.minLevel,
    };
    if (editForm.amount > 0) body.durationMs = Math.max(1, editForm.amount) * Number(editForm.unit);
    if (editForm.host) body.hostId = editForm.host.id;
    const r = await communityApi.editGiveaway(token, guildId, g.messageId, body);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setEditId(null);
    onToast("Giveaway aggiornato.");
    reload();
  };

  const active = (list || []).filter((g) => !g.ended);
  const past = (list || []).filter((g) => g.ended);

  const row = (g: Giveaway) => (
    <li key={g.id} className="space-y-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-caramel/12 text-ember">
          <Gift className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-crema">{g.prize}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-crema/55">
            <span>#{chName(g.channelId)}</span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" /> {g.participants}
            </span>
            <span>
              {g.winnerCount} {g.winnerCount === 1 ? "vincitore" : "vincitori"}
            </span>
            {g.minLevel ? <span>lv ≥ {g.minLevel}</span> : null}
            <span>{g.ended ? `finito ${formatWhen(g.endAt)}` : `finisce ${formatWhen(g.endAt)}`}</span>
          </p>
          {g.ended && !g.cancelled && g.winnerIds.length ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-crema/70">
              <Trophy className="size-3 text-ember" /> {g.winnerIds.length} {g.winnerIds.length === 1 ? "vincitore estratto" : "vincitori estratti"} (li vedi su Discord)
            </p>
          ) : null}
        </div>
        {g.cancelled ? <StatusBadge>Annullato</StatusBadge> : g.ended ? <StatusBadge tone="ok">Finito</StatusBadge> : <StatusBadge tone="accent">In corso</StatusBadge>}
        {!g.ended ? (
          <>
            <button type="button" className={miniBtn} disabled={!!busy} onClick={() => openEdit(g)}>
              <Pencil className="size-3.5" /> Modifica
            </button>
            <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void act(g, "end")}>
              <Square className="size-3.5" /> Termina ora
            </button>
            <button type="button" aria-label="Annulla giveaway" className={dangerBtn} disabled={!!busy} onClick={() => void act(g, "delete")}>
              <Trash2 className="size-3.5" />
            </button>
          </>
        ) : !g.cancelled ? (
          <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void act(g, "reroll")}>
            <Dices className="size-3.5" /> Nuovo vincitore
          </button>
        ) : null}
      </div>
      {editId === g.id && !g.ended ? (
        <div className="rounded-lg bg-crema/[0.04] p-3 ring-1 ring-sand/10">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Premio">
              <input value={editForm.prize} maxLength={200} onChange={(e) => setEditForm({ ...editForm, prize: e.target.value })} className={fieldClass} />
            </Field>
            <HostField guildId={guildId} token={token} value={editForm.host} emptyLabel="Host attuale" onChange={(host) => setEditForm({ ...editForm, host })} />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <span className="text-[0.8rem] font-semibold text-crema/80">Nuova durata da ora</span>
              <div className="mt-1.5 flex gap-2">
                <div className="w-28">
                  <NumberField className="!mt-0" value={editForm.amount} min={1} max={1440} onChange={(v) => setEditForm({ ...editForm, amount: Number(v) || 1 })} aria-label="Durata" />
                </div>
                <div className="w-28">
                  <Select value={editForm.unit} onChange={(unit) => setEditForm({ ...editForm, unit })} options={UNITS} className="!mt-0 h-10 rounded-lg" aria-label="Unità" />
                </div>
              </div>
            </div>
            <div>
              <span className="text-[0.8rem] font-semibold text-crema/80">Vincitori</span>
              <div className="mt-1.5 w-24">
                <NumberField className="!mt-0" value={editForm.winners} min={1} max={20} onChange={(v) => setEditForm({ ...editForm, winners: Number(v) || 1 })} aria-label="Vincitori" />
              </div>
            </div>
            <div>
              <span className="text-[0.8rem] font-semibold text-crema/80">Livello minimo</span>
              <div className="mt-1.5 w-24">
                <NumberField className="!mt-0" value={editForm.minLevel} min={0} max={10000} onChange={(v) => setEditForm({ ...editForm, minLevel: Math.max(0, Number(v) || 0) })} aria-label="Livello minimo" />
              </div>
            </div>
            <button type="button" className={primaryMini} disabled={!!busy} onClick={() => void saveEdit(g)}>
              Salva modifiche
            </button>
            <button type="button" className={miniBtn} disabled={!!busy} onClick={() => setEditId(null)}>
              Chiudi
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );

  return (
    <div className="space-y-4">
      <FormGroup title="Nuovo giveaway" description="Il bot pubblica il messaggio col pulsante per partecipare ed estrae i vincitori alla fine.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Premio">
            <input value={form.prize} maxLength={200} placeholder="es. Nitro 1 mese" onChange={(e) => setForm({ ...form, prize: e.target.value })} className={fieldClass} />
          </Field>
          <ChannelField label="Canale" value={form.channelId} channels={data.pickers.textChannels} onChange={(channelId) => setForm({ ...form, channelId })} />
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <span className="text-[0.8rem] font-semibold text-crema/80">Durata</span>
            <div className="mt-1.5 flex gap-2">
              <div className="w-28">
                <NumberField className="!mt-0" value={form.amount} min={1} max={1440} onChange={(v) => setForm({ ...form, amount: Number(v) || 1 })} aria-label="Durata" />
              </div>
              <div className="w-28">
                <Select value={form.unit} onChange={(unit) => setForm({ ...form, unit })} options={UNITS} className="!mt-0 h-10 rounded-lg" aria-label="Unità" />
              </div>
            </div>
          </div>
          <div>
            <span className="text-[0.8rem] font-semibold text-crema/80">Vincitori</span>
            <div className="mt-1.5 w-28">
              <NumberField className="!mt-0" value={form.winners} min={1} max={20} onChange={(v) => setForm({ ...form, winners: Number(v) || 1 })} aria-label="Vincitori" />
            </div>
          </div>
          <div>
            <span className="text-[0.8rem] font-semibold text-crema/80"> Livello minimo </span>
            <div className="mt-1.5 w-28">
              <NumberField className="!mt-0" value={form.minLevel} min={0} max={10000} onChange={(v) => setForm({ ...form, minLevel: Math.max(0, Number(v) || 0) })} aria-label="Livello minimo" />
            </div>
          </div>
          <div className="w-full sm:w-72">
            <HostField guildId={guildId} token={token} value={form.host} emptyLabel="Tu (predefinito)" onChange={(host) => setForm({ ...form, host })} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <span className="text-[0.8rem] font-semibold text-crema/80">Quando</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Pills
                value={when}
                onChange={(v) => {
                  setWhen(v);
                  if (v === "later" && !startAt) setStartAt(toLocalInput(Math.ceil((Date.now() + 3_600_000) / 3_600_000) * 3_600_000));
                }}
                ariaLabel="Quando parte il giveaway"
                options={[
                  { id: "now", label: "Subito" },
                  { id: "later", label: "Programma", icon: CalendarClock },
                ]}
              />
              {when === "later" ? (
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className={fieldClass + " !mt-0 h-10 w-auto [color-scheme:dark]"}
                  aria-label="Data e ora di inizio"
                />
              ) : null}
            </div>
          </div>
          <button type="button" className={primaryMini + " ml-auto h-10"} disabled={!!busy} onClick={() => void create()}>
            {when === "later" ? <CalendarClock className="size-3.5" /> : <Plus className="size-3.5" />} {when === "later" ? "Programma giveaway" : "Pubblica giveaway"}
          </button>
        </div>
      </FormGroup>

      {listError && !list ? <Notice error>{listError}</Notice> : null}
      {!list && !listError ? <RowsSkeleton rows={3} /> : null}
      {list ? (
        list.length || scheduled.length ? (
          <div className="space-y-4">
            {scheduled.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-crema/55">Programmati</p>
                <ul className="space-y-2">
                  {scheduled.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-crema/[0.06] text-crema/70">
                        <CalendarClock className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-crema">{s.prize}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-crema/55">
                          <span>#{chName(s.channelId)}</span>
                          <span>parte {formatWhen(s.startAt)}</span>
                          <span>dura {durationText(s.durationMs)}</span>
                          <span>
                            {s.winnerCount} {s.winnerCount === 1 ? "vincitore" : "vincitori"}
                          </span>
                          {s.minLevel ? <span>lv ≥ {s.minLevel}</span> : null}
                        </p>
                      </div>
                      <StatusBadge>Programmato</StatusBadge>
                      <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void actScheduled(s, "start")}>
                        <Play className="size-3.5" /> Parti ora
                      </button>
                      <button type="button" aria-label="Annulla giveaway programmato" className={dangerBtn} disabled={!!busy} onClick={() => void actScheduled(s, "cancel")}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {active.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-crema/55">In corso</p>
                <ul className="space-y-2">{active.map(row)}</ul>
              </div>
            ) : null}
            {past.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-crema/55">Finiti</p>
                <ul className="space-y-2">{past.slice(0, 20).map(row)}</ul>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState icon={Gift} title="Nessun giveaway" text="Crea il primo qui sopra." />
        )
      ) : null}
    </div>
  );
}

/** Scelta dell'host: cerca un membro del server; vuoto = valore predefinito. */
function HostField({
  guildId,
  token,
  value,
  emptyLabel,
  onChange,
}: {
  guildId: string;
  token: string;
  value: MemberHit | null;
  emptyLabel: string;
  onChange: (m: MemberHit | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) return;
    const timer = window.setTimeout(async () => {
      const res = await searchTicketMembers(token, guildId, q);
      if (res.ok) setHits(res.data);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, token, guildId]);

  const shown = query.trim().length >= 2 || /^\d{16,22}$/.test(query.trim()) ? hits : [];

  return (
    <div>
      <span className="text-[0.8rem] font-semibold text-crema/80">Host</span>
      {value ? (
        <div className="mt-1.5 flex h-10 items-center gap-2 rounded-lg bg-espresso/70 px-3 text-sm text-crema ring-1 ring-sand/15">
          <span className="min-w-0 flex-1 truncate font-semibold" translate="no">{value.label || value.username}</span>
          <button type="button" aria-label="Rimuovi host" className="rounded p-1 text-crema/55 hover:bg-crema/10 hover:text-crema" onClick={() => onChange(null)}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-crema/45" aria-hidden />
          <input
            value={query}
            placeholder={emptyLabel + " · cerca un membro"}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            className={fieldClass + " !mt-0 h-10 py-0 pl-8"}
          />
          {open && shown.length ? (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg bg-mocha p-1 shadow-xl ring-1 ring-sand/15">
              {shown.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-crema hover:bg-crema/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(m);
                      setQuery("");
                      setHits([]);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate font-semibold" translate="no">{m.label}</span>
                    {m.label !== m.username ? <span className="truncate text-xs text-crema/50" translate="no">@{m.username}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
