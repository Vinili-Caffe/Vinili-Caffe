"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Crown, Swords, Trophy, Zap } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import {
  fetchEventoClassifiche,
  type EventoClassificheBoards,
  type EventoClassificheFactionRow,
  type EventoClassificheUserRow,
} from "@/lib/evento-api";
import { avatarUrl, useAuth } from "@/lib/auth";
import { useEventoFactionSync } from "@/lib/evento-faction-sync";
import { cn } from "@/lib/cn";

type Scope = "period" | "phase";

function fmt(n?: number | null, digits = 0) {
  const v = Number(n) || 0;
  return v.toLocaleString("it-IT", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits > 0 ? Math.min(1, digits) : 0,
  });
}

function saberTone(rank: number) {
  if (rank === 1) return "from-[#ffe08a] via-[#f0c14a] to-[#c9891a]";
  if (rank === 2) return "from-[#d7e7ff] via-[#8eb7ff] to-[#3d6fd6]";
  if (rank === 3) return "from-[#ffb4a8] via-[#e85d4c] to-[#9e2f24]";
  return "from-cyan-200/80 via-sky-400/70 to-cyan-600/50";
}

function Holopad({
  title,
  subtitle,
  icon,
  children,
  delay = 0,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[1.75rem] p-px"
      style={{
        background:
          "linear-gradient(145deg, rgba(125,211,252,0.55), rgba(56,189,248,0.08) 40%, rgba(14,165,233,0.35))",
      }}
    >
      <div className="relative overflow-hidden rounded-[1.7rem] bg-[linear-gradient(165deg,rgba(8,24,40,0.92),rgba(4,10,18,0.96)_55%,rgba(2,8,16,0.98))] px-4 py-5 sm:px-5 sm:py-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(125,211,252,0.08) 2px, rgba(125,211,252,0.08) 3px)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-cyan-400/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-sky-300/10 blur-3xl"
        />
        <header className="relative mb-4 flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-300/30 shadow-[0_0_24px_rgba(56,189,248,0.25)]">
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-xl font-semibold tracking-tight text-cyan-50 sm:text-2xl">
              {title}
            </h3>
            <p className="mt-1 text-sm text-sky-100/65">{subtitle}</p>
          </div>
        </header>
        <div className="relative">{children}</div>
      </div>
    </motion.section>
  );
}

