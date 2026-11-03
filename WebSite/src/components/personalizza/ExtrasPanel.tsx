"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cake,
  Check,
  CircleUserRound,
  GalleryHorizontal,
  Loader2,
  Lock,
  LockOpen,
  MessageSquare,
  Palette,
  Quote,
  Repeat2,
  Smile,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import {
  customEmojiUrl,
  loadGuildEmojis,
  mutateProfileExtras,
  reactionTokenFromPick,
  type GuildEmoji,
  type PersTab,
  type ProfileExtras,
} from "@/lib/personalizza";
import { EmojiPopover, type EmojiPick } from "./EmojiPopover";
import { LockPlate } from "./LockPlate";
import { EmojiText } from "@/components/discord/EmojiText";
import { DiscordContent } from "@/components/discord/DiscordContent";

const ROLE_CAT_KEY = "vc_pers_role_cat";

/** Cosa blocca davvero ogni voce lato bot (+avatar, +banner, quote, repost). */
const PRIVACY_INFO: Record<string, { icon: LucideIcon; title: string; on: string; off: string }> = {
  avatar: {
    icon: CircleUserRound,
    title: "Avatar",
    on: "Nessuno può aprire il tuo avatar in grande con +avatar.",
    off: "Chiunque può aprire il tuo avatar in grande con +avatar.",
  },
  banner: {
    icon: GalleryHorizontal,
    title: "Banner",
    on: "Nessuno può aprire il tuo banner con +banner.",
    off: "Chiunque può aprire il tuo banner con +banner.",
  },
  quotes: {
    icon: Quote,
    title: "Quote",
    on: "I tuoi messaggi non possono diventare una quote.",
    off: "Gli altri possono trasformare i tuoi messaggi in quote.",
  },
  reposts: {
    icon: Repeat2,
    title: "Repost",
    on: "Il bot non ripubblica i tuoi messaggi.",
    off: "Il bot può ripubblicare i tuoi messaggi.",
  },
};

function ReactionPreview({
  token,
  display,
  emojis,
}: {
  token: string;
  display?: string | { markup?: string; url?: string; name?: string };
  emojis: GuildEmoji[];
}) {
  if (typeof display === "object" && display?.url) {
    return <img src={display.url} alt="" className="size-7 object-contain" />;
  }
  if (token.startsWith("custom:")) {
    const id = token.slice(7);
    const meta = emojis.find((e) => e.id === id);
    return <img src={meta?.url || customEmojiUrl(id, meta?.animated)} alt="" className="size-7 object-contain" />;
  }
  if (token.startsWith("unicode:")) return <span className="text-xl leading-none">{token.slice(8)}</span>;
  return <span className="text-sm text-crema/50">{token}</span>;
}

