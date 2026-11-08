"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BadgeCheck, Cake, Check, Copy, Link2, UserRound } from "lucide-react";
import { page } from "@/lib/site";
import { Avatar } from "@/components/Avatar";
import { BirthdayCalendar } from "@/components/profile/BirthdayCalendar";
import { badges, dateIt, fmt, type ProfileData } from "@/lib/profile";
import { cn } from "@/lib/cn";
import { sizedDiscordCdn } from "@/lib/discord-cdn";
import { useFxCap } from "@/components/effects/DeviceFxProvider";
import { useTilt } from "@/components/ui/tilted-card";
import {
  HeroBackdrop,
  HERO_ATMO_BAND,
  HERO_ATMO_VIDEO,
  HERO_ATMO_VIDEO_MOBILE,
} from "@/components/HeroBackdrop";

const ease = [0.22, 1, 0.36, 1] as const;

/** Versione ferma + size CDN (avatar/banner animati: .gif → .png). */
function staticImageUrl(url: string, size = 256): string {
  return sizedDiscordCdn(url, size) || url;
}

function AlbumCoverGlow({ src }: { src: string }) {
  const blur = useFxCap("blur");
  if (!blur) {
    return <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_40%_20%,rgba(212,145,80,0.18),transparent_55%)]" aria-hidden />;
  }
  return <img src={src} alt="" className="absolute inset-0 -z-20 size-full scale-125 object-cover opacity-25 blur-3xl" />;
}

