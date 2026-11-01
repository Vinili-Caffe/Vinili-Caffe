"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, ImageOff, Pause, Play, Repeat2 } from "lucide-react";
import { BACHECA_EMOJIS, splitBachecaText, tiltFor, type BachecaItem } from "@/lib/bacheca";
import { toggleBachecaAudio, useBachecaAudio } from "@/lib/bacheca-audio";
import { cn } from "@/lib/cn";

const ease = [0.22, 1, 0.36, 1] as const;

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "adesso";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h fa`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} g fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

/** Puntina: testa colorata con riflesso e ombra sul sughero. */
export function Pin({ tone = "red", className }: { tone?: "red" | "yellow" | "blue" | "green"; className?: string }) {
  const color = {
    red: "from-[#ff8a7a] to-[#b3261e]",
    yellow: "from-[#ffe58a] to-[#c99a12]",
    blue: "from-[#9cc8ff] to-[#2b5fb3]",
    green: "from-[#a8e6a1] to-[#2f7d32]",
  }[tone];
  return (
    <span aria-hidden className={cn("absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2", className)}>
      <span className={cn("block size-5 rounded-full bg-gradient-to-br shadow-[0_3px_4px_rgba(0,0,0,0.45)] ring-1 ring-black/20", color)}>
        <span className="absolute left-1 top-1 size-1.5 rounded-full bg-white/70" />
      </span>
    </span>
  );
}

/** Immagine con ripiego: se il link non funziona più si vede un riquadro pulito, non il testo alternativo. */
export function SafeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [broken, setBroken] = useState(!src);
  if (broken) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-ink/8 text-center text-ink/45">
        <ImageOff className="size-7" />
        <span className="text-xs font-semibold">Immagine non più disponibile</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={className} onError={() => setBroken(true)} />;
}

/** Striscia di scotch semitrasparente. */
function Tape({ className }: { className?: string }) {
  return <span aria-hidden className={cn("absolute z-10 h-6 w-20 bg-[#fffbe8]/55 shadow-sm backdrop-blur-[1px]", className)} />;
}

function Avatar({ src, name, className }: { src: string; name: string; className?: string }) {
  if (!src) {
    return <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full bg-ink/15 text-[0.6rem] font-bold", className)}>{name.slice(0, 1).toUpperCase()}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" className={cn("size-6 shrink-0 rounded-full object-cover", className)} />;
}

export function ReactionBar({
  item,
  onReact,
  onRepost,
  dark = false,
}: {
  item: BachecaItem;
  onReact: (emoji: string) => void;
  onRepost?: () => void;
  dark?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {BACHECA_EMOJIS.map((emoji) => {
        const n = (item.reactions[emoji] || 0) + (emoji === "💀" && item.kind === "skull" ? Math.max(0, (item.skulls || 1) - 1) : 0);
        const on = item.mine.includes(emoji);
        return (
          <motion.button
            key={emoji}
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => onReact(emoji)}
            aria-pressed={on}
            aria-label={`Reazione ${emoji}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold lining-nums transition-colors",
              dark
                ? on
                  ? "bg-caramel text-ink"
                  : "bg-crema/10 text-crema/80 hover:bg-crema/20"
                : on
                  ? "bg-ink text-paper"
                  : "bg-ink/8 text-ink/70 hover:bg-ink/15",
            )}
          >
            <span>{emoji}</span>
            {n > 0 && <span>{n}</span>}
          </motion.button>
        );
      })}
      {item.kind !== "skull" && onRepost ? (
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          onClick={onRepost}
          disabled={item.repostedByMe}
          aria-pressed={Boolean(item.repostedByMe)}
          title={item.repostedByMe ? "L'hai già repostato" : "Reposta"}
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold lining-nums transition-colors",
            item.repostedByMe
              ? dark
                ? "bg-caramel text-ink"
                : "bg-ink text-paper"
              : dark
                ? "bg-crema/10 text-crema/80 hover:bg-crema/20"
                : "bg-ink/8 text-ink/70 hover:bg-ink/15",
          )}
        >
          <Repeat2 className="size-3.5" />
          {item.repostedByMe ? "Repostato" : "Reposta"}
          {item.reposts > 0 && <span className="opacity-70">· {item.reposts}</span>}
        </motion.button>
      ) : (
        item.reposts > 0 && (
          <span className={cn("ml-auto inline-flex items-center gap-1 text-xs", dark ? "text-crema/60" : "text-ink/55")} title="Repostato altre volte">
            <Repeat2 className="size-3.5" /> {item.reposts}
          </span>
        )
      )}
    </div>
  );
}

