"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Clock, Crown, LogIn, Sparkles, Trophy } from "lucide-react";
import { loadVote, PLATFORMS, untilText, VoteLoadOfflineError, type PlatformId, type VoteData } from "@/lib/vote";
import { enqueue, OFFLINE_TOAST_VOTE } from "@/lib/offline-queue";
import { showToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/Avatar";
import { Pagination, pageSlice } from "@/components/ui/Pagination";
import { Reveal } from "../Reveal";
import { CoolMode } from "@/components/ui/cool-mode";
import { celebrate } from "@/lib/confetti";
import { useFxCap } from "@/components/effects/DeviceFxProvider";
import { subscribeSiteRealtime } from "@/lib/site-realtime";
import { useI18n } from "@/lib/i18n";

const PAGE_SIZE = 10;

const nf = new Intl.NumberFormat("it-IT");

/** Si ridisegna da solo una volta al minuto (non tutta la pagina). */
function Countdown({ until, onReady }: { until: string; onReady: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const txt = untilText(until, now);
  useEffect(() => {
    if (!txt) onReady();
  }, [txt, onReady]);
  return <>{txt ?? "adesso"}</>;
}

/** Card voto per una piattaforma. */
function VoteKey({
  id,
  data,
  loggedIn,
  onRefresh,
  onVoteClick,
  i,
}: {
  id: PlatformId;
  data: VoteData | null;
  loggedIn: boolean;
  onRefresh: () => void;
  onVoteClick: (platformId: PlatformId) => void;
  i: number;
}) {
  const { t } = useI18n();
  const p = PLATFORMS.find((x) => x.id === id)!;
  const st = data?.personal?.[id];
  const mine = id === "topgg" ? data?.personal?.topggVotes : data?.personal?.discadiaVotes;
  const ready = !st || st.canVote || !untilText(st.nextVoteAt);

  return (
    <Reveal delay={i * 0.1} className="h-full">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[2rem] bg-gradient-to-b from-mocha to-roast p-6 ring-1 ring-sand/15 sm:p-7">
        <div className="pointer-events-none absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full blur-3xl" style={{ background: `${p.accent}33` }} />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-crema/45">{t("vote.cooldownEvery", { hours: p.cooldownHours })}</p>
            <h3 className="mt-1 font-display text-4xl font-semibold">{p.name}</h3>
          </div>
          {loggedIn && st && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1",
                ready ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40" : "bg-crema/6 text-crema/60 ring-sand/20",
              )}
            >
              {ready ? (
                <>
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                  </span>
                  {t("vote.canVote")}
                </>
              ) : (
                <>
                  <Clock className="size-3.5" /> tra <Countdown until={st.nextVoteAt!} onReady={onRefresh} />
                </>
              )}
            </span>
          )}
        </div>
        <p className="relative mt-3 text-crema/65">{p.tagline}</p>
        {loggedIn && mine != null && (
          <p className="relative mt-3 text-sm text-crema/50">
            {t(mine === 1 ? "vote.votedHereOnce" : "vote.votedHereMany", { n: nf.format(mine) })}
          </p>
        )}
        {/* Cool Mode: al click schizzano cuori, dischi e tazzine */}
        <CoolMode>
        <motion.a
          href={p.href}
          target="_blank"
          rel="noopener"
          onClick={() => onVoteClick(id)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          className={cn(
            "relative mt-auto inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-shadow",
            "mt-7 text-white shadow-[0_12px_30px_-12px_var(--glow)]",
            !ready && loggedIn && "opacity-70",
          )}
          style={{ background: `linear-gradient(180deg, ${p.accent}, ${p.accent}cc)`, ["--glow" as string]: p.accent }}
        >
          {ready || !loggedIn ? t("vote.ctaVote", { name: p.name }) : t("vote.ctaOpen", { name: p.name })} <ArrowUpRight className="size-4" />
        </motion.a>
        </CoolMode>
      </div>
    </Reveal>
  );
}

/** Anello progresso verso l'obiettivo voti. */
function GoalDisc({ total, goal }: { total: number; goal: number }) {
  const pct = Math.min(1, total / Math.max(1, goal));
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-56 sm:size-64">
      <div className="absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle,#0b0705_0_1.5px,#1d140e_1.5px_3px)] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] ring-1 ring-sand/15" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(244,233,216,0.08)" strokeWidth="4" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#vc-goal)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
        <defs>
          <linearGradient id="vc-goal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f0b46e" />
            <stop offset="1" stopColor="#d99a5b" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-[30%] flex flex-col items-center justify-center rounded-full bg-gradient-to-br from-crema to-sand text-espresso">
        <span className="font-display text-3xl font-bold leading-none lining-nums sm:text-4xl">{nf.format(total)}</span>
        <span className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wider">su {nf.format(goal)}</span>
      </div>
    </div>
  );
}