/** Testata profilo: avatar + livello / EXP. */
export function AlbumCover({
  p,
  tab = "community",
  showStaffTab = false,
  onTab,
}: {
  p: ProfileData;
  tab?: "community" | "staff";
  showStaffTab?: boolean;
  onTab?: (t: "community" | "staff") => void;
}) {
  const reduce = useReducedMotion();
  // la copertina si inclina verso il mouse come un vinile preso in mano
  const tilt = useTilt(10);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [bdayOpen, setBdayOpen] = useState(false);
  const lv = p.level;
  const cur = lv ? Math.max(0, lv.exp - lv.currentLevelExp) : 0;
  const tot = lv ? Math.max(1, lv.nextLevelExp - lv.currentLevelExp) : 1;
  const pct = Math.max(0, Math.min(100, Math.round(lv?.progressPercent ?? 0)));
  const b = badges(p.roles);
  const staffMode = tab === "staff";

  const copy = () => {
    navigator.clipboard?.writeText(p.userId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const copyProfileLink = () => {
    const url = `${typeof location !== "undefined" ? location.origin : ""}${page(`/user/?id=${p.userId}`)}`;
    navigator.clipboard?.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    });
  };

  return (
    <section className={cn("relative isolate overflow-x-clip pb-16 sm:pb-24", showStaffTab ? "pt-20 sm:pt-24" : "pt-16 sm:pt-20")}>
      {/* stessa atmosfera café delle altre pagine interne */}
      <HeroBackdrop
        priority
        poster={HERO_ATMO_BAND}
        videoSrc={HERO_ATMO_VIDEO}
        videoSrcMobile={HERO_ATMO_VIDEO_MOBILE}
        imgClassName="size-full object-cover opacity-55 sm:opacity-60"
        objectPosition="50% 42%"
      />
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(ellipse 90% 45% at 50% 0%, rgba(217,154,91,0.16), transparent 55%)",
            "linear-gradient(to bottom, rgba(14,9,6,0.5) 0%, rgba(14,9,6,0.78) 42%, rgba(14,9,6,0.94) 78%, var(--color-espresso) 100%)",
          ].join(", "),
        }}
      />
      {/* blur-3xl solo su device rich; altrimenti alone statico (meno GPU) */}
      {p.avatarUrl ? (
        <AlbumCoverGlow src={staticImageUrl(p.avatarUrl)} />
      ) : null}

      {showStaffTab && onTab && (
        <div className="relative z-20 mx-auto mb-5 flex max-w-5xl justify-center px-6 sm:mb-6">
          <div role="tablist" aria-label="Sezione profilo" className="inline-flex rounded-full bg-roast/95 p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.85)] ring-1 ring-sand/25 backdrop-blur">
            {(["community", "staff"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => onTab(t)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors",
                  tab === t ? "bg-crema text-espresso" : "text-crema/65 hover:text-crema",
                )}
              >
                {t === "staff" ? <BadgeCheck className="size-4" /> : <UserRound className="size-4" />} {t === "staff" ? "Staff" : "Community"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="scheme-dark mx-auto grid max-w-5xl items-center gap-10 px-6 md:grid-cols-[auto_1fr] md:gap-14">
        <div className="relative mx-auto aspect-square w-56 overflow-visible sm:w-72 md:mr-10" style={{ perspective: 900 }} {...tilt.handlers}>
          <motion.div
            initial={{ x: "0%", rotate: 0 }}
            animate={{ x: "28%", rotate: reduce ? 0 : 200 }}
            transition={{ delay: 0.3, duration: 1.4, ease }}
            aria-hidden
            className="pointer-events-none absolute inset-[4%] rounded-full bg-[repeating-radial-gradient(circle,#0b0705_0_1.5px,#1e140e_1.5px_3px)] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.95)] ring-1 ring-black/60"
          >
            <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_210deg,transparent,rgba(255,240,220,0.12)_40deg,transparent_80deg,transparent_200deg,rgba(255,240,220,0.06)_230deg,transparent_260deg)]" />
            <span className="absolute inset-[34%] overflow-hidden rounded-full ring-1 ring-white/20">
              <Avatar userId={p.userId} src={p.avatarUrl ? staticImageUrl(p.avatarUrl) : p.avatarUrl} name={p.displayName} className="size-full text-2xl" />
            </span>
            <span className="absolute left-1/2 top-1/2 size-[4%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-espresso" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            style={tilt.style}
            className="absolute inset-0 overflow-hidden rounded-md bg-mocha shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/20"
          >
            <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ background: tilt.glare, opacity: tilt.glareOpacity }} />
            <Avatar userId={p.userId} src={p.avatarUrl} name={p.displayName} className="size-full rounded-none text-7xl" noPresence />
            <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,240,220,0.18),transparent_35%,transparent_70%,rgba(0,0,0,0.35))]" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-3 pt-10">
              <span className="block font-display text-sm uppercase tracking-[0.3em] text-crema/80">VINILI & CAFFÈ</span>
            </span>
            {lv?.rank === 1 && (
              <span className="absolute right-3 top-3 rotate-6 rounded-full bg-ember px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider text-ink shadow-lg">N°1 in classifica</span>
            )}
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.8, ease }} className="min-w-0 text-center md:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">{staffMode ? "Profilo staff" : "Profilo"}</p>
          <h1 className="mt-2 break-words font-display text-4xl font-semibold leading-tight sm:text-6xl">{p.displayName}</h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-crema/55 md:justify-start">
            {p.username && <span>@{p.username}</span>}
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 font-mono text-xs lining-nums transition-colors hover:text-crema" title="Copia l'ID">
              {copied ? <Check className="size-3.5 text-ember" /> : <Copy className="size-3.5" />} {p.userId}
            </button>
            <button
              type="button"
              onClick={copyProfileLink}
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/6 px-2.5 py-0.5 text-xs font-medium text-crema/65 ring-1 ring-sand/15 transition-colors hover:bg-crema/10 hover:text-crema"
            >
              {linkCopied ? <Check className="size-3.5 text-ember" /> : <Link2 className="size-3.5" />}
              {linkCopied ? "Link copiato!" : "Copia link profilo"}
            </button>
            {p.birthday && (
              <button
                type="button"
                onClick={() => setBdayOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={bdayOpen}
                aria-label={`Compleanno: ${p.birthday.label || ""} — apri calendario`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  p.birthday.isToday
                    ? "bg-ember/20 text-ember ring-1 ring-ember/40 hover:bg-ember/30"
                    : "bg-crema/6 text-crema/65 ring-1 ring-sand/15 hover:bg-crema/10 hover:text-crema",
                )}
              >
                <Cake className="size-3.5" />
                {p.birthday.isToday ? "Oggi è il suo compleanno!" : p.birthday.showAge === false ? p.birthday.label?.replace(/\s\d{4}$/, "") : p.birthday.label}
              </button>
            )}
          </div>
          {p.joinedAt && p.inGuild && <p className="mt-2 text-sm text-crema/45">Nel server dal {dateIt(p.joinedAt)}</p>}
          {!p.inGuild && <p className="mt-2 text-sm text-crema/45">Non è più nel server Discord</p>}

          {b.length > 0 && (
            <ul className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
              {b.map((x, i) => (
                <li
                  key={x.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1 text-xs font-bold text-ink shadow-[0_6px_14px_-6px_rgba(0,0,0,0.8)]",
                    i % 2 ? "rotate-2" : "-rotate-2",
                  )}
                >
                  {x.iconUrl && <img src={x.iconUrl} alt="" className="size-4" />}
                  {x.label}
                </li>
              ))}
            </ul>
          )}

          {!staffMode && lv && (
            <div className="mt-7 flex items-center gap-4">
              {/* anello del livello (Animated Circular Progress di Magic UI) */}
              <div
                className="relative size-20 shrink-0"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label="Avanzamento livello"
              >
                <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
                  <defs>
                    <linearGradient id="vc-lv-ring" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="var(--color-caramel)" />
                      <stop offset="1" stopColor="var(--color-ember)" />
                    </linearGradient>
                  </defs>
                  <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-crema/10" />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    strokeWidth="9"
                    strokeLinecap="round"
                    stroke="url(#vc-lv-ring)"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: pct / 100 }}
                    transition={{ delay: 0.5, duration: 1.2, ease }}
                  />
                </svg>
                <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <span className="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-crema/50">Lv</span>
                  <span className="font-display text-2xl font-semibold lining-nums">{lv.level}</span>
                </span>
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-display text-2xl font-semibold lining-nums">Livello {lv.level}</p>
                <p className="mt-0.5 text-crema/55 lining-nums">
                  {fmt(cur)} / {fmt(tot)} EXP
                </p>
                <p className="mt-0.5 text-xs text-caramel lining-nums">
                  {pct}% verso il livello {lv.level + 1}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <BirthdayCalendar open={bdayOpen} onClose={() => setBdayOpen(false)} highlightUserId={p.userId} />
    </section>
  );
}