function Byline({ item, dark = false }: { item: BachecaItem; dark?: boolean }) {
  const verb = { quote: "quotato da", repost: "repostato da", clip: "registrata da", skull: "💀 di" }[item.kind];
  return (
    <div className={cn("flex items-center gap-2 text-xs", dark ? "text-crema/70" : "text-ink/65")}>
      <Avatar src={item.author.avatar} name={item.author.name} />
      <span className="min-w-0 truncate">
        <strong className={dark ? "text-crema" : "text-ink"}>{item.author.name}</strong>
        {item.by.id && item.by.id !== item.author.id && (
          <>
            {" "}
            · {verb} {item.by.name}
          </>
        )}
      </span>
      <span className="ml-auto shrink-0 opacity-70">{timeAgo(item.createdAt)}</span>
    </div>
  );
}

/** Contenitore comune: inclinazione stabile, arrivo dall'alto, si raddrizza al passaggio. */
function Hanging({ item, children, onOpen, fresh }: { item: BachecaItem; children: React.ReactNode; onOpen: () => void; fresh?: boolean }) {
  const reduce = useReducedMotion();
  const tilt = tiltFor(item.id);
  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : fresh ? { opacity: 0, y: -60, rotate: tilt - 12, scale: 1.08 } : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0, rotate: tilt, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={reduce ? undefined : { rotate: 0, y: -4, transition: { type: "spring", stiffness: 300, damping: 18 } }}
      transition={fresh ? { type: "spring", stiffness: 220, damping: 14 } : { duration: 0.45, ease }}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      tabIndex={0}
      role="button"
      aria-label={`Apri ${item.kind === "quote" ? "la quote" : item.kind === "clip" ? "la clip" : "il post"} di ${item.author.name}`}
      className="relative mb-8 cursor-pointer break-inside-avoid outline-none focus-visible:ring-2 focus-visible:ring-caramel"
    >
      {children}
    </motion.article>
  );
}

/** Quote: polaroid con la puntina. */
function Polaroid({ item, onReact, onRepost }: { item: BachecaItem; onReact: (e: string) => void; onRepost?: () => void }) {
  return (
    <div className="relative bg-[#fbf7ef] p-3 pb-4 text-ink shadow-[0_14px_26px_-10px_rgba(0,0,0,0.6)]">
      <Pin tone="red" />
      <SafeImage src={item.imageUrl} alt={`Quote di ${item.author.name}`} className="w-full bg-ink/10 object-cover" />
      <p className="mt-3 text-center font-script text-2xl leading-none text-ink/80">{item.author.name}</p>
      <div className="mt-3 space-y-2">
        <Byline item={item} />
        <ReactionBar item={item} onReact={onReact} onRepost={onRepost} />
      </div>
    </div>
  );
}

