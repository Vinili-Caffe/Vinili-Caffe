"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Coins,
  Gavel,
  Handshake,
  ListChecks,
  Loader2,
  Search,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { showToast } from "@/components/ui";
import type { StaffAccess } from "@/lib/staff";
import { cleanRole, loadCard, loadManage, setSerataFilm, type ManageData, type RosterMember, type StaffCard } from "@/lib/staffCard";
import { cn } from "@/lib/cn";
import { ManagePanel } from "./ManagePanel";
import { Resoconto } from "./Resoconto";
import { Sheet } from "./Sheet";
import { PauseSheet, PmSheet, PtSheet, ValSheet, WarnSheet, type StatCtx } from "./StatSheets";

type SheetKind = "pos" | "neg" | "warn" | "pause" | "pm" | "pt" | "manage";

const profileHref = (id: string) => `/user/?id=${id}&tab=staff`;

/* ── navigazione tra i profili dello staff ── */

function Navigator({ roster, current, onGo }: { roster: { label: string; members: RosterMember[] }[]; current: string; onGo: (id: string) => void }) {
  const flat = useMemo(() => roster.flatMap((s) => s.members), [roster]);
  const i = flat.findIndex((m) => m.userId === current);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  if (!flat.length) return null;
  const go = (id?: string) => id && (setOpen(false), onGo(id));
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  return (
    <div ref={box} className="relative flex items-center gap-1 rounded-full bg-roast/80 p-1 ring-1 ring-sand/15" aria-label="Navigazione profili staff">
      <button type="button" aria-label="Profilo staff precedente" disabled={i <= 0} onClick={() => go(flat[i - 1]?.userId)} className="rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema disabled:opacity-30">
        <ChevronLeft className="size-4" />
      </button>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-crema/8">
        <Users className="size-4 text-caramel" /> Lista staff <span className="text-crema/45 lining-nums">{i >= 0 ? `${i + 1}/${flat.length}` : flat.length}</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <button type="button" aria-label="Profilo staff successivo" disabled={i < 0 || i >= flat.length - 1} onClick={() => go(flat[i + 1]?.userId)} className="rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema disabled:opacity-30">
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
            <label className="flex items-center gap-2 border-b border-sand/10 px-3">
              <Search className="size-4 text-crema/40" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca uno staffer…" className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-crema/35" />
            </label>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {roster.map((s) => {
                const list = s.members.filter((m) => !q || norm(m.displayName + " " + (m.username || "")).includes(norm(q)));
                if (!list.length) return null;
                return (
                  <div key={s.label} className="mb-1">
                    <p className="px-2 pb-1 pt-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-caramel">{cleanRole(s.label)}</p>
                    {list.map((m) => (
                      <button key={m.userId} type="button" onClick={() => go(m.userId)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-crema/[0.06]", m.userId === current && "bg-caramel/12 text-ember")}>
                        <Avatar userId={m.userId} src={m.avatarUrl} name={m.displayName} className="size-7 text-xs" />
                        <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                        {m.onPause && <span className="text-[0.6rem] font-bold uppercase text-sand">pausa</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── riquadro numerico cliccabile ── */

function Tile({ value, label, icon, tone, onClick, badge }: { value: number | string; label: string; icon: React.ReactNode; tone?: "pos" | "neg" | "warn"; onClick?: () => void; badge?: number }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "relative flex flex-col items-start rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-4 text-left ring-1 ring-sand/12 transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out",
        onClick && "hover:-translate-y-0.5 hover:ring-caramel/40",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl ring-1 [&>svg]:size-4",
          tone === "pos" ? "bg-[#3f7d4e]/20 text-[#9fd3ac] light:text-[#2f6b3f] ring-[#3f7d4e]/35" : tone === "neg" || tone === "warn" ? "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c] ring-[#a83a2c]/30" : "bg-caramel/15 text-ember ring-caramel/25",
        )}
      >
        {icon}
      </span>
      <span className="mt-3 font-display text-3xl font-semibold leading-none lining-nums">{value}</span>
      <span className="mt-1 text-xs text-crema/55">{label}</span>
      {badge ? <span className="absolute right-3 top-3 rounded-full bg-ember px-2 py-0.5 text-[0.65rem] font-bold text-ink lining-nums">{badge}</span> : null}
    </Comp>
  );
}

function Block({ title, icon, link, children }: { title: string; icon: React.ReactNode; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-2xl font-semibold [&>svg]:size-5 [&>svg]:text-caramel">
          {icon} {title}
        </p>
        {link && (
          <a href={link.href} className="text-sm font-semibold text-caramel hover:text-ember">
            {link.label}
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

/** La scheda Staff del profilo (sito vecchio: user-profile-staff-tab + staff-profile-render). */
export function StaffCardView({ token, userId, access, onNavigate }: { token: string; userId: string; access: StaffAccess; onNavigate: (id: string) => void }) {
  const [card, setCard] = useState<StaffCard | null>(null);
  const [err, setErr] = useState("");
  const [mng, setMng] = useState<ManageData | null>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [reload, setReload] = useState(0);
  const [sfBusy, setSfBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCard(token, userId).then((r) => {
      if (!alive) return;
      if (r.ok) (setCard(r.data), setErr(""));
      else setErr(r.message);
    });
    loadManage(token, userId).then((r) => alive && r.ok && setMng(r.data));
    return () => {
      alive = false;
    };
  }, [token, userId, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  // da notifica (?staffOpen=pause|pm|pm-punti-tolti): appena la scheda è pronta si apre il pannello giusto
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (!card || openedFromLink.current) return;
    openedFromLink.current = true;
    const open = new URLSearchParams(location.search).get("staffOpen") || "";
    const map: Record<string, SheetKind> = { pause: "pause", pm: "pm", "pm-punti-tolti": "pt", "punti-tolti": "pt" };
    if (map[open]) setSheet(map[open]);
  }, [card]);
  const roster = useMemo(() => (mng?.sections ?? []).map((s) => ({ label: s.roleLabel, members: s.members })), [mng]);
  const me = mng?.sections.flatMap((s) => s.members).find((m) => m.userId === userId);

  if (err) return <p className="mx-auto max-w-xl rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-8 text-center text-crema/70 ring-1 ring-sand/12">{err}</p>;
  if (!card)
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-crema/55">
        <Loader2 className="size-5 animate-spin" /> Sto recuperando le statistiche dell’utente…
      </div>
    );

  const isHS = Boolean(access?.isHighStaff);
  const actions = new Set(mng?.actions ?? []);
  const ctx: StatCtx = {
    token,
    userId,
    card,
    isHighStaff: isHS,
    canReportPuntiTolti: Boolean(access?.canReviewPmPointsRemoved),
    actions,
    onChanged: refresh,
  };
  const p = card.partner;
  const showPm = Boolean(card.role?.isPm && p);
  const canManageCareer = Boolean(mng?.canManage && !mng.readOnly && !card.isSelf && mng.member && actions.size);
  const q = card.pause?.quota ?? { remaining: null as number | null };

  const toggleSerata = async (v: boolean) => {
    setSfBusy(true);
    const r = await setSerataFilm(token, v);
    setSfBusy(false);
    if (!r.ok) return showToast(r.message, true);
    refresh();
  };

  // come sito vecchio: link serata per HS/manage; stato presenza se il payload lo manda (profilo full)
  const canOpenSerata = Boolean(isHS || access.canManage);
  const flags = [
    me?.onPause && { k: "pause", t: "In pausa", c: "bg-sand/15 text-sand" },
    me?.isNew && { k: "new", t: "Nuovo in staff", c: "bg-ember/15 text-ember" },
    me?.isStaffDelMese && { k: "mese", t: "Staffer del mese", c: "bg-ember/15 text-ember" },
    me?.isStaffDelSettimana && { k: "sett", t: "Staffer della settimana", c: "bg-ember/15 text-ember" },
  ].filter(Boolean) as { k: string; t: string; c: string }[];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-20 sm:px-6">
      <div className="relative z-30 flex flex-wrap items-center justify-center gap-3">
        <Navigator roster={roster} current={userId} onGo={onNavigate} />
        {canManageCareer && (
          <button
            type="button"
            onClick={() => setSheet("manage")}
            className="relative z-30 inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink"
          >
            <Settings2 className="size-4" /> Gestisci
          </button>
        )}
      </div>

      {/* flag / tenure: i badge ruolo stanno già nell’AlbumCover */}
      {(flags.length > 0 || card.career?.tenure?.label) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {flags.map((f) => (
            <span key={f.k} className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", f.c)}>
              {f.t}
            </span>
          ))}
          {card.career?.tenure?.label && <span className="text-sm text-crema/50">In staff dal {card.career.tenure.label}</span>}
        </div>
      )}

      {/* riquadri: ognuno apre il suo pannello */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Tile value={card.valutazioni?.positive ?? 0} label="Valutazioni positive" icon={<ThumbsUp />} tone="pos" onClick={() => setSheet("pos")} />
        <Tile value={card.valutazioni?.negative ?? 0} label="Valutazioni negative" icon={<ThumbsDown />} tone="neg" onClick={() => setSheet("neg")} />
        <Tile value={card.warn?.count ?? 0} label="Warn staff" icon={<TriangleAlert />} tone="warn" onClick={() => setSheet("warn")} />
        <Tile value={q.remaining ?? "—"} label="Giorni di pausa rimanenti" icon={<CalendarDays />} onClick={() => setSheet("pause")} badge={card.pause?.pendingCount} />
        {showPm && p && (
          <>
            <Tile value={p.points} label="Punti PM" icon={<Coins />} onClick={() => setSheet("pm")} />
            <Tile value={p.partnerCount} label="Partner" icon={<Handshake />} onClick={() => setSheet("pm")} />
            <Tile value={p.redeemSpend} label="Spesi in shop" icon={<ShoppingBag />} onClick={() => setSheet("pm")} />
            {(access?.canViewPmPointsRemoved || card.isSelf) && <Tile value={p.pendingPuntiTolti ?? 0} label="Punti tolti in attesa" icon={<ShieldAlert />} onClick={() => setSheet("pt")} />}
          </>
        )}
      </div>

      {(access?.canViewResoconti || card.isSelf) && <Resoconto key={userId} token={token} userId={userId} canDecide={Boolean(access?.canViewResoconti && isHS)} onChanged={refresh} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Pause" icon={<CalendarDays />} link={{ href: "/staff/pause/", label: "Calendario" }}>
          <p className="text-sm text-crema/70">{card.pause?.statusLine || "—"}</p>
          <ul className="mt-3 space-y-2">
            {(card.pause?.history ?? []).slice(0, 4).map((h) => (
              <li key={String(h.id || h.pauseId)} className="flex items-center justify-between gap-3 rounded-xl bg-crema/[0.04] px-3 py-2 text-sm ring-1 ring-sand/10">
                <span className="lining-nums">
                  {h.start} → {h.end}
                  {h.motivazione && <span className="block text-xs text-crema/45">{h.motivazione}</span>}
                </span>
                <span className="shrink-0 text-xs font-semibold text-crema/60">{h.statusLabel}</span>
              </li>
            ))}
            {!(card.pause?.history?.length) && <li className="text-sm text-crema/45">Nessuna pausa recente.</li>}
          </ul>
          <button type="button" onClick={() => setSheet("pause")} className="mt-3 text-sm font-semibold text-caramel hover:text-ember">
            Tutte le pause{card.pause?.pendingCount ? ` · ${card.pause.pendingCount} da gestire` : ""}
          </button>
        </Block>

        <Block title="Carriera" icon={<Gavel />}>
          <ol className="relative space-y-3 border-l border-sand/20 pl-5">
            {(card.career?.rolesHistory ?? []).map((r, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full bg-caramel ring-4 ring-roast" />
                <p className="text-sm font-semibold">
                  {cleanRole(r.oldRole)} → <span className="text-ember">{cleanRole(r.newRole)}</span>
                </p>
                <p className="text-xs text-crema/45">
                  {r.dateLabel}
                  {r.reason ? ` · ${r.reason}` : ""}
                </p>
              </li>
            ))}
            {!card.career?.rolesHistory?.length && <li className="text-sm text-crema/45">Cronologia non disponibile.</li>}
          </ol>
        </Block>

        {card.modstats && (
          <Block title="Sanzioni" icon={<ShieldAlert />}>
            <div className="grid grid-cols-3 gap-2">
              {(["d7", "d30", "all"] as const).map((k) => {
                const s = card.modstats![k];
                return (
                  <div key={k} className="rounded-2xl bg-crema/[0.04] p-3 ring-1 ring-sand/10">
                    <p className="text-xs text-crema/50">{k === "d7" ? "7 giorni" : k === "d30" ? "30 giorni" : "Totale"}</p>
                    <p className="font-display text-3xl font-semibold lining-nums">{s.total}</p>
                    <p className="mt-1 text-[0.7rem] leading-relaxed text-crema/45 lining-nums">
                      {s.ban} ban · {s.mute} mute
                      <br />
                      {s.kick} kick · {s.warn} warn
                    </p>
                  </div>
                );
              })}
            </div>
          </Block>
        )}

        <Block title="Strumenti" icon={<BookOpen />}>
          <div className="grid grid-cols-2 gap-2">
            <a href="/staff/guida/" className="rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-sand/10 hover:ring-caramel/40">
              <BookOpen className="size-5 text-caramel" />
              <p className="mt-2 font-semibold">Guida</p>
              <p className="text-xs text-crema/50">Manualistica staff</p>
            </a>
            {access.canCompiti && (
              <a href="/staff/compiti/" className="rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-sand/10 hover:ring-caramel/40">
                <ListChecks className="size-5 text-caramel" />
                <p className="mt-2 font-semibold">Compiti</p>
                <p className="text-xs text-crema/50">Compiti settimanali</p>
              </a>
            )}
          </div>
          {card.serataFilm && (
            <div className="mt-4 space-y-3 rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-sand/10">
              <div className="flex flex-wrap items-center gap-3">
                <Clapperboard className="size-5 text-caramel" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-caramel">Serata film</p>
                  <p className="text-sm text-crema/75">{card.serataFilm.label}</p>
                </div>
                {canOpenSerata && (
                  <a href="/seratafilm/" className="rounded-full bg-caramel/20 px-3 py-1.5 text-xs font-semibold text-ember ring-1 ring-caramel/30 hover:bg-caramel/30">
                    Apri
                  </a>
                )}
              </div>
              {card.serataFilm.editable && (
                <div role="radiogroup" aria-label="Presenza Serata Film" className="inline-flex rounded-full bg-black/20 p-0.5 text-xs font-semibold">
                  {[
                    { v: true, l: "Presente" },
                    { v: false, l: "Assente" },
                  ].map((o) => (
                    <button
                      key={o.l}
                      type="button"
                      role="radio"
                      aria-checked={card.serataFilm!.willAttend === o.v}
                      disabled={sfBusy}
                      onClick={() => card.serataFilm!.willAttend !== o.v && toggleSerata(o.v)}
                      className={cn("rounded-full px-3 py-1.5", card.serataFilm!.willAttend === o.v ? "bg-crema text-espresso" : "text-crema/60")}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Block>
      </div>

      <AnimatePresence>
        {sheet && (
          <Sheet
            key={sheet}
            kicker={card.identity.displayName}
            title={{ pos: "Valutazioni positive", neg: "Valutazioni negative", warn: "Warn staff", pause: "Pause", pm: "Punti PM e shop", pt: "Punti tolti", manage: "Gestisci carriera" }[sheet]}
            onClose={() => setSheet(null)}
          >
            {sheet === "pos" && <ValSheet ctx={ctx} kind="pos" />}
            {sheet === "neg" && <ValSheet ctx={ctx} kind="neg" />}
            {sheet === "warn" && <WarnSheet ctx={ctx} />}
            {sheet === "pause" && <PauseSheet ctx={ctx} />}
            {sheet === "pm" && <PmSheet ctx={ctx} />}
            {sheet === "pt" && <PtSheet ctx={ctx} />}
            {sheet === "manage" && mng && <ManagePanel token={token} userId={userId} data={mng} onDone={() => (setSheet(null), refresh())} />}
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

export { profileHref };
