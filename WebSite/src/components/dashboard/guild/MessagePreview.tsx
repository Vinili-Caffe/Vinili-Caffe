"use client";

import { DiscordContent } from "@/components/discord/DiscordContent";
import { cn } from "@/lib/cn";

type Named = { id: string; name: string };

/**
 * Anteprima leggibile di un messaggio del bot (embed stile Discord): emoji, menzioni
 * di ruoli/canali e markdown come li vedono i membri. I segnaposto {xxx} restano evidenziati.
 */
export function MessagePreview({
  title,
  text,
  roles = [],
  channels = [],
  samples = {},
  color = "#d49150",
  className,
}: {
  title?: string | null;
  text?: string | null;
  roles?: Named[];
  channels?: Named[];
  /** valori d'esempio per i segnaposto, es. { guild: "Vinili & Caffè", points: "12" } */
  samples?: Record<string, string>;
  color?: string;
  className?: string;
}) {
  const fill = (s: string) => s.replace(/\{([a-zA-Z_.]+)\}/g, (m, k: string) => samples[k] ?? m);
  const t = fill(String(title || "").trim());
  const body = fill(String(text || "").trim());
  if (!t && !body) return null;
  const names = {
    roles: Object.fromEntries(roles.map((r) => [r.id, r.name])),
    channels: Object.fromEntries(channels.map((c) => [c.id, c.name])),
  };
  return (
    <div className={cn("mt-2", className)}>
      <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/60">Anteprima</p>
      <div translate="no" className="rounded-xl bg-[#313338] p-3 ring-1 ring-sand/10">
        <div className="flex overflow-hidden rounded-md bg-[#2b2d31]">
          <span className="w-1 shrink-0" style={{ background: color }} aria-hidden />
          <div className="min-w-0 flex-1 space-y-1 px-3 py-2.5">
            {t ? <DiscordContent text={t} names={names} className="text-[0.95rem] font-semibold text-white" /> : null}
            {body ? <DiscordContent text={body} names={names} className="text-sm leading-relaxed text-[#dbdee1]" /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
