"use client";

import { Select } from "@/components/ui/Select";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ExternalLink, FileText, Search, Star, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Notice, fieldClass, miniBtn } from "./bits";

// API: GET /webhooks/site-dashboard/guilds/:id/tickets/transcripts?username=&ticketId=&ticketType=&rating=&offset=&limit=
//      GET /webhooks/site-dashboard/guilds/:id/tickets/transcripts/:ticketId → HTML (o { apiUrl })
// Handler: MultiGuild/tickets/dashboard/dashboardTranscriptsApi.ts

type ArchiveRow = {
  id: string;
  number: number | null;
  username: string | null;
  userId: string | null;
  type: string;
  closedAt: string | null;
  createdAt: string | null;
  closeReason: string | null;
  rating: number | null;
  canOpen: boolean;
};

type ArchivePage = { rows: ArchiveRow[]; total: number; nextOffset: number | null; panels: string[] };

const PAGE = 25;
const BASE = (gid: string) => `/webhooks/site-dashboard/guilds/${encodeURIComponent(gid)}/tickets/transcripts`;

function mapRow(raw: unknown): ArchiveRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id || "").trim();
  if (!id) return null;
  return {
    id,
    number: r.ticketNumber != null ? Number(r.ticketNumber) : null,
    username: r.username ? String(r.username) : null,
    userId: r.userId ? String(r.userId) : null,
    type: String(r.ticketType || "supporto"),
    closedAt: r.closedAt ? String(r.closedAt) : null,
    createdAt: r.createdAt ? String(r.createdAt) : null,
    closeReason: r.closeReason ? String(r.closeReason) : null,
    rating: r.ratingScore != null && Number.isFinite(Number(r.ratingScore)) ? Number(r.ratingScore) : null,
    canOpen: r.canOpenTranscript !== false,
  };
}

async function loadArchive(
  token: string,
  guildId: string,
  filters: { q: string; type: string; rating: string },
  offset: number,
): Promise<{ ok: true; page: ArchivePage } | { ok: false; message: string }> {
  const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset), _: String(Date.now()) });
  const q = filters.q.trim();
  if (/^#?\d{1,10}$/.test(q)) qs.set("ticketId", q.replace(/^#/, ""));
  else if (/^\d{16,22}$/.test(q)) qs.set("userId", q);
  else if (q.length >= 2) qs.set("username", q);
  if (filters.type) qs.set("ticketType", filters.type);
  if (filters.rating) qs.set("rating", filters.rating);
  try {
    const r = await fetch(`${BASE(guildId)}?${qs}`, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status !== 200 || d.ok === false) return { ok: false, message: typeof d.message === "string" ? d.message : "Archivio non disponibile." };
    return {
      ok: true,
      page: {
        rows: (Array.isArray(d.transcripts) ? d.transcripts : []).map(mapRow).filter((x): x is ArchiveRow => Boolean(x)),
        total: Number(d.total) || 0,
        nextOffset: d.nextOffset == null ? null : Number(d.nextOffset),
        panels: Array.isArray(d.panels) ? d.panels.map(String) : [],
      },
    };
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
}

async function loadTranscriptHtml(token: string, guildId: string, id: string): Promise<{ ok: true; html: string } | { ok: true; url: string } | { ok: false; message: string }> {
  try {
    const r = await fetch(`${BASE(guildId)}/${encodeURIComponent(id)}`, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "text/html,application/json", Authorization: `Bearer ${token}` },
    });
    const type = r.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.status !== 200 || d.ok === false) return { ok: false, message: typeof d.message === "string" ? d.message : "Transcript non disponibile." };
      const url = String(d.redirectUrl || d.apiUrl || "");
      return url ? { ok: true, url } : { ok: false, message: "Transcript non disponibile." };
    }
    if (r.status !== 200) return { ok: false, message: "Transcript non disponibile." };
    return { ok: true, html: await r.text() };
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function typeLabel(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/[_-]+/g, " ");
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[#f2c14e]" aria-label={`${n} stelle su 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("size-3", i < n ? "fill-current" : "opacity-25")} aria-hidden />
      ))}
    </span>
  );
}

