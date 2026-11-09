"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, RefreshCw, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadGuildHealth, type GuildHealth, type HealthCheck } from "@/lib/dashboard-health";
import { Notice, RowsSkeleton, StatTile, miniBtn } from "./bits";

const AREA_LABEL: Record<string, string> = {
  generale: "Generale",
  bacheca: "Bacheca",
  ticket: "Ticket",
  partnership: "Partnership",
};

const LEVEL_STYLE: Record<HealthCheck["level"], { icon: React.ReactNode; ring: string; chip: string }> = {
  error: {
    icon: <XCircle className="size-4" />,
    ring: "ring-[#a83a2c]/35 bg-[#a83a2c]/[0.07]",
    chip: "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c]",
  },
  warn: {
    icon: <AlertTriangle className="size-4" />,
    ring: "ring-caramel/35 bg-caramel/[0.06]",
    chip: "bg-caramel/15 text-ember",
  },
  info: {
    icon: <Info className="size-4" />,
    ring: "ring-sand/15 bg-espresso/45",
    chip: "bg-crema/[0.08] text-crema/70",
  },
  ok: {
    icon: <CheckCircle2 className="size-4" />,
    ring: "ring-sand/10 bg-espresso/35",
    chip: "bg-[#5f9a6a]/15 text-[#9fd0a8] light:text-[#2f6b3f]",
  },
};

function CheckRow({ c }: { c: HealthCheck }) {
  const st = LEVEL_STYLE[c.level];
  return (
    <motion.li initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-xl p-3 ring-1", st.ring)}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", st.chip)}>{st.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-crema">{c.title}</p>
            <span className="rounded-md bg-crema/[0.06] px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-crema/55">
              {AREA_LABEL[c.area] || c.area}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-crema/70">{c.detail}</p>
          {c.fix ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-crema/[0.04] px-2.5 py-1.5 text-[0.8rem] text-crema/80">
              <Wrench className="mt-0.5 size-3.5 shrink-0 text-ember" />
              <span>{c.fix}</span>
            </p>
          ) : null}
        </div>
      </div>
    </motion.li>
  );
}

export function HealthPanel({ guildId, token }: { guildId: string; token: string }) {
  const [data, setData] = useState<GuildHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [showOk, setShowOk] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadGuildHealth(token, guildId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setData(r.health);
        setError(null);
      } else setError(r.message);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token, nonce]);

  const problems = useMemo(() => (data?.checks || []).filter((c) => c.level !== "ok"), [data]);
  const fine = useMemo(() => (data?.checks || []).filter((c) => c.level === "ok"), [data]);

  if (loading && !data) return <RowsSkeleton rows={5} />;
  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return null;
  if (!data.botPresent) return <Notice error>Il bot non è nel server o non riesce a leggerne ruoli e canali.</Notice>;

  const allGood = data.summary.error === 0 && data.summary.warn === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-crema">
            <ShieldCheck className={cn("size-5", allGood ? "text-[#9fd0a8] light:text-[#2f6b3f]" : "text-ember")} />
            {allGood ? "Tutto a posto" : data.summary.error ? "Qualcosa non funziona" : "Quasi tutto a posto"}
          </p>
          <p className="text-sm text-crema/60">
            Il bot controlla i suoi permessi nei canali e nei ruoli che hai impostato.
            {data.botRole ? (
              <>
                {" "}
                Il suo ruolo più alto è <span className="font-semibold text-crema/85">@{data.botRole.name}</span>.
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className={miniBtn}
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setNonce((n) => n + 1);
          }}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Ricontrolla
        </button>
      </div>

      {error ? <Notice error>{error}</Notice> : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <StatTile icon={<XCircle />} label="Da sistemare" value={data.summary.error} tone={data.summary.error ? "accent" : "default"} />
        <StatTile icon={<AlertTriangle />} label="Avvisi" value={data.summary.warn} />
        <StatTile icon={<CheckCircle2 />} label="Funziona" value={data.summary.ok} tone="ok" />
      </div>

      {problems.length ? (
        <ul className="space-y-2">
          {problems.map((c) => (
            <CheckRow key={c.id} c={c} />
          ))}
        </ul>
      ) : (
        <Notice>Nessun problema: il bot ha tutti i permessi che servono per quello che hai configurato.</Notice>
      )}

      {fine.length ? (
        <div>
          <button
            type="button"
            onClick={() => setShowOk((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-crema/60 transition hover:text-crema"
          >
            <ChevronDown className={cn("size-3.5 transition", showOk && "rotate-180")} />
            {showOk ? "Nascondi" : "Mostra"} i controlli superati ({fine.length})
          </button>
          {showOk ? (
            <ul className="mt-2 space-y-2">
              {fine.map((c) => (
                <CheckRow key={c.id} c={c} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="text-[0.7rem] text-crema/45">
        Controllato alle {new Date(data.checkedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}.
      </p>
    </div>
  );
}
