"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  Clock3,
  ExternalLink,
  FileText,
  Inbox,
  Lock,
  MessageSquareText,
  Star,
  Ticket,
  UserCheck,
  X,
} from "lucide-react";
import { confirmDialog } from "@/components/ui";
import {
  forceCloseTicket,
  listTicketList,
  loadTicketModule,
  patchGuildTickets,
  type TicketListBundle,
  type TicketModule,
  type TicketsSummary,
} from "@/lib/dashboard-guild";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/Select";
import { Field, ModuleBanner, Notice, Panel, SectionHead, SettingRow, SettingsGroup, StatTile, Subnav, Toggle, fieldClass } from "./bits";
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

type ToggleKey =
  | "hideCloseButton"
  | "hideCloseReasonButton"
  | "hideClaimButton"
  | "allowUserClose"
  | "closeConfirmation"
  | "ratingEnabled"
  | "storeTranscripts";

const BEHAVIOUR: { key: ToggleKey; title: string; description: string; icon: React.ReactNode }[] = [
  { key: "closeConfirmation", title: "Conferma chiusura", description: "Chiede conferma prima di chiudere un ticket.", icon: <CheckCheck /> },
  { key: "ratingEnabled", title: "Valutazione", description: "A ticket chiuso l'utente può dare un voto al supporto.", icon: <Star /> },
  { key: "storeTranscripts", title: "Salva transcript", description: "Conserva la conversazione e la manda nel canale transcript.", icon: <FileText /> },
  { key: "allowUserClose", title: "L'utente può chiudere", description: "Anche chi ha aperto il ticket può chiuderlo.", icon: <UserCheck /> },
  { key: "hideClaimButton", title: "Nascondi \"Prendi in carico\"", description: "Toglie il pulsante claim dal messaggio del ticket.", icon: <Inbox /> },
  { key: "hideCloseButton", title: "Nascondi \"Chiudi\"", description: "Toglie il pulsante di chiusura rapida.", icon: <X /> },
  { key: "hideCloseReasonButton", title: "Nascondi \"Chiudi con motivo\"", description: "Toglie il pulsante di chiusura con motivazione.", icon: <MessageSquareText /> },
];

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

  const markClosed = async (row: TicketListBundle["tickets"][number]) => {
    const ok = await confirmDialog({
      message: `Segnare chiuso il ticket #${row.ticketNumber ?? "?"}? Lo chiude nel database e, se esiste ancora, elimina anche il canale Discord.`,
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await forceCloseTicket(token, guildId, row.id);
    setBusy(false);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    setList((l) => (l ? { ...l, tickets: l.tickets.filter((t) => t.id !== row.id) } : l));
    setMod((m) => (m ? { ...m, overview: res.data } : m));
    onSummary({ enabled, overview: res.data });
    onToast(`Ticket #${row.ticketNumber ?? ""} segnato chiuso.`);
  };

  const channelOptions = (none: string) => [
    { value: "", label: none },
    ...(mod?.pickers.textChannels ?? []).map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
  ];

  return (
    <div className="space-y-5">
      {error && !summary && !mod ? <Notice>{error}</Notice> : null}
      {modError && !mod ? <Notice>{modError}</Notice> : null}

      <ModuleBanner
        icon={<Ticket />}
        title="Modulo ticket"
        active={enabled}
        status={enabled ? "Gli utenti possono aprire ticket dai pannelli" : "I pannelli non aprono ticket"}
        control={<Toggle checked={enabled} disabled={busy} label="Attiva ticket" onChange={(next) => save({ enabled: next })} />}
      />

      <Subnav tabs={TABS} value={tab} onChange={setTab} label="Ticket" />

      {tab === "overview" && overview ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={<Inbox />} label="Aperti" value={overview.open} tone="accent" />
            <StatTile icon={<UserCheck />} label="Presi in carico" value={overview.claimed} tone="ok" />
            <StatTile icon={<Clock3 />} label="In attesa" value={overview.unclaimed} hint="senza staffer" />
            <StatTile icon={<CheckCheck />} label="Chiusi 24h" value={overview.closed24h} hint={`${overview.total} in totale`} />
          </div>

          {mod ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <div>
                <SectionHead title="Canali" description="Pannello, transcript e overflow quando la categoria è piena." />
                <SettingsGroup>
                  <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-sand/[0.07]">
                    <div className="px-4 py-4 sm:px-5">
                      <Field label="Canale pannello">
                        <Select
                          value={mod.settings.panelChannelId || ""}
                          disabled={busy}
                          onChange={(v) => save({ panelChannelId: v || null })}
                          className={fieldClass}
                          options={channelOptions("— Nessuno —")}
                        />
                      </Field>
                    </div>
                    <div className="px-4 py-4 sm:px-5">
                      <Field label="Canale transcript">
                        <Select
                          value={mod.settings.transcriptChannelId || ""}
                          disabled={busy}
                          onChange={(v) => save({ transcriptChannelId: v || null })}
                          className={fieldClass}
                          options={channelOptions("— Nessuno —")}
                        />
                      </Field>
                    </div>
                    <div className="px-4 py-4 sm:px-5">
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
                    </div>
                    <div className="px-4 py-4 sm:px-5">
                      <Field label="Ticket aperti per utente">
                        <input
                          name="max-open-tickets"
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
                  </div>
                </SettingsGroup>
              </div>

              <div>
                <SectionHead title="Comportamento" description="Pulsanti e passaggi del ticket su Discord." />
                <SettingsGroup>
                  {BEHAVIOUR.map((b) => (
                    <SettingRow key={b.key} title={b.title} description={b.description} icon={b.icon}>
                      <Toggle
                        checked={mod.settings[b.key] === true}
                        disabled={busy}
                        label={b.title}
                        onChange={(next) => save({ [b.key]: next })}
                      />
                    </SettingRow>
                  ))}
                </SettingsGroup>
              </div>
            </div>
          ) : null}

          <Panel
            icon={<Inbox />}
            title="Elenco ticket"
            description={`${overview.total} registrati in tutto`}
            aside={
              <Select
                value={status}
                onChange={setStatus}
                size="sm"
                className="rounded-lg bg-espresso/70 px-2.5 py-1.5 text-xs font-semibold text-crema ring-1 ring-sand/15"
                options={[
                  { value: "open", label: "Aperti" },
                  { value: "closed", label: "Chiusi" },
                  { value: "all", label: "Tutti" },
                ]}
              />
            }
            bodyClassName="p-0 sm:p-0"
          >
            {!list?.tickets.length ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl bg-crema/[0.05] text-crema/35">
                  <Inbox className="size-5" />
                </span>
                <p className="text-sm text-crema/45">{status === "open" ? "Nessun ticket aperto. Tutto tranquillo." : "Nessun ticket."}</p>
              </div>
            ) : (
              <ul className="divide-y divide-sand/[0.07]">
                {list.tickets.map((row) => {
                  const who = row.anonymised ? "Anonimo" : row.username || row.userId || "Utente";
                  const claimed = Boolean(row.claimedBy);
                  return (
                    <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-crema/[0.02] sm:px-5">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-[0.7rem] font-bold tabular-nums",
                          row.open ? "bg-caramel/12 text-ember" : "bg-crema/[0.05] text-crema/40",
                        )}
                      >
                        {row.ticketNumber ?? "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-crema">
                          <span className="truncate">{row.panelTitle || row.ticketType}</span>
                          {row.open ? (
                            <span
                              className={cn(
                                "rounded px-1.5 py-px text-[0.58rem] font-bold uppercase tracking-wider",
                                claimed ? "bg-[#5f9a6a]/15 text-[#9fd0a8] light:text-[#2f6b3f]" : "bg-caramel/15 text-ember",
                              )}
                            >
                              {claimed ? "in carico" : "in attesa"}
                            </span>
                          ) : (
                            <span className="rounded bg-crema/[0.06] px-1.5 py-px text-[0.58rem] font-bold uppercase tracking-wider text-crema/40">
                              chiuso
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-crema/45">
                          {who}
                          {row.claimedByUsername ? ` · gestito da ${row.claimedByUsername}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.channelUrl ? (
                          <a
                            href={row.channelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-crema/70 ring-1 ring-sand/15 transition hover:text-crema hover:ring-sand/30"
                          >
                            Canale <ExternalLink className="size-3" aria-hidden />
                          </a>
                        ) : null}
                        {row.transcriptUrl ? (
                          <a
                            href={row.transcriptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-crema/70 ring-1 ring-sand/15 transition hover:text-crema hover:ring-sand/30"
                          >
                            <FileText className="size-3" aria-hidden /> Transcript
                          </a>
                        ) : null}
                        {row.open && status !== "closed" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void markClosed(row)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#a83a2c]/10 px-2.5 py-1.5 text-xs font-semibold text-[#f0a493] ring-1 ring-[#a83a2c]/25 transition hover:bg-[#a83a2c]/20 disabled:opacity-50 light:text-[#a83a2c]"
                          >
                            <Lock className="size-3" aria-hidden /> Segna chiuso
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === "panels" ? (
        <Panel>
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
        </Panel>
      ) : null}
      {tab === "forms" ? (
        <Panel>
          <TicketForms guildId={guildId} token={token} onToast={onToast} />
        </Panel>
      ) : null}
      {tab === "teams" ? (
        <Panel>
          <TicketTeams guildId={guildId} token={token} onToast={onToast} />
        </Panel>
      ) : null}
      {tab === "blacklist" ? (
        <Panel>
          <TicketBlacklist guildId={guildId} token={token} onToast={onToast} />
        </Panel>
      ) : null}
    </div>
  );
}
