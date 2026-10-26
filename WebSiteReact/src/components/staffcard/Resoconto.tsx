"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, ClipboardList, Loader2, Undo2 } from "lucide-react";
import { confirmDialog, showToast } from "@/components/ui";
import { RESO_ALTS, decideResoconto, fmtNum, hoursOf, loadResoconti, type ResoItem, type ResoWeek } from "@/lib/staffCard";
import { cn } from "@/lib/cn";

const DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

type Track = "s" | "p";

function isPm(it: ResoItem | null | undefined) {
  return String(it?.kind || "").toLowerCase() === "p";
}

function pickItem(items: ResoItem[], track: Track): ResoItem | undefined {
  if (!items.length) return undefined;
  if (track === "p") return items.find((it) => isPm(it)) || items[0];
  return items.find((it) => !isPm(it)) || items[0];
}

function availableTracks(items: ResoItem[]) {
  const staff = items.some((it) => !isPm(it));
  const pm = items.some((it) => isPm(it));
  return { staff, pm, dual: staff && pm };
}

/** Grafico costanza: per ogni giorno della settimana messaggi (caramello) e ore vocali (sabbia). */
function Chart({ data }: { data: ResoItem["costanzaChart"] }) {
  const maxText = Math.max(1, ...data.map((d) => d.text));
  const maxVoice = Math.max(1, ...data.map((d) => d.voiceSeconds));
  return (
    <div role="img" aria-label="Grafico costanza messaggi e ore vocali" className="flex h-36 items-end gap-2 sm:gap-3">
      {data.map((d, i) => (
        <div key={d.dayKey} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-28 w-full items-end justify-center gap-1">
            <motion.span
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(3, (d.text / maxText) * 100)}%` }}
              transition={{ delay: i * 0.04, duration: 0.6 }}
              title={`${fmtNum(d.text)} messaggi`}
              className="w-2.5 rounded-t-full bg-gradient-to-t from-caramel/70 to-ember sm:w-3"
            />
            <motion.span
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(3, (d.voiceSeconds / maxVoice) * 100)}%` }}
              transition={{ delay: i * 0.04 + 0.05, duration: 0.6 }}
              title={`${hoursOf(d.voiceSeconds)} h in vocale`}
              className="w-2.5 rounded-t-full bg-gradient-to-t from-crema/20 to-crema/70 sm:w-3"
            />
          </div>
          <span className="text-[0.65rem] uppercase tracking-wider text-crema/45">{DAYS[new Date(d.dayKey + "T12:00:00").getDay()]}</span>
        </div>
      ))}
    </div>
  );
}

