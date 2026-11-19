"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";
import { Feather, Flame, Loader2, LogIn, Sparkles, Users, VenetianMask } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  BGM_SRC,
  MAX_LEN,
  MIN_LEN,
  hasSeenPropositiBurn,
  loadPropositi,
  markPropositiBurnSeen,
  sendProposito,
  type PropViewer,
  type Proposito,
} from "@/lib/propositi";
import { cn } from "@/lib/cn";
import { readDeepLink } from "@/lib/deeplink";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { subscribeSiteRealtime } from "@/lib/site-realtime";
import { isPropositiSeason } from "@/lib/site-effects";
import { loadStaffAccess } from "@/lib/staff";
import { page } from "@/lib/site";
import { MusicDock } from "@/components/MusicDock";
import { Pagination, pageSlice } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { EmojiInsertButton, emojiPickText, insertAtCaret } from "@/components/tickets/EmojiInsertButton";
import { PropSheet } from "./PropSheet";
import { Letter, type BurnPhase } from "./PropLetter";
import { useI18n } from "@/lib/i18n";

const VOL_KEY = "vc_propositi_bgm_volume_v1";
const PAGE_SIZE = 12;

function readVol() {
  try {
    const n = Number(localStorage.getItem(VOL_KEY));
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch {
    /* ignore */
  }
  return 0.34;
}

function Candle({ className }: { className?: string }) {
  const reduce = useReducedMotionSafe();
  return (
    <span className={cn("relative block h-24 w-8", className)} aria-hidden>
      <motion.span
        className="absolute bottom-[3.6rem] left-1/2 h-7 w-3.5 -translate-x-1/2 rounded-[50%_50%_45%_45%/60%_60%_40%_40%] bg-[radial-gradient(circle_at_50%_70%,#fff3c4,#f0b46e_45%,#d9631f_80%)] blur-[0.5px]"
        animate={reduce ? undefined : { scaleY: [1, 1.12, 0.94, 1.06, 1], scaleX: [1, 0.92, 1.05, 0.96, 1], rotate: [0, -2, 1.5, -1, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "50% 100%" }}
      />
      <span className="absolute bottom-[3.5rem] left-1/2 h-1.5 w-px -translate-x-1/2 bg-black/70" />
      <span className="absolute bottom-0 left-1/2 h-14 w-6 -translate-x-1/2 rounded-t-sm bg-gradient-to-b from-[#f4e9d8] to-[#c9b89c]" />
    </span>
  );
}

function Bgm() {
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [hint, setHint] = useState(true);
  const [failed, setFailed] = useState(false);
  const [volume, setVolume] = useState(0.34);

  useEffect(() => {
    setVolume(readVol());
  }, []);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(false), 4500);
    return () => window.clearTimeout(t);
  }, [hint]);

  useEffect(() => {
    const a = ref.current;
    if (a) a.volume = volume;
  }, [volume]);

  const setVol = (v: number) => {
    const next = Math.min(1, Math.max(0, v));
    setVolume(next);
    try {
      localStorage.setItem(VOL_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const toggle = async () => {
    const a = ref.current;
    if (!a) return;
    setHint(false);
    if (on) {
      a.pause();
      setOn(false);
      return;
    }
    a.volume = volume;
    try {
      if (!a.src) a.src = BGM_SRC;
      await a.play();
      setOn(true);
      setFailed(false);
    } catch {
      setOn(false);
      setFailed(true);
    }
  };

  return (
    <>
      <audio ref={ref} loop preload="metadata" playsInline onError={() => setFailed(true)} />
      <MusicDock
        label="Ambiente · propositi"
        on={on}
        onToggle={() => void toggle()}
        volume={volume}
        onVolume={setVol}
        hint={hint && !on ? "Tocca play per avviare" : null}
        failed={failed && !on ? "Audio non disponibile" : null}
      />
    </>
  );
}

export function PropositiBoard() {
  const { ready, token, login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<Proposito[] | null>(null);
  const [viewer, setViewer] = useState<PropViewer>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(() => readDeepLink().propositoId || null);
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [seasonOpen, setSeasonOpen] = useState(() => isPropositiSeason());
  const [gateOk, setGateOk] = useState(false);
  const [burning, setBurning] = useState(false);
  const [burnPhase, setBurnPhase] = useState<BurnPhase>("idle");
  const burnStarted = useRef(false);
  const pullRef = useRef<(() => Promise<void>) | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const startBurnCeremony = useCallback(
    (cards?: Proposito[] | null, opts?: { preview?: boolean }) => {
      if (burnStarted.current) return;
      const preview = Boolean(opts?.preview);
      /* Auto-cerimonia mai con force-test (evita loop ↔ confessionale). */
      if (isPropositiSeason() && !preview) return;
      burnStarted.current = true;
      if (!preview) markPropositiBurnSeen();
      const snapshot = cards && cards.length ? cards : null;
      if (snapshot) setItems(snapshot);
      setPageNum(1);
      setBurning(true);
      setOpenId(null);
      /* ignite → flame → ash → gone → redirect (o restore in preview). */
      /* stessi tempi anche con "riduci movimento": il fuoco va visto per intero */
      const tIgnite = 700;
      const tFlame = 2800;
      const tAsh = 1400;
      const tGone = 500;
      setBurnPhase("ignite");
      window.setTimeout(() => {
        setBurnPhase("flame");
        window.setTimeout(() => {
          setBurnPhase("ash");
          window.setTimeout(() => {
            setBurnPhase("gone");
            setItems([]);
            window.setTimeout(() => {
              setBurnPhase("done");
              setBurning(false);
              burnStarted.current = false;
              if (preview) {
                setBurnPhase("idle");
                void pullRef.current?.();
                return;
              }
              router.replace(page("/confessionale/"));
            }, tGone);
          }, tAsh);
        }, tFlame);
      }, tIgnite);
    },
    [router],
  );

  /* Stagione/force → board normale. Fuori: cerimonia one-shot, poi confessionale (HS preview ok). */
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const run = async () => {
      if (isPropositiSeason()) {
        if (alive) {
          setSeasonOpen(true);
          setGateOk(true);
        }
        return;
      }
      setSeasonOpen(false);
      if (!hasSeenPropositiBurn()) {
        if (alive) setGateOk(true);
        return;
      }
      let highStaff = false;
      if (token) {
        const staff = await loadStaffAccess(token);
        if (!alive) return;
        highStaff = Boolean(staff.ok && staff.data.isHighStaff);
      }
      if (highStaff) {
        if (alive) setGateOk(true);
        return;
      }
      router.replace(page("/confessionale/"));
    };
    void run();
    return () => {
      alive = false;
    };
  }, [ready, token, router]);

  /* Tick: solo passaggio reale stagione→chiusura (force off). */
  useEffect(() => {
    if (!gateOk) return;
    const tick = () => {
      const open = isPropositiSeason();
      setSeasonOpen((prev) => {
        if (prev && !open) startBurnCeremony();
        return open;
      });
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [gateOk, startBurnCeremony]);

  useEffect(() => {
    const want = openId && /^[a-f0-9]{24}$/i.test(openId) ? `#vc-prop-card-${openId}` : "";
    const cur = location.hash || "";
    if (want) {
      if (cur.toLowerCase() !== want.toLowerCase()) {
        history.replaceState(history.state, "", `${location.pathname}${location.search}${want}`);
        window.dispatchEvent(new Event("vc:notif-page"));
      }
    } else if (/^#(?:vc-prop-card-)?[a-f0-9]{24}$/i.test(cur)) {
      history.replaceState(history.state, "", `${location.pathname}${location.search}`);
      window.dispatchEvent(new Event("vc:notif-page"));
    }
  }, [openId]);

  const pull = useCallback(async () => {
    if (!ready || !gateOk || burning) return;
    const r = await loadPropositi(token);
    if (!r.ok) {
      setError(r.message);
      setItems([]);
      return;
    }
    setError("");
    setViewer(r.data.viewer);
    /* UI stagione = solo client (localStorage force); API non deve spegnere il test. */
    const open = isPropositiSeason();
    setSeasonOpen(open);
    if (open) {
      setItems(r.data.items);
      return;
    }
    /* Fuori stagione, prima visita: cerimonia sui bruciati (non sui live). */
    const forBurn = r.data.burnedItems?.length ? r.data.burnedItems : r.data.items;
    setItems(forBurn);
    if (!hasSeenPropositiBurn() && !burnStarted.current) {
      window.setTimeout(() => startBurnCeremony(forBurn), 900);
    }
  }, [ready, token, gateOk, burning, startBurnCeremony]);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  useEffect(() => {
    void pull();
  }, [pull]);

  useLiveRefresh(pull, { intervalMs: 90_000, enabled: ready && gateOk && !burning, boot: false, topics: ["propositi"] });

  useEffect(() => {
    if (!gateOk || burning) return;
    return subscribeSiteRealtime((p) => {
      if (p.type === "propositi_burned" || (p.type === "propositi_changed" && p.action === "burned")) {
        if (!isPropositiSeason()) startBurnCeremony();
      }
    });
  }, [gateOk, burning, startBurnCeremony]);

  const replace = useCallback((c: Proposito) => setItems((l) => (l ? l.map((x) => (x.id === c.id ? c : x)) : l)), []);
  const current = items?.find((c) => c.id === openId) ?? null;
  const { page: pageSafe, totalPages, slice } = pageSlice(items ?? [], pageNum, PAGE_SIZE);
  const len = text.trim().length;
  const canWrite = seasonOpen && !burning;

  const send = async () => {
    if (!token) return login();
    if (!canWrite) return setNote({ ok: false, text: t("propositi.seasonClosed") });
    if (len < MIN_LEN) return setNote({ ok: false, text: `Scrivi almeno ${MIN_LEN} caratteri.` });
    setSending(true);
    setNote(null);
    const r = await sendProposito(token, text.trim(), anonymous);
    setSending(false);
    if (!r.ok) return setNote({ ok: false, text: r.message });
    setText("");
    setItems((l) => [r.data, ...(l ?? [])]);
    setNote({
      ok: true,
      text: anonymous ? t("propositi.sentAnon") : t("propositi.sentPublic"),
    });
  };

  if (!gateOk) {
    return (
      <div className="mx-auto flex max-w-6xl justify-center px-6 py-24">
        <Loader2 className="size-8 animate-spin text-caramel" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-6xl px-6 pb-20">
      <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[40rem] bg-[radial-gradient(ellipse_at_50%_20%,rgba(240,180,110,0.14),transparent_60%)]" />

      <Bgm />

      {burning && (
        <div
          className="pointer-events-none sticky top-20 z-30 mx-auto mb-6 max-w-md"
          aria-live="polite"
        >
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-sm bg-[#1a0c08]/90 px-5 py-4 text-center text-crema shadow-[0_20px_50px_-20px_rgba(255,80,20,0.55)] ring-1 ring-[#ff7a3a]/35 backdrop-blur-sm"
          >
            <Flame className="mx-auto size-8 text-[#ff8a3a]" />
            <p className="mt-2 font-display text-xl font-bold">{t("propositi.burnTitle")}</p>
            <p className="mt-1 text-sm text-crema/70">{t("propositi.burnText")}</p>
          </motion.div>
        </div>
      )}

      {viewer?.canModerate && seasonOpen && !burning && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => startBurnCeremony(items, { preview: true })}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#a83a2c]/20 px-3 py-1.5 text-xs font-semibold text-[#f0a493] ring-1 ring-[#a83a2c]/35"
          >
            <Flame className="size-3.5" /> {t("propositi.burnPreview")}
          </button>
        </div>
      )}

      {canWrite && (
        <section className="mx-auto mt-10 max-w-2xl">
          <div className="flex items-end justify-center gap-6">
            <Candle className="hidden sm:block" />
            <div className="relative w-full rounded-sm bg-[#ece0c8] p-6 text-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,1)] sm:p-8">
              <p className="flex items-center gap-2 font-display text-2xl font-bold">
                <Sparkles className="size-5" /> {t("propositi.writeTitle")}
              </p>
              <p className="mt-1 text-sm text-ink/60">{t("propositi.writeHint")}</p>
              <div className="mt-4 inline-flex rounded-full bg-ink/5 p-1">
                <button
                  type="button"
                  aria-pressed={anonymous}
                  onClick={() => setAnonymous(true)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    anonymous ? "bg-ink text-paper" : "text-ink/55 hover:text-ink",
                  )}
                >
                  <VenetianMask className="size-3.5" /> {t("propositi.anon")}
                </button>
                <button
                  type="button"
                  aria-pressed={!anonymous}
                  onClick={() => setAnonymous(false)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    !anonymous ? "bg-ink text-paper" : "text-ink/55 hover:text-ink",
                  )}
                >
                  <Users className="size-3.5" /> {t("propositi.public")}
                </button>
              </div>
              <textarea
                ref={textRef}
                name="message"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                onFocus={() => !token && ready && setNote({ ok: false, text: t("propositi.loginToSend") })}
                rows={5}
                placeholder={t("propositi.placeholder")}
                className="mt-4 w-full resize-y border-b border-ink/20 bg-[repeating-linear-gradient(transparent,transparent_31px,rgba(80,50,30,0.15)_31px,rgba(80,50,30,0.15)_32px)] bg-transparent font-display text-xl leading-8 outline-none placeholder:text-ink/35"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <EmojiInsertButton
                    token={token}
                    preferAbove
                    className="text-ink/50 hover:bg-ink/5 hover:text-ink"
                    onPick={(pick) => {
                      const { next } = insertAtCaret(text, emojiPickText(pick), textRef.current, MAX_LEN);
                      setText(next);
                    }}
                  />
                  <span className="text-xs text-ink/45 lining-nums">
                    {len < MIN_LEN ? `almeno ${MIN_LEN} caratteri` : `${len} / ${MAX_LEN}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={send}
                  disabled={sending}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : token ? (
                    <Feather className="size-4" />
                  ) : (
                    <LogIn className="size-4" />
                  )}{" "}
                  {token ? t("propositi.publish") : t("propositi.loginToWrite")}
                </button>
              </div>
              {note && (
                <p
                  className={cn(
                    "mt-3 rounded-lg px-3 py-2 text-sm font-medium",
                    note.ok ? "bg-[#3f7d4e]/12 text-[#2c5634]" : "bg-[#a83a2c]/10 text-[#a83a2c]",
                  )}
                >
                  {note.text}
                </p>
              )}
            </div>
            <Candle className="hidden sm:block" />
          </div>
        </section>
      )}

      {!seasonOpen && !burning && (
        <p className="mx-auto mt-10 max-w-2xl rounded-xl bg-black/25 px-4 py-3 text-center text-sm text-crema/70">
          {t("propositi.previewOnly")}
        </p>
      )}

      {error && (
        <p className="mx-auto mt-8 max-w-2xl rounded-xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c]">
          {error}
        </p>
      )}

      <section id="propositi-list" className={cn("scroll-mt-28", burning ? "mt-6" : "mt-16")}>
        {!burning && <p className="text-center font-script text-4xl text-caramel">{t("propositi.listTitle")}</p>}
        <div className="mt-8">
          {items === null ? (
            <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="mb-6 h-48 animate-pulse rounded-sm bg-crema/[0.07]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={Sparkles} title={t("propositi.emptyTitle")} text={t("propositi.emptyText")} />
          ) : (
            <>
              <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
                {(burning ? items.slice(0, 24) : slice).map((c, i) => (
                  <Letter
                    key={c.id}
                    c={c}
                    i={i}
                    token={token}
                    burnPhase={burnPhase}
                    onOpen={() => !burning && setOpenId(c.id)}
                    onUpdate={replace}
                  />
                ))}
              </div>
              {!burning && (
                <Pagination page={pageSafe} totalPages={totalPages} onChange={setPageNum} scrollToId="propositi-list" />
              )}
            </>
          )}
        </div>
      </section>

      <AnimatePresence>
        {current && !burning && (
          <PropSheet key={current.id} c={current} token={token} viewer={viewer} onClose={() => setOpenId(null)} onUpdate={replace} />
        )}
      </AnimatePresence>
    </div>
  );
}
