"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Swords, X } from "lucide-react";
import {
  fetchEventoWarReport,
  type EventoWarReport,
  type EventoWarSide,
  type EventoWarUnitRow,
} from "@/lib/evento-api";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { EventoTroopIcon } from "@/components/evento/EventoTroopIcon";
import { cn } from "@/lib/cn";

function fmt(n?: number | null) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("it-IT");
}

function stanceLabel(s?: string | null) {
  if (s === "attack") return "Attacco";
  if (s === "defend") return "Difesa";
  return "Passivo";
}

function formatWhen(iso?: string | null, hourKey?: string | null) {
  const raw = iso || (hourKey ? `${hourKey}:00:00.000Z` : null);
  if (!raw) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return String(hourKey || "—");
  return d.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UnitTable({
  rows,
  empty,
  factionId,
}: {
  rows?: EventoWarUnitRow[];
  empty: string;
  factionId?: string | null;
}) {
  if (!rows?.length) {
    return <p className="text-xs text-crema/45">{empty}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-center gap-2.5 rounded-xl bg-black/35 px-2.5 py-2 ring-1 ring-white/10"
        >
          <EventoTroopIcon
            unitId={r.id}
            factionId={factionId}
            size="sm"
            alt={r.label}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-crema">{r.label}</p>
            <p className="text-[0.65rem] text-crema/45">
              pot. {fmt(r.powerEach)} · tot. {fmt(r.power)}
            </p>
          </div>
          <span className="tabular-nums text-sm font-bold text-[#e4c76b]">×{fmt(r.qty)}</span>
        </li>
      ))}
    </ul>
  );
}

function SideColumn({ side, tone }: { side?: EventoWarSide | null; tone: "sky" | "rose" }) {
  if (!side) return null;
  const ring = tone === "sky" ? "ring-sky-400/35" : "ring-rose-400/35";
  const accent = tone === "sky" ? "text-sky-200" : "text-rose-200";
  const factorPct = Math.round((Number(side.surviveFactor) || 0) * 100);
  return (
    <div className={cn("rounded-2xl bg-black/30 p-4 ring-1", ring)}>
      <div className="mb-3">
        <p className={cn("text-[0.65rem] font-semibold uppercase tracking-[0.22em]", accent)}>
          {stanceLabel(side.stance)}
          {side.deployed ? " · schierate" : " · hangar"}
        </p>
        <h4 className="mt-1 font-display text-xl text-crema">{side.factionLabel || side.factionId}</h4>
        <p className="mt-1 text-xs text-crema/55">Sopravvivenza forze in campo: {factorPct}%</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-black/40 px-2 py-2 ring-1 ring-white/10">
          <p className="text-[0.55rem] uppercase tracking-wider text-crema/40">Schierate</p>
          <p className="mt-1 font-semibold tabular-nums text-crema">{fmt(side.before?.count ?? side.beforeCount)}</p>
        </div>
        <div className="rounded-xl bg-rose-500/10 px-2 py-2 ring-1 ring-rose-400/25">
          <p className="text-[0.55rem] uppercase tracking-wider text-rose-200/70">Cadute</p>
          <p className="mt-1 font-semibold tabular-nums text-rose-200">{fmt(side.dead?.count ?? side.deadCount)}</p>
        </div>
        <div className="rounded-xl bg-emerald-500/10 px-2 py-2 ring-1 ring-emerald-400/25">
          <p className="text-[0.55rem] uppercase tracking-wider text-emerald-200/70">Vive</p>
          <p className="mt-1 font-semibold tabular-nums text-emerald-200">
            {fmt(side.survivors?.count ?? side.survivorsCount)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45">
            In campo
          </p>
          <UnitTable
            rows={side.before?.rows}
            empty="Nessuna truppa in campo."
            factionId={side.factionId}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-rose-200/70">
            Cadute
          </p>
          <UnitTable rows={side.dead?.rows} empty="Nessuna perdita." factionId={side.factionId} />
        </div>
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">
            Sopravvissute
          </p>
          <UnitTable
            rows={side.survivors?.rows}
            empty="Nessuna sopravvissuta."
            factionId={side.factionId}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#e4c76b]/80">
            Hangar dopo la guerra
          </p>
          <UnitTable
            rows={side.hangarAfter?.rows}
            empty="Hangar vuoto."
            factionId={side.factionId}
          />
        </div>
      </div>
    </div>
  );
}

export function EventoWarReportModal({
  warId,
  token,
  onClose,
}: {
  warId: string;
  token: string;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const [war, setWar] = useState<EventoWarReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void fetchEventoWarReport(token, warId).then((out) => {
      if (!alive) return;
      setLoading(false);
      if (!out?.ok || !out.war) {
        setError(out?.message || "Resoconto non disponibile.");
        setWar(null);
        return;
      }
      setWar(out.war);
    });
    return () => {
      alive = false;
    };
  }, [token, warId]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          aria-label="Chiudi"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="war-report-title"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-[1] flex max-h-[min(92dvh,960px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2rem] bg-[#0a0c14] ring-1 ring-[#c9a227]/30 sm:rounded-[2rem]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">
                Resoconto di guerra
              </p>
              <h3 id="war-report-title" className="mt-1 font-display text-2xl text-crema sm:text-3xl">
                {war?.modeLabel || "Guerra"}
              </h3>
              <p className="mt-1 text-sm text-crema/55">{formatWhen(war?.resolvedAt, war?.hourKey)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-crema/70 ring-1 ring-white/10 hover:bg-white/10"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {loading ? (
              <div className="h-48 animate-pulse rounded-2xl bg-crema/8" />
            ) : error ? (
              <p className="text-sm text-crema/60">{error}</p>
            ) : war ? (
              <div className="space-y-5">
                <div className="rounded-2xl bg-gradient-to-r from-[#c9a227]/15 to-transparent p-4 ring-1 ring-[#c9a227]/25">
                  <div className="flex flex-wrap items-center gap-2">
                    <Swords className="size-4 text-[#e4c76b]" aria-hidden />
                    <p className="font-semibold text-crema">
                      {war.winnerLabel
                        ? `Vincitore: ${war.winnerLabel}`
                        : "Nessun vincitore (stallo)"}
                      {war.youWon === true ? " · vittoria tua fazione" : war.youWon === false ? " · sconfitta" : ""}
                    </p>
                  </div>
                  {war.message ? <p className="mt-2 text-sm text-crema/65">{war.message}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-crema/55">
                    <span className="rounded-full bg-black/35 px-2.5 py-1 ring-1 ring-white/10">
                      Schierate {fmt(war.totals?.troopsDeployed)}
                    </span>
                    <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-100 ring-1 ring-rose-400/25">
                      Cadute {fmt(war.totals?.troopsDead)}
                    </span>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-100 ring-1 ring-emerald-400/25">
                      Vive {fmt(war.totals?.troopsSurvived)}
                    </span>
                    <span className="rounded-full bg-black/35 px-2.5 py-1 ring-1 ring-white/10">
                      Potenza persa {fmt(war.totals?.powerLost)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <SideColumn side={war.left} tone="sky" />
                  <SideColumn side={war.right} tone="rose" />
                </div>
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
