"use client";

import { useEffect, useRef, useState } from "react";
import {
  listTicketList,
  loadTicketModule,
  patchGuildTickets,
  type TicketListBundle,
  type TicketModule,
  type TicketsSummary,
} from "@/lib/dashboard-guild";
import { Select } from "@/components/ui/Select";
import { Field, Notice, Subnav, Toggle, fieldClass } from "./bits";
import { TicketBlacklist } from "./TicketBlacklist";
import { TicketForms } from "./TicketForms";
import { TicketPanels } from "./TicketPanels";
import { TicketTeams } from "./TicketTeams";

type Tab = "overview" | "panels" | "forms" | "teams" | "blacklist";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Panoramica" },
  { id: "panels", label: "Pannelli" },
  { id: "forms", label: "Form" },
  { id: "teams", label: "Team" },
  { id: "blacklist", label: "Blacklist" },
];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-espresso/55 px-3 py-2 ring-1 ring-sand/12">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/40">{label}</p>
      <p className="mt-0.5 font-display text-xl font-semibold lining-nums text-crema">{value}</p>
    </div>
  );
}

export function TicketDesk({
  guildId,
  token,
  summary,
  error,
  isMainGuild,
  onSummary,
  onToast,
}: {
  guildId: string;
  token: string;
  summary: TicketsSummary | null;
  error: string | null;
  isMainGuild: boolean;
  onSummary: (next: TicketsSummary) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [mod, setMod] = useState<TicketModule | null>(null);
  const [modError, setModError] = useState("");
  const [list, setList] = useState<TicketListBundle | null>(null);
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState(false);

  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;

  useEffect(() => {
    let cancel = false;
    (async () => {
      const res = await loadTicketModule(token, guildId);
      if (cancel) return;
      if (!res.ok) {
        setModError(res.message);
        return;
      }
      setMod(res.data);
      setModError("");
      onSummaryRef.current({ enabled: res.data.enabled, overview: res.data.overview });
    })();
    return () => {
      cancel = true;
    };
  }, [token, guildId]);

  useEffect(() => {
    if (tab !== "overview") return;
    let cancel = false;
    listTicketList(token, guildId, { status, limit: 30 }).then((res) => {
      if (cancel) return;
      if (res.ok) setList(res.data);
    });
    return () => {
      cancel = true;
    };
  }, [tab, status, token, guildId]);

  const enabled = mod?.enabled ?? summary?.enabled ?? false;
  const overview = mod?.overview ?? summary?.overview;

  const save = async (body: Record<string, unknown>, ok = "Impostazioni tickets salvate.") => {
    setBusy(true);
    const res = await patchGuildTickets(token, guildId, body);
    setBusy(false);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    setMod(res.data);
    onSummary({ enabled: res.data.enabled, overview: res.data.overview });
    onToast(ok);
  };

  return (
    <div className="space-y-4">
      {error && !summary && !mod ? <Notice>{error}</Notice> : null}
      {modError && !mod ? <Notice>{modError}</Notice> : null}
      <Subnav tabs={TABS} value={tab} onChange={setTab} label="Ticket" />

      {tab === "overview" && overview ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-crema">Modulo ticket</p>
              <p className="text-xs text-crema/45">{enabled ? "Modulo attivo" : "Modulo spento"}</p>
            </div>
            <Toggle
              checked={enabled}
              disabled={busy}
              label="Attiva ticket"
              onChange={(next) => save({ enabled: next })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Aperti" value={overview.open} />
            <Stat label="Presi in carico" value={overview.claimed} />
            <Stat label="In attesa" value={overview.unclaimed} />
            <Stat label="Chiusi 24h" value={overview.closed24h} />
          </div>
          {mod ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Canale pannello">
                <Select
                  value={mod.settings.panelChannelId || ""}
                  disabled={busy}
                  onChange={(v) => save({ panelChannelId: v || null })}
                  className={fieldClass}
                  options={[
                    { value: "", label: "— Nessuno —" },
                    ...mod.pickers.textChannels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
                  ]}
                />
              </Field>
              <Field label="Canale transcript">
                <Select
                  value={mod.settings.transcriptChannelId || ""}
                  disabled={busy}
                  onChange={(v) => save({ transcriptChannelId: v || null })}
                  className={fieldClass}
                  options={[
                    { value: "", label: "— Nessuno —" },
                    ...mod.pickers.textChannels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
                  ]}
                />
              </Field>
              <Field label="Categoria overflow">
                <Select
                  value={mod.settings.overflowCategoryId || ""}
                  disabled={busy}
                  onChange={(v) => save({ overflowCategoryId: v || null })}
                  className={fieldClass}
                  options={[
                    { value: "", label: mod.settings.categoryName || "Automatica" },
                    ...mod.pickers.categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </Field>
              <Field label="Max aperti per utente">
                <input
                  type="number"
                  min={1}
                  max={25}
                  disabled={busy}
                  value={mod.settings.maxOpenTicketsPerUser}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n !== mod.settings.maxOpenTicketsPerUser) {
                      save({ maxOpenTicketsPerUser: n });
                    }
                  }}
                  onChange={(e) =>
                    setMod({
                      ...mod,
                      settings: { ...mod.settings, maxOpenTicketsPerUser: Number(e.target.value) || 1 },
                    })
                  }
                  className={fieldClass}
                />
              </Field>
            </div>
          ) : null}
          {mod ? (
            <div className="space-y-2">
              {(
                [
                  ["hideCloseButton", "Nascondi Chiudi"],
                  ["hideCloseReasonButton", "Nascondi Chiudi con motivo"],
                  ["hideClaimButton", "Nascondi Claim"],
                  ["allowUserClose", "L'utente può chiudere"],
                  ["closeConfirmation", "Conferma chiusura"],
                  ["ratingEnabled", "Valutazione"],
                  ["storeTranscripts", "Salva transcript"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-crema/80">{label}</span>
                  <Toggle
                    checked={mod.settings[key] === true}
                    disabled={busy}
                    label={label}
                    onChange={(next) => save({ [key]: next })}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-crema">Elenco</p>
            <Select
              value={status}
              onChange={setStatus}
              size="sm"
              className="rounded-lg bg-espresso/70 px-2 py-1 text-xs text-crema ring-1 ring-sand/20"
              options={[
                { value: "open", label: "Aperti" },
                { value: "closed", label: "Chiusi" },
                { value: "all", label: "Tutti" },
              ]}
            />
          </div>
          <ul className="divide-y divide-sand/10 rounded-xl bg-espresso/40 ring-1 ring-sand/12">
            {!list?.tickets.length ? (
              <li className="px-3 py-4 text-sm text-crema/40">Nessun ticket</li>
            ) : (
              list.tickets.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-crema">
                      #{row.ticketNumber ?? "—"} · {row.panelTitle || row.ticketType}
                    </p>
                    <p className="truncate text-xs text-crema/40">
                      {row.anonymised ? "Anonimo" : row.username || row.userId || "Utente"}
                      {row.claimedByUsername ? ` · ${row.claimedByUsername}` : row.claimedBy ? " · in carico" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    {row.channelUrl ? (
                      <a href={row.channelUrl} target="_blank" rel="noreferrer" className="text-ember underline decoration-caramel/40">
                        Canale
                      </a>
                    ) : null}
                    {row.transcriptUrl ? (
                      <a href={row.transcriptUrl} target="_blank" rel="noreferrer" className="text-crema/70 underline decoration-sand/30">
                        Transcript
                      </a>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
          <p className="text-xs text-crema/35">
            Totale registrati: <span className="lining-nums text-crema/60">{overview.total}</span>
          </p>
        </div>
      ) : null}

      {tab === "panels" ? (
        <TicketPanels
          guildId={guildId}
          token={token}
          isMainGuild={isMainGuild}
          hideClose={mod?.settings.hideCloseButton === true}
          hideCloseReason={mod?.settings.hideCloseReasonButton === true}
          hideClaim={mod?.settings.hideClaimButton === true}
          maxOpen={mod?.settings.maxOpenTicketsPerUser || 1}
          onToast={onToast}
        />
      ) : null}
      {tab === "forms" ? <TicketForms guildId={guildId} token={token} onToast={onToast} /> : null}
      {tab === "teams" ? <TicketTeams guildId={guildId} token={token} onToast={onToast} /> : null}
      {tab === "blacklist" ? <TicketBlacklist guildId={guildId} token={token} onToast={onToast} /> : null}
    </div>
  );
}
