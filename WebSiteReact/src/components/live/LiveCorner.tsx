"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, Play, Radio, Volume2, VolumeX, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  KICK_LIVE_URL,
  KICK_PREVIEW_LIMIT_MS,
  LIVE_HIDE_AFTER_MISSES,
  LIVE_POLL_MS,
  TWITCH_LIVE_URL,
  beginWatch,
  externalUrl,
  fetchKickSubStatus,
  fetchLive,
  flushWatch,
  kickPlayableUrl,
  loadWatch,
  resolveShown,
  startKickSubLink,
  withEmbedParent,
  type KickSubStatus,
  type LivePlatform,
  type LiveStream,
} from "@/lib/live";
import { useChromeOpenListener } from "@/lib/chrome-open";
/** Telefono (touch + viewport stretto): niente PiP. Tablet/desktop restano. */
function isPhoneNoPip() {
  try {
    return window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 900px)").matches;
  } catch {
    return false;
  }
}

function intlTag(locale: Locale) {
  const map: Partial<Record<Locale, string>> = {
    it: "it-IT",
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    pt: "pt-BR",
  };
  return map[locale] || locale;
}

function countLine(
  locale: Locale,
  stream: LiveStream,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const n = new Intl.NumberFormat(intlTag(locale)).format(stream.viewerCount);
  return t(stream.kind === "vod" ? "live.views" : "live.viewers", { n });
}

function useShownStream(path: string, liveOnly: boolean) {
  const [stream, setStream] = useState<LiveStream | null>(null);
  const misses = useRef(0);
  const current = useRef<LiveStream | null>(null);

  useEffect(() => {
    current.current = stream;
  }, [stream]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      const next = resolveShown(await fetchLive(path), liveOnly);
      if (!alive) return;
      if (next.action === "show") {
        misses.current = 0;
        setStream(next.stream);
        return;
      }
      if (next.action === "hide") {
        misses.current = 0;
        setStream(null);
        return;
      }
      misses.current += 1;
      if (next.action === "offline" && !current.current) misses.current = LIVE_HIDE_AFTER_MISSES;
      if (misses.current >= LIVE_HIDE_AFTER_MISSES) {
        misses.current = 0;
        setStream(null);
      }
    };
    const boot = window.setTimeout(() => void tick(), 350);
    // fallback lento: il WS `live_stream_changed` forza tick subito
    const id = window.setInterval(() => void tick(), Math.max(LIVE_POLL_MS, 120_000));
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    const onLive = (ev: Event) => {
      const detail = String((ev as CustomEvent).detail || "");
      if (detail && detail !== "live_stream") return;
      void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("vc:live-refresh", onLive);
    return () => {
      alive = false;
      window.clearTimeout(boot);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("vc:live-refresh", onLive);
    };
  }, [path, liveOnly]);

  return stream;
}

