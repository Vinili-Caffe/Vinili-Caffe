"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Crown, Radio, Swords, Trophy, Zap } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import {
  fetchEventoClassifiche,
  type EventoClassificheBoards,
  type EventoClassificheFactionRow,
  type EventoClassificheUserRow,
} from "@/lib/evento-api";
import { avatarUrl, useAuth } from "@/lib/auth";
import { useEventoFactionSync } from "@/lib/evento-faction-sync";
import { EventoLoginGate } from "@/components/evento/EventoUi";
import { cn } from "@/lib/cn";

type Scope = "period" | "phase";

const EASE = [0.22, 1, 0.36, 1] as const;

function fmt(n?: number | null, digits = 0) {
  const v = Number(n) || 0;
  return v.toLocaleString("it-IT", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits > 0 ? Math.min(1, digits) : 0,
  });
}

function saberTone(rank: number) {
  if (rank === 1) return { bar: "from-[#fff6c8] via-[#f0c14a] to-[#a86a12]", glow: "rgba(240,193,74,0.75)" };
  if (rank === 2) return { bar: "from-[#e8f1ff] via-[#7eb0ff] to-[#2a5fd4]", glow: "rgba(126,176,255,0.7)" };
  if (rank === 3) return { bar: "from-[#ffd0c8] via-[#e85d4c] to-[#8a241c]", glow: "rgba(232,93,76,0.65)" };
  return { bar: "from-cyan-100 via-sky-400 to-cyan-700", glow: "rgba(56,189,248,0.45)" };
}

function factionAccent(factionId?: string | null) {
  const f = String(factionId || "").toLowerCase();
  if (f.includes("repubblica") || f.includes("ribellione") || f.includes("nuova")) {
    return { ring: "ring-sky-400/35", wash: "from-sky-500/20" };
  }
  if (f.includes("impero") || f.includes("separat") || f.includes("ordine") || f.includes("primo")) {
    return { ring: "ring-rose-400/30", wash: "from-rose-500/18" };
  }
  return { ring: "ring-cyan-300/25", wash: "from-cyan-500/15" };
}

