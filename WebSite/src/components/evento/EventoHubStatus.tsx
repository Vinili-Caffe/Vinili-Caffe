"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fetchEventoStatus, type EventoStatus } from "@/lib/evento-api";
import { useEventoFactionSync } from "@/lib/evento-faction-sync";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { EventoPanel } from "@/components/evento/EventoUi";
import { EventoCreditsIcon } from "@/components/evento/EventoCreditsIcon";
import { cdnUrl } from "@/lib/site";
import { cn } from "@/lib/cn";

const FACTION_ICON_V = "20261104ri2";

function factionIconUrl(factionId?: string | null, epoch?: string | null): string | null {
  const f = String(factionId || "").trim().toLowerCase();
  if (!f) return null;
  const ep = String(epoch || "clone_wars").trim().toLowerCase();
  let file: string | null = null;
  if (ep === "civil_war") {
    if (f === "ribellione" || f === "repubblica") file = "role-icon-ribellione.png";
    else if (f === "impero" || f === "separatisti") file = "role-icon-impero.png";
  } else if (ep === "sequel") {
    if (f === "nuova_repubblica" || f === "repubblica" || f === "ribellione") file = "role-icon-nuova-repubblica.png";
    else if (f === "nuovo_ordine" || f === "primo_ordine" || f === "separatisti" || f === "impero") {
      file = "role-icon-primo-ordine.png";
    }
  } else {
    if (f === "repubblica") file = "role-icon-repubblica.png";
    else if (f === "separatisti") file = "role-icon-separatisti.png";
  }
  if (!file) return null;
  return cdnUrl(`/images/starwars/${file}?v=${FACTION_ICON_V}`);
}

function StatCell({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-black/35 px-3 py-3 ring-1 ring-white/10 sm:px-4">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-crema/45">{label}</p>
      <p className="mt-1.5 flex items-center gap-1.5 font-sans text-xl font-semibold tabular-nums tracking-tight text-crema sm:text-2xl">
        {icon}
        <span className="min-w-0 truncate">{value}</span>
      </p>
      <p className="mt-1 text-[0.65rem] text-crema/40">{hint}</p>
    </div>
  );
}

function fmt(n: number | null | undefined) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("it-IT");
}

/** Profilo hub: Centro di comando — stats evento + fazione. */
export function EventoHubStatus() {
  const { token, ready, user, login } = useAuth();
  const [st, setSt] = useState<EventoStatus | null>(null);

  const reload = useCallback(() => {
    if (!ready) return;
    void fetchEventoStatus(token).then((r) => {
      if (r) setSt(r);
    });
  }, [ready, token]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEventoFactionSync(reload, { pollMs: 12_000 });

  if (!st?.ok) return null;

  const w = st.wallet;
  const lv = w?.level;
  const factionName = st.factionLabel || w?.factionId || null;
  const factionId = w?.factionId || null;
  const epoch = st.features?.epoch || w?.epoch || null;
  const factionIcon = factionIconUrl(factionId, epoch);

  return (
    <div className="mx-auto mb-6 max-w-4xl px-6">
      <EventoPanel glow="blue">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {user && w ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl(user, 96)}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-full ring-2 ring-[#c9a227]/40"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="truncate font-display text-2xl font-semibold text-crema sm:text-3xl">
                      {displayName(user)}
                    </p>
                    {factionName ? (
                      <span
                        className={cn(
                          "inline-flex max-w-full items-center gap-1.5 rounded-full bg-gradient-to-r from-[#c9a227]/25 to-[#2ea8ff]/15 py-1 pl-1 pr-3 ring-1 ring-[#c9a227]/45",
                        )}
                      >
                        {factionIcon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={factionIcon}
                            alt=""
                            width={22}
                            height={22}
                            className="size-[22px] shrink-0 rounded-full bg-black/40 object-cover ring-1 ring-white/15"
                            data-vc-lightbox-ignore
                          />
                        ) : (
                          <span className="size-[22px] shrink-0 rounded-full bg-[#c9a227]/35" aria-hidden />
                        )}
                        <span className="truncate text-xs font-semibold tracking-wide text-[#e4c76b]">
                          {factionName}
                        </span>
                      </span>
                    ) : null}
                    {w?.factionRank?.label ? (
                      <span className="inline-flex max-w-full items-center rounded-full bg-black/45 py-1 px-3 ring-1 ring-sand/25">
                        <span className="truncate text-xs font-semibold tracking-wide text-crema/90">
                          {w.factionRank.label}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="font-display text-2xl font-semibold text-crema">Centro di Comando</p>
                <p className="mt-1 text-sm text-crema/60">
                  {token ? "Profilo evento in caricamento…" : "Accedi per vedere inventario, livello e rango."}
                </p>
                {!token ? (
                  <button
                    type="button"
                    onClick={login}
                    className="mt-3 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2 text-sm font-semibold text-ink"
                  >
                    Accedi con Discord
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {w ? (
            <div className="text-right">
              <p className="flex items-center justify-end gap-2 font-sans text-3xl font-semibold tracking-tight text-sand tabular-nums">
                <EventoCreditsIcon size="md" className="shrink-0 drop-shadow-[0_0_10px_rgba(201,162,39,0.45)]" />
                {fmt(w.credits)}
              </p>
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-crema/45">crediti evento</p>
            </div>
          ) : null}
        </div>

        {w ? (
          <>
            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <StatCell label="Exp evento" value={fmt(w.exp)} hint="Esperienza guadagnata" />
              <StatCell
                label="Minigames vinti"
                value={fmt(w.quizCorrectTotal)}
                hint="Risposte corrette totali"
              />
              <StatCell label="Voti" value={fmt(w.votes)} hint="Voti bot accumulati" />
            </div>

            {lv ? (
              <div className="mt-5 rounded-2xl bg-black/35 p-4 ring-1 ring-white/10">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#e4c76b]">
                      Progresso livello
                    </p>
                    <p className="mt-1 font-sans text-xl font-semibold tracking-tight text-crema">
                      Lv {lv.level}
                      <span className="ml-2 text-base font-normal text-crema/70">{lv.title}</span>
                    </p>
                  </div>
                  <p className="text-xs text-crema/50 tabular-nums">
                    {lv.nextLevel != null
                      ? `${fmt(lv.expToNext)} exp → Lv ${lv.nextLevel}`
                      : "Livello massimo"}
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-crema/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-caramel to-ember transition-[width] duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, lv.progressPct))}%` }}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </EventoPanel>
    </div>
  );
}
