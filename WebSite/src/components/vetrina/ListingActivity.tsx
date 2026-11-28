"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Bot, ChartColumn, Clock, ExternalLink } from "lucide-react";
import { loadListingActivity, type ListingActivity as Activity } from "@/lib/boards";
import { cn } from "@/lib/cn";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Attività del server ora per ora (media giornaliera): se manca il bot, CTA di invito. */
export function ListingActivity({
  listingId,
  token,
  inviteUrl,
}: {
  listingId: string;
  token?: string | null;
  inviteUrl?: string | null;
}) {
  const [data, setData] = useState<Activity | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    let alive = true;
    setLoaded(false);
    void loadListingActivity(listingId, token).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else setData(null);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [listingId, token]);

  if (!loaded) {
    return <div className="h-48 animate-pulse rounded-3xl bg-roast/50 ring-1 ring-sand/10" />;
  }

  if (!data?.available || !Array.isArray(data.hours) || data.hours.length !== 24) {
    return (
      <section className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
        <h2 className="flex items-center gap-2.5 font-display text-2xl font-semibold">
          <ChartColumn className="size-5 text-caramel" /> Attività del server
        </h2>
        <p className="mt-3 text-sm text-crema/60">
          Per vedere le ore di punta serve il bot di Vinili &amp; Caffè nel server (messaggi e vocale).
        </p>
        {inviteUrl ? (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-caramel px-4 py-2.5 text-sm font-semibold text-ink"
          >
            <Bot className="size-4" /> Invita Vinili &amp; Caffè
            <ExternalLink className="size-3.5 opacity-70" />
          </a>
        ) : (
          <p className="mt-3 text-xs text-crema/40">Chiedi allo staff del server di invitare il bot dalla dashboard.</p>
        )}
      </section>
    );
  }

  const max = Math.max(...data.hours, 1);
  const peak = typeof data.peakHour === "number" ? data.peakHour : data.hours.indexOf(max);
  const shown = hover ?? peak;
  const v = data.hours[shown] || 0;

  return (
    <section className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
      <h2 className="flex items-center gap-2.5 font-display text-2xl font-semibold">
        <ChartColumn className="size-5 text-caramel" /> Attività del server
      </h2>

      <p className="mt-3 text-sm text-crema/60">
        <span className="font-semibold tabular-nums text-crema">{hh(shown)}</span>
        {" · "}
        {v >= 1 ? `circa ${Math.round(v).toLocaleString("it-IT")} interazioni al giorno` : "quasi nessuno"}
      </p>

      <div className="mt-4 flex h-24 items-end gap-[3px]" onMouseLeave={() => setHover(null)} role="img" aria-label={`Attività per ora, picco alle ${hh(peak)}`}>
        {data.hours.map((n, h) => {
          const ratio = n / max;
          return (
            <button
              key={h}
              type="button"
              aria-label={`${hh(h)}: ${Math.round(n)} al giorno`}
              onMouseEnter={() => setHover(h)}
              onFocus={() => setHover(h)}
              onBlur={() => setHover(null)}
              className="group flex h-full flex-1 items-end outline-none"
            >
              <motion.span
                initial={{ height: 4 }}
                animate={{ height: `${Math.max(6, ratio * 100)}%` }}
                transition={{ duration: 0.6, delay: h * 0.015, ease: [0.22, 1, 0.36, 1] }}
                className={cn("block w-full rounded-t-[4px] rounded-b-[2px] transition-colors", shown === h ? "bg-ember" : "bg-caramel")}
                style={{ opacity: shown === h ? 1 : 0.22 + ratio * 0.6 }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-crema/40">
        <span>0:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>

      <p className="mt-4 flex items-center gap-2 border-t border-sand/10 pt-4 text-sm text-crema/65">
        <Clock className="size-4 text-caramel" />
        Più attivo verso le <span className="font-semibold text-crema">{hh(peak)}</span>
      </p>
      <p className="mt-1 text-xs text-crema/40">
        Messaggi e minuti in vocale, media degli ultimi {data.days} giorni (ora italiana).
      </p>
    </section>
  );
}