export function LiveCorner() {
  // Su telefono niente PiP (richiesta prodotto; desktop/tablet fine)
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const sync = () => setPhone(isPhoneNoPip());
    sync();
    const mq = window.matchMedia("(max-width: 900px)");
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  // Twitch: live + ultimo VOD (prima solo live → PiP invisibile se c’era solo VOD)
  const twitch = useShownStream(TWITCH_LIVE_URL, false);
  const kick = useShownStream(KICK_LIVE_URL, false);
  const [open, setOpen] = useState<LivePlatform | null>(null);
  const [chromeOpen, setChromeOpen] = useState(false);
  const twitchHere = Boolean(twitch);
  const kickHere = Boolean(kick);
  const [presence, setPresence] = useState({ twitchHere, kickHere });
  if (presence.twitchHere !== twitchHere || presence.kickHere !== kickHere) {
    setPresence({ twitchHere, kickHere });
    if ((open === "twitch" && !twitchHere) || (open === "kick" && !kickHere)) setOpen(null);
  }

  useEffect(() => useChromeOpenListener(setChromeOpen), []);

  const entries: { platform: LivePlatform; stream: LiveStream }[] = [];
  if (twitch) entries.push({ platform: "twitch", stream: twitch });
  if (kick) entries.push({ platform: "kick", stream: kick });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // menù chrome aperti → nascondi PiP (non coprire nav / account / notif)
  useEffect(() => {
    if (chromeOpen) setOpen(null);
  }, [chromeOpen]);

  // zucche Halloween condividono l’angolo BL a z-40: segnala al decor di farsi da parte
  useEffect(() => {
    if (phone || !entries.length || chromeOpen) {
      try {
        delete document.documentElement.dataset.vcLivePip;
      } catch {
        /* ignore */
      }
      return;
    }
    document.documentElement.dataset.vcLivePip = "1";
    return () => {
      try {
        delete document.documentElement.dataset.vcLivePip;
      } catch {
        /* ignore */
      }
    };
  }, [phone, entries.length, chromeOpen]);

  if (phone || !entries.length || chromeOpen) return null;

  const opened = entries.find((e) => e.platform === open) || null;

  return (
    <div
      data-vc-live-corner
      className="pointer-events-none fixed bottom-4 left-4 z-[55] flex w-[min(17.5rem,calc(100vw-2rem))] flex-col-reverse items-start gap-2 sm:bottom-5 sm:left-5"
    >
      {entries
        .filter((e) => e.platform !== open)
        .map((e) => (
          <LivePill
            key={e.platform}
            platform={e.platform}
            stream={e.stream}
            onOpen={() => setOpen(e.platform)}
          />
        ))}
      <AnimatePresence>
        {opened && (
          <LiveStage
            key={opened.platform}
            platform={opened.platform}
            stream={opened.stream}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LivePill({
  platform,
  stream,
  onOpen,
}: {
  platform: LivePlatform;
  stream: LiveStream;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const live = stream.kind === "live";
  const label = live ? t("live.lastLive") : t("live.lastVod");
  const brand = platform === "twitch" ? t("live.twitch") : t("live.kick");

  return (
    <button
      type="button"
      onClick={onOpen}
      className="pointer-events-auto inline-flex max-w-full items-center gap-1.5 rounded-full bg-roast/90 py-1 pr-2.5 pl-2 text-left shadow-[0_12px_32px_-16px_rgba(212,145,80,0.55)] ring-1 ring-caramel/35 backdrop-blur-md transition hover:-translate-y-0.5 hover:ring-caramel/60"
      aria-label={t("live.pillAria", { name: stream.displayName, platform: brand })}
    >
      <span className="relative flex size-2 shrink-0" aria-hidden>
        {live && (
          <span className="absolute inline-flex size-full rounded-full bg-ember opacity-70 motion-safe:animate-ping" />
        )}
        <span className={`relative m-auto size-1.5 rounded-full ${live ? "bg-ember" : "bg-sand"}`} />
      </span>
      <span className="text-[0.68rem] font-semibold tracking-[0.12em] text-caramel uppercase">{label}</span>
    </button>
  );
}

function LiveStage({
  platform,
  stream,
  onClose,
}: {
  platform: LivePlatform;
  stream: LiveStream;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const live = stream.kind === "live";
  const brand = platform === "twitch" ? t("live.twitch") : t("live.kick");
  const href = externalUrl(stream.url, platform);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <motion.section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto w-full overflow-hidden rounded-2xl bg-gradient-to-b from-caramel/15 to-roast shadow-[0_24px_60px_-28px_rgba(212,145,80,0.4)] ring-1 ring-caramel/45"
    >
      <header className="flex items-start gap-2.5 px-3 pt-2.5 pb-1.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-caramel/15 text-ember ring-1 ring-caramel/25">
          <Radio className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.62rem] font-semibold tracking-[0.18em] text-caramel uppercase">
            {live ? t("live.lastLive") : t("live.lastVod")}
          </p>
          <h2 id={titleId} className="truncate font-display text-lg leading-tight font-semibold text-crema">
            {stream.displayName}
          </h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("live.close")}
          className="rounded-full bg-crema/8 p-2 text-crema ring-1 ring-sand/25 transition hover:bg-crema/12"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      {platform === "twitch" ? (
        <TwitchPlayer key={stream.id} stream={stream} />
      ) : (
        <KickPlayer key={stream.id} stream={stream} />
      )}

      <div className="space-y-1.5 px-3 pt-2 pb-3">
        {stream.title && <p className="line-clamp-2 text-xs text-crema/90">{stream.title}</p>}
        <p className="text-[0.7rem] text-sand">
          {stream.category ? `${stream.category} · ` : ""}
          <span className="lining-nums">{countLine(locale, stream, t)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-caramel to-ember px-2.5 py-1 text-xs font-semibold text-ink transition hover:-translate-y-0.5"
            >
              {platform === "twitch" ? t("live.openTwitch") : t("live.openKick")}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
          {platform === "kick" && <KickSubButton fallbackUrl={href} />}
        </div>
      </div>
    </motion.section>
  );
}

function Poster({ stream, children }: { stream: LiveStream; children?: ReactNode }) {
  return (
    <div className="relative aspect-video w-full bg-espresso">
      {stream.thumbnailUrl ? (
        <Image src={stream.thumbnailUrl} alt="" fill sizes="17.5rem" className="object-cover" unoptimized />
      ) : (
        <div className="size-full bg-[radial-gradient(circle_at_30%_20%,rgba(212,145,80,0.28),transparent_55%)]" />
      )}
      {children}
    </div>
  );
}

function PlayPlate({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute inset-0 flex items-center justify-center bg-espresso/25"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-r from-caramel to-ember text-ink shadow-[0_16px_40px_-12px_rgba(212,145,80,0.8)] ring-1 ring-crema/30 transition hover:scale-105">
        <Play className="ml-0.5 size-6 fill-current" aria-hidden />
      </span>
    </button>
  );
}

function TwitchPlayer({ stream }: { stream: LiveStream }) {
  const { t } = useI18n();
  const [on, setOn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const src = on && stream.embedUrl ? withEmbedParent(stream.embedUrl) : "";

  useEffect(() => {
    if (!on) return;
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setScale(w > 0 ? w / 400 : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);

  if (!stream.embedUrl) return <Poster stream={stream} />;

  return (
    <Poster stream={stream}>
      {!on && <PlayPlate label={t("live.play")} onClick={() => setOn(true)} />}
      {on && (
        <div ref={box} className="absolute inset-0 overflow-hidden bg-espresso">
          <iframe
            key={stream.id}
            src={src}
            title={t("live.playerTwitch")}
            className="absolute top-0 left-0 h-[225px] w-[400px] border-0"
            style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="origin-when-cross-origin"
          />
        </div>
      )}
    </Poster>
  );
}

function KickPlayer({ stream }: { stream: LiveStream }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [locked, setLocked] = useState(() => loadWatch(stream.id).locked);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const href = externalUrl(stream.url, "kick");

  useEffect(() => () => {
    flushWatch(stream.id);
  }, [stream.id]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) flushWatch(stream.id);
      else if (videoRef.current && !videoRef.current.paused) beginWatch(stream.id);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stream.id]);

  useEffect(() => {
    if (!on || locked) return;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (document.hidden || !v || v.paused || v.ended) {
        flushWatch(stream.id);
        return;
      }
      const st = flushWatch(stream.id);
      if (!st.locked && st.watchedMs < KICK_PREVIEW_LIMIT_MS) {
        beginWatch(stream.id);
        return;
      }
      v.pause();
      v.removeAttribute("src");
      v.load();
      setLocked(true);
      setOn(false);
    }, 1000);
    return () => window.clearInterval(id);
  }, [on, locked, stream.id]);

  const play = useCallback(() => {
    const st = beginWatch(stream.id);
    if (st.locked) {
      setLocked(true);
      return;
    }
    const src = kickPlayableUrl(stream);
    const v = videoRef.current;
    if (!src || !v) {
      setFailed(true);
      return;
    }
    if (!v.src.endsWith(src)) v.src = src;
    v.muted = true;
    setMuted(true);
    setOn(true);
    setFailed(false);
    void v.play().catch(() => {
      flushWatch(stream.id);
      setOn(false);
      setFailed(true);
    });
  }, [stream]);

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  return (
    <Poster stream={stream}>
      <video
        ref={videoRef}
        className={on && !locked ? "absolute inset-0 size-full bg-espresso object-contain" : "hidden"}
        playsInline
        loop
        preload="none"
        aria-label={t("live.playerKick")}
        poster={stream.thumbnailUrl || undefined}
        onPlay={() => {
          if (!loadWatch(stream.id).locked) beginWatch(stream.id);
        }}
        onError={() => {
          flushWatch(stream.id);
          setOn(false);
          setFailed(true);
        }}
      />
      {!on && !locked && !failed && <PlayPlate label={t("live.play")} onClick={play} />}
      {(locked || failed) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-espresso/80 px-5 text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-caramel uppercase">
            {locked ? t("live.previewEnded") : t("live.previewFail")}
          </p>
          <p className="max-w-xs text-sm text-crema/85">
            {locked ? t("live.previewLimit") : t("live.previewFailHint")}
          </p>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 rounded-full bg-gradient-to-r from-caramel to-ember px-3.5 py-1.5 text-sm font-semibold text-ink"
            >
              {t("live.openKick")}
            </a>
          )}
        </div>
      )}
      {on && !locked && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? t("live.unmute") : t("live.mute")}
          className="absolute right-2 bottom-2 rounded-full bg-espresso/75 p-2 text-crema ring-1 ring-sand/30"
        >
          {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
        </button>
      )}
    </Poster>
  );
}

