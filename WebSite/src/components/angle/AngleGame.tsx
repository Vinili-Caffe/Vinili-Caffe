"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Check, Copy, Dices, Flame, Link2, Minus, Plus, Sun, Swords, Target } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
import {
  ANGLE_ATTEMPTS,
  ANGLE_TOLERANCE,
  dailyAngle,
  dayNumber,
  decodeChallenge,
  encodeChallenge,
  loadAngleMe,
  postAngleResult,
  readLocalDay,
  romeDay,
  writeLocalDay,
  type AngleStats,
} from "@/lib/angle";
import { QuizRewardNote, type QuizReward } from "@/components/number-quiz/QuizRewardNote";

type Mode = "daily" | "practice" | "create" | "challenge";

/* ───────────── disegno: un vinile con due bracci ───────────── */

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (-deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}

function Disc({ angle, ghost, reveal }: { angle: number; ghost?: number | null; reveal?: boolean }) {
  const C = 160;
  const R = 128;
  const [ex, ey] = polar(C, C, R, angle);
  const [ax, ay] = polar(C, C, 46, angle);
  const large = angle > 180 ? 1 : 0;
  return (
    <svg viewBox="0 0 320 320" className="mx-auto w-full max-w-[22rem] drop-shadow-[0_24px_40px_rgba(0,0,0,0.6)]" role="img" aria-label="Angolo da indovinare">
      {/* disco */}
      <circle cx={C} cy={C} r={150} fill="#141010" />
      {[140, 128, 116, 104, 92, 80, 68].map((r) => (
        <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="#2a2220" strokeWidth={1} />
      ))}
      <circle cx={C} cy={C} r={40} fill="#c98b50" />
      <circle cx={C} cy={C} r={40} fill="url(#vc-label)" opacity={0.5} />
      <circle cx={C} cy={C} r={5} fill="#141010" />
      <defs>
        <radialGradient id="vc-label">
          <stop offset="0%" stopColor="#f3e3c7" />
          <stop offset="100%" stopColor="#8a5a33" />
        </radialGradient>
      </defs>
      {/* arco dell'angolo */}
      <path d={`M ${C + 46} ${C} A 46 46 0 ${large} 0 ${ax} ${ay}`} fill="none" stroke="#e8b37a" strokeWidth={4} strokeLinecap="round" opacity={0.9} />
      {/* tentativo (tratteggiato) */}
      {ghost != null ? (() => {
        const [gx, gy] = polar(C, C, R, ghost);
        return <line x1={C} y1={C} x2={gx} y2={gy} stroke="#f3e3c7" strokeWidth={3} strokeDasharray="6 7" strokeLinecap="round" opacity={0.55} />;
      })() : null}
      {/* bracci */}
      <line x1={C} y1={C} x2={C + R} y2={C} stroke="#f3e3c7" strokeWidth={7} strokeLinecap="round" />
      <motion.line
        x1={C}
        y1={C}
        initial={false}
        animate={{ x2: ex, y2: ey }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        stroke="#f3e3c7"
        strokeWidth={7}
        strokeLinecap="round"
      />
      <circle cx={C + R} cy={C} r={9} fill="#e8b37a" />
      <motion.circle initial={false} animate={{ cx: ex, cy: ey }} r={9} fill="#e8b37a" />
      <circle cx={C} cy={C} r={11} fill="#f3e3c7" />
      {reveal ? (
        <text x={C} y={C + 74} textAnchor="middle" className="fill-crema font-mono text-[26px] font-bold">
          {angle}°
        </text>
      ) : null}
    </svg>
  );
}

/* ───────────── partita: un angolo, quattro tentativi ───────────── */

type Row = { guess: number; diff: number };

function closeness(diff: number) {
  const d = Math.abs(diff);
  if (d <= ANGLE_TOLERANCE) return { label: "Preso!", cls: "bg-emerald-500 text-white" };
  if (d <= 8) return { label: "Bollente", cls: "bg-ember text-white" };
  if (d <= 20) return { label: "Caldo", cls: "bg-caramel text-ink" };
  if (d <= 45) return { label: "Tiepido", cls: "bg-sand/70 text-ink" };
  return { label: "Freddo", cls: "bg-sky-500/80 text-white" };
}

function Round({
  answer,
  initial,
  onDone,
  locked,
}: {
  answer: number;
  initial?: number[];
  onDone: (guesses: number[], solved: boolean) => void;
  locked?: boolean;
}) {
  const [value, setValue] = useState(90);
  const [rows, setRows] = useState<Row[]>(() => (initial || []).map((g) => ({ guess: g, diff: answer - g })));
  const solved = rows.some((r) => Math.abs(r.diff) <= ANGLE_TOLERANCE);
  const over = solved || rows.length >= ANGLE_ATTEMPTS || Boolean(locked);
  const reported = useRef(Boolean(initial && (initial.length >= ANGLE_ATTEMPTS || initial.some((g) => Math.abs(answer - g) <= ANGLE_TOLERANCE))));

  function submit() {
    if (over) return;
    const g = Math.max(0, Math.min(360, Math.round(value)));
    const next = [...rows, { guess: g, diff: answer - g }];
    setRows(next);
    const win = Math.abs(answer - g) <= ANGLE_TOLERANCE;
    if ((win || next.length >= ANGLE_ATTEMPTS) && !reported.current) {
      reported.current = true;
      onDone(next.map((r) => r.guess), win);
    } else onDone(next.map((r) => r.guess), false);
  }

  /* tastiera: frecce per ±1 (con Maiusc ±10), Invio per provare */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") setValue((v) => Math.min(360, v + (e.shiftKey ? 10 : 1)));
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") setValue((v) => Math.max(0, v - (e.shiftKey ? 10 : 1)));
      else if (e.key === "Enter") submit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const last = rows[rows.length - 1];
  return (
    <div className="grid items-start gap-6 md:grid-cols-[1fr_20rem]">
      <div>
        <Disc angle={answer} ghost={over ? null : last?.guess ?? null} reveal={over} />
        <AnimatePresence>
          {over ? (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("mt-2 text-center font-display text-2xl", solved ? "text-emerald-400" : "text-crema")}
            >
              {solved ? `Preso in ${rows.findIndex((r) => Math.abs(r.diff) <= ANGLE_TOLERANCE) + 1} su ${ANGLE_ATTEMPTS}!` : `Era ${answer}°`}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="rounded-3xl bg-roast/80 p-4 ring-1 ring-sand/12">
        {!over ? (
          <>
            <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-crema/50">
              Tentativo {rows.length + 1} di {ANGLE_ATTEMPTS}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <StepBtn onClick={() => setValue((v) => Math.max(0, v - 1))} label="Un grado in meno">
                <Minus className="size-5" />
              </StepBtn>
              <label className="relative">
                <span className="sr-only">Gradi</span>
                <input
                  value={value}
                  inputMode="numeric"
                  onChange={(e) => setValue(Math.max(0, Math.min(360, Number(e.target.value.replace(/\D/g, "")) || 0)))}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="w-28 rounded-2xl bg-espresso/80 py-2 text-center font-mono text-4xl font-bold tabular-nums text-crema outline-none ring-1 ring-sand/20 focus:ring-2 focus:ring-caramel/60"
                />
                <span className="pointer-events-none absolute right-3 top-1 font-mono text-xl text-crema/50">°</span>
              </label>
              <StepBtn onClick={() => setValue((v) => Math.min(360, v + 1))} label="Un grado in più">
                <Plus className="size-5" />
              </StepBtn>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              aria-label="Scegli i gradi"
              className="mt-4 w-full accent-[#e8b37a]"
            />
            <button
              type="button"
              onClick={submit}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-caramel to-ember text-sm font-bold uppercase tracking-wide text-ink transition hover:brightness-105"
            >
              <Target className="size-4" /> Prova
            </button>
          </>
        ) : null}

        <ul className={cn("space-y-1.5", over ? "" : "mt-4")}>
          {rows.map((r, i) => {
            const c = closeness(r.diff);
            const hit = Math.abs(r.diff) <= ANGLE_TOLERANCE;
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 rounded-xl bg-espresso/70 px-3 py-2 ring-1 ring-sand/10"
              >
                <span className="w-14 font-mono text-lg font-bold tabular-nums text-crema">{r.guess}°</span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase", c.cls)}>{c.label}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-crema/60">
                  {hit ? (
                    <Check className="size-4 text-emerald-400" />
                  ) : r.diff > 0 ? (
                    <>
                      più grande <ArrowUp className="size-4 text-caramel" />
                    </>
                  ) : (
                    <>
                      più piccolo <ArrowDown className="size-4 text-sky-400" />
                    </>
                  )}
                </span>
              </motion.li>
            );
          })}
          {Array.from({ length: Math.max(0, ANGLE_ATTEMPTS - rows.length) }, (_, i) => (
            <li key={`e${i}`} className="h-11 rounded-xl border border-dashed border-sand/15" />
          ))}
        </ul>
      </div>
    </div>
  );
}

function StepBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-12 place-items-center rounded-2xl bg-crema/[0.07] text-crema ring-1 ring-sand/15 transition hover:bg-crema/[0.12] active:scale-95"
    >
      {children}
    </button>
  );
}