/** Repost: post-it giallo con il testo, foto attaccate con lo scotch. */
function PostIt({ item, onReact, onRepost }: { item: BachecaItem; onReact: (e: string) => void; onRepost?: () => void }) {
  const tones = ["bg-[#fbe68a]", "bg-[#ffd0b0]", "bg-[#c9f0c4]", "bg-[#cfe3ff]"];
  const tone = tones[Math.abs(Math.round(tiltFor(item.id, 100))) % tones.length];
  /* niente link grezzi: GIF e immagini si vedono, gli altri link diventano chip */
  const parts = splitBachecaText(item.text, [item.imageUrl]);
  const photo = item.imageUrl || parts.images[0] || "";
  return (
    <div className={cn("relative p-4 text-ink shadow-[0_14px_22px_-12px_rgba(0,0,0,0.6)]", tone)}>
      <Tape className="-top-3 left-1/2 -translate-x-1/2 -rotate-2" />
      {photo && (
        <div className="relative -mx-1 mb-3 rotate-[1.5deg] bg-white p-1.5 shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" loading="lazy" className="w-full object-cover" onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />
        </div>
      )}
      {parts.text && <p className="whitespace-pre-line break-words text-[0.95rem] leading-snug [overflow-wrap:anywhere]">{parts.text.length > 420 ? `${parts.text.slice(0, 420)}…` : parts.text}</p>}
      <LinkChips links={parts.links} />
      <MediaAttachments media={item.media} />
      <div className="mt-3 space-y-2 border-t border-ink/10 pt-2">
        <Byline item={item} />
        <ReactionBar item={item} onReact={onReact} onRepost={onRepost} />
      </div>
    </div>
  );
}

