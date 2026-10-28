"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from "motion/react";
import { Coffee, Crown, Gem, MessageCircle, Mic2, Moon, Sun, Sunset, UserCheck, Users } from "lucide-react";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  loadStatsBundle,
  type BoostMember,
  type HourSlot,
  type StaffGroup,
  type Stats,
  type StatsExtra,
} from "@/lib/stats";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { timeAgoMs } from "@/lib/time";
import { Avatar } from "@/components/Avatar";
import { Reveal } from "./Reveal";
import { cn } from "@/lib/cn";
import { AvatarCircles } from "./ui/avatar-circles";

function userIdFromProfile(url?: string) {
  if (!url) return "";
  try {
    const u = new URL(url, "https://www.viniliecaffe.it");
    return String(u.searchParams.get("id") || u.searchParams.get("userId") || "").trim();
  } catch {
    return "";
  }
}

function nfLocale(locale: Locale) {
  const map: Partial<Record<Locale, string>> = { it: "it-IT", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR" };
  return map[locale] || locale;
}

type RosterKind = "members" | "online" | "boosts" | "staff" | null;

function CountUp({ value, locale }: { value: number; locale: Locale }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const reduce = useReducedMotion();
  const shown = useRef(0);
  const nf = new Intl.NumberFormat(nfLocale(locale));

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduce) {
      el.textContent = nf.format(value);
      shown.current = value;
      return;
    }
    const controls = animate(shown.current, value, {
      duration: shown.current === 0 ? 1.6 : 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = nf.format(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [inView, value, reduce, nf]);

  return (
    <span ref={ref} className="lining-nums tabular-nums">
      {nf.format(value)}
    </span>
  );
}

function TinyPerson({
  name,
  avatarUrl,
  profileUrl,
  tip,
}: {
  name: string;
  avatarUrl?: string;
  profileUrl?: string;
  tip?: string;
}) {
  const uid = userIdFromProfile(profileUrl);
  const inner = (
    <Avatar userId={uid || undefined} src={avatarUrl} name={name} className="size-7 bg-crema/10 ring-1 ring-sand/20" />
  );
  if (profileUrl) {
    return (
      <a href={profileUrl} className="transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]" title={tip || name}>
        {inner}
      </a>
    );
  }
  return <span title={tip || name}>{inner}</span>;
}

/** Ordine roster staff homepage (niente High Staff / Staff generico). */
const STAFF_ROSTER_SLOTS: { id: string; label: string }[] = [
  { id: "1442568886988963923", label: "Founder" },
  { id: "1521562607339704442", label: "Manager" },
  { id: "1442568893435478097", label: "Admin" },
  { id: "1544831236868931636", label: "Senior Moderator" },
  { id: "1442568901887000618", label: "Moderator" },
  { id: "1442568904311570555", label: "Helper" },
  { id: "1544831242510270464", label: "Partner Manager" },
  { id: "1557507157899878533", label: "Blogger" },
];

const PARTNER_MANAGER_ROLE_ID = "1544831242510270464";
const BLOGGER_ROLE_ID = "1557507157899878533";
/** Ruoli nel roster dettaglio ma fuori dal conteggio grande `staffNoPm` (e dalle facce anteprima). */
const STAFF_COUNT_EXCLUDED = new Set([PARTNER_MANAGER_ROLE_ID, BLOGGER_ROLE_ID]);

function normRoleLabel(label: string) {
  return String(label || "")
    .toLowerCase()
    .replace(/^༄\s*/, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericStaffRole(label: string) {
  const n = normRoleLabel(label);
  return n === "staff" || n === "high staff" || n === "highstaff";
}

/** Sempre tutte le slot: Founder…Blogger, anche se vuote. */
function buildStaffRoster(raw: StaffGroup[]): StaffGroup[] {
  const byId = new Map<string, StaffGroup>();
  const byLabel = new Map<string, StaffGroup>();
  for (const g of raw) {
    if (isGenericStaffRole(g.role)) continue;
    const id = String(g.roleId || "").trim();
    if (id) byId.set(id, g);
    const lab = normRoleLabel(g.role);
    if (lab) byLabel.set(lab, g);
  }
  return STAFF_ROSTER_SLOTS.map((slot) => {
    const hit = byId.get(slot.id) || byLabel.get(normRoleLabel(slot.label));
    return {
      roleId: slot.id,
      role: slot.label,
      members: Array.isArray(hit?.members) ? hit.members : [],
    };
  });
}

/** Riga booster come sul vecchio sito: avatar + nome + badge “N boost”. */
function BoostRow({ m, t }: { m: BoostMember; t: (k: string, v?: Record<string, string | number>) => string }) {
  const count = Math.max(1, Math.min(2, Math.floor(Number(m.boostCount || 1))));
  const uid = userIdFromProfile(m.profileUrl);
  const inner = (
    <>
      <Avatar userId={uid || undefined} src={m.avatarUrl} name={m.name} className="size-9 shrink-0 bg-crema/10 ring-1 ring-sand/20" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-crema">{m.name}</span>
      <span className="shrink-0 rounded-full bg-gradient-to-br from-[#6b4218] to-[#3f2a12] px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-[0.08em] text-[#fff8f0] ring-1 ring-[rgba(245,214,183,0.42)]">
        {t("stats.boostCount", { n: count })}
      </span>
    </>
  );
  const cls =
    "flex min-h-[2.7rem] items-center gap-2.5 overflow-hidden rounded-[0.8rem] bg-roast px-2.5 py-1.5 ring-1 ring-sand/10 transition hover:bg-mocha hover:ring-sand/30";
  if (m.profileUrl) {
    return (
      <a href={m.profileUrl} className={cls}>
        {inner}
      </a>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function RosterBody({
  kind,
  extra,
  t,
}: {
  kind: Exclude<RosterKind, null>;
  extra: StatsExtra | null;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  if (kind === "staff") {
    const groups = buildStaffRoster((extra?.staffHoverGroups || []) as StaffGroup[]);
    // Stesso perimetro del numero grande: escludi PM + Blogger dal conteggio (restano nelle colonne sotto).
    const people = new Set(
      groups
        .filter((g) => !STAFF_COUNT_EXCLUDED.has(String(g.roleId || "")))
        .flatMap((g) => g.members.map((m) => m.profileUrl || m.name)),
    ).size;
    return (
      <div>
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-caramel">{t("stats.staffKicker")}</p>
            <p className="mt-0.5 text-sm text-crema/55">{t("stats.staffCount", { people })}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groups.map((g) => (
            <section
              key={g.roleId || g.role}
              className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/85 to-roast px-3 py-2.5 ring-1 ring-sand/10"
            >
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-caramel/90">{g.role}</p>
              {g.members.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.members.map((m) => (
                    <TinyPerson
                      key={`${g.role}-${m.name}`}
                      name={m.name}
                      avatarUrl={m.avatarUrl}
                      profileUrl={m.profileUrl}
                      tip={[m.name, m.isOwner ? t("stats.owner") : "", m.isPaused ? t("stats.paused") : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-crema/35">—</p>
              )}
            </section>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "boosts") {
    const list = (extra?.boostHoverMembers || []) as BoostMember[];
    if (!list.length) return <p className="px-2 py-3 text-sm text-crema/50">{t("stats.rosterEmpty")}</p>;
    const totalBoosts = list.reduce((s, m) => s + Math.max(1, Math.floor(Number(m.boostCount || 1))), 0);
    return (
      <div>
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-caramel">{t("stats.boostersKicker")}</p>
            <p className="mt-0.5 text-sm text-crema/55">
              {t("stats.boostersCount", { people: list.length, boosts: totalBoosts })}
            </p>
          </div>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <li key={m.name} className="min-w-0">
              <BoostRow m={m} t={t} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // members / online: gestiti fuori (MembersPulseBody / HoursBody)
  return null;
}

function formatPulseNum(n: number, locale: Locale) {
  return new Intl.NumberFormat(nfLocale(locale)).format(Math.max(0, Math.round(n)));
}

function MembersPulseBody({
  pulse,
  locale,
  t,
}: {
  pulse: NonNullable<StatsExtra["memberPulse"]>;
  locale: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const voiceH = pulse.voiceSeconds7d != null ? Math.round(pulse.voiceSeconds7d / 3600) : null;
  const cards = [
    pulse.messages7d != null && pulse.messages7d > 0
      ? {
          id: "msg",
          icon: MessageCircle,
          value: formatPulseNum(pulse.messages7d, locale),
          label: t("stats.pulseMessagesLabel"),
          hint: t("stats.pulseMessagesHint"),
        }
      : null,
    voiceH != null && voiceH > 0
      ? {
          id: "voice",
          icon: Mic2,
          value: `${formatPulseNum(voiceH, locale)} h`,
          label: t("stats.pulseVoiceLabel"),
          hint: t("stats.pulseVoiceHint"),
        }
      : null,
    pulse.activeMembers7d != null && pulse.activeMembers7d > 0
      ? {
          id: "active",
          icon: UserCheck,
          value: formatPulseNum(pulse.activeMembers7d, locale),
          label: t("stats.pulseActiveLabel"),
          hint: t("stats.pulseActiveHint"),
        }
      : null,
  ].filter(Boolean) as { id: string; icon: typeof MessageCircle; value: string; label: string; hint: string }[];

  if (!cards.length) return <p className="px-2 py-3 text-sm text-crema/50">{t("stats.rosterEmpty")}</p>;

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-caramel">{t("stats.pulseKicker")}</p>
          <p className="mt-0.5 text-sm text-crema/55">{t("stats.pulseSub")}</p>
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {cards.map((c, i) => (
          <li key={c.id}>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-full overflow-hidden rounded-2xl bg-gradient-to-b from-crema/[0.07] to-crema/[0.02] px-4 py-4 ring-1 ring-sand/12"
            >
              <div className="absolute -right-4 -top-4 size-20 rounded-full bg-caramel/10 blur-2xl" />
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-caramel/15 text-caramel ring-1 ring-caramel/25">
                <c.icon className="size-4" />
              </span>
              <p className="mt-3 font-display text-3xl font-semibold lining-nums tabular-nums text-crema sm:text-4xl">{c.value}</p>
              <p className="mt-1 text-sm font-semibold text-crema/85">{c.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-crema/45">{c.hint}</p>
            </motion.div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function bandIconFor(slot: HourSlot) {
  const key = `${slot.id || ""} ${slot.label || ""}`.toLowerCase();
  if (key.includes("mattina") || key.includes("morning")) return Coffee;
  if (key.includes("pomeriggio") || key.includes("afternoon")) return Sun;
  if (key.includes("sera") || key.includes("evening")) return Sunset;
  if (key.includes("notte") || key.includes("night")) return Moon;
  return Sun;
}

function HoursBody({
  slots,
  blurb,
  onlineNow,
  locale,
  t,
}: {
  slots: HourSlot[];
  blurb?: string;
  onlineNow?: number;
  locale: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-caramel">{t("stats.hoursKicker")}</p>
          <p className="mt-0.5 text-sm text-crema/55">{t("stats.hoursSub")}</p>
        </div>
        {onlineNow != null && onlineNow > 0 ? (
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/25">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            {t("stats.hoursOnlineNow", { n: formatPulseNum(onlineNow, locale) })}
          </p>
        ) : null}
      </div>
      {blurb ? <p className="mb-4 max-w-2xl px-1 text-sm leading-relaxed text-crema/60">{blurb}</p> : null}
      {!slots.length ? (
        <p className="px-1 text-sm text-crema/50">{t("stats.rosterEmpty")}</p>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {slots.map((s, i) => {
            const BandIcon = bandIconFor(s);
            const pct = Math.min(100, Math.max(8, Number(s.pct) || 0));
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "rounded-2xl px-4 py-3.5 ring-1 transition-colors",
                  s.hottest ? "bg-gradient-to-br from-caramel/15 to-ember/5 ring-caramel/35" : "bg-crema/[0.04] ring-sand/12",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
                      s.hottest ? "bg-caramel/20 text-ember ring-caramel/30" : "bg-crema/8 text-caramel ring-sand/15",
                    )}
                  >
                    <BandIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="font-semibold text-crema">{s.label || s.range}</p>
                      {s.range && s.label ? <span className="text-xs tabular-nums text-crema/40">{s.range}</span> : null}
                      {s.hottest ? (
                        <span className="rounded-full bg-ember/20 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-ember">
                          {t("stats.hoursHot")}
                        </span>
                      ) : null}
                    </div>
                    {s.hint ? <p className="mt-1 text-xs leading-snug text-crema/50">{s.hint}</p> : null}
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-crema/10">
                      <motion.div
                        className={cn("h-full rounded-full", s.hottest ? "bg-gradient-to-r from-caramel to-ember" : "bg-caramel/70")}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatsUpdatedAgo({ atMs }: { atMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const label = timeAgoMs(atMs, now);
  if (!label) return null;
  return <p className="mt-2 text-xs text-crema/40">Ultimo aggiornamento {label}</p>;
}

export function LiveStats({ initial }: { initial: Stats }) {
  const { t, locale } = useI18n();
  const [stats, setStats] = useState(initial);
  const [extra, setExtra] = useState<StatsExtra | null>(null);
  const [open, setOpen] = useState<RosterKind>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const pull = useCallback(() => {
    return loadStatsBundle("", initial).then((b) => {
      setStats(b.stats);
      setExtra(b.extra);
      setFetchedAt(Date.now());
    });
  }, [initial]);

  useLiveRefresh(pull, { intervalMs: 120_000, topics: ["live_stats"] });

  const items: {
    id: Exclude<RosterKind, null>;
    icon: typeof Users;
    label: string;
    value: number;
    live?: boolean;
  }[] = [
    { id: "members", icon: Users, label: t("stats.members"), value: stats.members },
    { id: "online", icon: Coffee, label: t("stats.online"), value: stats.online, live: true },
    { id: "boosts", icon: Gem, label: t("stats.boosts"), value: stats.boosts },
    { id: "staff", icon: Crown, label: t("stats.staff"), value: stats.staff },
  ];

  const boosters = (extra?.boostHoverMembers || []).map((m) => ({ name: m.name, avatarUrl: m.avatarUrl }));
  // stessa persona in più ruoli (e nei ruoli generici Staff/High Staff) = una faccia sola
  const staffSeen = new Set<string>();
  // Allinea alle facce il numero grande (`staffNoPm`): niente Partner Manager né Blogger in anteprima
  // (chi ha anche un ruolo staff resta dagli altri gruppi).
  const staffPeople = buildStaffRoster((extra?.staffHoverGroups || []) as StaffGroup[])
    .filter((g) => !STAFF_COUNT_EXCLUDED.has(String(g.roleId || "")))
    .flatMap((g) => g.members)
    .filter((m) => {
      const k = m.profileUrl || m.name;
      if (staffSeen.has(k)) return false;
      staffSeen.add(k);
      return true;
    })
    .map((m) => ({ name: m.name, avatarUrl: m.avatarUrl }));

  // anteprima facce anche su Membri / Online (stesso pattern Boost/Staff; niente API dedicata → pool community)
  const memberFaces = (() => {
    const seen = new Set<string>();
    const out: { name: string; avatarUrl?: string }[] = [];
    for (const p of [...boosters, ...staffPeople]) {
      const k = p.name;
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(p);
      if (out.length >= 12) break;
    }
    return out;
  })();
  const onlineFaces = (() => {
    const seen = new Set<string>();
    const out: { name: string; avatarUrl?: string }[] = [];
    for (const p of [...staffPeople, ...boosters]) {
      const k = p.name;
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(p);
      if (out.length >= 12) break;
    }
    return out;
  })();

  const toggle = (id: Exclude<RosterKind, null>) => setOpen((cur) => (cur === id ? null : id));
  const hours = extra?.communityHours;

  return (
    <section id="numeri" className="relative scroll-mt-28 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_60%_80%_at_50%_0%,rgba(217,154,91,0.12),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-6">
      <Reveal className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">{t("stats.kicker")}</p>
        <h2 className="mt-3 font-display text-4xl font-semibold text-balance sm:text-5xl">
          {t("stats.title")}
        </h2>
        {fetchedAt ? <StatsUpdatedAgo atMs={fetchedAt} /> : null}
      </Reveal>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((it, i) => (
          <Reveal key={it.id} delay={i * 0.08}>
            <motion.button
              type="button"
              onClick={() => toggle(it.id)}
              aria-expanded={open === it.id}
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={cn(
                "relative w-full overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.12] via-mocha/80 to-roast p-5 text-left ring-1 transition-[box-shadow,ring-color] duration-200 sm:p-7",
                open === it.id ? "ring-caramel/55 shadow-[0_20px_48px_-24px_rgba(212,145,80,0.75)]" : "ring-sand/18 hover:ring-sand/30",
              )}
            >
              <div className="absolute -right-6 -top-6 size-28 rounded-full bg-ember/15 blur-2xl" />
              <div className="flex items-center gap-2 text-sm text-crema/70">
                <it.icon className="size-4 text-caramel" />
                {it.label}
                {it.live && (
                  <span className="relative ml-auto flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
                  </span>
                )}
              </div>
              <div className="mt-3 font-display text-4xl font-semibold text-crema sm:text-5xl">
                <CountUp value={it.value} locale={locale} />
              </div>
              {/* facce anteprima su tutte e 4 le card */}
              {(() => {
                const people =
                  it.id === "boosts"
                    ? boosters
                    : it.id === "staff"
                      ? staffPeople
                      : it.id === "members"
                        ? memberFaces
                        : onlineFaces;
                if (!people.length) return <div className="mt-3 h-8" aria-hidden />;
                return (
                  <AvatarCircles
                    className="mt-3"
                    people={people}
                    total={people.length}
                    label={t("stats.staffCount", { people: people.length })}
                    max={4}
                  />
                );
              })()}
              <p className="mt-2 text-[0.7rem] text-crema/45">{open === it.id ? t("stats.hideDetail") : t("stats.showDetail")}</p>
            </motion.button>
          </Reveal>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {open && (
          <motion.div
            key={open}
            initial={{ opacity: 0, y: 12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 8, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.08] via-mocha/70 to-roast/90 p-4 ring-1 ring-sand/18 sm:p-5"
          >
            {open === "members" ? (
              extra?.memberPulse ? (
                <MembersPulseBody pulse={extra.memberPulse} locale={locale} t={t} />
              ) : (
                <p className="px-2 py-3 text-sm text-crema/50">{t("stats.rosterEmpty")}</p>
              )
            ) : open === "online" ? (
              <HoursBody
                slots={hours?.slots || []}
                blurb={hours?.blurb}
                onlineNow={stats.online}
                locale={locale}
                t={t}
              />
            ) : (
              <RosterBody kind={open} extra={extra} t={t} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </section>
  );
}