/* ───────────── pagina ───────────── */

export function AngleGame() {
  const sp = useSearchParams();
  const challengeCode = sp.get("s");
  const challenge = useMemo(() => (challengeCode ? decodeChallenge(challengeCode) : null), [challengeCode]);
  const [mode, setMode] = useState<Mode>(challenge ? "challenge" : "daily");
  useEffect(() => {
    if (challenge) setMode("challenge");
  }, [challenge]);

  const tabs: Array<{ id: Mode; label: string; icon: React.ReactNode }> = [
    { id: "daily", label: "Del giorno", icon: <Sun className="size-4" /> },
    { id: "practice", label: "Allenamento", icon: <Dices className="size-4" /> },
    { id: "create", label: "Sfida un amico", icon: <Swords className="size-4" /> },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20">
      <div className="mx-auto mb-6 flex max-w-lg gap-1 rounded-2xl bg-ink/50 p-1 ring-1 ring-sand/15">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={cn("relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-bold uppercase tracking-wide transition sm:text-sm", mode === t.id ? "text-ink" : "text-crema/65 hover:text-crema")}
          >
            {mode === t.id ? <motion.span layoutId="angle-tab" className="absolute inset-0 rounded-xl bg-caramel" /> : null}
            <span className="relative">{t.icon}</span>
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      {mode === "daily" ? <Daily /> : mode === "practice" ? <Practice /> : mode === "create" ? <Create /> : challenge != null ? <Challenge angle={challenge} /> : <Daily />}
    </div>
  );
}

