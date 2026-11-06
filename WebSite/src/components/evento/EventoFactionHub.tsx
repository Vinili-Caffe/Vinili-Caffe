"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  fetchEventoFaction,
  useEventoItem,
  type EventoFactionHub as FactionPayload,
} from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { cdnUrl } from "@/lib/site";
import { cn } from "@/lib/cn";
import { EventoPanel, EventoLoginGate } from "@/components/evento/EventoUi";
import { EventoCreditsIcon } from "@/components/evento/EventoCreditsIcon";
import { EventoTroopIcon } from "@/components/evento/EventoTroopIcon";
import { EventoUtilityIcon } from "@/components/evento/EventoUtilityIcon";
import { EventoShopPanel } from "@/components/evento/EventoShopPanel";
import { EventoFactionRanksPanel } from "@/components/evento/EventoFactionRanksPanel";
import { EventoWarRegistryPanel } from "@/components/evento/EventoWarRegistryPanel";
import { useEventoFactionSync } from "@/lib/evento-faction-sync";
import { SmartLink } from "@/components/SmartLink";

const FACTION_ICON_V = "20261104ri2";

function factionIconUrl(factionId?: string | null, epoch?: string | null): string | null {
  const f = String(factionId || "")
    .trim()
    .toLowerCase();
  if (!f) return null;
  const ep = String(epoch || "clone_wars")
    .trim()
    .toLowerCase();
  let file: string | null = null;
  if (ep === "civil_war") {
    if (f === "ribellione" || f === "repubblica") file = "role-icon-ribellione.png";
    else if (f === "impero" || f === "separatisti") file = "role-icon-impero.png";
  } else if (ep === "sequel") {
    if (f === "nuova_repubblica" || f === "repubblica" || f === "ribellione") {
      file = "role-icon-nuova-repubblica.png";
    } else if (f === "nuovo_ordine" || f === "primo_ordine" || f === "separatisti" || f === "impero") {
      file = "role-icon-primo-ordine.png";
    }
  } else {
    if (f === "repubblica") file = "role-icon-repubblica.png";
    else if (f === "separatisti") file = "role-icon-separatisti.png";
  }
  if (!file) return null;
  return cdnUrl(`/images/starwars/${file}?v=${FACTION_ICON_V}`);
}

function isLightSide(factionId?: string | null) {
  const f = String(factionId || "").toLowerCase();
  return (
    f === "repubblica" ||
    f === "ribellione" ||
    f === "nuova_repubblica"
  );
}

function fmt(n: number | null | undefined) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("it-IT");
}

