"use client";

import { EmojiText } from "@/components/discord/EmojiText";
import { NumberField } from "@/components/ui/NumberField";
import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  CheckCheck,
  Clock3,
  ExternalLink,
  FileText,
  Hash,
  Inbox,
  Lock,
  MessageSquareText,
  Plus,
  SlidersHorizontal,
  Star,
  Ticket,
  Trash2,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { confirmDialog } from "@/components/ui";
import {
  forceCloseTicket,
  listTicketList,
  loadTicketModule,
  patchGuildTickets,
  type TicketListBundle,
  type TicketModule,
  type TicketQuickReply,
  type TicketsSummary,
} from "@/lib/dashboard-guild";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/Select";
import { Field, Notice, Panel, SettingRow, StatTile, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini, RowsSkeleton } from "./bits";
import { TicketArchive } from "./TicketArchive";
import { TicketBlacklist } from "./TicketBlacklist";
import { TicketForms } from "./TicketForms";
import { TicketPanels } from "./TicketPanels";
import { TicketTeams } from "./TicketTeams";
import { isTicketModuleTab, type TicketModuleTabId } from "../guildSections";

type Tab = TicketModuleTabId;

function newQuickReplyId() {
  return `r${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`.slice(0, 24);
}

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
  tab: tabProp,
}: {
  guildId: string;
  token: string;
  summary: TicketsSummary | null;
  error: string | null;
  isMainGuild: boolean;
  onSummary: (next: TicketsSummary) => void;
  onToast: (msg: string, err?: boolean) => void;
  /** Tab dalla sidebar (senza Subnav orizzontale). */
  tab?: Tab;
}) {
  const tab: Tab = tabProp && isTicketModuleTab(tabProp) ? tabProp : "overview";
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
      message: `Segnare chiuso il ticket #${row.ticketNumber ?? "?"}? Si chiude solo qui (nel database), su Discord non succede niente: usalo per i ticket rimasti aperti senza canale.`,
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
    <div className="space-y-4">
      {error && !summary && !mod ? <Notice>{error}</Notice> : null}
      {modError && !mod ? <Notice>{modError}</Notice> : null}

      {/* modulo: stato + interruttore principale, sempre in vista */}
      <section
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-2xl p-4 ring-1 sm:p-5",
          enabled ? "bg-gradient-to-r from-caramel/[0.12] via-roast/80 to-roast/80 ring-caramel/25" : "bg-roast/80 ring-sand/10",
        )}
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1",
            enabled ? "bg-caramel/15 text-ember ring-caramel/30" : "bg-crema/[0.05] text-crema/60 ring-sand/15",
          )}
        >
          <Ticket className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-crema">Modulo ticket</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-crema/50">
            <span className={cn("size-1.5 rounded-full", enabled ? "bg-[#7fc48c]" : "bg-crema/30")} aria-hidden />
            {enabled ? "Attivo: gli utenti possono aprire ticket dai pannelli" : "Spento: i pannelli non aprono ticket"}
          </p>
        </div>
        <Toggle checked={enabled} disabled={busy} label="Attiva ticket" onChange={(next) => save({ enabled: next })} />
      </section>

      {tab === "overview" && !overview && !(modError && !mod) && !(error && !summary) ? (
        <div className="space-y-4" aria-busy aria-label="Caricamento ticket">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-espresso/55 p-3 ring-1 ring-sand/10">
                <span className="size-9 animate-pulse rounded-lg bg-crema/[0.07]" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-2.5 w-1/2 animate-pulse rounded bg-crema/[0.06]" />
                  <span className="block h-5 w-1/3 animate-pulse rounded bg-crema/[0.09]" />
                </span>
              </div>
            ))}
          </div>
          <RowsSkeleton rows={4} />
        </div>
      ) : null}
      {tab === "overview" && overview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatTile icon={<Inbox />} label="Aperti" value={overview.open} tone="accent" />
            <StatTile icon={<UserCheck />} label="Presi in carico" value={overview.claimed} tone="ok" />
            <StatTile icon={<Clock3 />} label="In attesa" value={overview.unclaimed} hint="senza staffer" />
            <StatTile icon={<CheckCheck />} label="Chiusi 24h" value={overview.closed24h} hint={`${overview.total} in totale`} />
          </div>

          {mod ? (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {/* Sinistra: Canali + Avvisi impilati (altezza al contenuto). Destra: Comportamento. */}
              <div className="min-w-0 space-y-4">
              <Panel icon={<Hash />} title="Canali" description="Dove stanno pannello e transcript, e dove si aprono i ticket quando la categoria è piena.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Canale pannello">
                    <Select
                      value={mod.settings.panelChannelId || ""}
                      disabled={busy}
                      onChange={(v) => save({ panelChannelId: v || null })}
                      className={fieldClass}
                      options={channelOptions("— Nessuno —")}
                    />
                  </Field>
                  <Field label="Canale transcript">
                    <Select
                      value={mod.settings.transcriptChannelId || ""}
                      disabled={busy}
                      onChange={(v) => save({ transcriptChannelId: v || null })}
                      className={fieldClass}
                      options={channelOptions("— Nessuno —")}
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
                  <Field label="Ticket aperti per utente">
                    <NumberField
                      name="max-open-tickets"
                      aria-label="Ticket aperti per utente"
                      min={1}
                      max={25}
                      disabled={busy}
                      value={mod.settings.maxOpenTicketsPerUser}
                      onChange={(n) => setMod({ ...mod, settings: { ...mod.settings, maxOpenTicketsPerUser: n ?? 1 } })}
                      onCommit={(n) => {
                        if (n != null) save({ maxOpenTicketsPerUser: n });
                      }}
                    />
                  </Field>
                </div>
              </Panel>

                <Panel
                  icon={<BellRing />}
                  title="Avvisi ticket fermi"
                  description="Se l'utente scrive e lo staff non risponde entro X minuti, avvisa una sola volta."
                >
                  <div className="space-y-3">
                    <SettingRow
                      title="Attiva avvisi"
                      description="Controlla i ticket aperti ogni ~10 minuti. Un avviso per messaggio dell'utente."
                      icon={<BellRing />}
                    >
                      <Toggle
                        checked={mod.settings.staleAlertEnabled === true}
                        disabled={busy}
                        label="Avvisi ticket fermi"
                        onChange={(next) => save({ staleAlertEnabled: next })}
                      />
                    </SettingRow>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Minuti di attesa" hint="Da 15 a 1440 (24 ore). Predefinito 120.">
                        <NumberField
                          name="stale-alert-minutes"
                          aria-label="Minuti di attesa prima dell'avviso"
                          min={15}
                          max={1440}
                          disabled={busy || !mod.settings.staleAlertEnabled}
                          value={mod.settings.staleAlertMinutes}
                          onChange={(n) =>
                            setMod({
                              ...mod,
                              settings: { ...mod.settings, staleAlertMinutes: n ?? 120 },
                            })
                          }
                          onCommit={(n) => {
                            if (n != null) save({ staleAlertMinutes: n });
                          }}
                        />
                      </Field>
                      <Field label="Canale avvisi" hint="Vuoto = messaggio nel ticket stesso (con menzione a chi l'ha preso in carico).">
                        <Select
                          value={mod.settings.staleAlertChannelId || ""}
                          disabled={busy || !mod.settings.staleAlertEnabled}
                          onChange={(v) => save({ staleAlertChannelId: v || null })}
                          className={fieldClass}
                          options={channelOptions("— Nel ticket —")}
                        />
                      </Field>
                    </div>
                  </div>
                </Panel>
              </div>

              <Panel icon={<SlidersHorizontal />} title="Comportamento" description="Pulsanti e passaggi del ticket su Discord.">
                <div className="divide-y divide-sand/[0.07]">
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
                </div>
              </Panel>
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
                <span className="flex size-11 items-center justify-center rounded-xl bg-crema/[0.05] text-crema/50">
                  <Inbox className="size-5" />
                </span>
                <p className="text-sm text-crema/60">{status === "open" ? "Nessun ticket aperto. Tutto tranquillo." : "Nessun ticket."}</p>
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
                          row.open ? "bg-caramel/12 text-ember" : "bg-crema/[0.05] text-crema/60",
                        )}
                      >
                        {row.ticketNumber ?? "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-crema">
                          <span className="truncate"><EmojiText text={row.panelTitle || row.ticketType} /></span>
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
                            <span className="rounded bg-crema/[0.06] px-1.5 py-px text-[0.58rem] font-bold uppercase tracking-wider text-crema/60">
                              chiuso
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-crema/60">
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
      {tab === "replies" ? (
        <Panel
          icon={<Zap />}
          title="Risposte rapide"
          description="Modelli pronti per lo staff. Su Discord: /risposta nel canale del ticket."
        >
          {!mod ? (
            <Notice>Carica prima la panoramica ticket.</Notice>
          ) : (
            <QuickRepliesEditor
              replies={mod.settings.quickReplies}
              busy={busy}
              onSave={async (next) => save({ quickReplies: next }, "Risposte rapide salvate.")}
            />
          )}
        </Panel>
      ) : null}
      {tab === "archive" ? (
        <Panel>
          <TicketArchive guildId={guildId} token={token} />
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

function QuickRepliesEditor({
  replies,
  busy,
  onSave,
}: {
  replies: TicketQuickReply[];
  busy: boolean;
  onSave: (next: TicketQuickReply[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TicketQuickReply[]>(replies);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(replies);
    setDirty(false);
  }, [replies]);

  const patchAt = (index: number, partial: Partial<TicketQuickReply>) => {
    setDraft((cur) => cur.map((row, i) => (i === index ? { ...row, ...partial } : row)));
    setDirty(true);
  };

  const add = () => {
    if (draft.length >= 25) return;
    setDraft((cur) => [...cur, { id: newQuickReplyId(), title: "", content: "" }]);
    setDirty(true);
  };

  const remove = async (index: number) => {
    const row = draft[index];
    const ok = await confirmDialog({
      message: row?.title ? `Eliminare la risposta «${row.title}»?` : "Eliminare questa risposta?",
      danger: true,
    });
    if (!ok) return;
    const next = draft.filter((_, i) => i !== index);
    setDraft(next);
    setDirty(false);
    await onSave(next);
  };

  const persist = async () => {
    const cleaned = draft
      .map((r) => ({
        id: String(r.id || newQuickReplyId()).slice(0, 24),
        title: String(r.title || "").trim().slice(0, 60),
        content: String(r.content || "").trim().slice(0, 2000),
      }))
      .filter((r) => r.title && r.content);
    await onSave(cleaned);
    setDirty(false);
  };

  return (
    <div className="space-y-4">
      {!draft.length ? (
        <div className="rounded-xl bg-crema/[0.03] px-4 py-8 text-center ring-1 ring-sand/10">
          <p className="text-sm text-crema/65">Nessuna risposta ancora. Aggiungine una per usarla con /risposta.</p>
          <button type="button" disabled={busy} onClick={add} className={cn(primaryMini, "mt-4")}>
            <Plus className="size-3.5" aria-hidden /> Aggiungi risposta
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {draft.map((row, index) => (
            <li key={row.id || index} className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10 sm:p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <Field label="Titolo">
                    <input
                      value={row.title}
                      disabled={busy}
                      maxLength={60}
                      placeholder="Es. Ciao e benvenuto"
                      className={fieldClass}
                      onChange={(e) => patchAt(index, { title: e.target.value })}
                    />
                  </Field>
                  <Field label="Messaggio" hint="Testo inviato nel ticket (max 2000).">
                    <textarea
                      value={row.content}
                      disabled={busy}
                      maxLength={2000}
                      rows={3}
                      placeholder="Ciao! Grazie per aver aperto un ticket…"
                      className={cn(fieldClass, "min-h-[5.5rem] resize-y")}
                      onChange={(e) => patchAt(index, { content: e.target.value })}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(index)}
                  className={dangerBtn}
                  aria-label="Elimina risposta"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || draft.length >= 25} onClick={add} className={miniBtn}>
          <Plus className="size-3.5" aria-hidden /> Aggiungi
        </button>
        <button type="button" disabled={busy || !dirty} onClick={() => void persist()} className={primaryMini}>
          Salva risposte
        </button>
        {draft.length >= 25 ? <span className="self-center text-xs text-crema/50">Massimo 25 risposte.</span> : null}
      </div>
    </div>
  );
}
