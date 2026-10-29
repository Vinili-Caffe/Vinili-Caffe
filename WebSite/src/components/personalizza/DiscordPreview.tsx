"use client";

import { motion } from "motion/react";
import { Headphones, Volume2 } from "lucide-react";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { discordEmojiUrl } from "@/components/discord/EmojiText";
import { HOLO_PRIMARY, HOLO_SECONDARY, type ColorMode } from "@/lib/personalizza";
import { cn } from "@/lib/cn";

/** Icona ruolo come la salva il bot: emoji unicode, `<:nome:id>` oppure link https a un'immagine. */
export function parseRoleIcon(value: string): { kind: "none" } | { kind: "img"; src: string; name: string } | { kind: "text"; text: string } {
  const v = String(value || "").trim();
  if (!v) return { kind: "none" };
  const m = v.match(/^<(a?):([A-Za-z0-9_~]{1,64}):(\d{15,22})>$/);
  if (m) return { kind: "img", src: discordEmojiUrl(m[3], m[1] === "a", 64), name: m[2] };
  if (/^https:\/\/\S+$/i.test(v)) return { kind: "img", src: v, name: "immagine" };
  return { kind: "text", text: v };
}

export function RoleIconGlyph({ value, className }: { value: string; className?: string }) {
  const icon = parseRoleIcon(value);
  if (icon.kind === "img")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon.src} alt={`:${icon.name}:`} className={cn("size-5 object-contain", className)} />;
  if (icon.kind === "text") return <span className={cn("text-lg leading-none", className)}>{icon.text}</span>;
  return null;
}

function roleFill(mode: ColorMode, c1: string, c2: string) {
  if (mode === "holo") return `linear-gradient(90deg, ${HOLO_PRIMARY}, ${HOLO_SECONDARY}, #ffffff, ${HOLO_PRIMARY})`;
  if (mode === "gradient") return `linear-gradient(90deg, ${c1}, ${c2})`;
  return `linear-gradient(90deg, ${c1}, ${c1})`;
}

/** Messaggio in chat + pillola del ruolo, come li disegna Discord (tema scuro). */
export function RolePreview({ name, mode, color, color2, icon }: { name: string; mode: ColorMode; color: string; color2: string; icon: string }) {
  const { user } = useAuth();
  const fill = roleFill(mode, color, color2);
  const nameStyle = {
    backgroundImage: fill,
    backgroundSize: mode === "holo" ? "300% 100%" : "100% 100%",
  };
  return (
    <div className="scheme-dark overflow-hidden rounded-2xl bg-[#313338] text-[#dbdee1] ring-1 ring-black/40">
      <p className="border-b border-black/25 bg-[#2b2d31] px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#949ba4]">
        Come appare su Discord
      </p>
      <div className="flex gap-3 px-4 pb-3 pt-3.5">
        {user ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl(user, 80)} alt="" className="size-10 shrink-0 rounded-full" />
        ) : (
          <span className="size-10 shrink-0 rounded-full bg-[#5865f2]" />
        )}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <motion.span
              className="bg-clip-text font-semibold text-transparent"
              style={nameStyle}
              animate={mode === "holo" ? { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] } : { backgroundPosition: "0% 50%" }}
              transition={mode === "holo" ? { duration: 6, repeat: Infinity, ease: "linear" } : { duration: 0 }}
            >
              {user ? displayName(user) : "Tu"}
            </motion.span>
            <RoleIconGlyph value={icon} className="size-[1.15rem] text-base" />
            <span className="text-[0.7rem] text-[#949ba4]">Oggi alle 21:30</span>
          </p>
          <p className="mt-0.5 text-[0.94rem]">Nuovo ruolo, che ne dite? ☕</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-black/20 px-4 py-3">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-[#949ba4]">Ruolo</span>
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-[4px] bg-[#232428] px-2 py-1 text-xs font-medium">
          <span className="size-3 shrink-0 rounded-full" style={{ background: fill }} />
          <RoleIconGlyph value={icon} className="size-3.5 text-xs" />
          <span className="truncate">{name.trim() || "Il tuo ruolo"}</span>
        </span>
      </div>
    </div>
  );
}

/** Riga del canale nell'elenco di Discord: ༄🎧ǀnome, con chi c'è dentro. */
export function VoicePreview({ name, emoji, members }: { name: string; emoji: string; members: { id: string; avatarUrl?: string; displayName?: string; username?: string }[] }) {
  const { user } = useAuth();
  const people = members.length ? members.slice(0, 4) : user ? [{ id: user.id, avatarUrl: avatarUrl(user, 48), displayName: displayName(user) }] : [];
  return (
    <div className="scheme-dark overflow-hidden rounded-2xl bg-[#2b2d31] text-[#949ba4] ring-1 ring-black/40">
      <p className="border-b border-black/25 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em]">Come appare su Discord</p>
      <div className="px-2 py-3">
        <p className="px-2 pb-1 text-[0.68rem] font-bold uppercase tracking-wide">Vocali private</p>
        <div className="flex items-center gap-1.5 rounded-md bg-[#404249] px-2 py-1.5 text-[#f2f3f5]">
          <Volume2 className="size-4 shrink-0 text-[#949ba4]" />
          <span className="truncate font-medium">
            ༄{emoji.trim() || "🎧"}ǀ{name.trim() || "privata"}
          </span>
        </div>
        <ul className="mt-1 space-y-0.5 pl-8">
          {people.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-0.5 text-sm">
              {m.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatarUrl} alt="" className="size-6 rounded-full" />
              ) : (
                <span className="flex size-6 items-center justify-center rounded-full bg-[#5865f2] text-white">
                  <Headphones className="size-3" />
                </span>
              )}
              <span className="truncate">{m.displayName || m.username || m.id}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
