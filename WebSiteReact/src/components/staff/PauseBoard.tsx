"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { DateField, showToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  MONTH_NAMES,
  PAUSE_REASON_MAX,
  PAUSE_REASON_MIN,
  WEEKDAYS_IT,
  currentRomeYearMonth,
  dayPhaseLabel,
  daysInMonth,
  isoDay,
  loadPauseMonth,
  mondayIndexFirst,
  phaseLabel,
  phaseOnCalendarDay,
  requestPause,
  shiftMonth,
  type PauseCalendar,
  type PauseDayEntry,
  type PauseItem,
} from "@/lib/staffPause";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { WorkflowChatPanel } from "./WorkflowChatPanel";
import { useStaff } from "./StaffShell";

/**
 * Calendario pause + richiesta + chat pratica.
 * Layout: calendario | form (items-start, niente card vuota che allunga).
 */
export function PauseBoard() {
  const { token } = useStaff();
  const now = currentRomeYearMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [cal, setCal] = useState<PauseCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [pendingKey, setPendingKey] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadPauseMonth(token, year, month).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok) {
        setErr(r.message);
        setCal(null);
        return;
      }
      setCal(r.data);
      setErr("");
      const pend = r.data.me?.pendingRequest?.dedupeKey || "";
      if (pend) setPendingKey(pend);
      const choices = r.data.me?.roleChoices || [];
      if (choices.length && !role) setRole(choices[0]!.value);
    });
    return () => {
      alive = false;
    };
  }, [token, year, month, reload]);

  useLiveRefresh(() => setReload((n) => n + 1), {
    intervalMs: 90_000,
    enabled: Boolean(token),
    boot: false,
    topics: ["staff_pauses"],
  });

  const dayEntries: PauseDayEntry[] = useMemo(() => {
    if (!cal || !selectedDay) return [];
    return cal.days?.[selectedDay] || [];
  }, [cal, selectedDay]);

  const grid = useMemo(() => {
    const dim = daysInMonth(year, month);
    const lead = mondayIndexFirst(year, month);
    const cells: ({ day: number; iso: string } | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push({ day: d, iso: isoDay(year, month, d) });
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [year, month]);

  const pauses = cal?.pauses || [];

  function goMonth(delta: number) {
    const n = shiftMonth(year, month, delta);
    setYear(n.year);
    setMonth(n.month);
    setSelectedDay("");
  }

  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) {
      showToast("Indica inizio e ritorno.", true);
      return;
    }
    if (end <= start) {
      showToast("La data di ritorno deve essere dopo l'inizio.", true);
      return;
    }
    const min = cal?.me?.reasonMin || PAUSE_REASON_MIN;
    if (reason.trim().length < min) {
      showToast(`Motivazione troppo corta (min. ${min} caratteri).`, true);
      return;
    }
    if (cal?.me?.needsRolePick && !role) {
      showToast("Scegli l'attività in pausa.", true);
      return;
    }
    setBusy(true);
    const r = await requestPause(token, {
      start,
      end,
      reason: reason.trim().slice(0, cal?.me?.reasonMax || PAUSE_REASON_MAX),
      role: role || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      showToast(r.message, true);
      return;
    }
    showToast(r.data.message || "Richiesta in attesa");
    if (r.data.dedupeKey) setPendingKey(r.data.dedupeKey);
    setReason("");
    setReload((n) => n + 1);
  }

  const reasonMax = cal?.me?.reasonMax || PAUSE_REASON_MAX;
  const pending = cal?.me?.pendingRequest;

  return (
    <div className="space-y-5">
      {err ? (
        <p className="rounded-2xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/30">{err}</p>
      ) : null}

      {/* Calendario + form affiancati, senza stretch verticale */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.9fr)]">
        <section className="rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/12 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Mese precedente"
              onClick={() => goMonth(-1)}
              className="rounded-full bg-crema/8 p-2 text-crema/70 ring-1 ring-sand/15 hover:text-crema"
            >
              <ChevronLeft className="size-4" />
            </button>
            <h2 className="font-display text-2xl font-semibold">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
            <button
              type="button"
              aria-label="Mese successivo"
              onClick={() => goMonth(1)}
              className="rounded-full bg-crema/8 p-2 text-crema/70 ring-1 ring-sand/15 hover:text-crema"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {loading && !cal ? (
            <div className="h-56 animate-pulse rounded-2xl bg-crema/6" />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-crema/40">
                {WEEKDAYS_IT.map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {grid.map((cell, i) => {
                  if (!cell) return <div key={`e-${i}`} />;
                  const entries = cal?.days?.[cell.iso] || [];
                  const today = cal?.today === cell.iso;
                  const on = selectedDay === cell.iso;
                  const primary = entries.some((e) => e.phase === "active")
                    ? "active"
                    : entries.some((e) => e.phase === "planned")
                      ? "planned"
                      : entries.length
                        ? "ended"
                        : "";
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => setSelectedDay(cell.iso)}
                      className={cn(
                        "relative flex min-h-[2.85rem] flex-col items-center rounded-xl px-0.5 py-1 text-sm transition ring-1",
                        on ? "bg-caramel/25 text-ember ring-caramel/40" : "bg-crema/4 ring-sand/10 hover:bg-crema/8",
                        today && !on && "ring-sand/30",
                      )}
                    >
                      <span className="font-semibold lining-nums">{cell.day}</span>
                      {entries.length ? (
                        <span
                          className={cn(
                            "mt-0.5 max-w-full truncate text-[0.55rem] leading-tight",
                            primary === "active" && "text-emerald-300",
                            primary === "planned" && "text-caramel",
                            primary === "ended" && "text-crema/40",
                          )}
                        >
                          {entries.length === 1 ? entries[0]!.displayName.split(" ")[0] : `${entries.length} pause`}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {selectedDay ? (
            <div className="mt-3 rounded-2xl bg-espresso/50 p-3 ring-1 ring-sand/12">
              <p className="text-xs font-semibold uppercase tracking-wider text-caramel">Dettaglio giorno</p>
              <p className="mt-0.5 text-sm text-crema/60 lining-nums">{selectedDay}</p>
              <ul className="mt-2 space-y-2">
                {dayEntries.map((e) => {
                  const onDay = phaseOnCalendarDay(e.start, e.end, selectedDay);
                  return (
                    <li key={`${e.id}-${e.userId}`} className="flex items-start gap-2 rounded-xl bg-crema/5 px-2.5 py-2">
                      <Avatar userId={e.userId} src={e.avatarUrl} name={e.displayName} className="size-8 text-[0.65rem]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{e.displayName}</p>
                        <p className="text-xs text-crema/50">
                          {e.start} → {e.end} · {e.ruolo}
                        </p>
                        <p className="text-xs text-crema/45">{dayPhaseLabel(onDay)}</p>
                      </div>
                    </li>
                  );
                })}
                {!dayEntries.length ? <li className="text-sm text-crema/45">Nessuna pausa in questo giorno.</li> : null}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-center text-xs text-crema/40">Tocca un giorno per il dettaglio.</p>
          )}
        </section>

        <div className="space-y-4">
          {pending || pendingKey ? (
            <section className="space-y-2 rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/12 sm:p-5">
              <h3 className="font-display text-xl font-semibold">Richiesta in attesa</h3>
              <p className="text-sm text-crema/55">
                {pending?.statusLabel || "In attesa"}
                {pending?.start && pending?.end ? ` · ${pending.start} → ${pending.end}` : ""}
              </p>
              <p className="text-xs text-crema/40">
                Messaggi visibili a te e a chi gestisce le richieste. La chat si chiude quando la pratica viene conclusa.
              </p>
              <WorkflowChatPanel token={token} dedupeKey={pendingKey || pending?.dedupeKey || ""} />
            </section>
          ) : null}

          {cal?.me?.canRequest ? (
            <form onSubmit={onRequest} className="space-y-3 rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/12 sm:p-5">
              <h3 className="font-display text-xl font-semibold">Richiedi una pausa</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wider text-crema/45">Inizio</span>
                  <DateField
                    required
                    value={start}
                    min={cal.me.minStartIso?.slice(0, 10) || undefined}
                    onChange={setStart}
                    className="mt-1 w-full"
                    aria-label="Data inizio pausa"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wider text-crema/45">Ritorno</span>
                  <DateField
                    required
                    value={end}
                    onChange={setEnd}
                    className="mt-1 w-full"
                    aria-label="Data ritorno"
                  />
                </label>
              </div>
              {(cal.me.roleChoices || []).length > 0 ? (
                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wider text-crema/45">Attività in pausa</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cal.me.roleChoices.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setRole(c.value)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition",
                          role === c.value
                            ? "bg-caramel/20 text-ember ring-caramel/35"
                            : "bg-crema/5 text-crema/65 ring-sand/15 hover:text-crema",
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-crema/45">Motivazione</span>
                <textarea
                  required
                  minLength={cal.me.reasonMin || PAUSE_REASON_MIN}
                  maxLength={reasonMax}
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, reasonMax))}
                  rows={3}
                  className="mt-1 w-full rounded-xl bg-espresso/70 px-3 py-2 ring-1 ring-sand/15"
                  placeholder="Perché chiedi la pausa…"
                />
                <span className="mt-1 block text-right text-[0.7rem] text-crema/35 lining-nums">
                  {reason.length}/{reasonMax}
                </span>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Invia richiesta
              </button>
            </form>
          ) : !pending && !pendingKey ? (
            <p className="rounded-2xl bg-roast/50 px-4 py-3 text-sm text-crema/50 ring-1 ring-sand/10">
              Non puoi aprire una nuova richiesta in questo momento.
            </p>
          ) : null}
        </div>
      </div>

      {/* Elenco mese: solo se ci sono pause, altrimenti una riga compatta */}
      <section className="rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/12 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-xl font-semibold">Pause del mese</h3>
          <p className="text-xs text-crema/45 lining-nums">{cal?.count ?? 0} nel calendario</p>
        </div>
        {pauses.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {pauses.map((p: PauseItem) => (
              <li key={p.id} className="rounded-2xl bg-crema/5 px-3 py-2.5 ring-1 ring-sand/10">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-crema">{p.displayName}</p>
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-crema/45">
                    {p.statusLabel || phaseLabel(p.phase)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-crema/55">
                  {p.start} → {p.end} · {p.ruolo}
                </p>
                {p.motivazione ? <p className="mt-1 line-clamp-2 text-xs text-crema/40">{p.motivazione}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-crema/45">{loading ? "Carico…" : "Nessuna pausa in questo mese."}</p>
        )}
      </section>
    </div>
  );
}
