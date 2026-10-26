"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Feather, Loader2, LogIn, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BGM_SRC, MAX_LEN, MIN_LEN, loadConfessions, sendConfession, type Board, type ConfViewer, type Confession } from "@/lib/confessionale";
import { cn } from "@/lib/cn";
import { readDeepLink } from "@/lib/deeplink";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { MusicDock } from "@/components/MusicDock";
import { Pagination, pageSlice } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfSheet } from "./ConfSheet";
import { Letter } from "./Letter";
import { useI18n } from "@/lib/i18n";

const VOL_KEY = "vc_confessionale_bgm_volume_v1";

function readVol() {
  try {
    const n = Number(localStorage.getItem(VOL_KEY));
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch {
    /* ignore */
  }
  return 0.34;
}

const PAGE_SIZE = 12;

/** Fiamma di candela: solo transform/opacity, si ferma con "riduci movimento". */
function Candle({ className }: { className?: string }) {
  const reduce = useReducedMotion();
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

/** Musica confessionale: dock con volume; sale solo se c’è la freccia torna-su. */
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
        on={on}
        onToggle={() => void toggle()}
        volume={volume}
        onVolume={setVol}
        hint={hint && !on ? "Tocca per la musica" : null}
        failed={failed && !on ? "Audio non disponibile" : null}
      />
    </>
  );
}

