"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowRight, ArrowUpCircle, History, Search } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";
import { loadPexHistory, type PexHistoryItem } from "@/lib/staffManage";

type KindFilter = "all" | "pex" | "depex";

const PAGE = 30;

/** Cronologia pex/depex in Gestione: tutti o solo il membro selezionato, con motivo, data e chi l'ha fatto. */
export function PexHistory({
  token,
  member,
  refreshKey,
}: {
  token: string;
  member: { userId: string; displayName: string } | null;
  refreshKey: number;
}) {
  const [items, setItems] = useState<PexHistoryItem[] | null>(null);
  const [error, setError] = useState("");
  const [onlyMember, setOnlyMember] = useState(false);
  const [kind, setKind] = useState<KindFilter>("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const filterId = onlyMember && member ? member.userId : null;

  useEffect(() => {
    let alive = true;
    loadPexHistory(token, filterId).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setError("");
      setItems(r.data.pexHistory || []);
      setShown(PAGE);
    });
    return () => {
      alive = false;
    };
  }, [token, filterId, refreshKey]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items || []).filter((it) => {
      if (kind !== "all" && it.kind !== kind) return false;
      if (!needle) return true;
      const hay = `${it.displayName} ${it.username || ""} ${it.userId} ${it.fromRole || ""} ${it.toRole || ""} ${it.reason || ""} ${it.actorName || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, kind, q]);

  const counts = useMemo(() => {
    const list = items || [];
    return { all: list.length, pex: list.filter((i) => i.kind === "pex").length, depex: list.filter((i) => i.kind === "depex").length };
  }, [items]);

  return (
    <section className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-4 ring-1 ring-sand/15 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-caramel">
            <History className="size-3.5" /> Cronologia
          </p>
          <h3 className="mt-1 font-display text-2xl font-semibold">
            {onlyMember && member ? `Pex e depex di ${member.displayName}` : "Pex e depex"}
          </h3>
        </div>
        <label className="relative block min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/40" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Cerca nome, ruolo, motivo…"
            className="w-full rounded-full bg-espresso/80 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-caramel/50"
          />
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "Tutti", counts.all],
            ["pex", "Pex", counts.pex],
            ["depex", "Depex", counts.depex],
          ] as const
        ).map(([value, label, n]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
              setShown(PAGE);
            }}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition",
              kind === value ? "bg-caramel/20 text-ember ring-caramel/35" : "bg-crema/5 text-crema/65 ring-sand/15 hover:text-crema",
            )}
          >
            {label} <span className="ml-1 text-crema/40 lining-nums">{n}</span>
          </button>
        ))}
        {member ? (
          <button
            type="button"
            aria-pressed={onlyMember}
            onClick={() => setOnlyMember((v) => !v)}
            className={cn(
              "ml-auto rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition",
              onlyMember ? "bg-caramel/20 text-ember ring-caramel/35" : "bg-crema/5 text-crema/65 ring-sand/15 hover:text-crema",
            )}
          >
            Solo {member.displayName}
          </button>
        ) : null}
      </div>

      {error && !items ? (
        <p className="rounded-xl bg-crema/[0.04] p-3 text-sm text-crema/60 ring-1 ring-sand/10">{error}</p>
      ) : !items ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-crema/8" />
          ))}
        </div>
      ) : !filtered.length ? (
        <p className="py-8 text-center text-sm text-crema/50">Nessun pex o depex trovato.</p>
      ) : (
        <>
          <ol className="space-y-2">
            {filtered.slice(0, shown).map((it, i) => {
              const up = it.kind === "pex";
              return (
                <li
                  key={`${it.userId}-${it.dateIso || i}-${it.kind}-${i}`}
                  className="flex gap-3 rounded-xl bg-crema/[0.03] px-3 py-2.5 ring-1 ring-sand/10"
                >
                  <SmartLink href={`/user/?id=${encodeURIComponent(it.userId)}&tab=staff`} className="shrink-0">
                    <Avatar src={it.avatarUrl} name={it.displayName} userId={it.userId} noPresence className="size-9" />
                  </SmartLink>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ring-1",
                          up
                            ? "bg-emerald-400/10 text-[#9fd3ac] ring-emerald-300/25 light:text-[#2f6b3f]"
                            : "bg-rose-400/10 text-[#f0a493] ring-rose-300/25 light:text-[#a83a2c]",
                        )}
                      >
                        {up ? <ArrowUpCircle className="size-3" /> : <ArrowDownCircle className="size-3" />}
                        {up ? "Pex" : "Depex"}
                      </span>
                      <span className="truncate font-semibold text-crema">{it.displayName}</span>
                      {it.dateLabel ? <span className="ml-auto text-xs text-crema/45 lining-nums">{it.dateLabel}</span> : null}
                    </div>
                    {it.fromRole || it.toRole ? (
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-crema/70">
                        <span>{it.fromRole || "—"}</span>
                        <ArrowRight className="size-3.5 text-crema/40" />
                        <span className="font-semibold text-crema/85">{it.toRole || "—"}</span>
                      </p>
                    ) : null}
                    {it.reason ? <p className="mt-1 text-sm text-crema/55">{it.reason}</p> : null}
                    {it.actorName || it.imported ? (
                      <p className="mt-1 text-[0.7rem] text-crema/40">
                        {it.actorName ? `da ${it.actorName}` : ""}
                        {it.actorName && it.imported ? " · " : ""}
                        {it.imported ? "dal canale #pex-depex" : ""}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {filtered.length > shown ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema/75 ring-1 ring-sand/15 hover:text-crema"
              >
                Mostra altri ({filtered.length - shown})
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
