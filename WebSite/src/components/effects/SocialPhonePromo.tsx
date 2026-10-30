"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bell, Bookmark, Heart, Share2, UserPlus } from "lucide-react";
import { Iphone } from "@/components/magicui/iphone";
import { useChromeOpenListener } from "@/lib/chrome-open";
import { DISCORD_INVITE, SITE_ORIGIN, cdnUrl } from "@/lib/site";
import { cn } from "@/lib/cn";
import profile from "@/data/social-profile.json";

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

type ChannelId = "instagram" | "tiktok" | "site";
type Channel = { id: ChannelId; href: string; label: string; handle: string };
type Cta = {
  id: string;
  title: string;
  sub: string;
  icon: typeof Heart;
  hrefFor: (ch: Channel) => string;
  channels?: ChannelId[];
};

const CHANNELS: Channel[] = [
  { id: "instagram", href: "https://www.instagram.com/viniliecaffe/", label: "Instagram", handle: "@viniliecaffe" },
  { id: "tiktok", href: "https://www.tiktok.com/@viniliecaffe", label: "TikTok", handle: "@viniliecaffe" },
  { id: "site", href: `${SITE_ORIGIN}/`, label: "Sito", handle: "viniliecaffe.it" },
];

const CTAS: Cta[] = [
  { id: "follow", title: "Seguici", sub: "Profilo reale · post aggiornati", icon: UserPlus, hrefFor: (ch) => ch.href, channels: ["instagram", "tiktok"] },
  { id: "notify", title: "Attiva le notifiche", sub: "Così non ti perdi nulla", icon: Bell, hrefFor: (ch) => ch.href, channels: ["instagram", "tiktok"] },
  { id: "like", title: "Metti like", sub: "Un tap, ci aiuti un sacco", icon: Heart, hrefFor: (ch) => ch.href, channels: ["instagram", "tiktok"] },
  { id: "save", title: "Salva il post", sub: "Per rivederlo dopo", icon: Bookmark, hrefFor: (ch) => ch.href, channels: ["instagram", "tiktok"] },
  { id: "share", title: "Condividi", sub: "Passalo a un amico", icon: Share2, hrefFor: (ch) => ch.href },
  { id: "discord", title: "Entra su Discord", sub: "La community ti aspetta", icon: UserPlus, hrefFor: () => DISCORD_INVITE },
  { id: "site", title: "Apri dal telefono", sub: "Il sito vero, in anteprima", icon: Share2, hrefFor: (ch) => ch.href, channels: ["site"] },
];

const LS_KEY = "vc_social_phone_v4";
const DESKTOP_MQ = "(min-width: 900px)";
/** Prima comparsa: abbastanza presto da vederla in una visita normale. */
const FIRST_DELAY_MS = [20_000, 40_000] as const;
/** Tra una comparsa e l'altra: da 1 a 2 ore (la data resta salvata, vale anche tra una visita e l'altra). */
const BETWEEN_MS = [60 * 60_000, 120 * 60_000] as const;
const VISIBLE_MS = [18_000, 28_000] as const;
const CTA_GAP_MS = [3_500, 5_800] as const;
/** Dopo tab in background / pagina busy: aspetta un po’ prima di uscire. */
const AFTER_BUSY_MS = [6_000, 12_000] as const;
const ASSET_V = "20261024socialFix3";

/** Pagine dove il mock disturba (cinema, tool, chat) — si rimanda, non si brucia lo slot. */
function isBusyPath(pathname: string) {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  return (
    p.startsWith("/seratafilm") ||
    p.startsWith("/tickets") ||
    p.startsWith("/staff") ||
    p.startsWith("/dashboard") ||
    p.startsWith("/confessionale") ||
    p.startsWith("/notifications")
  );
}

function forcedChannelId(): ChannelId | null {
  try {
    const id = new URLSearchParams(window.location.search).get("vc_social_channel");
    if (id === "instagram" || id === "tiktok" || id === "site") return id;
  } catch {
    /* ignore */
  }
  return null;
}