/** Pannelli extras: ruoli/colori PLUS, compleanno, privacy, reactions, response. */
export function ExtrasPanel({
  tab,
  extras,
  token,
  onExtras,
  onToast,
}: {
  tab: Exclude<PersTab, "rank" | "primary" | "secondary" | "voice">;
  extras: ProfileExtras;
  token: string;
  onExtras: (e: ProfileExtras) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [roleCat, setRoleCat] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [responseText, setResponseText] = useState("");
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const respRef = useRef<HTMLTextAreaElement>(null);
  const respEmojiBtn = useRef<HTMLButtonElement>(null);
  const [respPicker, setRespPicker] = useState(false);

  useEffect(() => {
    const b = extras.birthday;
    setDay(b.day ? String(b.day) : "");
    setMonth(b.month ? String(b.month) : "");
    setYear(b.birthYear ? String(b.birthYear) : "");
    setResponseText(extras.mentionResponse?.text || "");
  }, [extras]);

  // parte dall'ultima sezione usata (se esiste ancora), altrimenti dalla prima; non torna indietro a ogni salvataggio
  useEffect(() => {
    if (tab !== "roles") return;
    const cats = extras.rolePanel?.categories || [];
    if (!cats.length) return;
    setRoleCat((cur) => {
      if (cats.some((c) => c.key === cur)) return cur;
      let saved = "";
      try {
        saved = localStorage.getItem(ROLE_CAT_KEY) || "";
      } catch {
        /* storage bloccato */
      }
      return cats.some((c) => c.key === saved) ? saved : cats[0].key;
    });
  }, [tab, extras.rolePanel?.categories]);

  function pickRoleCat(key: string) {
    setRoleCat(key);
    try {
      localStorage.setItem(ROLE_CAT_KEY, key);
    } catch {
      /* storage bloccato */
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadGuildEmojis(token).then((list) => {
      if (!cancelled) setGuildEmojis(list);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function run(section: string, extra: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    const r = await mutateProfileExtras(token, { section, ...extra });
    setBusy(false);
    if (!r.ok) {
      onToast(r.message, true);
      return;
    }
    const d = r.data;
    const next = { ...extras };
    if (d.birthday) next.birthday = d.birthday as ProfileExtras["birthday"];
    if (d.privacy) next.privacy = d.privacy as ProfileExtras["privacy"];
    if (d.mentionReaction) next.mentionReaction = d.mentionReaction as ProfileExtras["mentionReaction"];
    if (d.mentionResponse) {
      next.mentionResponse = { ...next.mentionResponse, ...(d.mentionResponse as ProfileExtras["mentionResponse"]) };
    }
    if (d.rolePanelCategory && next.rolePanel?.byKey) {
      const cat = d.rolePanelCategory as ProfileExtras["rolePanel"]["byKey"][string];
      next.rolePanel = {
        ...next.rolePanel,
        byKey: { ...next.rolePanel.byKey, [cat.key]: cat },
      };
    }
    onExtras(next);
    onToast(r.message || "Salvato.");
  }

  if (tab === "roles") {
    const cats = extras.rolePanel?.categories || [];
    const panel = extras.rolePanel?.byKey?.[roleCat];
    return (
      <div className="space-y-4">
        <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
              <Palette className="size-4" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Palette colori</p>
              <h3 className="mt-1 font-display text-2xl font-semibold">Ruoli & colori PLUS</h3>
              <p className="mt-1 text-sm text-crema/55">
                Pronomi, hobby e colori chat. I Colori Plus si sbloccano con boost o donazioni.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => pickRoleCat(c.key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
                  roleCat === c.key ? "bg-caramel text-ink ring-caramel" : "bg-crema/5 text-crema/70 ring-sand/15 hover:ring-sand/30",
                )}
              >
                <EmojiText text={c.label} />
              </button>
            ))}
          </div>
        </div>

        {panel && (
          <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display text-xl font-semibold"><EmojiText text={panel.label} /></h4>
              {panel.key === "colors_plus" && panel.canPickPlus === false && (
                <span className="inline-flex items-center gap-1 rounded-full bg-caramel/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-caramel ring-1 ring-caramel/25">
                  <Lock className="size-3" /> Bloccati
                </span>
              )}
            </div>
            {panel.key === "colors_plus" && panel.canPickPlus === false && (
              <p className="mb-4 rounded-2xl bg-caramel/10 px-3 py-2 text-sm text-crema/70 ring-1 ring-caramel/25">
                I Colori Plus si sbloccano con un boost o una donazione.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {panel.options.map((o) => {
                const selected = panel.multi
                  ? panel.selectedIds.includes(o.value)
                  : panel.selected === o.value || (o.value === "remove" && !panel.selected && !panel.selectedIds.length);
                const isRemove = o.value === "remove";
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={busy}
                    onClick={() => run("roles", { category: roleCat, value: o.value })}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 transition-colors disabled:opacity-50",
                      selected ? "bg-caramel/15 ring-caramel/40" : "bg-espresso/40 ring-sand/12 hover:ring-sand/30",
                      isRemove && "sm:col-span-2",
                    )}
                  >
                    {o.iconUrl ? (
                      <img src={o.iconUrl} alt="" className="size-7 rounded-full object-cover" />
                    ) : o.emoji ? (
                      <span className="text-lg"><EmojiText text={o.emoji} /></span>
                    ) : (
                      <span className="flex size-7 items-center justify-center rounded-full bg-crema/8 text-[0.65rem]">·</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium"><EmojiText text={o.label} /></span>
                    {selected && !isRemove && <Check className="size-4 shrink-0 text-caramel" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab === "birthday") {
    const b = extras.birthday;
    return (
      <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
            <Cake className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Compleanno</p>
            <h3 className="mt-1 font-display text-2xl font-semibold">Quando festeggiamo?</h3>
            <p className="mt-2 text-sm leading-relaxed text-crema/60">
              Il giorno del tuo compleanno ricevi un annuncio in chat, il ruolo compleanno e un multi EXP ×2 per tutta
              la giornata. Dopo l&apos;annuncio non potrai più cambiare giorno/mese fino all&apos;anno prossimo.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <label htmlFor="day" className="block">
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-crema/45">Giorno</span>
                <input id="day" name="day"
                  type="number"
                  min={1}
                  max={31}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-espresso/70 px-3 py-2.5 text-sm outline-none ring-1 ring-sand/15 focus:ring-caramel/60"
                />
              </label>
              <label htmlFor="month" className="block">
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-crema/45">Mese</span>
                <input id="month" name="month"
                  type="number"
                  min={1}
                  max={12}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-espresso/70 px-3 py-2.5 text-sm outline-none ring-1 ring-sand/15 focus:ring-caramel/60"
                />
              </label>
              <label htmlFor="year" className="block">
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-crema/45">Anno</span>
                <input id="year" name="year"
                  type="number"
                  min={1900}
                  max={new Date().getFullYear()}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-espresso/70 px-3 py-2.5 text-sm outline-none ring-1 ring-sand/15 focus:ring-caramel/60"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run("birthday", {
                    action: "set",
                    day: Number(day),
                    month: Number(month),
                    birthYear: Number(year),
                    showAge: b.showAge !== false,
                  })
                }
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Salva
              </button>
              <button
                type="button"
                disabled={busy || !b.day}
                onClick={() => run("birthday", { action: "privacy", showAge: b.showAge === false })}
                className="rounded-full bg-crema/8 px-4 py-2.5 text-sm font-semibold ring-1 ring-sand/25 disabled:opacity-50"
              >
                {b.showAge === false ? "Mostra età" : "Nascondi età"}
              </button>
              <button
                type="button"
                disabled={busy || !b.day}
                onClick={() => run("birthday", { action: "clear" })}
                className="rounded-full bg-crema/8 px-4 py-2.5 text-sm font-semibold text-crema/70 ring-1 ring-sand/20 disabled:opacity-50"
              >
                Rimuovi
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (tab === "privacy") {
    const kinds = extras.privacy?.kinds || [];
    const closed = kinds.filter((k) => k.blocked).length;
    const level = kinds.length ? closed / kinds.length : 0;
    return (
      <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-1 ring-sand/12">
        {/* testata: lucchetto che si chiude man mano che proteggi le voci */}
        <div className="relative flex flex-col gap-5 bg-gradient-to-br from-caramel/15 via-roast/40 to-transparent p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="relative flex size-20 shrink-0 items-center justify-center self-start rounded-[1.4rem] bg-espresso/70 ring-1 ring-caramel/30 sm:self-auto">
            <motion.span
              key={closed === kinds.length && kinds.length ? "lock" : "open"}
              initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 18 }}
              className="text-ember"
            >
              {closed === kinds.length && kinds.length ? <Lock className="size-8" /> : <LockOpen className="size-8" />}
            </motion.span>
            <svg viewBox="0 0 80 80" className="absolute inset-0 size-full -rotate-90" aria-hidden>
              <circle cx="40" cy="40" r="36" fill="none" strokeWidth="3" className="stroke-sand/10" />
              <motion.circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                className="stroke-caramel"
                initial={false}
                animate={{ pathLength: level }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Privacy</p>
            <h3 className="mt-1 font-display text-2xl font-semibold">Cosa possono fare gli altri con te</h3>
            <p className="mt-1 text-sm text-crema/55">
              <span className="font-semibold text-crema lining-nums">
                {closed} su {kinds.length}
              </span>{" "}
              {closed === 1 ? "voce protetta" : "voci protette"}. Quello che proteggi, gli altri non possono usarlo su di te.
            </p>
          </div>
          <div className="flex shrink-0 gap-2 sm:flex-col">
            <button
              type="button"
              disabled={busy || closed === kinds.length}
              onClick={() => run("privacy", { action: "all_off" })}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-xs font-semibold text-ink transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <Lock className="size-3.5" /> Proteggi tutto
            </button>
            <button
              type="button"
              disabled={busy || closed === 0}
              onClick={() => run("privacy", { action: "all_on" })}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-xs font-semibold ring-1 ring-sand/20 hover:bg-crema/12 disabled:opacity-40"
            >
              <LockOpen className="size-3.5" /> Apri tutto
            </button>
          </div>
        </div>

        <ul className="grid gap-3 p-5 pt-2 sm:grid-cols-2 sm:p-6 sm:pt-2">
          {kinds.map((k) => {
            const info = PRIVACY_INFO[k.key];
            const Icon = info?.icon || Lock;
            return (
              <li key={k.key}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={k.blocked}
                  disabled={busy}
                  onClick={() => run("privacy", { action: "toggle", key: k.key })}
                  className={cn(
                    "group flex h-full w-full items-start gap-3 rounded-2xl p-4 text-left ring-1 transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out disabled:opacity-60",
                    k.blocked
                      ? "bg-caramel/12 ring-caramel/40 shadow-[0_18px_40px_-28px_rgba(217,154,91,0.9)]"
                      : "bg-espresso/40 ring-sand/12 hover:-translate-y-0.5 hover:ring-sand/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
                      k.blocked ? "bg-caramel/20 text-ember ring-caramel/35" : "bg-crema/6 text-crema/55 ring-sand/15",
                    )}
                  >
                    <Icon className="size-[1.1rem]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">
                        <EmojiText text={info?.title || k.label} />
                      </span>
                      {/* interruttore */}
                      <span
                        aria-hidden
                        className={cn(
                          "relative h-6 w-11 shrink-0 rounded-full ring-1 transition-colors",
                          k.blocked ? "bg-caramel ring-caramel" : "bg-crema/10 ring-sand/20",
                        )}
                      >
                        <motion.span
                          initial={false}
                          animate={{ x: k.blocked ? 20 : 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className={cn(
                            "absolute left-0.5 top-0.5 flex size-5 items-center justify-center rounded-full shadow",
                            k.blocked ? "bg-ink text-caramel" : "bg-crema text-ink",
                          )}
                        >
                          {k.blocked ? <Lock className="size-2.5" /> : null}
                        </motion.span>
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-crema/55">
                      {info ? (k.blocked ? info.on : info.off) : k.blocked ? "Protetto." : "Libero."}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (tab === "reactions") {
    const mr = extras.mentionReaction;
    if (!mr.access) {
      return (
        <LockPlate
          title="Mention Reactions"
          anyOf={["VIP", "Booster", "Double Booster", "VIP+", "Livello 70"]}
          note="Mention Reactions riservate a VIP, Booster, Double Booster, VIP+ o Level 70."
        />
      );
    }
    const slots = Math.max(mr.max, mr.reactions.length);
    const tokens = mr.reactions || [];
    return (
      <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
            <Smile className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Mention Reactions</p>
            <h3 className="mt-1 font-display text-2xl font-semibold">Reazioni automatiche</h3>
            <p className="mt-1 text-sm text-crema/55">Fino a {mr.max} emoji quando ti menzionano.</p>
            <div className="relative mt-4 flex flex-wrap gap-2">
              {Array.from({ length: slots }, (_, i) => {
                const token = tokens[i];
                return (
                  <div key={i} className="relative">
                    <button
                      ref={i === pickerIdx ? pickRef : undefined}
                      type="button"
                      disabled={busy}
                      onClick={() => setPickerIdx(pickerIdx === i ? null : i)}
                      className={cn(
                        "flex size-14 items-center justify-center rounded-2xl ring-1 transition-colors",
                        token ? "bg-espresso/60 ring-sand/20" : "bg-crema/4 ring-dashed ring-sand/25 hover:ring-sand/40",
                      )}
                      aria-label={token ? `Slot ${i + 1}` : `Aggiungi reazione ${i + 1}`}
                    >
                      {token ? <ReactionPreview token={token} display={mr.display?.[i]} emojis={guildEmojis} /> : <Smile className="size-5 text-crema/35" />}
                    </button>
                    {token && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const next = tokens.filter((_, j) => j !== i);
                          if (next.length) run("mention_reaction", { action: "set", reactions: next });
                          else run("mention_reaction", { action: "clear" });
                        }}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-roast p-1 text-crema/50 ring-1 ring-sand/20 hover:text-crema"
                        aria-label="Rimuovi"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                    {pickerIdx === i && (
                      <EmojiPopover
                        open
                        onClose={() => setPickerIdx(null)}
                        preferCustom
                        guildEmojis={guildEmojis}
                        anchorRef={pickRef}
                        onPick={(pick: EmojiPick) => {
                          const tokenNext = reactionTokenFromPick(pick);
                          if (!tokenNext) return;
                          const next = tokens.slice();
                          if (i >= next.length) next.push(tokenNext);
                          else next[i] = tokenNext;
                          run("mention_reaction", { action: "set", reactions: next.slice(0, mr.max) });
                          setPickerIdx(null);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {tokens.length > 0 && (
              <button type="button" disabled={busy} onClick={() => run("mention_reaction", { action: "clear" })} className="mt-4 text-xs font-semibold text-sand underline-offset-2 hover:underline">
                Rimuovi tutte
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const resp = extras.mentionResponse;
  if (!resp.access) {
    return <LockPlate title="Mention Response" note={resp.accessHint || "Funzione riservata. Controlla i requisiti sul server."} />;
  }
  return (
    <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
          <MessageSquare className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Mention Response</p>
          <h3 className="mt-1 font-display text-2xl font-semibold">Risposta automatica</h3>
          <p className="mt-1 text-sm text-crema/55">{resp.accessHint}</p>
          <div className="relative mt-4">
            <textarea name="response"
              ref={respRef}
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-2xl bg-espresso/70 py-3 pl-4 pr-12 text-sm leading-relaxed outline-none ring-1 ring-sand/15 focus:ring-caramel/60"
              placeholder="Cosa rispondere quando qualcuno ti menziona…"
            />
            <div className="absolute right-2 top-2">
              <button
                ref={respEmojiBtn}
                type="button"
                onClick={() => setRespPicker((o) => !o)}
                className="rounded-xl bg-crema/8 p-2 ring-1 ring-sand/20 hover:bg-crema/12"
                aria-label="Inserisci emoji"
              >
                <Smile className="size-4" />
              </button>
              <EmojiPopover
                open={respPicker}
                onClose={() => setRespPicker(false)}
                guildEmojis={guildEmojis}
                preferCustom
                anchorRef={respEmojiBtn}
                onPick={(pick: EmojiPick) => {
                  const add = pick.type === "custom" ? pick.markup : pick.text;
                  const el = respRef.current;
                  const at = el ? el.selectionStart : responseText.length;
                  const end = el ? el.selectionEnd : responseText.length;
                  setResponseText((t) => `${t.slice(0, at)}${add}${t.slice(end)}`);
                  setRespPicker(false);
                  requestAnimationFrame(() => {
                    el?.focus();
                    el?.setSelectionRange(at + add.length, at + add.length);
                  });
                }}
              />
            </div>
          </div>
          {/* nel campo le emoji del server restano codice: qui si vedono come su Discord */}
          {responseText.trim() && (
            <div className="scheme-dark mt-3 rounded-2xl bg-[#313338] px-4 py-3 text-[0.94rem] leading-relaxed text-[#dbdee1] ring-1 ring-black/40">
              <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#949ba4]">Come appare su Discord</p>
              <DiscordContent text={responseText} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run("mention_response", { action: "set", text: responseText })}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Salva
            </button>
            <button
              type="button"
              disabled={busy || !resp.text}
              onClick={() => run("mention_response", { action: "clear" })}
              className="rounded-full bg-crema/8 px-4 py-2.5 text-sm font-semibold ring-1 ring-sand/25 disabled:opacity-50"
            >
              Rimuovi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
