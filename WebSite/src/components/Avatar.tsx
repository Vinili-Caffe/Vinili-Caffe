"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { sizedDiscordCdn } from "@/lib/discord-cdn";
import { PresenceDot } from "@/components/presence/PresenceDot";

/** Silhouette neutra (niente iniziale / avatar Discord default). */
function Silhouette({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative flex items-center justify-center overflow-hidden rounded-full bg-mocha text-crema/35", className)}
      aria-hidden
      data-vc-avatar
    >
      <svg viewBox="0 0 40 40" className="size-[70%] opacity-80" fill="currentColor">
        <circle cx="20" cy="14" r="7" />
        <path d="M6 34c0-7.2 6.3-12 14-12s14 4.8 14 12v2H6v-2z" />
      </svg>
    </span>
  );
}

type AvatarProps = {
  src?: string;
  name: string;
  className?: string;
  /** Se presente → pallino presenza sito (online/idle). */
  userId?: string | null;
  /** Disattiva il wrap PresenceDot anche se c’è userId (es. già wrappato fuori). */
  noPresence?: boolean;
};

/** Avatar con silhouette se manca o non carica (no fallback Discord). */
/**
 * Avatar Discord alla misura giusta: dalla classe `size-N` (N×4 px) si chiede a Discord la potenza di 2
 * che copre lo schermo ad alta densità (×2), invece di scaricarlo sempre a 128/256 px.
 */
function sizedDiscordUrl(src: string | undefined, className?: string): string | undefined {
  if (!src || !/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//.test(src)) return src;
  const m = String(className || "").match(/(?:^|\s)size-(\d+(?:\.\d+)?)(?:\s|$)/);
  const need = m ? Number(m[1]) * 4 * 2 : 128;
  let size = 16;
  while (size < need && size < 1024) size *= 2;
  return sizedDiscordCdn(src, Math.max(32, size)) || src;
}

export function Avatar({ src: rawSrc, name, className, userId, noPresence }: AvatarProps) {
  const src = sizedDiscordUrl(rawSrc, className);
  const [bad, setBad] = useState(false);
  const withPresence = Boolean(userId) && !noPresence;
  const faceClass = withPresence ? "size-full" : className;

  const face =
    !src || bad ? (
      <Silhouette className={faceClass} />
    ) : (
      <img
        src={src}
        alt=""
        title={name}
        loading="lazy"
        data-vc-avatar
        data-user-id={userId || undefined}
        onError={() => setBad(true)}
        className={cn("rounded-full object-cover", faceClass)}
      />
    );

  if (!withPresence) return face;
  // size / margin sul wrap: il pallino resta allineato all'angolo in basso a destra dell'avatar
  return (
    <PresenceDot userId={userId} className={cn("rounded-full", className)}>
      {face}
    </PresenceDot>
  );
}
