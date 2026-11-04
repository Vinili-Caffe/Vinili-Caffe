"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Ghost, Mic, Paintbrush, Sparkles, Users, Zap } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Reveal } from "@/components/Reveal";
import { cleanRole, dateIt, mult, multiplierRows, rankCardUrl, type CustomRole, type CustomVoice, type DeckCollection, type DiscordRole, type ProfileData, type SharedMember } from "@/lib/profile";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { EmojiText } from "@/components/discord/EmojiText";

function Title({ kicker, title, icon, action }: { kicker: string; title: string; icon: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-caramel [&>svg]:size-4">
          {icon} {kicker}
        </p>
        <h2 className="mt-1.5 font-display text-3xl font-semibold sm:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const EditLink = ({ href }: { href: string }) => (
  <a href={page(href)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-crema/8 px-3.5 py-2 text-sm font-semibold text-crema/80 ring-1 ring-sand/25 transition-colors hover:bg-crema/12 hover:text-crema">
    <Paintbrush className="size-3.5" /> <span className="hidden sm:inline">Modifica</span>
  </a>
);

/* ── rank card + moltiplicatori ─────────────────────────── */

export function RankCard({ p, owns }: { p: ProfileData; owns: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const rows = multiplierRows(p.multiplierSources);
  return (
    <Reveal>
      <Title kicker="Rank card" title="La card di +rank" icon={<Sparkles />} action={owns ? <EditLink href="/personalizza/" /> : undefined} />
      <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-1 ring-sand/12">
        <div className="relative p-3 sm:p-4">
          {/* l'immagine resta nel layout (invisibile) finché carica: con display:none il lazy-load non partirebbe */}
          {state !== "ok" && (
            <div className={cn("absolute inset-3 flex items-center justify-center rounded-2xl bg-crema/[0.04] text-sm text-crema/45 sm:inset-4", state === "loading" && "animate-pulse")}>
              {state === "loading" ? "Stampo la card…" : "Card non disponibile in questo momento"}
            </div>
          )}
          <img
            src={rankCardUrl(p.userId)}
            alt={`Rank card di ${p.displayName}`}
            loading="lazy"
            onLoad={() => setState("ok")}
            onError={() => setState("error")}
            className={cn("aspect-[976/276] w-full rounded-2xl object-contain transition-opacity duration-500", state !== "ok" && "opacity-0")}
          />
        </div>
        <div className="border-t border-sand/10 px-4 py-5 sm:px-6 sm:py-6">
          <p className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-semibold">
              <Zap className="size-4 text-ember" /> Moltiplicatore EXP
            </span>
            <span className="font-display text-3xl font-bold text-ember lining-nums">{mult(p.multiplier)}</span>
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {rows.map((r) => {
              const on = r.active || r.applied;
              return (
                <li key={r.key} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm", on ? "bg-crema/[0.06]" : "opacity-45 light:opacity-65")}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color || (r.type === "base" ? "#c4a07a" : "#e8c49c") }} />
                  <span className="min-w-0 flex-1 truncate">{r.type === "role" ? cleanRole(r.label) : r.label}</span>
                  <span className="font-semibold lining-nums">{mult(r.multiplier)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}

/* ── ruoli custom e vocale privata ──────────────────────── */

function Shared({ members, count, label }: { members?: SharedMember[]; count?: number; label: string }) {
  const [open, setOpen] = useState(false);
  const list = members ?? [];
  const total = Math.max(count ?? 0, list.length);
  return (
    <div className="border-t border-sand/10">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-5 py-3 text-sm text-crema/60 transition-colors hover:text-crema">
        <Users className="size-4" /> {label}
        <span className="ml-auto font-semibold lining-nums">{total}</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-3 pb-3">
            {list.length === 0 && <li className="px-2 py-2 text-sm text-crema/45">Nessun utente mostrabile.</li>}
            {list.map((m) => (
              <li key={m.id}>
                <a href={`/user/?id=${m.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-crema/[0.05]">
                  <Avatar userId={m.id} src={m.avatarUrl} name={m.displayName || m.username || "?"} className="size-7 text-xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">{m.displayName || m.username}</span>
                  {m.isOwner && <span className="text-[0.65rem] font-bold uppercase tracking-wider text-caramel">Creatore</span>}
                </a>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function RoleCard({ role, label }: { role: CustomRole; label: string }) {
  const c1 = role.color || "#c4a07a";
  const bg = role.colorMode === "gradient" && role.color2 ? `linear-gradient(135deg, ${c1}, ${role.color2})` : c1;
  return (
    <article className="overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-1 ring-sand/12">
      <div className="flex items-center gap-4 p-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-inner ring-1 ring-white/15" style={{ background: bg }}>
          {role.iconUrl ? <img src={role.iconUrl} alt="" className="size-8 drop-shadow" /> : role.emoji ? <span className="text-2xl"><EmojiText text={role.emoji} /></span> : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-crema/45">{label}</p>
          <p className="truncate bg-clip-text font-display text-xl font-semibold text-transparent" style={{ backgroundImage: role.colorMode === "gradient" && role.color2 ? bg : `linear-gradient(${c1},${c1})` }}>
            {cleanRole(role.name)}
          </p>
          {role.createdAt && <p className="text-xs text-crema/40">Creato il {dateIt(role.createdAt)}</p>}
        </div>
      </div>
      <Shared members={role.sharedMembers} count={role.memberCount} label="Condiviso con" />
    </article>
  );
}

function VoiceCard({ voice }: { voice: CustomVoice }) {
  return (
    <article className="overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-1 ring-sand/12">
      <div className="flex items-center gap-4 p-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/25">{voice.emoji ? <span className="text-2xl"><EmojiText text={voice.emoji} /></span> : <Mic className="size-6" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-crema/45">Vocale privata</p>
          <p className="truncate font-display text-xl font-semibold"><EmojiText text={voice.name} /></p>
          {voice.createdAt && <p className="text-xs text-crema/40">Creata il {dateIt(voice.createdAt)}</p>}
        </div>
      </div>
      <Shared members={voice.sharedMembers} count={voice.memberCount} label="Utenti con accesso" />
    </article>
  );
}

export function CustomStuff({ p, owns }: { p: ProfileData; owns: boolean }) {
  const { role, secondaryRole, voice } = p.custom;
  if (!role && !secondaryRole && !voice && !owns) return null;
  return (
    <Reveal>
      <Title kicker="Fatto su misura" title="Ruoli personalizzati" icon={<Paintbrush />} action={owns ? <EditLink href="/personalizza/" /> : undefined} />
      {!role && !secondaryRole && !voice ? (
        <a href={page("/personalizza/")} className="block rounded-3xl border-2 border-dashed border-sand/20 p-8 text-center text-crema/60 transition-colors hover:border-caramel/50 hover:text-crema">
          Non hai ancora un ruolo personalizzato. <span className="font-semibold text-caramel">Crealo da Personalizza →</span>
        </a>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {role && <RoleCard role={role} label="Ruolo principale" />}
          {secondaryRole && <RoleCard role={secondaryRole} label="Ruolo secondario" />}
          {voice && <VoiceCard voice={voice} />}
        </div>
      )}
    </Reveal>
  );
}

/* ── caramelle di Halloween (solo quando l'evento è visibile) ─ */

export function CandyCollection({ p }: { p: ProfileData }) {
  const c = p.candy;
  if (!c) return null;
  const pct = Math.round((c.ownedCount / Math.max(1, c.total)) * 100);
  return (
    <Reveal>
      <div className="scheme-dark relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2a1608] via-roast to-[#1a0f1f] p-6 ring-1 ring-[#ff8a1f]/25 sm:p-7">
        <div className="absolute -right-10 -top-10 hidden size-48 rounded-full bg-[#ff8a1f]/15 blur-3xl md:block" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#ffab5e]">
              <Ghost className="size-4" /> Evento di Halloween
            </p>
            <h2 className="mt-1.5 font-display text-3xl font-semibold sm:text-4xl">Collezione di caramelle</h2>
          </div>
          <p className="font-display text-3xl font-bold lining-nums">
            {c.ownedCount}
            <span className="text-crema/40">/{c.total}</span>
          </p>
        </div>
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-crema/10">
          <div className="h-full rounded-full bg-gradient-to-r from-[#ff8a1f] to-[#ffcf7a]" style={{ width: `${pct}%` }} />
        </div>
        <ul className="relative mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {c.items.map((it) => (
            <li
              key={it.id}
              title={it.owned ? it.name : "Non ancora trovata"}
              className={cn(
                "flex flex-col items-center justify-start gap-1.5 rounded-xl px-1.5 py-2 ring-1",
                it.owned ? "bg-crema/[0.07] ring-[#ff8a1f]/30" : "bg-black/20 ring-sand/8",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center sm:size-11">
                <img
                  src={it.owned ? it.thumbUrl : it.silhouetteUrl}
                  alt={it.owned ? it.name : ""}
                  loading="lazy"
                  className={cn("size-full object-contain", !it.owned && "opacity-30")}
                />
              </span>
              <span
                className={cn(
                  "w-full break-words hyphens-auto text-center text-[0.65rem] font-semibold leading-tight sm:text-[0.7rem]",
                  it.owned
                    ? "text-crema/90"
                    : "pointer-events-none select-none text-crema/75 blur-[5px] [filter:blur(5px)]",
                )}
                aria-hidden={!it.owned}
              >
                {it.name || "Caramella"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

function StarWarsDeckCard({ deck, accent }: { deck: DeckCollection; accent: "reliquie" | "pg" }) {
  const pct = Math.round((deck.ownedCount / Math.max(1, deck.total)) * 100);
  const ring = accent === "reliquie" ? "ring-[#c9a227]/30" : "ring-[#3b82f6]/30";
  const bar = accent === "reliquie" ? "from-[#c9a227] to-[#f5e6a3]" : "from-[#3b82f6] to-[#93c5fd]";
  const kicker = accent === "reliquie" ? "Evento Star Wars · Reliquie" : "Evento Star Wars · PG";
  return (
    <div className={cn("scheme-dark relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#12161f] via-roast to-[#0d1118] p-6 ring-1 sm:p-7", ring)}>
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-crema/55">{kicker}</p>
          <h2 className="mt-1.5 font-display text-3xl font-semibold sm:text-4xl">{deck.title}</h2>
        </div>
        <p className="font-display text-3xl font-bold lining-nums">
          {deck.ownedCount}
          <span className="text-crema/40">/{deck.total}</span>
        </p>
      </div>
      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-crema/10">
        <div className={cn("h-full rounded-full bg-gradient-to-r", bar)} style={{ width: `${pct}%` }} />
      </div>
      <ul className="relative mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {deck.items.map((it) => (
          <li
            key={it.id}
            title={it.owned ? it.name : "Non ancora trovata"}
            className={cn(
              "flex flex-col items-center justify-start gap-1.5 rounded-xl px-1.5 py-2 ring-1",
              it.owned ? "bg-crema/[0.07] ring-sand/20" : "bg-black/20 ring-sand/8",
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center sm:size-11">
              {it.thumbUrl || it.silhouetteUrl ? (
                <img
                  src={it.owned ? it.thumbUrl || it.silhouetteUrl : it.silhouetteUrl || it.thumbUrl}
                  alt={it.owned ? it.name : ""}
                  loading="lazy"
                  className={cn("size-full object-contain", !it.owned && "opacity-25 brightness-0")}
                />
              ) : (
                <span className={cn("size-8 rounded-full bg-crema/15", !it.owned && "opacity-30")} />
              )}
            </span>
            <span
              className={cn(
                "w-full break-words hyphens-auto text-center text-[0.65rem] font-semibold leading-tight sm:text-[0.7rem]",
                it.owned
                  ? "text-crema/90"
                  : "pointer-events-none select-none text-crema/75 blur-[5px] [filter:blur(5px)]",
              )}
              aria-hidden={!it.owned}
            >
              {it.name || "???"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StarWarsDeckCollections({ p }: { p: ProfileData }) {
  const decks = p.starWarsDecks;
  if (!decks?.visible) return null;
  return (
    <>
      {decks.reliquie ? (
        <Reveal>
          <StarWarsDeckCard deck={decks.reliquie} accent="reliquie" />
        </Reveal>
      ) : null}
      {decks.pg ? (
        <Reveal>
          <StarWarsDeckCard deck={decks.pg} accent="pg" />
        </Reveal>
      ) : null}
    </>
  );
}

/* ── tutti i ruoli Discord ──────────────────────────────── */

function RoleChip({ r }: { r: DiscordRole }) {
  return (
    <li className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-crema/[0.05] py-1 pl-2 pr-3 text-sm ring-1 ring-sand/12">
      {r.iconUrl ? <img src={r.iconUrl} alt="" loading="lazy" className="size-4" /> : r.emoji ? <span className="text-sm leading-none"><EmojiText text={r.emoji} /></span> : <span className="size-2.5 rounded-full" style={{ background: r.color || "#99aab5" }} />}
      <span className="truncate text-crema/80">{cleanRole(r.name)}</span>
    </li>
  );
}

export function RolesList({ p }: { p: ProfileData }) {
  const [all, setAll] = useState(false);
  const LIMIT = 30;
  const shown = all ? p.roles : p.roles.slice(0, LIMIT);
  return (
    <Reveal>
      <Title kicker={`${p.roles.length} ruoli`} title="Sul server" icon={<Users />} />
      {p.roles.length === 0 ? (
        <p className="text-crema/50">Nessun ruolo da mostrare.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {shown.map((r) => (
              <RoleChip key={r.id} r={r} />
            ))}
          </ul>
          {p.roles.length > LIMIT && (
            <button type="button" onClick={() => setAll((a) => !a)} className="mt-4 text-sm font-semibold text-caramel hover:text-ember">
              {all ? "Mostra meno" : `Mostra tutti (${p.roles.length})`}
            </button>
          )}
        </>
      )}
    </Reveal>
  );
}
