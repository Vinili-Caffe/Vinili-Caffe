"use client";

import { useEffect, useMemo, useState } from "react";
import { Diamond, Handshake, Settings2, Ticket, Wrench } from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import { loadGuildAudit, type AuditRow } from "@/lib/dashboard-insights";
import { Notice, RowsSkeleton, Subnav } from "./bits";

type Area = "all" | "settings" | "tickets" | "partnership" | "premium";

const AREAS: { id: Area; label: string }[] = [
  { id: "all", label: "Tutto" },
  { id: "settings", label: "Impostazioni" },
  { id: "tickets", label: "Ticket" },
  { id: "partnership", label: "Partnership" },
  { id: "premium", label: "Premium" },
];

const AREA_ICON: Record<string, React.ReactNode> = {
  settings: <Settings2 className="size-4" />,
  commands: <Settings2 className="size-4" />,
  tickets: <Ticket className="size-4" />,
  partnership: <Handshake className="size-4" />,
  premium: <Diamond className="size-4" />,
};

function dayLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const yest = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Oggi";
  if (d.toDateString() === yest.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/** Chi ha cambiato cosa e quando, dalla dashboard. */
export function AuditPanel({ guildId, token }: { guildId: string; token: string }) {
  const [area, setArea] = useState<Area>("all");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ key: string; rows: AuditRow[]; pages: number; total: number; error: string } | null>(null);
  const key = `${guildId}:${area}:${page}`;

  useEffect(() => {
    let off = false;
    void loadGuildAudit(token, guildId, page, area).then((r) => {
      if (off) return;
      setState(r.ok ? { key, rows: r.rows, pages: r.pages, total: r.total, error: "" } : { key, rows: [], pages: 1, total: 0, error: r.message });
    });
    return () => {
      off = true;
    };
  }, [token, guildId, area, page, key]);

  const current = state && state.key === key ? state : null;
  const groups = useMemo(() => {
    const out: { day: string; rows: AuditRow[] }[] = [];
    for (const r of current?.rows || []) {
      const d = dayLabel(r.at);
      const last = out[out.length - 1];
      if (last && last.day === d) last.rows.push(r);
      else out.push({ day: d, rows: [r] });
    }
    return out;
  }, [current]);

  return (
    <div id="dash-audit" className="scroll-mt-24 space-y-4">
      <p className="text-sm text-crema/70">Ogni modifica fatta dalla dashboard su questo server, con chi l&apos;ha fatta. Vengono tenute le ultime 500.</p>
      <Subnav
        tabs={AREAS}
        value={area}
        onChange={(a) => {
          setArea(a);
          setPage(1);
        }}
        label="Tipo di modifica"
      />
      {!current ? (
        <RowsSkeleton rows={6} />
      ) : current.error ? (
        <Notice>{current.error}</Notice>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center text-sm text-crema/60">
          Ancora nessuna modifica registrata. Da adesso ogni cambio fatto qui compare in questo elenco.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.day}>
              <h3 className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/60">{g.day}</h3>
              <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
                {g.rows.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="flex items-start gap-3 px-4 py-3">
                    <span className="relative mt-0.5 shrink-0">
                      {r.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.avatar} alt="" width={32} height={32} className="size-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex size-8 items-center justify-center rounded-full bg-crema/[0.08] text-xs font-bold text-crema/80">
                          {(r.username || "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-mocha text-ember ring-2 ring-espresso [&>svg]:size-2.5">
                        {AREA_ICON[r.area] || <Wrench className="size-2.5" />}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-crema">
                        <span className="font-semibold">{r.username || "Qualcuno"}</span> <span className="text-crema/80">· {r.action}</span>
                      </p>
                      {r.fields.length ? <p className="mt-0.5 truncate text-xs text-crema/60">{r.fields.join(" · ")}</p> : null}
                    </div>
                    <time className="shrink-0 text-xs tabular-nums text-crema/60" dateTime={new Date(r.at).toISOString()}>
                      {new Date(r.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {current.pages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs tabular-nums text-crema/60">{current.total} modifiche</span>
              <Pagination page={page} totalPages={current.pages} onChange={setPage} scrollToId="dash-audit" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