export function ConfessionaleBoard() {
  const { ready, token, login } = useAuth();
  const { t } = useI18n();
  const [board, setBoard] = useState<Board>("community");
  const [items, setItems] = useState<Confession[] | null>(null);
  const [viewer, setViewer] = useState<ConfViewer>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(() => readDeepLink().confessionId || null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pageNum, setPageNum] = useState(1);

  useEffect(() => {
    if (readDeepLink().boardStaff) setBoard("staff");
  }, []);

  // notifVisitExact1: hash discussione aperta → dismiss solo per quella lettera
  useEffect(() => {
    const want = openId && /^[a-f0-9]{24}$/i.test(openId) ? `#vc-conf-card-${openId}` : "";
    const cur = location.hash || "";
    if (want) {
      if (cur.toLowerCase() !== want.toLowerCase()) {
        history.replaceState(history.state, "", `${location.pathname}${location.search}${want}`);
        window.dispatchEvent(new Event("vc:notif-page"));
      }
    } else if (/^#(?:vc-conf-card-)?[a-f0-9]{24}$/i.test(cur)) {
      history.replaceState(history.state, "", `${location.pathname}${location.search}`);
      window.dispatchEvent(new Event("vc:notif-page"));
    }
  }, [openId]);

  const pull = useCallback(async () => {
    if (!ready) return;
    const r = await loadConfessions(board, token);
    if (!r.ok) {
      setError(r.message);
      setItems([]);
      if (board === "staff") setBoard("community");
      return;
    }
    setError("");
    setItems(r.data.items);
    setViewer(r.data.viewer);
  }, [ready, token, board]);

  useEffect(() => {
    void pull();
  }, [pull]);

  useLiveRefresh(pull, { intervalMs: 90_000, enabled: ready, boot: false, topics: ["confessionale"] });

  const replace = useCallback((c: Confession) => setItems((l) => (l ? l.map((x) => (x.id === c.id ? c : x)) : l)), []);
  const current = items?.find((c) => c.id === openId) ?? null;
  const { page: pageSafe, totalPages, slice } = pageSlice(items ?? [], pageNum, PAGE_SIZE);
  const len = text.trim().length;

  const send = async () => {
    if (!token) return login();
    if (len < MIN_LEN) return setNote({ ok: false, text: `Scrivi almeno ${MIN_LEN} caratteri.` });
    setSending(true);
    setNote(null);
    const r = await sendConfession(token, board, text.trim());
    setSending(false);
    if (!r.ok) return setNote({ ok: false, text: r.message });
    setText("");
    setItems((l) => [r.data, ...(l ?? [])]);
    setNote({ ok: true, text: "Messaggio inviato in anonimo." });
  };

  return (
    <div className="relative mx-auto max-w-6xl px-6 pb-20">
      {/* luce della candela sul bancone */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[40rem] bg-[radial-gradient(ellipse_at_50%_20%,rgba(240,180,110,0.14),transparent_60%)]" />

      <Bgm />
      {viewer?.canAccessStaffBoard && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="inline-flex rounded-full bg-black/30 p-1 ring-1 ring-crema/10">
            {(["community", "staff"] as Board[]).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={board === b}
                onClick={() => {
                  if (b === board) return;
                  setBoard(b);
                  setItems(null);
                  setOpenId(null);
                  setPageNum(1);
                }}
                className={cn("inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors", board === b ? "bg-crema text-espresso" : "text-crema/60 hover:text-crema")}
              >
                {b === "staff" ? <ShieldCheck className="size-4" /> : <Users className="size-4" />} {b === "staff" ? "Staff" : "Community"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* scrivi una lettera */}
      <section className="mx-auto mt-10 max-w-2xl">
        <div className="flex items-end justify-center gap-6">
          <Candle className="hidden sm:block" />
          <div className="relative w-full rounded-sm bg-[#ece0c8] p-6 text-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,1)] sm:p-8">
            <p className="flex items-center gap-2 font-display text-2xl font-bold">
              <Feather className="size-5" /> Scrivi una lettera
            </p>
            <p className="mt-1 text-sm text-ink/60">Il messaggio non salva chi lo ha scritto: niente nome, niente ID Discord.</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              onFocus={() => !token && ready && setNote({ ok: false, text: t("confessionale.loginToSend") })}
              rows={5}
              placeholder="Qui puoi sfogarti o segnalare qualcosa…"
              className="mt-4 w-full resize-y border-b border-ink/20 bg-[repeating-linear-gradient(transparent,transparent_31px,rgba(80,50,30,0.15)_31px,rgba(80,50,30,0.15)_32px)] bg-transparent font-display text-xl leading-8 outline-none placeholder:text-ink/35"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-ink/45 lining-nums">{len < MIN_LEN ? `almeno ${MIN_LEN} caratteri` : `${len} / ${MAX_LEN}`}</span>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-all hover:-translate-y-0.5 disabled:opacity-60"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : token ? <Feather className="size-4" /> : <LogIn className="size-4" />} {token ? "Pubblica nel confessionale" : t("confessionale.loginToWrite")}
              </button>
            </div>
            {note && <p className={cn("mt-3 rounded-lg px-3 py-2 text-sm font-medium", note.ok ? "bg-[#3f7d4e]/12 text-[#2c5634]" : "bg-[#a83a2c]/10 text-[#a83a2c]")}>{note.text}</p>}
          </div>
          <Candle className="hidden sm:block" />
        </div>
      </section>

      {error && <p className="mx-auto mt-8 max-w-2xl rounded-xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c]">{error}</p>}

      {/* le lettere */}
      <section id="confessionale-list" className="mt-16 scroll-mt-28">
        <p className="text-center font-script text-4xl text-caramel">Nel confessionale</p>
        <div className="mt-8">
          {items === null ? (
            <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="mb-6 h-48 animate-pulse rounded-sm bg-crema/[0.07]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={Feather} title={t("confessionale.emptyTitle")} text={t("confessionale.emptyText")} />
          ) : (
            <>
              <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
                {slice.map((c, i) => (
                  <Letter key={c.id} c={c} i={i} onOpen={() => setOpenId(c.id)} />
                ))}
              </div>
              <Pagination page={pageSafe} totalPages={totalPages} onChange={setPageNum} scrollToId="confessionale-list" />
            </>
          )}
        </div>
      </section>

      <AnimatePresence>{current && <ConfSheet key={current.id} c={current} token={token} viewer={viewer} onClose={() => setOpenId(null)} onUpdate={replace} />}</AnimatePresence>
    </div>
  );
}