function Daily() {
  const { token } = useAuth();
  const day = useMemo(() => romeDay(), []);
  const answer = useMemo(() => dailyAngle(day), [day]);
  const [saved, setSaved] = useState<number[] | null | undefined>(undefined);
  const [result, setResult] = useState<{ guesses: number[]; solved: boolean } | null>(null);
  const [reward, setReward] = useState<QuizReward>(null);
  const [stats, setStats] = useState<AngleStats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const local = readLocalDay(day);
    setSaved(local);
    if (local && (local.length >= ANGLE_ATTEMPTS || local.some((g) => Math.abs(answer - g) <= ANGLE_TOLERANCE))) {
      setResult({ guesses: local, solved: local.some((g) => Math.abs(answer - g) <= ANGLE_TOLERANCE) });
    }
  }, [day, answer]);

  useEffect(() => {
    if (!token) return;
    void loadAngleMe(token).then((r) => r?.stats && setStats(r.stats));
  }, [token]);

  function onDone(guesses: number[], solved: boolean) {
    writeLocalDay(day, guesses);
    const finished = solved || guesses.length >= ANGLE_ATTEMPTS;
    if (!finished) return;
    setResult({ guesses, solved });
    void postAngleResult(token, day, guesses).then((r) => {
      setReward(r?.reward || (token ? null : { auth: "guest", exp: 0 }));
      if (r?.stats) setStats(r.stats);
    });
  }

  function share() {
    if (!result) return;
    const marks = result.guesses
      .map((g) => (Math.abs(answer - g) <= ANGLE_TOLERANCE ? "🎯" : answer > g ? "⬆️" : "⬇️"))
      .join("");
    const score = result.solved ? `${result.guesses.findIndex((g) => Math.abs(answer - g) <= ANGLE_TOLERANCE) + 1}/${ANGLE_ATTEMPTS}` : `X/${ANGLE_ATTEMPTS}`;
    const text = `Angolo #${dayNumber(day)} ${score}\n${marks}\n${window.location.origin}${page("/quiz/angolo/")}`;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  if (saved === undefined) return null;
  return (
    <>
      <p className="mb-4 text-center text-sm text-crema/60">
        Angolo <b className="text-crema">#{dayNumber(day)}</b> · uguale per tutti, cambia a mezzanotte
      </p>
      <Round answer={answer} initial={saved || undefined} onDone={onDone} />
      {result ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-6 max-w-md text-center">
          <button
            type="button"
            onClick={share}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-crema/[0.08] px-5 text-xs font-bold uppercase tracking-wide text-crema ring-1 ring-sand/15 transition hover:bg-crema/[0.14]"
          >
            <Copy className="size-4" /> {copied ? "Copiato" : "Copia il risultato"}
          </button>
          <QuizRewardNote reward={reward} />
          {stats ? <StatsBox stats={stats} /> : null}
          <p className="mt-4 text-xs text-crema/45">Torna domani per un angolo nuovo, o allenati intanto.</p>
        </motion.div>
      ) : null}
    </>
  );
}