/** Lettura del transcript dentro la dashboard (iframe isolato, niente script). */
function TranscriptReader({ token, guildId, row, onClose }: { token: string; guildId: string; row: ArchiveRow; onClose: () => void }) {
  const [state, setState] = useState<{ loading: boolean; error: string; src: string | null; external: string | null }>({ loading: true, error: "", src: null, external: null });

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void loadTranscriptHtml(token, guildId, row.id).then((res) => {
      if (cancelled) return;
      if (!res.ok) return setState({ loading: false, error: res.message, src: null, external: null });
      if ("url" in res) return setState({ loading: false, error: "", src: null, external: res.url });
      url = URL.createObjectURL(new Blob([res.html], { type: "text/html" }));
      setState({ loading: false, error: "", src: url, external: null });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, guildId, row.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = row.number != null ? `Ticket #${row.number}` : "Transcript";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink/75 p-0 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <motion.section
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-5xl flex-col overflow-hidden bg-roast ring-1 ring-sand/15 sm:rounded-2xl"
      >
        <header className="flex items-center gap-3 border-b border-sand/[0.08] px-4 py-3">
          <button type="button" onClick={onClose} className={cn(miniBtn, "sm:hidden")} aria-label="Torna all'archivio">
            <ArrowLeft className="size-3.5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-crema">
              {title} · {typeLabel(row.type)}
            </p>
            <p className="truncate text-xs text-crema/60">
              {row.username || row.userId || "Utente nascosto"} · chiuso {fmtDate(row.closedAt)}
              {row.closeReason ? ` · ${row.closeReason}` : ""}
            </p>
          </div>
          {state.src ? (
            <a href={state.src} target="_blank" rel="noreferrer" className={miniBtn}>
              <ExternalLink className="size-3.5" aria-hidden /> Apri a parte
            </a>
          ) : null}
          <button type="button" onClick={onClose} className={cn(miniBtn, "hidden sm:inline-flex")} aria-label="Chiudi">
            <X className="size-3.5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 bg-[#1e1f22]">
          {state.loading ? (
            <p className="p-8 text-center text-sm text-crema/60">Carico il transcript…</p>
          ) : state.error ? (
            <div className="p-6">
              <Notice>{state.error}</Notice>
            </div>
          ) : state.external ? (
            <div className="p-8 text-center">
              <a href={state.external} target="_blank" rel="noreferrer" className={miniBtn}>
                <ExternalLink className="size-3.5" aria-hidden /> Apri il transcript
              </a>
            </div>
          ) : state.src ? (
            <iframe title={title} src={state.src} className="h-[calc(100dvh-4rem)] w-full border-0 sm:h-[75vh]" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
          ) : null}
        </div>
      </motion.section>
    </motion.div>
  );
}

export function TicketArchive({ guildId, token }: { guildId: string; token: string }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [rating, setRating] = useState("");
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [meta, setMeta] = useState<{ total: number; nextOffset: number | null; panels: string[] }>({ total: 0, nextOffset: null, panels: [] });
  const [status, setStatus] = useState<{ loading: boolean; more: boolean; error: string }>({ loading: true, more: false, error: "" });
  const [open, setOpen] = useState<ArchiveRow | null>(null);

  /* la ricerca parte mezzo secondo dopo che smetti di scrivere */
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q), 450);
    return () => window.clearTimeout(t);
  }, [q]);

  const filters = useMemo(() => ({ q: query, type, rating }), [query, type, rating]);

  useEffect(() => {
    let cancelled = false;
    void loadArchive(token, guildId, filters, 0).then((res) => {
      if (cancelled) return;
      if (!res.ok) return setStatus({ loading: false, more: false, error: res.message });
      setRows(res.page.rows);
      setMeta({ total: res.page.total, nextOffset: res.page.nextOffset, panels: res.page.panels });
      setStatus({ loading: false, more: false, error: "" });
    });
    return () => {
      cancelled = true;
    };
  }, [token, guildId, filters]);

  const loadMore = async () => {
    if (meta.nextOffset == null) return;
    setStatus((s) => ({ ...s, more: true }));
    const res = await loadArchive(token, guildId, filters, meta.nextOffset);
    if (!res.ok) return setStatus({ loading: false, more: false, error: res.message });
    setRows((cur) => [...cur, ...res.page.rows]);
    setMeta((m) => ({ ...m, total: res.page.total, nextOffset: res.page.nextOffset }));
    setStatus({ loading: false, more: false, error: "" });
  };

  const filtered = Boolean(query.trim() || type || rating);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Cerca nei ticket chiusi</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/50" aria-hidden />
          <input
            name="archive-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Numero ticket, nome o ID utente…"
            className={cn(fieldClass, "mt-0 pl-9")}
          />
        </label>
        <Select
          aria-label="Tipo di ticket"
          value={type}
          onChange={setType}
          options={[{ value: "", label: "Tutti i tipi" }, ...meta.panels.map((p) => ({ value: p, label: typeLabel(p) }))]}
          className="lg:w-44"
        />
        <Select
          aria-label="Valutazione"
          value={rating}
          onChange={setRating}
          options={[
            { value: "", label: "Ogni valutazione" },
            ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} stelle` })),
            { value: "none", label: "Senza voto" },
          ]}
          className="lg:w-44"
        />
      </div>

      <p className="text-xs text-crema/60">
        {status.loading ? "Carico l'archivio…" : `${meta.total.toLocaleString("it-IT")} ticket chiusi${filtered ? " trovati" : " con transcript"}`}
      </p>

      {status.error ? (
        <Notice>{status.error}</Notice>
      ) : status.loading && rows.length === 0 ? (
        <div className="space-y-1.5" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-crema/[0.04]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center text-sm text-crema/60">
          {filtered ? "Nessun ticket con questi filtri." : "Ancora nessun ticket chiuso con transcript."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={!r.canOpen}
                  onClick={() => setOpen(r)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-crema/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-crema/[0.06] text-crema/70" aria-hidden>
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <span className="font-semibold tabular-nums text-crema">{r.number != null ? `#${r.number}` : "—"}</span>
                      <span className="truncate text-crema/85">{r.username || r.userId || "Utente nascosto"}</span>
                      <span className="rounded bg-crema/[0.07] px-1.5 py-px text-[0.65rem] font-semibold text-crema/70">{typeLabel(r.type)}</span>
                      {r.rating != null ? <Stars n={r.rating} /> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-crema/60">
                      Chiuso {fmtDate(r.closedAt)}
                      {r.closeReason ? ` · ${r.closeReason}` : ""}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs font-semibold text-ember sm:block">Leggi</span>
                </button>
              </li>
            ))}
          </ul>
          {meta.nextOffset != null ? (
            <button type="button" onClick={() => void loadMore()} disabled={status.more} className={cn(miniBtn, "w-full py-2")}>
              {status.more ? "Carico…" : `Mostra altri (${rows.length} di ${meta.total})`}
            </button>
          ) : null}
        </>
      )}

      <AnimatePresence>{open ? <TranscriptReader token={token} guildId={guildId} row={open} onClose={() => setOpen(null)} /> : null}</AnimatePresence>
    </div>
  );
}
