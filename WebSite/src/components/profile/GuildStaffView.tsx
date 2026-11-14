"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Award, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Handshake, Loader2, Search, Target, Users, Zap } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { EmojiText } from "@/components/discord/EmojiText";
import { loadGuildStaff, objectiveProgress, type GuildStaff, type GuildStaffManager } from "@/lib/profile";
import { showToast } from "@/components/ui";
import { PartnerProfile } from "@/components/dashboard/ProfileBoard";
import { cn } from "@/lib/cn";

/** "Lista staff" dei Partner Manager del server: frecce, posizione e menu con ricerca. */
function PmNavigator({ list, current, onGo }: { list: GuildStaffManager[]; current: string; onGo: (id: string) => void }) {
  const i = list.findIndex((m) => m.userId === current);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  if (!list.length) return null;
  const go = (id?: string) => id && (setOpen(false), onGo(id));
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const shown = list.filter((m) => !q || norm(m.displayName).includes(norm(q)));

  return (
    <div ref={box} className="relative flex items-center gap-1 rounded-full bg-roast/80 p-1 ring-1 ring-sand/15" aria-label="Navigazione Partner Manager">
      <button type="button" aria-label="Partner Manager precedente" disabled={i <= 0} onClick={() => go(list[i - 1]?.userId)} className="rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema disabled:opacity-30">
        <ChevronLeft className="size-4" />
      </button>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-crema/8">
        <Users className="size-4 text-caramel" /> Lista staff <span className="text-crema/45 lining-nums">{i >= 0 ? `${i + 1}/${list.length}` : list.length}</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <button type="button" aria-label="Partner Manager successivo" disabled={i < 0 || i >= list.length - 1} onClick={() => go(list[i + 1]?.userId)} className="rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema disabled:opacity-30">
        <ChevronRight className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute left-1/2 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl bg-roast/95 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl"
          >
            <label htmlFor="pm-search" className="flex items-center gap-2 border-b border-sand/10 px-3">
              <Search className="size-4 text-crema/40" />
              <input id="pm-search" name="pm-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un Partner Manager…" className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-crema/35" />
            </label>
            <div className="max-h-80 overflow-y-auto p-1.5">
              <p className="px-2 pb-1 pt-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-caramel">Partner Manager</p>
              {shown.map((m) => (
                <button key={m.userId} type="button" onClick={() => go(m.userId)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-crema/[0.06]", m.userId === current && "bg-caramel/12 text-ember")}>
                  <Avatar userId={m.userId} src={m.avatarUrl || undefined} name={m.displayName} className="size-7 text-xs" />
                  <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Badge partnership scelti, come pillole (testata del profilo staff sul principale). */
function BadgeChips({ badges }: { badges: { id: string; title: string; node: React.ReactNode }[] }) {
  return (
    <>
      {badges.map((b) => (
        <span key={b.id} className="inline-flex items-center gap-1.5 rounded-full bg-caramel/12 px-2.5 py-1 text-xs font-semibold text-ember ring-1 ring-caramel/25">
          {b.node} {b.title}
        </span>
      ))}
    </>
  );
}

function Stat({ value, label, icon }: { value: number | string; label: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-4 ring-1 ring-sand/12">
      <span className="flex size-9 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25 [&>svg]:size-4">{icon}</span>
      <span className="mt-3 font-display text-3xl font-semibold leading-none lining-nums">{value}</span>
      <span className="mt-1 text-xs text-crema/55">{label}</span>
    </div>
  );
}

/** Tab Staff di un Partner Manager in un server (non il principale): le statistiche di +profile. */
export function GuildStaffView({
  token,
  guildId,
  userId,
  onNavigate,
  owns = false,
  hideNavigator = false,
  onBadges,
  embedded = false,
}: {
  token: string;
  guildId: string;
  userId: string;
  onNavigate: (id: string) => void;
  /** è il tuo profilo: preferenze e badge in vetrina modificabili */
  owns?: boolean;
  /** sul principale "Lista staff" c'è già (quella dello staff) */
  hideNavigator?: boolean;
  serverName?: string;
  /** server principale: i badge scelti vanno nella testata del profilo staff */
  onBadges?: (chips: React.ReactNode | null) => void;
  /** dentro il profilo staff (principale): niente margini propri */
  embedded?: boolean;
}) {
  const [res, setRes] = useState<{ key: string; r: Awaited<ReturnType<typeof loadGuildStaff>> } | null>(null);
  const key = `${guildId}:${userId}`;

  useEffect(() => {
    let alive = true;
    void loadGuildStaff(token, guildId, userId).then((r) => alive && setRes({ key, r }));
    return () => {
      alive = false;
    };
  }, [token, guildId, userId, key]);

  const staff: GuildStaff | null = res?.key === key && res.r.ok ? res.r.data : null;
  const pending = useMemo(() => (staff ? staff.objectives.filter((o) => !o.done) : []), [staff]);
  const doneCount = staff ? staff.objectives.length - pending.length : 0;

  /* principale, profilo di un altro: i badge scelti salgono nella testata */
  const badgeIds = staff ? staff.selectedBadges.map((b) => b.id).join(",") : "";
  useEffect(() => {
    if (!hideNavigator || !onBadges || owns) return;
    onBadges(staff && staff.selectedBadges.length ? <BadgeChips badges={staff.selectedBadges.map((b) => ({ id: b.id, title: b.title, node: <EmojiText text={b.emoji} emojiClassName="size-4" /> }))} /> : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cambia solo coi badge
  }, [badgeIds, hideNavigator, owns]);

  const wrap = embedded ? "space-y-6" : "mx-auto max-w-5xl space-y-6 px-4 pb-20 sm:px-6";
  const badgesFromProfile = (list: { id: string; title: string; emoji: { url?: string | null; text?: string } }[]) =>
    onBadges?.(
      list.length ? (
        <BadgeChips
          badges={list.map((b) => ({
            id: b.id,
            title: b.title,
            node: b.emoji.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- emoji del badge
              <img src={b.emoji.url} alt="" className="size-4 object-contain" />
            ) : (
              <span>{b.emoji.text}</span>
            ),
          }))}
        />
      ) : null,
    );
  if (owns && hideNavigator) {
    return (
      <div className={wrap}>
        <PartnerProfile token={token} guildId={guildId} onToast={(m, err) => showToast(m, Boolean(err))} showStats={false} onBadges={onBadges ? badgesFromProfile : undefined} />
      </div>
    );
  }

  /* sul principale (sotto la scheda staff): se non è Partner Manager non si mostra niente */
  if (hideNavigator && (!res || res.key !== key || !res.r.ok)) return null;
  if (!res || res.key !== key)
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-crema/55">
        <Loader2 className="size-5 animate-spin" /> Sto recuperando le statistiche…
      </div>
    );
  if (!res.r.ok) return <p className="mx-auto max-w-xl rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-8 text-center text-crema/70 ring-1 ring-sand/12">{res.r.message}</p>;
  const s = res.r.data;

  /* il tuo profilo: statistiche, preferenze, badge da scegliere e obiettivi (come in /dashboard/profilo) */
  if (owns) {
    return (
      <div className={wrap}>
        {hideNavigator ? null : (
          <div className="relative z-30 flex justify-center">
            <PmNavigator list={s.managers} current={userId} onGo={onNavigate} />
          </div>
        )}
        <PartnerProfile
          token={token}
          guildId={guildId}
          onToast={(m, err) => showToast(m, Boolean(err))}
          showStats={!hideNavigator}
        />
      </div>
    );
  }

  return (
    <div className={wrap}>
      {hideNavigator ? null : (
        <div className="relative z-30 flex justify-center">
          <PmNavigator list={s.managers} current={userId} onGo={onNavigate} />
        </div>
      )}

      {s.selectedBadges.length && !hideNavigator ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {s.selectedBadges.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1.5 rounded-full bg-caramel/12 px-3 py-1 text-xs font-semibold text-ember ring-1 ring-caramel/25">
              <EmojiText text={b.emoji} emojiClassName="size-4" /> {b.title}
            </span>
          ))}
        </div>
      ) : null}

      {hideNavigator ? null : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={s.scores.total} label="Partnership totali" icon={<Handshake />} />
          <Stat value={s.scores.daily} label="Oggi" icon={<Zap />} />
          <Stat value={s.scores.weekly} label="Questa settimana" icon={<CalendarDays />} />
          <Stat value={`${s.awardsPercent}%`} label="Premi ottenuti" icon={<Award />} />
        </div>
      )}

      <section className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-caramel" aria-hidden />
          <h3 className="font-display text-2xl font-semibold">Obiettivi</h3>
          <span className="ml-auto text-xs text-crema/50 lining-nums">
            {doneCount}/{s.objectives.length} completati
          </span>
        </div>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {[...pending, ...s.objectives.filter((o) => o.done)].map((o) => {
            const { pct, label } = objectiveProgress(o);
            return (
              <li key={o.id} className={cn("rounded-2xl bg-espresso/50 p-3.5 ring-1", o.done ? "ring-caramel/30" : "ring-sand/10")}>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-lg leading-none">
                    <EmojiText text={o.emoji} emojiClassName="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-semibold", o.done ? "text-ember" : "text-crema")}>{o.title}</p>
                    {o.desc ? <p className="mt-0.5 text-xs leading-relaxed text-crema/55">{o.desc}</p> : null}
                  </div>
                  {o.done ? <span className="shrink-0 rounded-full bg-caramel/15 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-ember">fatto</span> : null}
                </div>
                {!o.done ? (
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-crema/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-caramel to-ember" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[0.7rem] text-crema/50 lining-nums">
                      {label}
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {s.badges.length ? (
        <section className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
          <div className="flex items-center gap-2">
            <Award className="size-5 text-caramel" aria-hidden />
            <h3 className="font-display text-2xl font-semibold">Badge sbloccati</h3>
            <span className="ml-auto text-xs text-crema/50 lining-nums">{s.badges.length}</span>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2">
            {s.badges.map((b) => (
              <li key={b.id} className="inline-flex items-center gap-1.5 rounded-full bg-crema/[0.05] px-3 py-1.5 text-xs font-semibold text-crema/80 ring-1 ring-sand/15" title={b.title}>
                <EmojiText text={b.emoji} emojiClassName="size-4" /> {b.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