type Store = { day: string; showsToday: number; nextAt: number; lastChannel: ChannelId | null };

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function pick<T>(arr: readonly T[], avoid?: T | null): T {
  if (arr.length === 1) return arr[0]!;
  const pool = avoid != null ? arr.filter((x) => x !== avoid) : [...arr];
  return pool[Math.floor(Math.random() * pool.length)]!;
}
function ctasFor(ch: Channel) {
  return CTAS.filter((c) => !c.channels || c.channels.includes(ch.id));
}
function asset(path: string) {
  const withV = `${path}${path.includes("?") ? "&" : "?"}v=${ASSET_V}`;
  return cdnUrl(withV);
}

function readStore(): Store {
  const today = dayKey();
  const empty: Store = { day: today, showsToday: 0, nextAt: 0, lastChannel: null };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return empty;
    const j = JSON.parse(raw) as Partial<Store>;
    const day = typeof j.day === "string" ? j.day : today;
    return {
      day,
      showsToday: day === today ? Number(j.showsToday) || 0 : 0,
      nextAt: Number(j.nextAt) || 0,
      lastChannel: (j.lastChannel as ChannelId) || null,
    };
  } catch {
    return empty;
  }
}
function writeStore(s: Store) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
function ensureSchedule(s: Store): Store {
  const today = dayKey();
  const next: Store = { ...s, day: today, showsToday: s.day === today ? s.showsToday : 0 };
  if (!next.nextAt) next.nextAt = Date.now() + rand(FIRST_DELAY_MS[0], FIRST_DELAY_MS[1]);
  return next;
}

function isPhonePreview() {
  try {
    return new URLSearchParams(window.location.search).get("vc_phone_preview") === "1";
  } catch {
    return false;
  }
}