function KickSubButton({ fallbackUrl }: { fallbackUrl: string | null }) {
  const { t } = useI18n();
  const { token, user, login } = useAuth();
  const [status, setStatus] = useState<KickSubStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [seenToken, setSeenToken] = useState(token);
  if (seenToken !== token) {
    setSeenToken(token);
    if (!token) setStatus(null);
  }

  const applyStatus = useCallback((next: KickSubStatus | "disabled" | null) => {
    if (next === "disabled") {
      setHidden(true);
      setStatus(null);
      return;
    }
    if (next) setStatus(next);
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const pull = () => {
      void fetchKickSubStatus(token).then((next) => {
        if (alive) applyStatus(next);
      });
    };
    pull();
    window.addEventListener("focus", pull);
    return () => {
      alive = false;
      window.removeEventListener("focus", pull);
    };
  }, [token, applyStatus]);

  if (hidden) return null;

  const linked = !!status?.linked;
  const active = linked && !!status?.subActive;
  const label = !token || !user ? t("live.subLogin") : active ? t("live.subActive") : linked ? t("live.subLinked") : t("live.sub");

  async function onClick() {
    setNote(null);
    if (!token || !user) {
      login();
      return;
    }
    if (active) {
      const url = status?.subscribeUrl || fallbackUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (linked) {
      setNote(t("live.subLinkedHint"));
      return;
    }
    setBusy(true);
    const out = await startKickSubLink(token);
    setBusy(false);
    if (out.disabled) {
      setHidden(true);
      return;
    }
    if (out.status === 401) {
      login();
      return;
    }
    if (out.url) {
      location.assign(out.url);
      return;
    }
    setNote(t("live.subError"));
  }

  const openKick = status?.subscribeUrl || fallbackUrl;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        className="inline-flex items-center rounded-full bg-crema/8 px-3.5 py-1.5 text-sm font-semibold text-crema ring-1 ring-sand/25 transition hover:-translate-y-0.5 hover:ring-sand/40 disabled:opacity-60"
      >
        {busy ? t("common.loading") : label}
      </button>
      {note && (
        <div className="rounded-2xl bg-caramel/10 px-3 py-2 text-xs leading-relaxed text-crema ring-1 ring-caramel/25">
          <p>{note}</p>
          {openKick && (
            <a
              href={openKick}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex font-semibold text-ember underline-offset-2 hover:underline"
            >
              {t("live.openKick")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