/** Board classifiche — vetro comando SW, senza sweep/blur continui. */
function Holopad({
  title,
  subtitle,
  icon,
  children,
  delay = 0,
  wide,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
  delay?: number;
  wide?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      className={cn("relative", wide && "lg:col-span-2")}
    >
      <div
        className="relative rounded-2xl p-px"
        style={{
          background:
            "linear-gradient(160deg, rgba(228,199,107,0.5), rgba(56,189,248,0.16) 48%, rgba(14,165,233,0.3))",
        }}
      >
        <div className="relative rounded-[0.95rem] bg-[#070d18]/92 px-4 py-5 sm:rounded-[1.05rem] sm:px-5 sm:py-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e4c76b]/40 to-transparent"
          />
          <header className="relative mb-5 flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#2ea8ff]/12 text-[#7dd3fc] ring-1 ring-[#2ea8ff]/30">
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#e4c76b]/80">
                Sala comando
              </p>
              <h3 className="mt-1 font-display text-xl font-semibold tracking-tight text-[#f0e6c8] sm:text-2xl">
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-snug text-[#f0e6c8]/55">{subtitle}</p>
            </div>
          </header>
          <div className="relative">{children}</div>
        </div>
      </div>
    </motion.section>
  );
}

function Lightsaber({ rank, tall }: { rank: number; tall?: boolean }) {
  const tone = saberTone(rank);
  return (
    <span
      aria-hidden
      className={cn(
        "relative shrink-0 rounded-full bg-gradient-to-b shadow-[0_0_10px_var(--saber-glow)]",
        tall ? "h-12 w-[3px] sm:h-14" : "h-10 w-[3px]",
        tone.bar,
      )}
      style={{ ["--saber-glow" as string]: tone.glow }}
    >
      <span className="absolute inset-x-[-1px] top-0 h-1.5 rounded-full bg-white/70" />
    </span>
  );
}

function FactionRows({ rows }: { rows: EventoClassificheFactionRow[] }) {
  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-sky-100/45">Nessuna fazione in classifica.</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const accent = factionAccent(r.factionId);
        return (
          <motion.li
            key={r.factionId}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.45, ease: EASE }}
            className="relative"
          >
            <div
              className={cn(
                "relative flex items-center gap-3 overflow-hidden rounded-2xl bg-black/35 px-3 py-3 ring-1",
                accent.ring,
                r.rank === 1 && "ring-[#e4c76b]/35",
              )}
            >
              <div
                aria-hidden
                className={cn("pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r to-transparent opacity-50", accent.wash)}
              />
              <Lightsaber rank={r.rank} tall />
              <div className="relative min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-semibold text-crema">
                    <span className="mr-2 font-mono text-[0.75rem] tabular-nums text-cyan-200/65">
                      {String(r.rank).padStart(2, "0")}
                    </span>
                    {r.label}
                  </p>
                  <p className="shrink-0 font-mono text-lg font-bold tabular-nums tracking-tight text-[#f0d78c]">
                    {fmt(r.value)}
                  </p>
                </div>
                <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-cyan-950/90 ring-1 ring-cyan-400/15">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(10, (r.value / max) * 100)}%` }}
                    transition={{ duration: 0.95, delay: 0.08 * i, ease: EASE }}
                    className="h-full rounded-full bg-gradient-to-r from-[#2ea8ff] via-[#7dd3fc] to-[#e4c76b]"
                  />
                </div>
                <p className="mt-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-sky-100/40">
                  {r.members} smistati
                </p>
              </div>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

function UserRows({
  rows,
  unit,
  digits = 0,
}: {
  rows: EventoClassificheUserRow[];
  unit: string;
  digits?: number;
}) {
  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-sky-100/45">Ancora nessuno in classifica.</p>;
  }
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => (
        <motion.li
          key={`${r.userId}-${r.rank}`}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.4, ease: EASE }}
          className={cn(
            "relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 ring-1",
            r.rank === 1
              ? "bg-[linear-gradient(115deg,rgba(240,193,74,0.16),rgba(0,0,0,0.4))] ring-[#e4c76b]/40"
              : "bg-black/35 ring-white/10",
          )}
        >
          <Lightsaber rank={r.rank} />
          <div className="relative shrink-0">
            <Avatar
              userId={r.userId}
              src={r.avatarUrl || undefined}
              name={r.displayName || r.userId}
              className={cn(
                "size-10 ring-1",
                r.rank === 1 ? "ring-[#e4c76b]/50" : "ring-white/15",
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-crema">
              <span className="mr-1.5 font-mono text-[0.75rem] tabular-nums text-cyan-200/65">
                #{r.rank}
              </span>
              {r.displayName || r.userId}
            </p>
            {r.factionId ? (
              <p className="truncate font-mono text-[0.62rem] uppercase tracking-[0.16em] text-sky-100/40">
                {r.factionId.replace(/_/g, " ")}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-lg font-bold tabular-nums tracking-tight text-cyan-50">
              {fmt(r.value, digits)}
            </p>
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-sky-100/40">{unit}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

/** Classifiche olografiche — sala comando SW. */
export function EventoClassifiche() {
  const { token, ready, login, user } = useAuth();
  const reduce = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>("period");
  const [epochLabel, setEpochLabel] = useState<string | null>(null);
  const [boards, setBoards] = useState<EventoClassificheBoards | null>(null);
  const [livePulse, setLivePulse] = useState(true);
  const [me, setMe] = useState<{
    displayName?: string;
    avatarUrl?: string | null;
    peiRank?: number | null;
    expRank?: number | null;
    pei?: number;
    exp?: number;
  } | null>(null);

  const reload = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!ready) return;
      if (!opts?.soft) setLoading(true);
      const st = await fetchEventoClassifiche(token);
      if (!opts?.soft) setLoading(false);
      if (!st?.ok || !st.boards) return;
      setBoards(st.boards);
      setEpochLabel(st.epochLabel || st.epoch || null);
      setMe(st.me || null);
      setLivePulse(true);
    },
    [ready, token],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEventoFactionSync(() => {
    void reload({ soft: true });
  }, { pollMs: 12_000 });

  useEffect(() => {
    if (!livePulse) return;
    const t = window.setTimeout(() => setLivePulse(false), 1600);
    return () => window.clearTimeout(t);
  }, [livePulse, boards]);

  const factionRows = useMemo(() => {
    if (!boards) return [];
    return scope === "period" ? boards.factionExpPeriod : boards.factionExpPhase;
  }, [boards, scope]);
  const peiRows = useMemo(() => {
    if (!boards) return [];
    return scope === "period" ? boards.peiPeriod : boards.peiPhase;
  }, [boards, scope]);
  const expRows = useMemo(() => {
    if (!boards) return [];
    return scope === "period" ? boards.expPeriod : boards.expPhase;
  }, [boards, scope]);

  if (!token) {
    return (
      <div className="mx-auto max-w-4xl px-6">
        <EventoLoginGate label="Accedi con Discord per sintonizzare le proiezioni di comando." onLogin={login} />
      </div>
    );
  }

  if (loading && !boards) {
    return (
      <div className="mx-auto max-w-5xl px-6">
        <div className="h-72 animate-pulse rounded-[1.35rem] bg-[linear-gradient(145deg,rgba(56,189,248,0.08),rgba(0,0,0,0.35))] ring-1 ring-cyan-300/20" />
      </div>
    );
  }

  if (!boards) {
    return (
      <div className="mx-auto max-w-4xl px-6 text-center text-sm text-crema/55">
        Trasmissione interrotta. Riprova tra poco.
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-5xl px-6">
      {/* ambient stars wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -top-16 h-64 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(56,189,248,0.16), transparent 70%)",
        }}
      />

      <div className="relative mb-7 flex flex-col gap-5 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-1 ring-1 ring-[#c9a227]/30">
            <span
              className={cn(
                "size-1.5 rounded-full bg-[#2ea8ff]",
                livePulse && !reduce && "animate-pulse",
              )}
            />
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#e4c76b]/85">
              Canale · comando
            </span>
            <Radio className="size-3 text-[#e4c76b]/70" aria-hidden />
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-crema sm:text-[2.35rem]">
            Sala delle <span className="italic text-[#e4c76b]">classifiche</span>
          </h2>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-crema/60">
            Rank live{epochLabel ? ` · epoca ${epochLabel}` : ""}. Periodo = stagione intera · Fase =
            guadagni dall&apos;inizio dell&apos;epoca corrente.
          </p>
        </motion.div>

        <div
          role="tablist"
          aria-label="Ambito classifica"
          className="relative inline-flex self-start overflow-hidden rounded-full bg-black/55 p-1 ring-1 ring-white/12"
        >
          {(
            [
              { id: "period" as const, label: "Tutto il periodo" },
              { id: "phase" as const, label: "Solo fase" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={scope === t.id}
              onClick={() => setScope(t.id)}
              className={cn(
                "relative z-10 rounded-full px-4 py-2 text-sm font-semibold transition",
                scope === t.id ? "text-ink" : "text-crema/60 hover:text-crema",
              )}
            >
              {scope === t.id ? (
                <motion.span
                  layoutId="classifiche-scope-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-[#c9a227] to-[#e4c76b]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              ) : null}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {me ? (
          <motion.div
            key="me-holo"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative mb-6 overflow-hidden rounded-2xl p-px"
            style={{
              background:
                "linear-gradient(120deg, rgba(201,162,39,0.45), rgba(46,168,255,0.22))",
            }}
          >
            <div className="relative rounded-[0.95rem] bg-[#070d18]/92 px-4 py-4 sm:px-5 sm:py-5">
              <div className="relative flex flex-wrap items-center gap-4">
                <div className="relative">
                  <Avatar
                    userId={user?.id || me.displayName || "me"}
                    src={user ? avatarUrl(user, 96) : me.avatarUrl || undefined}
                    name={me.displayName || "Tu"}
                    className="size-12 ring-2 ring-[#c9a227]/40"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#e4c76b]/80">
                    Il tuo standing
                  </p>
                  <p className="mt-0.5 font-semibold text-crema">{me.displayName || "Pilota"}</p>
                  <p className="mt-1 text-sm text-crema/55">
                    PEI #{me.peiRank || "—"} · EXP #{me.expRank || "—"}
                  </p>
                </div>
                <div className="flex gap-2.5">
                  <div className="min-w-[4.5rem] rounded-2xl bg-black/45 px-3 py-2 text-center ring-1 ring-white/10">
                    <p className="text-[0.58rem] uppercase tracking-[0.2em] text-crema/45">PEI</p>
                    <p className="font-mono text-lg font-bold tabular-nums text-crema">{fmt(me.pei, 1)}</p>
                  </div>
                  <div className="min-w-[4.5rem] rounded-2xl bg-black/45 px-3 py-2 text-center ring-1 ring-[#c9a227]/25">
                    <p className="text-[0.58rem] uppercase tracking-[0.2em] text-crema/45">EXP</p>
                    <p className="font-mono text-lg font-bold tabular-nums text-[#f0d78c]">{fmt(me.exp)}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative grid gap-5 lg:grid-cols-2">
        <Holopad
          title="EXP fazione"
          subtitle={
            scope === "period"
              ? "Somma EXP di tutti gli smistati · stagione"
              : "EXP guadagnata dalle fazioni in questa epoca"
          }
          icon={<Swords className="size-5" aria-hidden />}
          delay={0.04}
          wide
        >
          <FactionRows rows={factionRows} />
        </Holopad>

        <Holopad
          title="Top 5 PEI"
          subtitle={scope === "period" ? "I più influenti di tutta la stagione" : "Chi sta dominando questa epoca"}
          icon={<Crown className="size-5" aria-hidden />}
          delay={0.1}
        >
          <UserRows rows={peiRows} unit="PEI" digits={1} />
        </Holopad>

        <Holopad
          title="Top 5 EXP"
          subtitle={scope === "period" ? "I piloti con più esperienza accumulata" : "Chi sta grindando di più ora"}
          icon={<Zap className="size-5" aria-hidden />}
          delay={0.16}
        >
          <UserRows rows={expRows} unit="EXP" />
        </Holopad>

        <Holopad
          title="Codex di guerra"
          subtitle="Come si leggono queste proiezioni"
          icon={<Trophy className="size-5" aria-hidden />}
          delay={0.22}
          wide
        >
          <ul className="grid gap-3 sm:grid-cols-3">
            {[
              {
                k: "EXP fazione",
                v: "Somma dell'esperienza di ogni membro smistato. Vince la flotta più attiva.",
              },
              {
                k: "PEI",
                v: "Punteggio influenza (exp, crediti, voti). Decide i podi di fine fase.",
              },
              {
                k: "Fase",
                v: "Solo i guadagni dall'inizio dell'epoca corrente (Clone Wars / Guerra Civile / Sequel).",
              },
            ].map((item) => (
              <li
                key={item.k}
                className="rounded-2xl bg-black/35 px-3.5 py-3 ring-1 ring-cyan-300/15"
              >
                <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
                  {item.k}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-sky-100/65">{item.v}</p>
              </li>
            ))}
          </ul>
        </Holopad>
      </div>
    </div>
  );
}