function formatLeft(expiresAt?: string) {
  const exp = Date.parse(String(expiresAt || ""));
  if (!Number.isFinite(exp)) return "";
  const ms = exp - Date.now();
  if (ms <= 0) return "scaduto";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

function epochLabel(epoch?: string | null) {
  const e = String(epoch || "").toLowerCase();
  if (e === "civil_war") return "Guerre Civili";
  if (e === "sequel") return "Era Sequel";
  return "Guerre dei Cloni";
}

/** Hub comando fazione: banca, arsenale, inventario condiviso. */
export function EventoFactionHub() {
  const { token, ready, login } = useAuth();
  const [data, setData] = useState<FactionPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankTick, setRankTick] = useState(0);

  const reload = useCallback(async (opts?: { soft?: boolean }) => {
    if (!ready) return;
    if (!opts?.soft) setLoading(true);
    const out = await fetchEventoFaction(token);
    if (!opts?.soft) setLoading(false);
    if (out) setData(out);
  }, [ready, token]);

  const softReload = useCallback(() => {
    void reload({ soft: true });
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* Live economy (+deposita/income) + backup lento per caveau/arsenale banca. */
  useEventoFactionSync(softReload, { pollMs: 8_000 });

  const onRanksChanged = useCallback(() => {
    setRankTick((n) => n + 1);
    softReload();
  }, [softReload]);

  const light = isLightSide(data?.factionId);
  const crest = factionIconUrl(data?.factionId, data?.epoch);
  const bank = data?.bank;
  const given = data?.contribution?.given ?? 0;
  const sharePct = data?.contribution?.sharePct ?? 0;

  const armyRows = useMemo(() => {
    const units = bank?.units || {};
    const labels = data?.unitLabels || {};
    return Object.entries(units)
      .map(([id, qty]) => ({
        id,
        qty: Math.max(0, Math.floor(Number(qty) || 0)),
        label: labels[id] || id.replace(/_/g, " "),
      }))
      .filter((r) => r.qty > 0)
      .sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label, "it"));
  }, [bank?.units, data?.unitLabels]);

  const itemRows = useMemo(() => {
    const items = bank?.items || {};
    const catalog = data?.utilityItems || [];
    const labels = data?.utilityLabels || {};
    const ids = catalog.length
      ? catalog.map((c) => c.id)
      : ["bacta", "sconto_mercato_nero"];
    return ids.map((id) => {
      const meta = catalog.find((c) => c.id === id);
      return {
        id,
        qty: Math.max(0, Math.floor(Number(items[id]) || 0)),
        label: meta?.label || labels[id] || id,
        blurb: meta?.blurb || "",
        buff: data?.bank?.buffs?.[id],
      };
    });
  }, [bank?.items, bank?.buffs, data?.utilityItems, data?.utilityLabels]);

  async function useOne(itemId: string) {
    if (!token || busy) return;
    setBusy(itemId);
    const out = await useEventoItem(token, itemId);
    setBusy(null);
    if (!out?.ok) {
      showToast(out?.message || "Uso fallito.", true);
      return;
    }
    showToast(out.message || "Oggetto usato.");
    void reload();
  }

  if (!ready || loading) {
    return (
      <div className="mx-auto max-w-5xl px-6">
        <div className="h-56 animate-pulse rounded-[2rem] bg-crema/8" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoLoginGate
          label="Accedi per entrare nel ponte di comando della tua fazione."
          onLogin={login}
        />
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoPanel glow="blue" className="text-center">
          <p className="font-display text-2xl text-crema">
            {data?.error === "no_faction" ? "Smistamento richiesto" : "Hub non disponibile"}
          </p>
          <p className="mt-2 text-sm text-crema/65">
            {data?.message || "Completa lo smistamento per vedere la tua fazione."}
          </p>
          <SmartLink
            href="/evento/"
            className="mt-5 inline-flex rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Torna all&apos;hub
          </SmartLink>
        </EventoPanel>
      </div>
    );
  }

  const accentRing = light ? "ring-sky-400/40" : "ring-rose-400/40";
  const accentGlow = light
    ? "from-sky-500/25 via-transparent to-[#c9a227]/15"
    : "from-rose-600/25 via-transparent to-[#c9a227]/15";
  const stanceLabel =
    data.stance === "attack" ? "In attacco" : data.stance === "defend" ? "In difesa" : "In attesa";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 pb-4">
      {/* Cresta / comando */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "relative overflow-hidden rounded-[2rem] bg-[#070b14] p-6 ring-1 sm:p-8",
          accentRing,
        )}
      >
        <div
          className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", accentGlow)}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-[#c9a227]/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:text-left">
          <div className="relative shrink-0">
            <div
              className={cn(
                "absolute inset-0 rounded-full blur-xl",
                light ? "bg-sky-400/30" : "bg-rose-500/30",
              )}
              aria-hidden
            />
            {crest ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={crest}
                alt=""
                width={96}
                height={96}
                className="relative size-24 rounded-full bg-black/50 object-cover ring-2 ring-[#c9a227]/55 sm:size-28"
                data-vc-lightbox-ignore
              />
            ) : (
              <div className="relative size-24 rounded-full bg-[#c9a227]/25 ring-2 ring-[#c9a227]/55 sm:size-28" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[#e4c76b]">
              Ponte di comando · {epochLabel(data.epoch)}
            </p>
            <h2 className="mt-2 font-display text-4xl font-semibold tracking-wide text-crema sm:text-5xl">
              {data.factionLabel || data.factionId}
            </h2>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {data.factionRank?.label ? (
                <span className="rounded-full bg-gradient-to-r from-[#c9a227]/25 to-transparent px-3 py-1 text-xs font-semibold text-[#e4c76b] ring-1 ring-[#c9a227]/40">
                  {data.factionRank.label}
                </span>
              ) : null}
              <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-crema/80 ring-1 ring-white/10">
                {stanceLabel}
                {data.pendingStance ? " · ora in corso" : ""}
              </span>
              <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold tabular-nums text-sky-200 ring-1 ring-sky-400/30">
                potenza {fmt(bank?.power)}
              </span>
              <span className="rounded-full bg-[#c9a227]/15 px-3 py-1 text-xs font-semibold tabular-nums text-[#f0d78c] ring-1 ring-[#c9a227]/35">
                {fmt(bank?.unitCount)} unità
              </span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Banca */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      >
        <EventoPanel glow="gold" className="!p-0 overflow-hidden">
          <div className="grid md:grid-cols-[1.15fr_0.85fr]">
            <div className="relative border-b border-white/10 p-6 sm:p-8 md:border-b-0 md:border-r">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">
                Banca fazione
              </p>
              <p className="mt-3 flex items-center gap-3 font-sans text-4xl font-semibold tracking-tight text-sand tabular-nums sm:text-5xl">
                <EventoCreditsIcon size="lg" className="shrink-0 drop-shadow-[0_0_14px_rgba(201,162,39,0.5)]" />
                {fmt(bank?.credits)}
              </p>
              <p className="mt-2 text-sm text-crema/55">Crediti nel caveau condiviso</p>
            </div>
            <div className="flex flex-col justify-center gap-4 bg-black/25 p-6 sm:p-8">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-crema/45">
                  Il tuo contributo
                </p>
                <p className="mt-2 font-sans text-3xl font-semibold tabular-nums tracking-tight text-crema">
                  {fmt(given)}
                </p>
                <p className="mt-1 text-xs text-crema/50">
                  Solo con <span className="text-crema/80">+deposita</span> su Discord
                </p>
              </div>
              <div>
                <div className="mb-1.5 flex items-end justify-between gap-2 text-xs text-crema/50">
                  <span>Quota sul caveau</span>
                  <span className="tabular-nums text-[#e4c76b]">{sharePct.toLocaleString("it-IT")}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-crema/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-caramel to-ember"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, sharePct))}%` }}
                    transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            </div>
          </div>
        </EventoPanel>
      </motion.section>

      {/* Arsenale */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
      >
        <EventoPanel glow={light ? "blue" : "red"}>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">
                Hangar · Arsenale
              </p>
              <h3 className="mt-1 font-display text-2xl text-crema sm:text-3xl">Truppe della fazione</h3>
              <p className="mt-1 text-sm text-crema/55">
                Acquisti e loot finiscono qui — niente esercito personale.
              </p>
            </div>
          </div>

          {armyRows.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {armyRows.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 + i * 0.03, duration: 0.4 }}
                  className="rounded-2xl bg-black/45 px-3 py-3 ring-1 ring-sand/15"
                >
                  <div className="flex items-start gap-2.5">
                    <EventoTroopIcon
                      unitId={r.id}
                      factionId={data?.factionId}
                      size="sm"
                      alt={r.label}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-semibold text-crema">{r.label}</p>
                      <p className="mt-2 font-sans text-2xl font-bold tabular-nums tracking-tight text-[#e4c76b]">
                        ×{r.qty}
                      </p>
                    </div>
                  </div>
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-black/35 px-4 py-8 text-center text-sm text-crema/55 ring-1 ring-white/10">
              Hangar vuoto. Compra unità dallo shop sull&apos;hub per armare la fazione.
            </p>
          )}
        </EventoPanel>
      </motion.section>

      {/* Shop / guerra — solo se il rango lo consente */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        <EventoShopPanel embedded refreshKey={rankTick} />
      </motion.section>

      {/* Registro guerre — tutti i ranghi */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.19, ease: [0.22, 1, 0.36, 1] }}
      >
        <EventoWarRegistryPanel enabled={Boolean(data.factionId)} />
      </motion.section>

      {/* Ranghi — gestione solo dal rango massimo */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <EventoFactionRanksPanel enabled={Boolean(data.factionId)} onChanged={onRanksChanged} />
      </motion.section>

      {/* Inventario oggetti fazione */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <EventoPanel glow="gold">
          <div className="mb-5">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">
              Deposito rifornimenti
            </p>
            <h3 className="mt-1 font-display text-2xl text-crema sm:text-3xl">Inventario fazione</h3>
            <p className="mt-1 text-sm text-crema/55">
              Bacta e sconti mercato nero condivisi con tutta la flotta.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {itemRows.map((r) => {
              const loadingItem = busy === r.id;
              const buffOn = Boolean(r.buff?.active);
              const canUse = r.id === "sconto_mercato_nero" && r.qty > 0 && !buffOn && !busy;
              return (
                <li key={r.id} className="rounded-2xl bg-black/40 p-4 ring-1 ring-sand/15">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <EventoUtilityIcon itemId={r.id} size="md" alt={r.label} className="shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-crema">{r.label}</p>
                        <p className="mt-1 text-xs text-crema/55">{r.blurb}</p>
                        {buffOn ? (
                          <p className="mt-2 text-xs font-semibold text-[#86efac]">
                            Attivo · {formatLeft(r.buff?.expiresAt)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className="shrink-0 font-sans text-xl font-bold tabular-nums tracking-tight text-[#e4c76b]">
                      ×{r.qty}
                    </p>
                  </div>
                  {r.id === "bacta" ? (
                    r.qty < 1 ? (
                      <button
                        type="button"
                        disabled
                        className="mt-3 w-full rounded-full bg-gradient-to-r from-caramel to-ember py-2 text-sm font-semibold text-ink disabled:opacity-40"
                      >
                        Esaurito
                      </button>
                    ) : (
                      <p className="mt-3 rounded-full bg-black/35 px-3 py-2 text-center text-xs text-crema/50 ring-1 ring-white/10">
                        Si usa nello schieramento in attacco
                      </p>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={!canUse}
                      onClick={() => void useOne(r.id)}
                      className="mt-3 w-full rounded-full bg-gradient-to-r from-caramel to-ember py-2 text-sm font-semibold text-ink disabled:opacity-40"
                    >
                      {loadingItem ? "…" : buffOn ? "Già attivo" : r.qty < 1 ? "Esaurito" : "Attiva per la fazione"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </EventoPanel>
      </motion.section>
    </div>
  );
}
