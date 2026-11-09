"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Diamond, Gavel, Handshake, Settings2, Ticket, Wrench } from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import { cn } from "@/lib/cn";
import { loadGuildAudit, type AuditRow } from "@/lib/dashboard-insights";
import { Notice, RowsSkeleton } from "./bits";

type Area = "all" | "settings" | "commands" | "moderation" | "tickets" | "partnership" | "premium" | "community";

const AREA_LABEL: Record<string, string> = {
  settings: "Impostazioni",
  commands: "Comandi",
  moderation: "Moderazione",
  tickets: "Ticket",
  partnership: "Partnership",
  premium: "Premium",
  community: "Community",
  altro: "Altro",
};

const AREA_ICON: Record<string, React.ReactNode> = {
  settings: <Settings2 className="size-4" />,
  commands: <Settings2 className="size-4" />,
  moderation: <Gavel className="size-4" />,
  tickets: <Ticket className="size-4" />,
  partnership: <Handshake className="size-4" />,
  premium: <Diamond className="size-4" />,
};

const PAGE_SIZE = 25;

function dayLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const yest = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Oggi";
  if (d.toDateString() === yest.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function rowKey(r: AuditRow, i: number) {
  return `${r.at}-${r.userId || ""}-${r.action}-${i}`;
}

function AuditEntry({ row, open, onToggle }: { row: AuditRow; open: boolean; onToggle: () => void }) {
  const when = new Date(row.at);
  const areaLabel = AREA_LABEL[row.area] || row.area || "Altro";
  const preview = row.fields.length ? row.fields.join(" · ") : "Nessun dettaglio sui campi";

  return (
    <li className={cn("border-sand/[0.07]", open && "bg-crema/[0.02]")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-crema/[0.03]"
      >
        <span className="relative mt-0.5 shrink-0">
          {row.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.avatar} alt="" width={32} height={32} className="size-8 rounded-full object-cover" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-crema/[0.08] text-xs font-bold text-crema/80">
              {(row.username || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-mocha text-ember ring-2 ring-espresso [&>svg]:size-2.5">
            {AREA_ICON[row.area] || <Wrench className="size-2.5" />}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-crema">
            <span className="font-semibold">{row.username || "Qualcuno"}</span> <span className="text-crema/80">· {row.action}</span>
          </span>
          {!open && row.fields.length ? <span className="mt-0.5 block truncate text-xs text-crema/60">{preview}</span> : null}
          {!open && !row.fields.length ? <span className="mt-0.5 block text-xs text-crema/45">Clicca per i dettagli</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <time className="text-xs tabular-nums text-crema/60" dateTime={when.toISOString()}>
            {when.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </time>
          <ChevronDown className={cn("size-3.5 text-crema/40 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-sand/[0.07] px-4 pb-3.5 pt-3 sm:pl-[3.75rem]">
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-crema/50">Quando</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-crema/85">
                    {when.toLocaleString("it-IT", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-crema/50">Area</dt>
                  <dd className="mt-0.5 font-medium text-crema/85">{areaLabel}</dd>
                </div>
                {row.userId ? (
                  <div className="sm:col-span-2">
                    <dt className="text-crema/50">Chi</dt>
                    <dd className="mt-0.5 font-medium text-crema/85">
                      {row.username || "Utente"}{" "}
                      <span className="font-mono text-[0.7rem] text-crema/50">ID {row.userId}</span>
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/50">Cosa è cambiato</p>
                {row.fields.length ? (
                  <ul className="mt-1.5 space-y-1">
                    {row.fields.map((f, i) => (
                      <li
                        key={`${i}-${f}`}
                        className="rounded-lg bg-crema/[0.05] px-2.5 py-1.5 text-xs leading-relaxed text-crema/85 ring-1 ring-sand/10"
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-xs text-crema/55">Nessun dettaglio sul contenuto di questa azione (es. solo eliminazione).</p>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

/** Chi ha cambiato cosa e quando, dalla dashboard. */
export function AuditPanel({
  guildId,
  token,
  area = "all",
}: {
  guildId: string;
  token: string;
  area?: Area | string;
}) {
  const activeArea = (String(area || "all").trim() || "all") as Area;
  const [page, setPage] = useState(1);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [state, setState] = useState<{ key: string; rows: AuditRow[]; pages: number; total: number; error: string } | null>(null);
  const key = `${guildId}:${activeArea}:${page}`;

  useEffect(() => {
    setPage(1);
  }, [guildId, activeArea]);

  useEffect(() => {
    let off = false;
    void loadGuildAudit(token, guildId, page, activeArea).then((r) => {
      if (off) return;
      setState(r.ok ? { key, rows: r.rows, pages: r.pages, total: r.total, error: "" } : { key, rows: [], pages: 1, total: 0, error: r.message });
    });
    return () => {
      off = true;
    };
  }, [token, guildId, activeArea, page, key]);

  useEffect(() => {
    setOpenKey(null);
  }, [key]);

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

  const from = current && current.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = current ? Math.min(page * PAGE_SIZE, current.total) : 0;

  return (
    <div id="dash-audit" className="scroll-mt-24 space-y-4">
      <p className="text-sm text-crema/70">
        Ogni modifica fatta dalla dashboard su questo server, con chi l&apos;ha fatta. Clicca una riga per i dettagli. Vengono tenute le ultime 500.
      </p>
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
                {g.rows.map((r, i) => {
                  const id = rowKey(r, i);
                  return (
                    <AuditEntry
                      key={id}
                      row={r}
                      open={openKey === id}
                      onToggle={() => setOpenKey((cur) => (cur === id ? null : id))}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand/10 pt-3">
            <span className="text-xs tabular-nums text-crema/60">
              {current.total <= PAGE_SIZE
                ? `${current.total} modific${current.total === 1 ? "a" : "he"}`
                : `${from}–${to} di ${current.total}`}
            </span>
            <Pagination
              page={page}
              totalPages={Math.max(1, current.pages)}
              onChange={setPage}
              scrollToId="dash-audit"
              className="mt-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
