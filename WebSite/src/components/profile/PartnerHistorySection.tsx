"use client";

import { useEffect, useId, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import { cn } from "@/lib/cn";
import { loadPmPartnershipHistory, type PmPartnershipHistory } from "@/lib/dashboard-profile";

const PERIODS = [
  { v: "7", l: "7 giorni" },
  { v: "30", l: "30 giorni" },
  { v: "all", l: "Sempre" },
] as const;

function initialLetter(name: string) {
  return (name.match(/[\p{L}\p{N}]/u)?.[0] || "?").toUpperCase();
}

/** Cronologia partnership del server sul profilo staff (tenant e principale). */
export function PartnerHistorySection({
  token,
  guildId,
  className,
  compact = false,
}: {
  token: string;
  guildId: string;
  className?: string;
  /** dentro la griglia a due colonne della scheda staff principale */
  compact?: boolean;
}) {
  const listId = useId().replace(/:/g, "");
  const [days, setDays] = useState<string>("30");
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<PmPartnershipHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const query = days === "all" ? { page, pageSize: 20 } : { days: Number(days) || 30, page, pageSize: 20 };
    void loadPmPartnershipHistory(token, guildId, query).then((res) => {
      if (!alive) return;
      setLoading(false);
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) setDenied(true);
        setHistory(null);
        return;
      }
      setDenied(false);
      setHistory(res.data);
    });
    return () => {
      alive = false;
    };
  }, [token, guildId, days, page]);

  if (denied) return null;

  return (
    <section
      className={cn(
        compact
          ? "rounded-3xl bg-roast/85 p-5 ring-1 ring-sand/12 sm:p-6"
          : "rounded-3xl bg-roast/85 p-5 ring-1 ring-sand/12 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <History className="size-5 text-caramel" aria-hidden />
        <h3 className="font-display text-2xl font-semibold">Cronologia partnership</h3>
        {history ? (
          <span className="ml-auto text-xs text-crema/50 lining-nums">
            {history.totalPartnerships} con {history.uniqueServers} server
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-crema/55">Server con cui questo server ha fatto partnership, come <span className="font-semibold text-crema/70">+history</span>.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-grid grid-cols-3 gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p.v}
              type="button"
              role="radio"
              aria-checked={days === p.v}
              onClick={() => {
                if (p.v === days) return;
                setLoading(true);
                setPage(1);
                setDays(p.v);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                days === p.v ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema",
              )}
            >
              {p.l}
            </button>
          ))}
        </div>
      </div>

      <div id={`pm-history-${listId}`} className="mt-4 scroll-mt-24">
        {!history || (loading && !history.entries.length) ? (
          <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10" aria-busy>
            {Array.from({ length: compact ? 5 : 8 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="size-9 shrink-0 animate-pulse rounded-xl bg-crema/[0.06]" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block h-3.5 w-1/3 animate-pulse rounded bg-crema/[0.08]" />
                  <span className="block h-3 w-1/4 animate-pulse rounded bg-crema/[0.05]" />
                </span>
              </li>
            ))}
          </ul>
        ) : !history.entries.length ? (
          <p className="rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center text-sm text-crema/60">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Carico…
              </span>
            ) : (
              "Nessuna partnership in questo periodo."
            )}
          </p>
        ) : (
          <>
            <ul className={cn("divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10 transition-opacity", loading && "opacity-50")}>
              {history.entries.map((row, i) => {
                const name = row.guildName || row.invite || "Server";
                return (
                  <li key={`${row.guildId || row.invite || i}`} className="flex items-center gap-3 px-4 py-3">
                    {row.iconUrl ? (
                       
                      <img src={row.iconUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded-xl object-cover ring-1 ring-sand/15" />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-crema/[0.08] text-sm font-semibold text-crema/80" aria-hidden>
                        {initialLetter(name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-crema">{name}</p>
                      {row.lastAt ? <p className="text-xs text-crema/60">ultima il {new Date(row.lastAt).toLocaleDateString("it-IT")}</p> : null}
                    </div>
                    <span className="rounded-md bg-crema/[0.07] px-2 py-1 text-xs font-semibold tabular-nums text-crema/85">
                      {row.count} {row.count === 1 ? "volta" : "volte"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {history.totalPages > 1 ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs tabular-nums text-crema/60">
                  Pagina {history.page} di {history.totalPages}
                </span>
                <Pagination
                  page={history.page}
                  totalPages={history.totalPages}
                  scrollToId={`pm-history-${listId}`}
                  className="mt-0"
                  onChange={(n) => {
                    setLoading(true);
                    setPage(n);
                  }}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
