"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Sparkles, Timer } from "lucide-react";
import { AccessHomeRedirect } from "@/components/AccessHomeRedirect";
import { EventoHero } from "@/components/evento/EventoHero";
import { PuzzleGame } from "@/components/puzzle/PuzzleGame";
import { PuzzleSponsorGate } from "@/components/puzzle/PuzzleSponsorGate";
import { Reveal } from "@/components/Reveal";
import { showToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import {
  completeEventoPuzzle,
  fetchEventoPuzzle,
  finishEventoPuzzleAd,
  startEventoPuzzle,
  startEventoPuzzleAd,
  type EventoPuzzleDifficultyRow,
} from "@/lib/evento-api";
import { canAccessEventoPage } from "@/lib/evento-starwars";
import {
  PUZZLE_DIFFICULTIES,
  crateOddsLabel,
  formatPuzzleCooldown,
  formatPuzzleTime,
  getPuzzleDifficulty,
  type PuzzleDifficulty,
} from "@/lib/puzzle";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";
import { cn } from "@/lib/cn";

type LiveDiff = EventoPuzzleDifficultyRow & { local: PuzzleDifficulty };

function mergeDifficulties(rows?: EventoPuzzleDifficultyRow[] | null): LiveDiff[] {
  const byId = new Map((rows || []).map((r) => [r.id, r]));
  return PUZZLE_DIFFICULTIES.map((local) => {
    const remote = byId.get(local.id);
    return {
      ...local,
      ...(remote || {}),
      imageUrl: remote?.imageUrl || local.imageUrl,
      local,
    };
  });
}

/** Gate: HS sempre; pubblico solo nella finestra calendar /puzzle/. */
export function PuzzleBoard() {
  const { ready, token } = useAuth();
  const [access, setAccess] = useState<StaffAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LiveDiff[]>(() => mergeDifficulties());
  const [watchSec, setWatchSec] = useState(12);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [active, setActive] = useState<{
    difficulty: PuzzleDifficulty;
    attemptId: string | null;
  } | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [cdGate, setCdGate] = useState<{
    difficultyId: string;
    adSessionId: string;
    watchSec: number;
  } | null>(null);

  const reload = useCallback(async () => {
    const st = await fetchEventoPuzzle(token);
    if (st?.ok && Array.isArray(st.difficulties)) {
      setRows(mergeDifficulties(st.difficulties));
      if (st.adBoosts?.watchSec) setWatchSec(Number(st.adBoosts.watchSec) || 12);
    } else {
      setRows(mergeDifficulties());
    }
    setFetchedAt(Date.now());
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setAccess(null);
      setLoading(false);
      void reload();
      return;
    }
    let alive = true;
    setLoading(true);
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      setAccess(r.ok ? r.data : null);
      setLoading(false);
    });
    void reload();
    return () => {
      alive = false;
    };
  }, [ready, token, reload]);

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const displayRows = useMemo(() => {
    const drift = Math.max(0, nowTick - fetchedAt);
    return rows.map((r) => {
      const remaining = Math.max(0, Number(r.cooldownRemainingMs || 0) - drift);
      return {
        ...r,
        cooldownRemainingMs: remaining,
        canStart: Boolean(token) && remaining <= 0,
        canCutCooldown: Boolean(token && remaining > 0 && (r.cdAdsLeft == null || r.cdAdsLeft > 0)),
      };
    });
  }, [rows, nowTick, fetchedAt, token]);

  async function onPick(row: LiveDiff) {
    if (startingId || active) return;
    const diff = getPuzzleDifficulty(row.id) || row.local;
    if (!token) {
      showToast("Accedi con Discord per giocare e ritirare il premio.", true);
      return;
    }
    if ((row.cooldownRemainingMs || 0) > 0) {
      showToast(`Cooldown: ${formatPuzzleCooldown(row.cooldownRemainingMs || 0)}`, true);
      return;
    }
    setStartingId(row.id);
    const out = await startEventoPuzzle(token, row.id);
    setStartingId(null);
    if (!out?.ok || !out.attemptId) {
      showToast(out?.message || "Non posso avviare questa difficoltà.", true);
      if (out?.cooldownRemainingMs) void reload();
      return;
    }
    setActive({ difficulty: diff, attemptId: out.attemptId });
  }

  async function onCutCooldown(row: LiveDiff, ev: { stopPropagation: () => void }) {
    ev.stopPropagation();
    if (!token || cdGate) return;
    const start = await startEventoPuzzleAd(token, { kind: "cooldown", difficultyId: row.id });
    if (!start?.ok || !start.adSessionId) {
      showToast(start?.message || "Boost non disponibile.", true);
      return;
    }
    setCdGate({
      difficultyId: row.id,
      adSessionId: start.adSessionId,
      watchSec: start.watchSec || watchSec,
    });
  }

  async function onComplete(payload: { elapsedMs: number; timedOut: boolean }) {
    if (!active || payload.timedOut) return;
    if (!token || !active.attemptId) return;
    const out = await completeEventoPuzzle(token, {
      difficultyId: active.difficulty.id,
      attemptId: active.attemptId,
      elapsedMs: payload.elapsedMs,
    });
    if (!out?.ok) {
      throw new Error(out?.message || "Premio non assegnato.");
    }
    const crate = out.grant?.crateId ? ` + cassa ${out.grant.crateId}` : "";
    const boost = out.rewardBoosted ? " (boost)" : "";
    showToast(`+${out.grant?.exp || active.difficulty.exp} EXP${crate}${boost}`);
    void reload();
  }

  if (!ready || loading) {
    return (
      <section className="mx-auto max-w-5xl px-6 pb-20 pt-8" aria-busy="true" aria-label="Caricamento">
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-2xl bg-crema/8" />
          <div className="aspect-[1600/816] animate-pulse rounded-3xl bg-crema/6" />
          <div className="h-24 animate-pulse rounded-3xl bg-crema/6" />
        </div>
      </section>
    );
  }

  if (!canAccessEventoPage("puzzle", access)) {
    return <AccessHomeRedirect active />;
  }

  return (
    <>
      <EventoHero
        icon={<Sparkles />}
        title="Puzzle"
        accent="galassia"
        text="Sei difficoltà · bonus per tagliare il cooldown, guadagnare tempo e potenziare il premio."
      />
      <Reveal className="-mt-6 mx-auto max-w-5xl px-4 pb-24 sm:-mt-10 sm:px-6">
        {active ? (
          <PuzzleGame
            key={`${active.difficulty.id}-${active.attemptId || "x"}`}
            difficulty={active.difficulty}
            attemptId={active.attemptId}
            token={token}
            watchSec={watchSec}
            onExit={() => {
              setActive(null);
              void reload();
            }}
            onComplete={onComplete}
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl bg-gradient-to-b from-[#1a2744]/80 to-[#05070f] p-4 ring-1 ring-[#c9a227]/30 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e4c76b]">Scegli la rotta</p>
              <p className="mt-1 text-sm text-crema/65">
                In cooldown? Guarda un annuncio (−35% attesa, max 3). In partita: +45s e premio ×1.5.
              </p>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2">
              {displayRows.map((row) => {
                const locked = (row.cooldownRemainingMs || 0) > 0;
                const busy = startingId === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onPick(row)}
                      className={cn(
                        "group relative w-full overflow-hidden rounded-3xl text-left ring-1 transition",
                        locked ? "ring-white/10 opacity-90" : "ring-[#c9a227]/35 hover:ring-[#e4c76b]/70",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.imageUrl}
                        alt=""
                        className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        draggable={false}
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                      <span className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-display text-xl font-semibold text-crema sm:text-2xl">{row.label}</span>
                          {locked ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[0.65rem] text-crema/75 ring-1 ring-white/15">
                              <Lock className="size-3" aria-hidden />
                              {formatPuzzleCooldown(row.cooldownRemainingMs || 0)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#2ea8ff]/20 px-2 py-0.5 text-[0.65rem] text-[#9fd4ff] ring-1 ring-[#2ea8ff]/35">
                              <Timer className="size-3" aria-hidden />
                              {formatPuzzleTime(row.timeLimitSec)}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-xs text-crema/70">
                          {row.pieces} pezzi · {row.exp} EXP · {crateOddsLabel(row.crateOdds)}
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#e4c76b]/90">
                            {busy ? "Avvio…" : locked ? "In cooldown" : token ? "Gioca" : "Accedi per giocare"}
                          </span>
                          {locked && row.canCutCooldown ? (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(ev) => void onCutCooldown(row, ev)}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  void onCutCooldown(row, ev as unknown as React.MouseEvent);
                                }
                              }}
                              className="rounded-full bg-caramel/25 px-2.5 py-1 text-[0.65rem] font-semibold text-sand ring-1 ring-caramel/40 hover:bg-caramel/40"
                            >
                              Riduci attesa ({row.cdAdsLeft ?? "?"} left)
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </Reveal>

      {cdGate && token ? (
        <PuzzleSponsorGate
          watchSec={cdGate.watchSec}
          title="Riduci il cooldown"
          subtitle="−35% sull’attesa rimanente"
          onCancel={() => setCdGate(null)}
          onDone={async () => {
            const out = await finishEventoPuzzleAd(token, cdGate.adSessionId);
            setCdGate(null);
            if (!out?.ok) {
              showToast(out?.message || "Boost fallito.", true);
              return;
            }
            showToast(`Cooldown −${formatPuzzleCooldown(out.cutMs || 0)}`);
            void reload();
          }}
        />
      ) : null}
    </>
  );
}