export function VoteBoard({ initial }: { initial: VoteData | null }) {
  const { user, login, ready } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState(initial);
  const [pageNum, setPageNum] = useState(1);

  const refresh = useCallback(() => {
    if (!ready) return Promise.resolve();
    return loadVote({ userId: user?.id })
      .then((d) => {
        if (d) setData(d);
      })
      .catch((e) => {
        if (e instanceof VoteLoadOfflineError) enqueue("vote", { userId: user?.id ?? null });
      });
  }, [ready, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Contatore / classifica / cooldown: aggiorna mentre resti sulla pagina (e al ritorno da Top.gg/Discadia).
  useLiveRefresh(refresh, { intervalMs: 60_000, enabled: ready, topics: ["vote", "notifications"] });

  // dopo il click su "Vota" poll aggressivo ~2s per 3 min (webhook → votes_changed spegne prima)
  const [waitUntil, setWaitUntil] = useState(0);
  useEffect(() => {
    if (!waitUntil) return;
    const id = window.setInterval(() => {
      if (Date.now() > waitUntil) {
        setWaitUntil(0);
        return;
      }
      if (!document.hidden) void refresh();
    }, 2_000);
    return () => window.clearInterval(id);
  }, [waitUntil, refresh]);

  // votes_changed dal webhook + dismiss reminder (notifications_changed)
  useEffect(() => {
    if (!ready || !user) return;
    return subscribeSiteRealtime((ping) => {
      if (ping.type === "votes_changed" && (!ping.userId || ping.userId === user.id)) {
        void refresh();
        setWaitUntil(0);
        return;
      }
      if (ping.type === "notifications_changed" && (!ping.userId || ping.userId === user.id)) void refresh();
    });
  }, [ready, user, refresh]);

  // il tuo voto risulta arrivato (contatore personale salito): coriandoli
  const confettiRich = useFxCap("confettiRich");
  const myVotes = (data?.personal?.topggVotes ?? 0) + (data?.personal?.discadiaVotes ?? 0);
  const prevVotes = useRef<number | null>(null);
  useEffect(() => {
    if (!user || data?.personal == null) return;
    if (prevVotes.current != null && myVotes > prevVotes.current) {
      celebrate(confettiRich);
      setWaitUntil(0);
    }
    prevVotes.current = myVotes;
  }, [myVotes, user, data?.personal, confettiRich]);

  const stats = data?.stats ?? { totalVotes: 0, totalVoters: 0, goal: 1000 };
  const rows = data?.rows ?? [];
  const { page: pageSafe, totalPages, slice } = pageSlice(rows, pageNum, PAGE_SIZE);

  const allVotedCooldown = useMemo(() => {
    if (!user || !data?.personal) return false;
    return PLATFORMS.every((p) => {
      const st = data.personal?.[p.id];
      return st && !st.canVote && !!st.nextVoteAt && !!untilText(st.nextVoteAt);
    });
  }, [user, data?.personal]);

  return (
    <div className="mx-auto max-w-5xl space-y-20 px-6 pb-16">
      <section>
        {allVotedCooldown && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-caramel/15 px-5 py-4 text-center ring-1 ring-caramel/40 sm:justify-between sm:text-left"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-ember">
              <Clock className="size-4 shrink-0" aria-hidden />
              {t("vote.allVotedTitle")}
            </span>
            <span className="text-sm text-crema/70">{t("vote.allVotedHint")}</span>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {PLATFORMS.map((p, i) => (
            <VoteKey
              key={p.id}
              id={p.id}
              i={i}
              data={data}
              loggedIn={!!user}
              onRefresh={refresh}
              onVoteClick={(platformId) => {
                setWaitUntil(Date.now() + 3 * 60_000);
                // PWA: salva /vote/ prima di aprire Top.gg/Discadia (rientro ≠ home)
                try {
                  sessionStorage.setItem("vc-pwa-left-start", "1");
                  sessionStorage.removeItem("vc-pwa-want-home");
                  localStorage.setItem("vc-pwa-resume", JSON.stringify({ p: "/vote/", t: Date.now() }));
                } catch {
                  /* ignore */
                }
                if (user && typeof navigator !== "undefined" && !navigator.onLine) {
                  enqueue("vote", { userId: user.id, platformId });
                  showToast(OFFLINE_TOAST_VOTE);
                }
              }}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-crema/[0.04] px-5 py-4 text-center text-sm text-crema/65 ring-1 ring-sand/10">
          {user && data?.personal ? (
            <span>
              {t("vote.statsVotedTotal", { n: nf.format(data.personal.votes) })}
              {data.personal.rank ? (
                <>
                  {" "}
                  {t("vote.statsRank", { rank: data.personal.rank })}
                </>
              ) : null}
              . {t("vote.statsThanks")}
            </span>
          ) : user ? (
            <span>{t("vote.statsNotYet")}</span>
          ) : (
            <>
              <span>{t("vote.loginPrompt")}</span>
              <button type="button" onClick={login} className="inline-flex items-center gap-1.5 font-semibold text-caramel hover:underline">
                <LogIn className="size-4" /> {t("auth.loginDiscord")}
              </button>
            </>
          )}
        </div>
      </section>

      {/* obiettivo + ricompense */}
      <section className="grid items-center gap-10 md:grid-cols-[auto_1fr]">
        <Reveal>
          <GoalDisc total={stats.totalVotes} goal={stats.goal} />
          <p className="mt-4 text-center text-sm text-crema/50">
            {nf.format(stats.totalVoters)} {stats.totalVoters === 1 ? "votante" : "votanti"} · obiettivo {nf.format(stats.goal)} voti
          </p>
        </Reveal>
        <div>
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Perché votare</p>
            <h2 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">Un voto per il server</h2>
            <p className="mt-3 max-w-xl text-crema/60">Votare è gratis, dura un attimo e ti fa guadagnare qualcosa ogni volta.</p>
          </Reveal>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Sparkles, t: "Bonus EXP", d: "Tra 100 e 250 EXP casuali a ogni voto." },
              { icon: Crown, t: "Ruolo Voter", d: "Il ruolo @༄ Voter per 12–24 ore." },
              { icon: Trophy, t: "Più visibilità", d: "Il server sale in classifica e arrivano nuovi membri." },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 0.08}>
                <div className="h-full rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-4 ring-1 ring-sand/12">
                  <x.icon className="size-5 text-caramel" />
                  <p className="mt-2 font-semibold">{x.t}</p>
                  <p className="mt-1 text-sm text-crema/55">{x.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="mt-4 text-xs text-crema/40">
              Il voto avviene sulle piattaforme ufficiali, non sul nostro sito. Tutti i vantaggi del ruolo sono nei{" "}
              <a href={page("/perks/")} className="text-caramel hover:underline">
                Perks
              </a>
              .
            </p>
          </Reveal>
        </div>
      </section>

      {/* top voters */}
      <section id="vote-list" className="scroll-mt-28">
        <Reveal className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Top voters</p>
          <h2 className="mt-2 font-display text-4xl font-semibold">Chi vota di più</h2>
          <div className="mt-3 flex gap-4 text-xs text-crema/50">
            {PLATFORMS.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: p.accent }} /> {p.name}
              </span>
            ))}
          </div>
        </Reveal>
        <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-1 ring-sand/12">
          {rows.length === 0 && <p className="px-6 py-10 text-center text-crema/55">{t("vote.emptyLeaderboard")}</p>}
          <ul>
            {slice.map((r, i) => {
              const max = rows[0]?.votes || 1;
              const me = r.userId === user?.id;
              return (
                <motion.li
                  key={r.userId}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: Math.min(i, 10) * 0.03 }}
                  className={cn("border-b border-sand/10 last:border-b-0", me && "bg-caramel/[0.08]")}
                >
                  <a href={page(`/user/?id=${r.userId}`)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-crema/[0.04] sm:gap-4 sm:px-6">
                    <span className={cn("w-8 text-center font-display text-lg font-semibold lining-nums", r.rank <= 3 ? "text-ember" : "text-crema/40")}>{r.rank}</span>
                    <Avatar userId={r.userId} src={r.avatarUrl} name={r.displayName} className="size-10 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate font-medium", me ? "text-ember" : "text-crema")}>{r.displayName}</span>
                      {/* barra divisa tra le due piattaforme */}
                      <span className="mt-1.5 flex h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-crema/8" style={{ width: `${Math.max(8, (r.votes / max) * 100)}%` }}>
                        <span style={{ width: `${(r.discadiaVotes / Math.max(1, r.votes)) * 100}%`, background: PLATFORMS[0].accent }} />
                        <span style={{ width: `${(r.topggVotes / Math.max(1, r.votes)) * 100}%`, background: PLATFORMS[1].accent }} />
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums text-sand">{nf.format(r.votes)}</span>
                      <span className="hidden text-xs text-crema/40 sm:block">
                        {r.discadiaVotes} · {r.topggVotes}
                      </span>
                    </span>
                  </a>
                </motion.li>
              );
            })}
          </ul>
        </div>
        <Pagination page={pageSafe} totalPages={totalPages} onChange={setPageNum} scrollToId="vote-list" />
      </section>
    </div>
  );
}