/** Schermo IG con stats + griglia post reali (snapshot da profilo pubblico). */
function ScreenInstagram() {
  const ig = profile.instagram;
  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex items-center justify-between px-3 pt-2.5 text-[0.5rem] text-white/45">
        <span className="tabular-nums">9:41</span>
        <span className="font-semibold tracking-wide text-white/80">Instagram</span>
        <span className="opacity-40">•••</span>
      </div>
      <div className="mt-2 flex items-center gap-2.5 px-2.5">
        <div className="size-11 shrink-0 overflow-hidden rounded-full bg-[conic-gradient(from_210deg,#f58529,#dd2a7b,#8134af,#f58529)] p-[1.5px]">
          <img src={asset(ig.avatar)} alt="" className="size-full rounded-full object-cover bg-[#111]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.7rem] font-semibold leading-tight">{ig.name}</p>
          <p className="truncate text-[0.5rem] text-white/45">{ig.handle}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-[#0095f6] px-2.5 py-1 text-[0.55rem] font-semibold">Segui</span>
      </div>
      <div className="mt-2 flex gap-2 px-3 text-center text-[0.5rem]">
        {[
          [String(ig.posts), "Post"],
          [ig.followers, "Follower"],
          [ig.following, "Seguiti"],
        ].map(([n, l]) => (
          <div key={l} className="flex-1">
            <p className="font-semibold text-white">{n}</p>
            <p className="text-white/40">{l}</p>
          </div>
        ))}
      </div>
      <div className="mt-1.5 px-3 text-[0.48rem] leading-snug text-white/70">
        <p className="font-semibold text-white/90">{ig.displayName}</p>
        {ig.bio.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="mt-2 grid flex-1 grid-cols-3 gap-[1px] bg-white/10 content-start">
        {ig.grid.map((src, i) => (
          <div key={`${src}-${i}`} className="relative aspect-square overflow-hidden bg-[#1a110c]">
            <img src={asset(src)} alt="" className="size-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Anteprima sito mobile (hero una sola volta — niente screenshot full-page buggato). */
function ScreenSite() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0e0906] text-[#f4e9d8]">
      <img
        src={asset("/images/hero-cafe-atmosphere.jpg")}
        alt=""
        className="absolute inset-0 size-full object-cover opacity-55"
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(14,9,6,0.45),rgba(14,9,6,0.82)_55%,#0e0906)]" />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-3.5 pt-10 text-center">
        <p className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[0.42rem] font-semibold uppercase tracking-[0.18em] text-[#c4a07a] ring-1 ring-white/15">
          ✧ Community Discord italiana
        </p>
        <h1 className="mt-3 font-display text-[1.55rem] font-semibold leading-[0.95] tracking-tight">
          <span className="block text-[0.72rem] font-medium italic text-[#f4e9d8]/70">Benvenut* su</span>
          <span className="bg-gradient-to-b from-[#f4e9d8] via-[#c4a07a] to-[#d99a5b] bg-clip-text text-transparent">
            Vinili <span className="italic">&amp;</span> Caffè
          </span>
        </h1>
        <p className="mt-2.5 max-w-[15rem] text-[0.48rem] leading-snug text-[#f4e9d8]/55">
          Una community chill: ruoli, canali, eventi, bot fatti in casa. Metti su un vinile.
        </p>
        <div className="mt-4 flex w-full flex-col items-center gap-1.5">
          <span className="w-[78%] rounded-full bg-[#5865F2] py-1.5 text-center text-[0.55rem] font-semibold text-white">
            Entra su Discord
          </span>
          <span className="text-[0.45rem] font-medium text-[#c4a07a]/80">Esplora la community</span>
        </div>
      </div>
      <div className="relative z-10 pb-3 pt-1 text-center text-[0.4rem] uppercase tracking-[0.2em] text-[#c4a07a]/45">
        viniliecaffe.it
      </div>
    </div>
  );
}

/** TikTok mobile (niente sidebar desktop): stats reali + cover dai post pubblici. */
function ScreenTikTok() {
  const tt = profile.tiktok;
  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex items-center justify-between px-3 pt-2.5 text-[0.5rem] text-white/45">
        <span className="tabular-nums">9:41</span>
        <span className="font-semibold text-white/80">TikTok</span>
        <span className="opacity-40">•••</span>
      </div>
      <div className="mt-4 flex flex-col items-center px-3">
        <div className="relative">
          <div className="size-14 overflow-hidden rounded-full ring-2 ring-white/90">
            <img src={asset(tt.avatar)} alt="" className="size-full object-cover" />
          </div>
          <span className="absolute -bottom-1 left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-[#fe2c55] text-[0.7rem] font-bold leading-none">
            +
          </span>
        </div>
        <p className="mt-2.5 text-[0.72rem] font-bold">{tt.displayName}</p>
        <p className="text-[0.5rem] text-white/45">{tt.handle}</p>
        <div className="mt-2.5 flex w-full justify-center gap-5 text-center text-[0.5rem]">
          {[
            [tt.following, "Following"],
            [tt.followers, "Followers"],
            [tt.likes, "Likes"],
          ].map(([n, l]) => (
            <div key={l}>
              <p className="font-semibold">{n}</p>
              <p className="text-white/40">{l}</p>
            </div>
          ))}
        </div>
        <span className="mt-3 w-[72%] rounded-md bg-[#fe2c55] py-1.5 text-center text-[0.62rem] font-semibold">Follow</span>
        <div className="mt-2 w-full px-1 text-center text-[0.45rem] leading-snug text-white/50">
          {tt.bio.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <div className="mt-3 grid flex-1 grid-cols-3 gap-[1px] bg-white/10 content-start">
        {tt.grid.map((src, i) => (
          <div key={`${src}-${i}`} className="relative aspect-[3/4] overflow-hidden bg-[#111]">
            <img src={asset(src)} alt="" className="size-full object-cover" />
            <span className="absolute bottom-1 left-1 text-[0.45rem] font-semibold text-white drop-shadow">▶</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Promo desktop: iPhone con anteprime reali (IG/TT UI mobile + screenshot sito).
 * Nessuna X. Solo ≥1024px.
 * Non esce su tab in background né su pagine “busy” (seratafilm/tickets/staff…): rimanda.
 */
export function SocialPhonePromo() {
  const reduce = useReducedMotion();
  const pathname = usePathname() || "/";
  const [desktop, setDesktop] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>(CHANNELS[0]!);
  const [cta, setCta] = useState<Cta | null>(null);

  const storeRef = useRef<Store | null>(null);
  const openRef = useRef(false);
  const pathRef = useRef(pathname);
  const chromeRef = useRef(chromeOpen);
  const hideTimer = useRef<number | null>(null);
  const ctaTimer = useRef<number | null>(null);
  pathRef.current = pathname;
  chromeRef.current = chromeOpen;

  useEffect(() => useChromeOpenListener(setChromeOpen), []);

  const clearTimers = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (ctaTimer.current) window.clearTimeout(ctaTimer.current);
    hideTimer.current = null;
    ctaTimer.current = null;
  }, []);

  const deferSoon = useCallback(() => {
    const s = storeRef.current || readStore();
    const soon = Date.now() + rand(AFTER_BUSY_MS[0], AFTER_BUSY_MS[1]);
    const nextAt = Math.max(s.nextAt || 0, soon);
    const next = { ...ensureSchedule(s), nextAt };
    storeRef.current = next;
    writeStore(next);
  }, []);

  const hideOpen = useCallback(() => {
    if (!openRef.current) return;
    clearTimers();
    openRef.current = false;
    setOpen(false);
    setCta(null);
  }, [clearTimers]);

  const showNow = useCallback(
    (force = false) => {
      const s0 = ensureSchedule(storeRef.current || readStore());
      if (openRef.current) return;
      if (document.hidden) {
        deferSoon();
        return;
      }
      if (!force && (chromeRef.current || isBusyPath(pathRef.current))) {
        deferSoon();
        return;
      }

      const forced = forcedChannelId();
      const avoid = CHANNELS.find((c) => c.id === s0.lastChannel) || null;
      const nextCh = (forced && CHANNELS.find((c) => c.id === forced)) || pick(CHANNELS, avoid);
      const firstCta = pick(ctasFor(nextCh));

      setChannel(nextCh);
      setCta(firstCta);
      openRef.current = true;
      setOpen(true);

      const s: Store = {
        ...s0,
        showsToday: s0.showsToday + 1,
        lastChannel: nextCh.id,
        nextAt: Date.now() + rand(BETWEEN_MS[0], BETWEEN_MS[1]),
      };
      storeRef.current = s;
      writeStore(s);

      hideTimer.current = window.setTimeout(() => {
        openRef.current = false;
        setOpen(false);
        setCta(null);
      }, rand(VISIBLE_MS[0], VISIBLE_MS[1]));

      const bumpCta = () => {
        setCta((prev) => pick(ctasFor(nextCh), prev));
        ctaTimer.current = window.setTimeout(bumpCta, rand(CTA_GAP_MS[0], CTA_GAP_MS[1]));
      };
      ctaTimer.current = window.setTimeout(bumpCta, rand(CTA_GAP_MS[0], CTA_GAP_MS[1]));
    },
    [deferSoon],
  );

  useEffect(() => {
    if (isPhonePreview()) {
      setEnabled(false);
      return;
    }
    setEnabled(true);
    const mq = window.matchMedia(DESKTOP_MQ);
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Menù chrome / pagina busy: nascondi subito se era aperto, rimanda la prossima.
  useEffect(() => {
    if (!openRef.current) return;
    if (chromeOpen || isBusyPath(pathname)) {
      hideOpen();
      deferSoon();
    }
  }, [chromeOpen, pathname, hideOpen, deferSoon]);

  useEffect(() => {
    if (!enabled || !desktop) {
      clearTimers();
      openRef.current = false;
      setOpen(false);
      return;
    }

    storeRef.current = ensureSchedule(readStore());
    writeStore(storeRef.current);

    let force = false;
    try {
      if (new URLSearchParams(window.location.search).get("vc_social_phone") === "1") {
        const s = storeRef.current;
        storeRef.current = { ...s, nextAt: 0 };
        force = true;
        window.setTimeout(() => showNow(true), 500);
      }
    } catch {
      /* ignore */
    }

    const tryShow = () => {
      if (document.hidden || openRef.current || chromeRef.current) return;
      if (isBusyPath(pathRef.current)) {
        const s = storeRef.current || readStore();
        if (Date.now() >= (s.nextAt || 0)) deferSoon();
        return;
      }
      const s = storeRef.current || readStore();
      if (Date.now() >= (s.nextAt || 0)) showNow(false);
    };

    if (!force) tryShow();
    const id = window.setInterval(tryShow, 5_000);

    const onVis = () => {
      if (document.hidden) {
        // Tab in background: se era aperto, chiudi; se era in coda, aspetta al rientro.
        hideOpen();
        return;
      }
      if (openRef.current || chromeRef.current || isBusyPath(pathRef.current)) return;
      const s = storeRef.current || readStore();
      if (Date.now() >= (s.nextAt || 0)) deferSoon();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      clearTimers();
    };
  }, [enabled, desktop, showNow, clearTimers, deferSoon, hideOpen]);

  const ChannelIcon = useMemo(() => {
    if (channel.id === "instagram") return InstagramGlyph;
    if (channel.id === "tiktok") return TikTokGlyph;
    return null;
  }, [channel.id]);

  if (!enabled || !desktop) return null;

  const CtaIcon = cta?.icon;
  const href = cta ? cta.hrefFor(channel) : channel.href;

  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[75] hidden lg:block">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="phone"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.97 }}
            transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 300, damping: 26 }}
            className="pointer-events-auto flex w-[168px] flex-col items-center"
          >
            <div className="mb-2.5 w-full min-h-[3.4rem]">
              <AnimatePresence mode="wait">
                {cta && CtaIcon ? (
                  <motion.a
                    key={cta.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: reduce ? 0.12 : 0.25 }}
                    className={cn(
                      "flex w-full flex-col items-center rounded-2xl px-3 py-2.5 text-center",
                      "bg-roast/95 ring-1 ring-sand/20 backdrop-blur-md",
                      "shadow-[0_12px_32px_rgba(0,0,0,0.45)] transition hover:ring-caramel/40",
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-crema">
                      <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-caramel to-ember text-ink">
                        <CtaIcon className="size-3.5" />
                      </span>
                      {cta.title}
                    </span>
                    <span className="mt-0.5 text-[0.65rem] leading-snug text-crema/50">{cta.sub}</span>
                  </motion.a>
                ) : null}
              </AnimatePresence>
            </div>

            <a
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-[1.75rem] outline-none transition hover:brightness-110"
              aria-label={`${cta?.title || "Apri"} — ${channel.label} ${channel.handle}`}
            >
              <Iphone className="drop-shadow-[0_22px_48px_rgba(0,0,0,0.6)]">
                {channel.id === "site" ? (
                  <ScreenSite />
                ) : channel.id === "instagram" ? (
                  <ScreenInstagram />
                ) : (
                  <ScreenTikTok />
                )}
              </Iphone>
            </a>

            <p className="mt-2 flex items-center justify-center gap-1.5 text-[0.65rem] font-medium text-crema/50">
              {ChannelIcon ? <ChannelIcon className="size-3.5" /> : null}
              <span>{channel.handle}</span>
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