/** Audio allegato: piccolo lettore (stesso lettore unico della Bacheca). */
export function AudioChip({ url, name, dark = false }: { url: string; name: string; dark?: boolean }) {
  const [playing, progress] = useBachecaAudio(url);
  return (
    <div
      className={cn("mt-2 flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3", dark ? "bg-crema/10" : "bg-ink/8")}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => toggleBachecaAudio(url)}
        aria-label={playing ? "Pausa" : `Ascolta ${name || "l'audio"}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-caramel text-ink shadow transition-transform active:scale-90"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-xs font-semibold", dark ? "text-crema/80" : "text-ink/75")}>{name || "Audio"}</p>
        <div className={cn("mt-1 h-1 overflow-hidden rounded-full", dark ? "bg-crema/15" : "bg-ink/10")}>
          <div className="h-full bg-caramel transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Allegati non immagine sul post-it: audio col lettore, video subito visibile, il resto come link. */
export function MediaAttachments({ media, dark = false }: { media: BachecaItem["media"]; dark?: boolean }) {
  const rest = media.filter((m) => m.type !== "image");
  if (!rest.length) return null;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      {rest.slice(0, 4).map((m) =>
        m.type === "audio" ? (
          <AudioChip key={m.url} url={m.url} name={m.name} dark={dark} />
        ) : m.type === "video" ? (
          <video key={m.url} src={m.url} controls preload="metadata" playsInline className="mt-2 w-full rounded-md bg-black" />
        ) : (
          <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" className={cn("mt-2 block truncate text-xs font-semibold underline", dark ? "text-crema/75" : "text-ink/70")}>
            {m.name || "Allegato"}
          </a>
        ),
      )}
    </div>
  );
}

/** Link nel testo: solo il nome del sito, cliccabile. */
export function LinkChips({ links, dark = false }: { links: { url: string; host: string }[]; dark?: boolean }) {
  if (!links.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
      {links.slice(0, 6).map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          title={l.url}
          className={cn(
            "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-xs font-semibold",
            dark ? "bg-crema/10 text-crema/80 hover:bg-crema/20" : "bg-ink/8 text-ink/75 hover:bg-ink/15",
          )}
        >
          <ExternalLink className="size-3 shrink-0" /> {l.host}
        </a>
      ))}
    </div>
  );
}

/** Clip: musicassetta. Le bobine girano mentre suona, la trascrizione è l'etichetta. */
export function Cassette({ item, onReact, onRepost, big = false }: { item: BachecaItem; onReact: (e: string) => void; onRepost?: () => void; big?: boolean }) {
  const reduce = useReducedMotion();
  /* lettore unico: card e dettaglio della stessa clip vanno insieme */
  const [playing, progress] = useBachecaAudio(item.audioUrl || "");
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleBachecaAudio(item.audioUrl || "");
  };
  const reel = (
    <motion.span
      className="flex size-11 items-center justify-center rounded-full bg-[#1c1410] ring-4 ring-[#3a2a20]"
      animate={playing && !reduce ? { rotate: 360 } : { rotate: 0 }}
      transition={playing ? { duration: 1.6, repeat: Infinity, ease: "linear" } : { duration: 0.3 }}
    >
      <span className="size-3 rounded-full bg-[#d9c7a8] [box-shadow:0_0_0_3px_#1c1410,0_0_0_5px_#d9c7a8]" />
    </motion.span>
  );
  return (
    <div className="relative rounded-xl bg-gradient-to-b from-[#3b2d25] to-[#21170f] p-3 text-crema shadow-[0_16px_28px_-12px_rgba(0,0,0,0.75)] ring-1 ring-black/40">
      <Pin tone="blue" />
      <div className="rounded-md bg-[#efe3c9] px-3 pb-2 pt-2.5 text-ink">
        <p className="truncate font-display text-lg font-bold leading-tight">🎙️ {item.author.name}</p>
        <p className={cn("mt-1 font-mono text-[0.72rem] leading-snug text-ink/75", big ? "" : "line-clamp-3")}>
          {item.text || "Clip vocale"}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-[#120c08] px-4 py-2.5">
        {reel}
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pausa" : "Ascolta la clip"}
          className="flex size-10 items-center justify-center rounded-full bg-caramel text-ink shadow-md transition-transform active:scale-90"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
        </button>
        {reel}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-crema/10">
        <div className="h-full bg-caramel transition-[width] duration-200" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 space-y-2">
        <Byline item={item} dark />
        <ReactionBar item={item} onReact={onReact} onRepost={onRepost} dark />
      </div>
    </div>
  );
}

/** 💀: cartolina con il timbro a inchiostro. */
function SkullCard({ item, onReact }: { item: BachecaItem; onReact: (e: string) => void }) {
  return (
    <div className="relative bg-[#f3ead8] p-3 text-ink shadow-[0_14px_26px_-10px_rgba(0,0,0,0.6)] [background-image:repeating-linear-gradient(0deg,transparent_0_26px,rgba(14,9,6,0.05)_26px_27px)]">
      <Tape className="-left-4 -top-2 -rotate-[24deg]" />
      <Tape className="-right-4 -top-2 rotate-[24deg]" />
      <span
        aria-hidden
        className="absolute right-3 top-3 z-10 flex size-14 rotate-12 flex-col items-center justify-center rounded-full border-[3px] border-[#7a1f1f]/80 text-[#7a1f1f]/90 mix-blend-multiply"
      >
        <span className="text-lg leading-none">💀</span>
        <span className="text-[0.65rem] font-black lining-nums">×{item.skulls || 1}</span>
      </span>
      {item.imageUrl ? (
        <SafeImage src={item.imageUrl} alt={item.text ? item.text.slice(0, 120) : `Messaggio di ${item.author.name}`} className="w-full rounded-sm" />
      ) : (
        <p className="whitespace-pre-line break-words p-2 pr-16 font-display text-lg [overflow-wrap:anywhere]">{item.text}</p>
      )}
      <div className="mt-3 space-y-2">
        <Byline item={item} />
        <ReactionBar item={item} onReact={onReact} />
      </div>
    </div>
  );
}

export function BachecaCard({
  item,
  onOpen,
  onReact,
  onRepost,
  fresh,
}: {
  item: BachecaItem;
  onOpen: () => void;
  onReact: (emoji: string) => void;
  onRepost: () => void;
  fresh?: boolean;
}) {
  const body =
    item.kind === "quote" ? (
      <Polaroid item={item} onReact={onReact} onRepost={onRepost} />
    ) : item.kind === "clip" ? (
      <Cassette item={item} onReact={onReact} onRepost={onRepost} />
    ) : item.kind === "skull" ? (
      <SkullCard item={item} onReact={onReact} />
    ) : (
      <PostIt item={item} onReact={onReact} onRepost={onRepost} />
    );
  return (
    <Hanging item={item} onOpen={onOpen} fresh={fresh}>
      {body}
    </Hanging>
  );
}