function FactionRows({ rows }: { rows: EventoClassificheFactionRow[] }) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-sky-100/50">Nessuna fazione in classifica.</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.factionId} className="relative">
          <div className="flex items-center gap-3 rounded-2xl bg-black/35 px-3 py-3 ring-1 ring-cyan-300/15">
            <span
              aria-hidden
              className={cn("h-10 w-1.5 shrink-0 rounded-full bg-gradient-to-b shadow-[0_0_14px_rgba(125,211,252,0.55)]", saberTone(r.rank))}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-semibold text-crema">
                  <span className="mr-2 tabular-nums text-cyan-200/70">#{r.rank}</span>
                  {r.label}
                </p>
                <p className="shrink-0 font-sans text-lg font-bold tabular-nums tracking-tight text-[#e4c76b]">
                  {fmt(r.value)}
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cyan-950/80 ring-1 ring-cyan-400/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(8, (r.value / max) * 100)}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-amber-300/80"
                />
              </div>
              <p className="mt-1.5 text-[0.7rem] text-sky-100/45">{r.members} smistati</p>
            </div>
          </div>
        </li>
      ))}
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
    return <p className="py-6 text-center text-sm text-sky-100/50">Ancora nessuno in classifica.</p>;
  }
  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li
          key={`${r.userId}-${r.rank}`}
          className={cn(
            "flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1",
            r.rank === 1
              ? "bg-[linear-gradient(110deg,rgba(240,193,74,0.16),rgba(0,0,0,0.35))] ring-[#e4c76b]/35 shadow-[0_0_28px_rgba(201,162,39,0.18)]"
              : "bg-black/35 ring-cyan-300/15",
          )}
        >
          <span
            aria-hidden
            className={cn("h-11 w-1.5 shrink-0 rounded-full bg-gradient-to-b shadow-[0_0_14px_rgba(125,211,252,0.45)]", saberTone(r.rank))}
          />
          <Avatar
            userId={r.userId}
            src={r.avatarUrl || undefined}
            name={r.displayName || r.userId}
            className="size-10 shrink-0 ring-1 ring-cyan-200/25"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-crema">
              <span className="mr-1.5 tabular-nums text-cyan-200/70">#{r.rank}</span>
              {r.displayName || r.userId}
            </p>
            {r.factionId ? (
              <p className="truncate text-[0.7rem] uppercase tracking-wider text-sky-100/40">
                {r.factionId.replace(/_/g, " ")}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="font-sans text-lg font-bold tabular-nums tracking-tight text-cyan-100">
              {fmt(r.value, digits)}
            </p>
            <p className="text-[0.65rem] uppercase tracking-wider text-sky-100/40">{unit}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Classifiche olografiche evento SW. */
export function EventoClassifiche() {
  const { token, ready, login, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>("period");
  const [epochLabel, setEpochLabel] = useState<string | null>(null);
  const [boards, setBoards] = useState<EventoClassificheBoards | null>(null);
  const [me, setMe] = useState<{
    displayName?: string;
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
    },
    [ready, token],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEventoFactionSync(() => {
    void reload({ soft: true });
  }, { pollMs: 12_000 });

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
      <div className="mx-auto max-w-4xl px-6 text-center">
        <button type="button" onClick={login} className="text-sm text-caramel underline underline-offset-2">
          Accedi con Discord per vedere le classifiche
        </button>
      </div>
    );
  }

  if (loading && !boards) {
    return <div className="mx-auto h-64 max-w-5xl animate-pulse rounded-[1.75rem] bg-crema/8 px-6" />;
  }

  if (!boards) {
    return (
      <div className="mx-auto max-w-4xl px-6 text-center text-sm text-crema/55">
        Classifiche non disponibili al momento.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-3xl font-semibold text-crema sm:text-4xl">Proiezioni di comando</h2>
          <p className="mt-2 max-w-xl text-sm text-crema/60">
            Ologrammi live{epochLabel ? ` · fase ${epochLabel}` : ""}. Periodo = stagione intera · Fase =
            guadagni dall&apos;inizio dell&apos;epoca corrente.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Ambito classifica"
          className="inline-flex rounded-full bg-black/45 p-1 ring-1 ring-cyan-300/25"
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
                "rounded-full px-4 py-2 text-sm font-semibold transition",
                scope === t.id
                  ? "bg-gradient-to-r from-cyan-300 to-sky-400 text-ink shadow-[0_0_22px_rgba(56,189,248,0.35)]"
                  : "text-sky-100/65 hover:text-crema",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {me ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 overflow-hidden rounded-3xl bg-[linear-gradient(120deg,rgba(56,189,248,0.14),rgba(0,0,0,0.45))] p-4 ring-1 ring-cyan-300/25 sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-4">
            <Avatar
              userId={user?.id || me.displayName || "me"}
              src={user ? avatarUrl(user, 96) : me.avatarUrl || undefined}
              name={me.displayName || "Tu"}
              className="size-12 ring-1 ring-cyan-200/30"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-crema">{me.displayName || "Il tuo standing"}</p>
              <p className="mt-1 text-sm text-sky-100/60">
                PEI #{me.peiRank || "—"} · EXP #{me.expRank || "—"}
              </p>
            </div>
            <div className="flex gap-3">
              <div className="rounded-2xl bg-black/40 px-3 py-2 text-center ring-1 ring-cyan-300/20">
                <p className="text-[0.65rem] uppercase tracking-wider text-sky-100/45">PEI</p>
                <p className="font-sans text-lg font-bold tabular-nums text-cyan-100">{fmt(me.pei, 1)}</p>
              </div>
              <div className="rounded-2xl bg-black/40 px-3 py-2 text-center ring-1 ring-amber-300/20">
                <p className="text-[0.65rem] uppercase tracking-wider text-sky-100/45">EXP</p>
                <p className="font-sans text-lg font-bold tabular-nums text-[#e4c76b]">{fmt(me.exp)}</p>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Holopad
          title="EXP fazione"
          subtitle={
            scope === "period"
              ? "Somma EXP di tutti gli smistati · stagione"
              : "EXP guadagnata dalle fazioni in questa epoca"
          }
          icon={<Swords className="size-5" aria-hidden />}
          delay={0.05}
        >
          <FactionRows rows={factionRows} />
        </Holopad>

        <Holopad
          title="Top 5 PEI"
          subtitle={scope === "period" ? "I più influenti di tutta la stagione" : "Chi sta dominando questa epoca"}
          icon={<Crown className="size-5" aria-hidden />}
          delay={0.12}
        >
          <UserRows rows={peiRows} unit="PEI" digits={1} />
        </Holopad>

        <Holopad
          title="Top 5 EXP"
          subtitle={scope === "period" ? "I piloti con più esperienza accumulata" : "Chi sta grindando di più ora"}
          icon={<Zap className="size-5" aria-hidden />}
          delay={0.18}
        >
          <UserRows rows={expRows} unit="EXP" />
        </Holopad>

        <Holopad
          title="Codex di guerra"
          subtitle="Come si leggono queste proiezioni"
          icon={<Trophy className="size-5" aria-hidden />}
          delay={0.24}
        >
          <ul className="space-y-3 text-sm leading-relaxed text-sky-100/70">
            <li>
              <span className="font-semibold text-cyan-100">EXP fazione</span> — somma dell&apos;esperienza di ogni
              membro smistato. Vince la flotta più attiva.
            </li>
            <li>
              <span className="font-semibold text-cyan-100">PEI</span> — punteggio influenza (exp, volume crediti,
              voti). Decide i podi di fine fase.
            </li>
            <li>
              <span className="font-semibold text-cyan-100">Fase</span> — solo i guadagni dall&apos;inizio
              dell&apos;epoca corrente (Clone Wars / Guerra Civile / Sequel).
            </li>
          </ul>
        </Holopad>
      </div>
    </div>
  );
}
