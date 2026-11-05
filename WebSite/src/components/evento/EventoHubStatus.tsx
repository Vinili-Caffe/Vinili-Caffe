"use client";

import { useEffect, useState, type ReactNode } from "react";
import { fetchEventoStatus, type EventoStatus } from "@/lib/evento-api";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { EventoKicker, EventoPanel } from "@/components/evento/EventoUi";
import { EventoCreditsIcon } from "@/components/evento/EventoCreditsIcon";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

function StatCell({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-black/35 px-3 py-3 ring-1 ring-white/10 sm:px-4">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-crema/45">{label}</p>
      <p className="mt-1.5 flex items-center gap-1.5 font-display text-xl font-semibold tabular-nums text-crema sm:text-2xl">
        {icon}
        <span className="min-w-0 truncate">{value}</span>
      </p>
      {hint ? <p className="mt-1 text-[0.65rem] text-crema/40">{hint}</p> : null}
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

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    fetchEventoStatus(token).then((r) => {
      if (alive) setSt(r);
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  if (!st?.ok) return null;

  const feat = st.features;
  const w = st.wallet;
  const lv = w?.level;
  const chips: string[] = [];
  if (!(st as { publicEnabled?: boolean }).publicEnabled) chips.push("Chiuso al pubblico");
  if (feat?.epoch) chips.push(String(feat.epoch).replace(/_/g, " "));
  if (feat?.economyOn) chips.push(`Economia fase ${feat.economyPhase ?? "?"}`);
  else if (st.canParticipate) chips.push("Economia off");
  if (st.todayAdvent) chips.push(`Avvento giorno ${st.todayAdvent}`);

  const factionName = st.factionLabel || w?.factionId || null;
  const peiRank = st.standing?.peiRank ?? null;
  const factionRank = st.standing?.factionRank ?? null;

  return (
    <div className="mx-auto mb-6 max-w-4xl px-6">
      <EventoPanel glow="blue">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <EventoKicker>
              {st.publicOpen ? "Live pubblico" : st.canPreview ? "Anteprima High Staff" : "Chiuso"}
              {st.romeDate ? ` · ${st.romeDate}` : ""}
            </EventoKicker>

            {user && w ? (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl(user, 96)}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-full ring-2 ring-[#c9a227]/40"
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-2xl font-semibold text-crema sm:text-3xl">
                    {displayName(user)}
                  </p>
                  <p className="mt-0.5 text-sm text-crema/60">
                    {factionName ? (
                      <>
                        Fazione <span className="font-semibold text-[#e4c76b]">{factionName}</span>
                        {factionRank != null ? (
                          <span className="text-crema/45"> · rango #{factionRank}</span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        Nessuna fazione ·{" "}
                        <SmartLink href={page("/evento/smistamento/")} className="text-caramel underline-offset-2 hover:underline">
                          Smistamento
                        </SmartLink>
                      </>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <p className="font-display text-2xl font-semibold text-crema">Centro di comando</p>
                <p className="mt-1 text-sm text-crema/60">
                  {token
                    ? chips.length
                      ? chips.join(" · ")
                      : "Stato evento"
                    : "Accedi per vedere inventario, livello e rango."}
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

            {chips.length && user && w ? (
              <p className="mt-3 text-[0.7rem] uppercase tracking-[0.18em] text-crema/40">{chips.join(" · ")}</p>
            ) : null}
          </div>

          {w ? (
            <div className="text-right">
              <p className="flex items-center justify-end gap-2 font-display text-3xl text-sand tabular-nums">
                <EventoCreditsIcon size="md" className="shrink-0 drop-shadow-[0_0_10px_rgba(201,162,39,0.45)]" />
                {fmt(w.credits)}
              </p>
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-crema/45">crediti evento</p>
            </div>
          ) : null}
        </div>

        {w ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              <StatCell label="Exp evento" value={fmt(w.exp)} hint="Solo Star Wars" />
              <StatCell
                label="Livello"
                value={lv ? `Lv ${lv.level}` : `Lv ${w.pgLevel || 0}`}
                hint={lv?.title || undefined}
              />
              <StatCell
                label="Minigames vinti"
                value={fmt(w.quizCorrectTotal)}
                hint="Risposte corrette totali"
              />
              <StatCell label="Voti" value={fmt(w.votes)} />
              <StatCell
                label="PEI"
                value={(Number(w.pei) || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                hint={peiRank != null ? `Classifica #${peiRank}` : undefined}
              />
              <StatCell
                label="Rango fazione"
                value={factionRank != null ? `#${factionRank}` : "—"}
                hint={factionName || "Completa lo smistamento"}
              />
              <StatCell
                label="Potenza arsenale"
                value={fmt(st.armyPower)}
                hint="Truppe personali"
              />
              <StatCell
                label="Volume crediti"
                value={fmt(w.creditsVolume)}
                hint="Mosso verso la fazione"
              />
            </div>

            {lv ? (
              <div className="mt-5 rounded-2xl bg-black/35 p-4 ring-1 ring-white/10">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#e4c76b]">
                      Progresso livello
                    </p>
                    <p className="mt-1 font-display text-xl font-semibold text-crema">
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