function StatsBox({ stats }: { stats: AngleStats }) {
  const pct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const maxDist = Math.max(1, ...Object.values(stats.dist || {}).map(Number));
  return (
    <div className="mt-4 rounded-2xl bg-roast/70 p-4 text-left ring-1 ring-sand/12">
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["Partite", stats.played],
          ["Vinte", `${pct}%`],
          ["Serie", stats.streak],
          ["Record", stats.maxStreak],
        ].map(([k, v]) => (
          <div key={String(k)}>
            <p className="font-mono text-xl font-bold text-crema">{v}</p>
            <p className="text-[10px] uppercase tracking-wide text-crema/50">{k}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1">
        {[1, 2, 3, 4].map((n) => {
          const v = Number(stats.dist?.[n] || 0);
          return (
            <div key={n} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-crema/60">{n}</span>
              <div className="h-4 flex-1 rounded bg-crema/[0.05]">
                <div className="flex h-full items-center justify-end rounded bg-caramel/70 px-1 font-bold text-ink" style={{ width: `${Math.max(8, (v / maxDist) * 100)}%` }}>
                  {v}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Practice() {
  const [answer, setAnswer] = useState(() => 5 + Math.floor(Math.random() * 351));
  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [done, setDone] = useState<null | boolean>(null);
  function next() {
    setAnswer(5 + Math.floor(Math.random() * 351));
    setRound((r) => r + 1);
    setDone(null);
  }
  return (
    <>
      <p className="mb-4 flex items-center justify-center gap-2 text-sm text-crema/60">
        Angoli a caso, senza limiti ·
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", streak ? "bg-caramel text-ink" : "bg-crema/[0.07] text-crema/70")}>
          <Flame className="size-3.5" /> serie {streak}
        </span>
      </p>
      <Round
        key={round}
        answer={answer}
        onDone={(g, solved) => {
          const finished = solved || g.length >= ANGLE_ATTEMPTS;
          if (!finished) return;
          setDone(solved);
          setStreak((s) => (solved ? s + 1 : 0));
        }}
      />
      {done != null ? (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={next}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-caramel to-ember px-8 text-sm font-bold uppercase tracking-wide text-ink"
          >
            <Dices className="size-4" /> Prossimo angolo
          </button>
        </div>
      ) : null}
    </>
  );
}

function Create() {
  const [angle, setAngle] = useState(137);
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}${page(`/quiz/angolo/?s=${encodeChallenge(angle)}`)}` : "";
  async function share() {
    const text = `Ti sfido: indovina questo angolo in ${ANGLE_ATTEMPTS} tentativi!`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text, url: link });
        return;
      }
    } catch {
      /* annullato: si copia */
    }
    void navigator.clipboard?.writeText(`${text} ${link}`).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }
  return (
    <div className="grid items-start gap-6 md:grid-cols-[1fr_20rem]">
      <Disc angle={angle} reveal />
      <div className="rounded-3xl bg-roast/80 p-5 ring-1 ring-sand/12">
        <p className="font-display text-xl text-crema">Scegli un angolo</p>
        <p className="mt-1 text-sm text-crema/60">Poi manda il link: chi lo apre deve indovinarlo in {ANGLE_ATTEMPTS} tentativi.</p>
        <input type="range" min={1} max={359} value={angle} onChange={(e) => setAngle(Number(e.target.value))} aria-label="Angolo da far indovinare" className="mt-5 w-full accent-[#e8b37a]" />
        <div className="mt-2 flex items-center justify-center gap-2">
          <StepBtn onClick={() => setAngle((a) => Math.max(1, a - 1))} label="Un grado in meno">
            <Minus className="size-5" />
          </StepBtn>
          <span className="w-24 text-center font-mono text-3xl font-bold text-crema">{angle}°</span>
          <StepBtn onClick={() => setAngle((a) => Math.min(359, a + 1))} label="Un grado in più">
            <Plus className="size-5" />
          </StepBtn>
        </div>
        <button
          type="button"
          onClick={() => setAngle(5 + Math.floor(Math.random() * 351))}
          className="mt-3 w-full rounded-xl py-2 text-xs font-bold uppercase tracking-wide text-crema/60 ring-1 ring-sand/15 hover:text-crema"
        >
          <Dices className="mr-1 inline size-4" /> A caso
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-caramel to-ember text-sm font-bold uppercase tracking-wide text-ink"
        >
          <Link2 className="size-4" /> {copied ? "Link copiato" : "Manda la sfida"}
        </button>
      </div>
    </div>
  );
}

function Challenge({ angle }: { angle: number }) {
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(false);
  return (
    <>
      <p className="mb-4 text-center text-sm text-crema/60">Un amico ti ha sfidato: indovina il suo angolo!</p>
      <Round key={round} answer={angle} onDone={(g, solved) => (solved || g.length >= ANGLE_ATTEMPTS) && setDone(true)} />
      {done ? (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setRound((r) => r + 1);
              setDone(false);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-crema/[0.08] px-5 text-xs font-bold uppercase tracking-wide text-crema ring-1 ring-sand/15"
          >
            Riprova
          </button>
        </div>
      ) : null}
    </>
  );
}