/** Barra "fatto / limite": verde a limite raggiunto, ambra sotto. */
function Meter({ label, value, limit, unit, noLimit }: { label: string; value: number; limit: number | null; unit: string; noLimit: string }) {
  if (limit == null || limit <= 0)
    return (
      <div className="rounded-2xl bg-crema/[0.04] p-3 ring-1 ring-sand/10">
        <p className="text-xs text-crema/50">{label}</p>
        <p className="font-display text-2xl font-semibold lining-nums">
          {fmtNum(value)} <span className="text-sm text-crema/45">{unit}</span>
        </p>
        <p className="text-[0.7rem] text-crema/40">{noLimit}</p>
      </div>
    );
  const pct = Math.min(100, (value / limit) * 100);
  const ok = value >= limit;
  return (
    <div className="rounded-2xl bg-crema/[0.04] p-3 ring-1 ring-sand/10">
      <p className="text-xs text-crema/50">{label}</p>
      <p className="font-display text-2xl font-semibold lining-nums">
        {unit === "h" ? value.toLocaleString("it-IT") : fmtNum(value)}
        <span className="text-sm text-crema/45">
          {" "}
          / {limit} {unit}
        </span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-crema/10">
        <div className={cn("h-full rounded-full", ok ? "bg-[#5f9a6a]" : "bg-ember")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Resoconto settimanale nel profilo staff: dati della settimana, esito proposto, decisione High Staff.
 *  Se è sia Staff che PM (dual), si può passare da una traccia all’altra — come sul sito vecchio. */
export function Resoconto({ token, userId, canDecide, onChanged }: { token: string; userId: string; canDecide: boolean; onChanged: () => void }) {
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [track, setTrack] = useState<Track>("s");
  const [data, setData] = useState<{ items: ResoItem[]; weeks: ResoWeek[]; week: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [alts, setAlts] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    loadResoconti(token, userId, week).then((r) => {
      if (!alive) return;
      if (!r.ok) return setErr(r.message);
      // prima apertura: se la settimana corrente è vuota, salta all'ultima che ha un resoconto
      const latest = r.data.weeks.find((w) => w.count > 0);
      if (week === undefined && !r.data.items.length && latest && latest.weekKey !== r.data.week) return setWeek(latest.weekKey);
      setData(r.data);
      setErr("");
      // se la traccia scelta non c’è in questa settimana, passa all’altra
      const tracks = availableTracks(r.data.items);
      setTrack((cur) => {
        if (cur === "p" && tracks.pm) return "p";
        if (cur === "s" && tracks.staff) return "s";
        if (tracks.pm && !tracks.staff) return "p";
        return "s";
      });
    });
    return () => {
      alive = false;
    };
  }, [token, userId, week, reload]);

  // le settimane con un resoconto per questo staffer, dalla più recente
  const weeks = useMemo(() => (data?.weeks ?? []).filter((w) => w.count > 0), [data]);
  const idx = weeks.findIndex((w) => w.weekKey === (week ?? data?.week));
  const tracks = useMemo(() => availableTracks(data?.items ?? []), [data]);
  const it = pickItem(data?.items ?? [], track);

  const decide = async (accept: boolean, override?: { key: string; label: string; reason?: string }) => {
    if (!it) return;
    const title = override ? `Applicare "${override.label}"?` : it.kind === "p" ? "Applicare l’esito proposto?" : "Confermare le proposte automatiche?";
    if (!(await confirmDialog({ title, message: it.azioneDisplay && !override ? it.azioneDisplay : undefined, confirmLabel: "Conferma" }))) return;
    setBusy(true);
    const r = await decideResoconto(token, it, accept, override ? { key: override.key, reason: override.reason } : undefined);
    setBusy(false);
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || "Resoconto gestito.");
    setAlts(false);
    setReload((n) => n + 1);
    onChanged();
  };

  const flipTrack = () => {
    if (!tracks.dual) return;
    setTrack((t) => (t === "p" ? "s" : "p"));
    setAlts(false);
  };

  return (
    <section data-deeplink="staffOpen:resoconto" className="scroll-mt-28 rounded-3xl bg-roast/70 p-5 ring-1 ring-sand/12 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-2xl font-semibold">
          <ClipboardList className="size-5 text-caramel" /> Resoconto
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {weeks.length > 0 && (
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Settimana precedente" disabled={idx < 0 || idx >= weeks.length - 1} onClick={() => setWeek(weeks[idx + 1]?.weekKey)} className="rounded-full p-1.5 text-crema/60 hover:bg-crema/8 disabled:opacity-30">
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-[8.5rem] text-center text-sm font-semibold lining-nums">{it?.weekLabel || weeks.find((w) => w.weekKey === data?.week)?.label || "—"}</span>
              <button type="button" aria-label="Settimana successiva" disabled={idx <= 0} onClick={() => setWeek(weeks[idx - 1]?.weekKey)} className="rounded-full p-1.5 text-crema/60 hover:bg-crema/8 disabled:opacity-30">
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
          {tracks.dual && (
            <div className="flex items-center gap-1 rounded-full bg-crema/[0.04] p-0.5 ring-1 ring-sand/15">
              <button type="button" aria-label="Resoconto precedente" onClick={flipTrack} className="rounded-full p-1.5 text-crema/60 hover:bg-crema/8">
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-[7.5rem] text-center text-xs font-semibold text-crema/80">{track === "p" ? "Partner Manager" : "Staff"}</span>
              <button type="button" aria-label="Resoconto successivo" onClick={flipTrack} className="rounded-full p-1.5 text-crema/60 hover:bg-crema/8">
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {tracks.dual && (
        <div className="mt-3 inline-flex rounded-full bg-black/25 p-1 ring-1 ring-crema/10">
          <button
            type="button"
            aria-pressed={track === "s"}
            onClick={() => (setTrack("s"), setAlts(false))}
            className={cn("rounded-full px-3.5 py-1 text-xs font-semibold transition-colors", track === "s" ? "bg-crema text-espresso" : "text-crema/60 hover:text-crema")}
          >
            Staff
          </button>
          <button
            type="button"
            aria-pressed={track === "p"}
            onClick={() => (setTrack("p"), setAlts(false))}
            className={cn("rounded-full px-3.5 py-1 text-xs font-semibold transition-colors", track === "p" ? "bg-crema text-espresso" : "text-crema/60 hover:text-crema")}
          >
            Partner Manager
          </button>
        </div>
      )}

      {err ? (
        <p className="mt-4 text-sm text-crema/50">{err}</p>
      ) : !data ? (
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-crema/[0.04]" />
      ) : !it ? (
        <p className="mt-4 text-sm text-crema/50">Resoconto non disponibile per questa settimana.</p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-crema/8 px-2.5 py-1 font-semibold text-crema/70">{it.roleLabel?.replace(/༄\s*/g, "") || (isPm(it) ? "Partner Manager" : "Staff")}</span>
            {it.isNewStaff && <span className="rounded-full bg-ember/15 px-2.5 py-1 font-semibold text-ember">Nuovo in staff</span>}
            {it.inPause && <span className="rounded-full bg-sand/15 px-2.5 py-1 font-semibold text-sand">In pausa{it.pauseNote ? ` · ${it.pauseNote}` : ""}</span>}
            <span className={cn("ml-auto rounded-full px-2.5 py-1 font-bold", it.status === "pending" ? "bg-ember/15 text-ember" : "bg-[#3f7d4e]/20 text-[#9fd3ac] light:text-[#2f6b3f]")}>
              {it.status === "pending" ? "In attesa" : `${it.statusLabel}${it.decidedByName ? ` · ${it.decidedByName}` : ""}`}
            </span>
          </div>

          {isPm(it) ? (
            <Meter label="Partner della settimana" value={it.weeklyPartners ?? 0} limit={30} unit="partner" noLimit="" />
          ) : (
            <>
              {it.costanzaChart.length > 0 && (
                <div>
                  <Chart data={it.costanzaChart} />
                  <p className="mt-2 flex gap-4 text-xs text-crema/50">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full bg-ember" /> messaggi
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full bg-crema/60" /> ore vocali
                    </span>
                  </p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Meter label="Messaggi" value={it.weeklyMessages ?? 0} limit={it.activityLimits?.messages ?? null} unit="msg" noLimit="Nessun limite messaggi per questo ruolo." />
                <Meter label="Ore vocali" value={hoursOf(it.weeklyVoiceSeconds)} limit={it.activityLimits?.hours ?? null} unit="h" noLimit="Nessun limite ore vocali per questo ruolo." />
                <Meter label="Sanzioni" value={it.weeklySanctions ?? 0} limit={it.sanctionLimit} unit="" noLimit="Nessun minimo sanzioni per questo ruolo." />
              </div>
              {(it.activityGrade || it.behaviorGrade) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-crema/[0.04] p-3 ring-1 ring-sand/10">
                    <p className="text-xs text-crema/50">Attività</p>
                    <p className="font-display text-xl font-semibold">{it.activityGrade || "—"}</p>
                  </div>
                  <div className="rounded-2xl bg-crema/[0.04] p-3 ring-1 ring-sand/10">
                    <p className="text-xs text-crema/50">Condotta</p>
                    <p className="font-display text-xl font-semibold">{it.behaviorGrade || "—"}</p>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="rounded-2xl bg-caramel/10 p-4 ring-1 ring-caramel/25">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-caramel">Esito proposto</p>
            <p className="mt-1 font-display text-xl font-semibold">{it.azioneDisplay || it.proposedLabel || "Nulla"}</p>
          </div>

          {canDecide && it.canAct && it.status === "pending" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => decide(true)} className="inline-flex items-center gap-1.5 rounded-full bg-[#3f7d4e] px-4 py-2 text-sm font-semibold text-crema disabled:opacity-50">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {isPm(it) ? "Applica l’esito proposto" : "Conferma le proposte automatiche"}
                </button>
                <button type="button" onClick={() => setAlts((a) => !a)} className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25">
                  <Undo2 className="size-4" /> {isPm(it) ? "Scegli Richiamo o Depex" : "Scegli un’altra valutazione"}
                </button>
              </div>
              {alts && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(isPm(it) ? RESO_ALTS.p : RESO_ALTS.s).map((a) => (
                    <button key={a.label} type="button" disabled={busy} onClick={() => decide(true, a)} className="rounded-xl bg-crema/[0.04] px-3 py-2.5 text-left text-sm font-semibold ring-1 ring-sand/15 hover:ring-caramel/50">
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
