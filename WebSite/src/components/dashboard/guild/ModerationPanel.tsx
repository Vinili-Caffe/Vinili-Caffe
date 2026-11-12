"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  FileText,
  Hash,
  ListOrdered,
  MessageSquare,
  Plus,
  Shield,
  ShieldCheck,
  UserCog,
  Zap,
} from "lucide-react";
import { Checkbox } from "@/components/ui";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import {
  createTicketForm,
  loadModeration,
  loadModerationCases,
  patchModeration,
  type AutoPunishAction,
  type AutoPunishRule,
  type ModerationAppeals,
  type ModerationBundle,
  type ModerationCase,
  type ModerationCasesPage,
  type ModerationMessages,
} from "@/lib/dashboard-guild";
import { Field, MultiCheck, Notice, Panel, SettingRow, Toggle, fieldClass, miniBtn, dangerBtn, primaryMini } from "./bits";

const controlClass = cn(fieldClass, "mt-0");

const CASES_PAGE_SIZE = 20;

const MESSAGE_FIELDS: { key: keyof ModerationMessages; label: string }[] = [
  { key: "ban", label: "Messaggio di ban" },
  { key: "softban", label: "Messaggio di softban" },
  { key: "mute", label: "Messaggio di silenziamento" },
  { key: "unban", label: "Messaggio di revoca ban" },
  { key: "kick", label: "Messaggio di espulsione" },
  { key: "unmute", label: "Messaggio di riattivazione" },
];

const AUTO_PUNISH_ACTIONS: { value: AutoPunishAction; label: string }[] = [
  { value: "mute", label: "silenzia" },
  { value: "kick", label: "espelli" },
  { value: "ban", label: "banna" },
  { value: "add_role", label: "Aggiungi ruolo" },
  { value: "remove_role", label: "Rimuovi ruolo" },
];

function actionLabel(action: string) {
  return AUTO_PUNISH_ACTIONS.find((a) => a.value === action)?.label || action;
}

function formatDurationMinutes(m: number) {
  if (!m) return "permanente";
  if (m < 60) return `${m} minuti`;
  if (m % 1440 === 0) return `${m / 1440} giorni`;
  if (m % 60 === 0) return `${m / 60} ore`;
  return `${m} minuti`;
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null) {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}g`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

function actionTone(action: string) {
  switch (action) {
    case "BAN":
    case "SOFTBAN":
    case "UNBAN":
      return "bg-[#a83a2c]/20 text-[#f0a493] light:text-[#a83a2c]";
    case "KICK":
      return "bg-caramel/15 text-caramel";
    case "MUTE":
    case "UNMUTE":
      return "bg-ember/15 text-ember";
    case "WARN":
      return "bg-crema/10 text-crema/80";
    default:
      return "bg-crema/[0.06] text-crema/70";
  }
}

function CaseRow({ row }: { row: ModerationCase }) {
  const dur = formatDuration(row.durationMs);
  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-2.5">
      <span className={cn("mt-0.5 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide", actionTone(row.action))}>
        {row.action}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-crema">
          Caso <span className="font-mono tabular-nums text-crema/80">#{row.caseId}</span>
          <span className="text-crema/50"> · </span>
          <span className="font-mono text-xs text-crema/65">u {row.userId}</span>
        </p>
        <p className="mt-0.5 text-xs text-crema/60 line-clamp-2">{row.reason || "Nessun motivo"}</p>
        <p className="mt-1 text-[0.7rem] text-crema/45">
          {formatWhen(row.createdAt)}
          {dur ? ` · ${dur}` : ""}
          {row.expiresAt ? ` · scade ${formatWhen(row.expiresAt)}` : ""}
          {!row.active ? " · chiuso" : ""}
        </p>
      </div>
    </li>
  );
}

export function ModerationPanel({
  guildId,
  token,
  tab,
  onToast,
}: {
  guildId: string;
  token: string;
  tab: string;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [bundle, setBundle] = useState<ModerationBundle | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [casesPage, setCasesPage] = useState(1);
  const [casesData, setCasesData] = useState<ModerationCasesPage | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState("");
  const [caseUserId, setCaseUserId] = useState("");
  const [caseAction, setCaseAction] = useState("ALL");
  const [caseFrom, setCaseFrom] = useState("");
  const [caseTo, setCaseTo] = useState("");
  const [caseFilters, setCaseFilters] = useState({ userId: "", action: "ALL", from: "", to: "" });
  const [msgDraft, setMsgDraft] = useState<ModerationMessages | null>(null);
  const [apWarnCount, setApWarnCount] = useState("3");
  const [apAction, setApAction] = useState<AutoPunishAction>("mute");
  const [apDuration, setApDuration] = useState("30");
  const [apRoleId, setApRoleId] = useState("");
  const [waitBanDraft, setWaitBanDraft] = useState("0");
  const [waitMuteDraft, setWaitMuteDraft] = useState("0");
  const [inviteDraft, setInviteDraft] = useState("");

  const activeTab = tab || "overview";

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const res = await loadModeration(token, guildId);
      if (cancel) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.message);
        setBundle(null);
        return;
      }
      setError("");
      setBundle(res.data);
      setMsgDraft(res.data.settings.messages);
      setWaitBanDraft(String(res.data.settings.appeals?.waitDaysBan ?? 0));
      setWaitMuteDraft(String(res.data.settings.appeals?.waitDaysMute ?? 0));
      setInviteDraft(res.data.settings.appeals?.inviteUrl || "");
    })();
    return () => {
      cancel = true;
    };
  }, [token, guildId]);

  useEffect(() => {
    if (activeTab !== "casi") return;
    let cancel = false;
    (async () => {
      setCasesLoading(true);
      setCasesError("");
      const fromMs = caseFilters.from ? Date.parse(`${caseFilters.from}T00:00:00`) : undefined;
      const toMs = caseFilters.to ? Date.parse(`${caseFilters.to}T23:59:59`) : undefined;
      const res = await loadModerationCases(token, guildId, {
        page: casesPage,
        pageSize: CASES_PAGE_SIZE,
        userId: caseFilters.userId || undefined,
        action: caseFilters.action !== "ALL" ? caseFilters.action : undefined,
        from: Number.isFinite(fromMs) ? fromMs : undefined,
        to: Number.isFinite(toMs) ? toMs : undefined,
      });
      if (cancel) return;
      setCasesLoading(false);
      if (!res.ok) {
        setCasesError(res.message);
        setCasesData(null);
        return;
      }
      setCasesData(res.data);
      if (res.data.page !== casesPage) setCasesPage(res.data.page);
    })();
    return () => {
      cancel = true;
    };
  }, [token, guildId, activeTab, casesPage, caseFilters]);

  useEffect(() => {
    setCasesPage(1);
    setCaseUserId("");
    setCaseAction("ALL");
    setCaseFrom("");
    setCaseTo("");
    setCaseFilters({ userId: "", action: "ALL", from: "", to: "" });
  }, [guildId]);

  const save = async (body: Record<string, unknown>, okMsg = "Moderazione salvata.") => {
    setBusy(true);
    const res = await patchModeration(token, guildId, body);
    setBusy(false);
    if (!res.ok) {
      onToast(res.message, true);
      return false;
    }
    setBundle(res.data);
    if (res.data.settings.messages) setMsgDraft(res.data.settings.messages);
    if (res.data.settings.appeals) {
      setWaitBanDraft(String(res.data.settings.appeals.waitDaysBan ?? 0));
      setWaitMuteDraft(String(res.data.settings.appeals.waitDaysMute ?? 0));
      setInviteDraft(res.data.settings.appeals.inviteUrl || "");
    }
    onToast(okMsg);
    return true;
  };

  const saveAppeals = async (patch: Partial<ModerationAppeals>, okMsg = "Ricorsi aggiornati.") => {
    if (!bundle) return false;
    return save({ appeals: { ...bundle.settings.appeals, ...patch } }, okMsg);
  };

  const createAppealForm = async () => {
    setBusy(true);
    const res = await createTicketForm(token, guildId, "Ricorso");
    if (!res.ok) {
      setBusy(false);
      onToast(res.message, true);
      return;
    }
    const created = res.data.forms.find((f) => f.title === "Ricorso") || res.data.forms[res.data.forms.length - 1];
    const formId = created?.id || null;
    setBusy(false);
    await saveAppeals({ formId }, formId ? "Modulo di ricorso creato." : "Form creato.");
  };

  const saveMessage = async (key: keyof ModerationMessages) => {
    if (!msgDraft) return;
    await save({ messages: { [key]: msgDraft[key] } }, "Messaggio aggiornato.");
  };

  const addAutoPunishRule = async () => {
    if (!bundle) return;
    const warnCount = Math.max(1, Math.min(50, Math.floor(Number(apWarnCount) || 0)));
    const durationMinutes = Math.max(0, Math.min(525600, Math.floor(Number(apDuration) || 0)));
    const needsRole = apAction === "add_role" || apAction === "remove_role";
    if (!warnCount) {
      onToast("Indica un numero di avvertimenti valido.", true);
      return;
    }
    if (needsRole && !apRoleId) {
      onToast("Seleziona un ruolo per questa azione.", true);
      return;
    }
    if (bundle.settings.autoPunishRules.some((r) => r.warnCount === warnCount)) {
      onToast("Esiste già una regola per quella soglia di warn.", true);
      return;
    }
    const next: AutoPunishRule[] = [
      ...bundle.settings.autoPunishRules,
      {
        id: `ap_${warnCount}_${apAction}_${Date.now()}`,
        warnCount,
        action: apAction,
        durationMinutes,
        roleId: needsRole ? apRoleId : null,
      },
    ].sort((a, b) => a.warnCount - b.warnCount);
    await save({ autoPunishRules: next }, "Regola aggiunta.");
  };

  const removeAutoPunishRule = async (id: string) => {
    if (!bundle) return;
    const next = bundle.settings.autoPunishRules.filter((r) => r.id !== id);
    await save({ autoPunishRules: next }, "Regola rimossa.");
  };

  const channelOptions = useMemo(() => {
    const list = bundle?.pickers.textChannels || [];
    return [{ value: "", label: "— Nessuno —" }, ...list.map((c) => ({ value: c.id, label: `#${c.name}` }))];
  }, [bundle?.pickers.textChannels]);

  const roleOptions = useMemo(
    () => (bundle?.pickers.roles || []).filter((r) => !r.managed).map((r) => ({ id: r.id, label: r.name })),
    [bundle?.pickers.roles],
  );

  const formOptions = useMemo(
    () => [
      { value: "", label: "Seleziona…" },
      ...(bundle?.pickers.forms || []).map((f) => ({ value: f.id, label: f.title })),
    ],
    [bundle?.pickers.forms],
  );

  if (loading && !bundle) {
    return <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />;
  }
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle) return null;

  const { settings } = bundle;

  return (
    <div className="space-y-4">
      {activeTab === "overview" ? (
        <div className="space-y-4">
          <Panel icon={<Shield />} title="Opzioni" description="Comportamento dei comandi di moderazione.">
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
              <SettingRow title="Invia DM agli utenti" description="Quando vengono espulsi, bannati o silenziati.">
                <Toggle size="sm" checked={settings.dmOnAction} disabled={busy} label="DM" onChange={(next) => void save({ dmOnAction: next })} />
              </SettingRow>
              <SettingRow title="Rispondi con la motivazione" description="Mostra il motivo nella risposta pubblica del comando.">
                <Toggle
                  size="sm"
                  checked={settings.replyWithReason}
                  disabled={busy}
                  label="Motivazione"
                  onChange={(next) => void save({ replyWithReason: next })}
                />
              </SettingRow>
              <SettingRow title="Usa i timeout di Discord" description="Per il silenziamento (altrimenti ruolo Muted se disponibile).">
                <Toggle
                  size="sm"
                  checked={settings.useDiscordTimeout}
                  disabled={busy}
                  label="Timeout Discord"
                  onChange={(next) => void save({ useDiscordTimeout: next })}
                />
              </SettingRow>
              <SettingRow title="Conserva i messaggi in caso di ban" description="Non cancella la cronologia messaggi dell’utente.">
                <Toggle
                  size="sm"
                  checked={settings.keepMessagesOnBan}
                  disabled={busy}
                  label="Conserva messaggi"
                  onChange={(next) => void save({ keepMessagesOnBan: next })}
                />
              </SettingRow>
              <SettingRow title="Elimina i comandi dopo l’esecuzione" description="Cancella il messaggio +ban/+mute/… dopo il successo.">
                <Toggle
                  size="sm"
                  checked={settings.deleteModCommands}
                  disabled={busy}
                  label="Elimina comandi"
                  onChange={(next) => void save({ deleteModCommands: next })}
                />
              </SettingRow>
              <SettingRow title="Motivo obbligatorio" description="Per mute e warn (ban e kick lo richiedono sempre).">
                <Toggle
                  size="sm"
                  checked={settings.requireReason}
                  disabled={busy}
                  label="Motivo obbligatorio"
                  onChange={(next) => void save({ requireReason: next })}
                />
              </SettingRow>
              {!settings.keepMessagesOnBan ? (
                <SettingRow title="Giorni messaggi da cancellare al ban" description="0–7 giorni di cronologia.">
                  <Select
                    value={String(settings.banDeleteDays)}
                    disabled={busy}
                    onChange={(v) => void save({ banDeleteDays: Number(v) || 0 }, "Giorni ban salvati.")}
                    className={cn(fieldClass, "w-28")}
                    options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: `${d}g` }))}
                  />
                </SettingRow>
              ) : null}
            </div>
          </Panel>

          <div className="grid items-stretch gap-4 xl:grid-cols-3">
            <Panel
              className="flex h-full flex-col"
              bodyClassName="flex flex-1 flex-col"
              icon={<Hash />}
              title="Canale log moderazione"
              description="Le azioni dei moderatori verranno registrate in questo canale."
            >
              <Field label="Canale">
                <Select
                  value={settings.modLogsChannelId || ""}
                  disabled={busy}
                  onChange={(v) => void save({ modLogsChannelId: v || null }, "Canale mod logs salvato.")}
                  className={fieldClass}
                  options={channelOptions}
                />
              </Field>
            </Panel>
            <Panel className="flex h-full flex-col" bodyClassName="flex flex-1 flex-col" icon={<UserCog />} title="Ruoli moderatore" description="I membri con questi ruoli possono usare i comandi di moderazione.">
              <MultiCheck
                options={roleOptions}
                selected={settings.moderatorRoleIds}
                onChange={(ids) => void save({ moderatorRoleIds: ids }, "Ruoli moderatore salvati.")}
                empty="Nessun ruolo disponibile."
              />
            </Panel>
            <Panel className="flex h-full flex-col" bodyClassName="flex flex-1 flex-col" icon={<ShieldCheck />} title="Ruoli protetti" description="Non possono essere silenziati, espulsi o bannati dai moderatori.">
              <MultiCheck
                options={roleOptions}
                selected={settings.protectedRoleIds}
                onChange={(ids) => void save({ protectedRoleIds: ids }, "Ruoli protetti salvati.")}
                empty="Nessun ruolo disponibile."
              />
            </Panel>
          </div>

          <Panel icon={<MessageSquare />} title="Risposte personalizzate" description="Messaggi pubblici dopo un’azione. Usa {user} per il nome dell’utente.">
            <div className="grid gap-3 md:grid-cols-2">
              {MESSAGE_FIELDS.map((field) => {
                const draftVal = msgDraft?.[field.key] || "";
                const savedVal = settings.messages?.[field.key] || "";
                const dirty = Boolean(msgDraft) && draftVal !== savedVal;
                return (
                  <div key={field.key} className="space-y-1.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-crema/50">{field.label}</p>
                    <div className="flex items-stretch gap-1.5">
                      <input
                        value={draftVal}
                        disabled={busy || !msgDraft}
                        onChange={(e) => setMsgDraft((prev) => (prev ? { ...prev, [field.key]: e.target.value } : prev))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && dirty) {
                            e.preventDefault();
                            void saveMessage(field.key);
                          }
                        }}
                        className={cn(fieldClass, "mt-0 min-w-0 flex-1")}
                        maxLength={300}
                      />
                      <button
                        type="button"
                        disabled={busy || !msgDraft || !dirty}
                        onClick={() => void saveMessage(field.key)}
                        title="Salva"
                        aria-label={`Salva ${field.label}`}
                        className={cn(
                          "inline-flex size-[2.625rem] shrink-0 items-center justify-center rounded-lg transition-[background-color,color,opacity,transform] duration-150 ease-out",
                          "text-ember hover:bg-caramel/15 active:scale-[0.97]",
                          "disabled:pointer-events-none disabled:text-crema/25",
                          dirty && "bg-caramel/10 ring-1 ring-caramel/30",
                        )}
                      >
                        <Check className="size-4" strokeWidth={2.25} aria-hidden />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

        </div>
      ) : null}

      {activeTab === "punizioni" ? (
        <Panel
          icon={<Zap />}
          title="Punizione automatica"
          description="Alla soglia di warn (+warn) il bot applica l’azione scelta. Durata 0 = permanente."
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-espresso/40 p-4 ring-1 ring-sand/10">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,11rem)_minmax(0,12rem)_minmax(0,11rem)_auto]">
                <label className="block min-w-0">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-crema/50">Warn raggiunti</span>
                  <div className="mt-1.5 flex h-[2.625rem] items-center gap-2">
                    <input
                      value={apWarnCount}
                      onChange={(e) => setApWarnCount(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                      className={cn(controlClass, "w-[4.25rem] shrink-0")}
                      inputMode="numeric"
                      disabled={busy}
                      aria-label="Numero avvertimenti"
                    />
                    <span className="text-sm text-crema/55">avvertimenti</span>
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-crema/50">Azione</span>
                  <div className="mt-1.5">
                    <Select
                      value={apAction}
                      disabled={busy}
                      onChange={(v) => setApAction(v as AutoPunishAction)}
                      className={cn(controlClass, "w-full")}
                      options={AUTO_PUNISH_ACTIONS.map((a) => ({ value: a.value, label: a.label }))}
                    />
                  </div>
                </label>

                {apAction === "mute" || apAction === "ban" ? (
                  <label className="block min-w-0">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-crema/50">Durata</span>
                    <div className="mt-1.5 flex h-[2.625rem] items-center gap-2">
                      <input
                        value={apDuration}
                        onChange={(e) => setApDuration(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                        className={cn(controlClass, "w-[5rem] shrink-0")}
                        inputMode="numeric"
                        disabled={busy}
                        aria-label="Durata in minuti"
                      />
                      <span className="text-sm text-crema/55">minuti</span>
                    </div>
                  </label>
                ) : null}

                {apAction === "add_role" || apAction === "remove_role" ? (
                  <label className="block min-w-0 sm:col-span-2 xl:col-span-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-crema/50">Ruolo</span>
                    <div className="mt-1.5">
                      <Select
                        value={apRoleId}
                        disabled={busy}
                        onChange={setApRoleId}
                        className={cn(controlClass, "w-full min-w-[12rem]")}
                        options={[{ value: "", label: "— Seleziona ruolo —" }, ...roleOptions.map((r) => ({ value: r.id, label: r.label }))]}
                      />
                    </div>
                  </label>
                ) : null}

                <div className="flex items-end">
                  <button
                    type="button"
                    className={cn(primaryMini, "h-[2.625rem] px-4")}
                    disabled={busy}
                    onClick={() => void addAutoPunishRule()}
                  >
                    <Plus className="size-3.5" strokeWidth={2.5} aria-hidden />
                    Aggiungi
                  </button>
                </div>
              </div>
            </div>

            {settings.autoPunishRules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-sand/15 px-4 py-8 text-center">
                <p className="text-sm text-crema/55">Nessuna regola ancora.</p>
                <p className="mt-1 text-xs text-crema/40">Esempio: 3 warn → silenzia 30 minuti</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl ring-1 ring-sand/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-espresso/60 text-[0.65rem] uppercase tracking-wide text-crema/50">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Warn n.</th>
                      <th className="px-3 py-2.5 font-semibold">Azione</th>
                      <th className="px-3 py-2.5 font-semibold">Durata</th>
                      <th className="px-3 py-2.5 font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand/[0.07] bg-espresso/40">
                    {settings.autoPunishRules.map((rule) => {
                      const roleName =
                        rule.roleId && (rule.action === "add_role" || rule.action === "remove_role")
                          ? roleOptions.find((r) => r.id === rule.roleId)?.label || rule.roleId
                          : null;
                      return (
                        <tr key={rule.id}>
                          <td className="px-3 py-2.5 tabular-nums text-crema">{rule.warnCount}</td>
                          <td className="px-3 py-2.5 text-crema/85">
                            {actionLabel(rule.action)}
                            {roleName ? <span className="text-crema/50"> · {roleName}</span> : null}
                          </td>
                          <td className="px-3 py-2.5 text-crema/70">
                            {rule.action === "mute" || rule.action === "ban" ? formatDurationMinutes(rule.durationMinutes) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              className={dangerBtn}
                              disabled={busy}
                              onClick={() => void removeAutoPunishRule(rule.id)}
                            >
                              Rimuovi
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>
      ) : null}

      {activeTab === "ricorsi" ? (
        <div className="space-y-4">
          <Panel
            icon={<FileText />}
            title="Modulo di ricorso"
            description="Form ticket collegato ai ricorsi. Sul sito Vinili le richieste unban/unmute usano comunque /appelli/."
          >
            <Field label="Modulo di ricorso">
              <Select
                value={settings.appeals.formId || ""}
                disabled={busy}
                onChange={(v) => void saveAppeals({ formId: v || null }, "Modulo di ricorso salvato.")}
                className={fieldClass}
                options={formOptions}
              />
            </Field>
            <button
              type="button"
              className={cn(miniBtn, "mt-3")}
              disabled={busy}
              onClick={() => void createAppealForm()}
            >
              Crea modulo
            </button>
          </Panel>

          <Panel icon={<Shield />} title="Consenti ricorsi per" description="Chi può inviare una richiesta di ricorso.">
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              <SettingRow title="Utenti bannati" description="Permetti ricorsi unban dal sito o dal form.">
                <Toggle
                  size="sm"
                  checked={settings.appeals.allowBanned}
                  disabled={busy}
                  label="Utenti bannati"
                  onChange={(next) => void saveAppeals({ allowBanned: next })}
                />
              </SettingRow>
              <SettingRow title="Membri mutati" description="Permetti ricorsi unmute dal sito o dal form.">
                <Toggle
                  size="sm"
                  checked={settings.appeals.allowMuted}
                  disabled={busy}
                  label="Membri mutati"
                  onChange={(next) => void saveAppeals({ allowMuted: next })}
                />
              </SettingRow>
            </div>
          </Panel>

          <Panel
            icon={<Clock3 />}
            title="Periodo di attesa (giorni)"
            description="Giorni da attendere dopo ban/mute (e tra un ricorso e il successivo)."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  {
                    key: "waitDaysBan" as const,
                    label: "Periodo di attesa per il ban",
                    draft: waitBanDraft,
                    setDraft: setWaitBanDraft,
                    saved: settings.appeals.waitDaysBan,
                  },
                  {
                    key: "waitDaysMute" as const,
                    label: "Periodo di attesa per il mute",
                    draft: waitMuteDraft,
                    setDraft: setWaitMuteDraft,
                    saved: settings.appeals.waitDaysMute,
                  },
                ] as const
              ).map((row) => {
                const dirty = Number(row.draft || 0) !== Number(row.saved || 0);
                return (
                  <div key={row.key} className="space-y-1.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-crema/50">{row.label}</p>
                    <div className="flex items-stretch gap-1.5">
                      <input
                        value={row.draft}
                        disabled={busy}
                        inputMode="numeric"
                        onChange={(e) => row.setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && dirty) {
                            e.preventDefault();
                            void saveAppeals({ [row.key]: Math.max(0, Math.min(365, Number(row.draft) || 0)) });
                          }
                        }}
                        className={cn(fieldClass, "mt-0 min-w-0 flex-1")}
                      />
                      <button
                        type="button"
                        disabled={busy || !dirty}
                        onClick={() => void saveAppeals({ [row.key]: Math.max(0, Math.min(365, Number(row.draft) || 0)) })}
                        title="Salva"
                        aria-label={`Salva ${row.label}`}
                        className={cn(
                          "inline-flex size-[2.625rem] shrink-0 items-center justify-center rounded-lg transition-[background-color,color,opacity,transform] duration-150 ease-out",
                          "text-ember hover:bg-caramel/15 active:scale-[0.97]",
                          "disabled:pointer-events-none disabled:text-crema/25",
                          dirty && "bg-caramel/10 ring-1 ring-caramel/30",
                        )}
                      >
                        <Check className="size-4" strokeWidth={2.25} aria-hidden />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            icon={<MessageSquare />}
            title="Invia DM all’utente su"
            description="Notifiche Discord all’utente dopo la decisione sullo staff. Funziona solo se l’utente e il bot condividono un server."
          >
            <ul className="space-y-2">
              {(
                [
                  { key: "dmOnApproveBan" as const, label: "Approvazione (rimuovi ban)" },
                  { key: "dmOnApproveMute" as const, label: "Approvazione (rimuovi mute)" },
                  { key: "dmOnReject" as const, label: "Rifiuto" },
                ] as const
              ).map((row) => (
                <li key={row.key}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-crema/[0.04]">
                    <Checkbox
                      checked={settings.appeals[row.key]}
                      disabled={busy}
                      onChange={(next) => void saveAppeals({ [row.key]: next })}
                    />
                    <span className="text-sm text-crema">{row.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            icon={<Hash />}
            title="URL di invito"
            description="Per invitare utenti a cui è stato rimosso il ban (pulsante nel DM di unban)."
          >
            <div className="flex items-stretch gap-1.5">
              <input
                value={inviteDraft}
                disabled={busy}
                placeholder="https://discord.gg/…"
                onChange={(e) => setInviteDraft(e.target.value.slice(0, 300))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inviteDraft.trim() !== (settings.appeals.inviteUrl || "")) {
                    e.preventDefault();
                    void saveAppeals({ inviteUrl: inviteDraft.trim() });
                  }
                }}
                className={cn(fieldClass, "mt-0 min-w-0 flex-1")}
              />
              <button
                type="button"
                disabled={busy || inviteDraft.trim() === (settings.appeals.inviteUrl || "")}
                onClick={() => void saveAppeals({ inviteUrl: inviteDraft.trim() })}
                title="Salva"
                aria-label="Salva URL di invito"
                className={cn(
                  "inline-flex size-[2.625rem] shrink-0 items-center justify-center rounded-lg transition-[background-color,color,opacity,transform] duration-150 ease-out",
                  "text-ember hover:bg-caramel/15 active:scale-[0.97]",
                  "disabled:pointer-events-none disabled:text-crema/25",
                  inviteDraft.trim() !== (settings.appeals.inviteUrl || "") && "bg-caramel/10 ring-1 ring-caramel/30",
                )}
              >
                <Check className="size-4" strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "casi" ? (
        <Panel
          icon={<ListOrdered />}
          title="Casi"
          description={
            casesData
              ? `${casesData.total} casi registrati · pagina ${casesData.page} di ${casesData.pages}`
              : "Azioni di moderazione registrate su questo server."
          }
        >
          <div id="dash-mod-cases" className="scroll-mt-24 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="ID utente">
                <input
                  value={caseUserId}
                  inputMode="numeric"
                  placeholder="es. 123456789012345678"
                  onChange={(e) => setCaseUserId(e.target.value.replace(/\D/g, "").slice(0, 22))}
                  className={controlClass}
                />
              </Field>
              <Field label="Azione">
                <Select
                  value={caseAction}
                  onChange={setCaseAction}
                  options={[
                    { value: "ALL", label: "Tutte" },
                    { value: "BAN", label: "Ban" },
                    { value: "SOFTBAN", label: "Softban" },
                    { value: "KICK", label: "Kick" },
                    { value: "MUTE", label: "Mute" },
                    { value: "WARN", label: "Warn" },
                    { value: "UNBAN", label: "Unban" },
                    { value: "UNMUTE", label: "Unmute" },
                  ]}
                  className={controlClass}
                />
              </Field>
              <Field label="Dal">
                <input type="date" value={caseFrom} onChange={(e) => setCaseFrom(e.target.value)} className={controlClass} />
              </Field>
              <Field label="Al">
                <input type="date" value={caseTo} onChange={(e) => setCaseTo(e.target.value)} className={controlClass} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryMini}
                onClick={() => {
                  setCasesPage(1);
                  setCaseFilters({ userId: caseUserId.trim(), action: caseAction, from: caseFrom, to: caseTo });
                }}
              >
                Cerca
              </button>
              <button
                type="button"
                className={miniBtn}
                onClick={() => {
                  setCaseUserId("");
                  setCaseAction("ALL");
                  setCaseFrom("");
                  setCaseTo("");
                  setCasesPage(1);
                  setCaseFilters({ userId: "", action: "ALL", from: "", to: "" });
                }}
              >
                Reset
              </button>
            </div>
            {casesLoading && !casesData ? <div className="h-32 animate-pulse rounded-xl bg-crema/6" /> : null}
            {casesError ? <Notice>{casesError}</Notice> : null}
            {!casesLoading && casesData && casesData.recentCases.length === 0 ? (
              <p className="text-sm text-crema/60">
                {caseFilters.userId || caseFilters.action !== "ALL" || caseFilters.from || caseFilters.to
                  ? "Nessun caso con questi filtri."
                  : "Ancora nessun caso. Appaiono qui dopo ban, kick, mute, warn, ecc."}
              </p>
            ) : null}
            {casesData && casesData.recentCases.length > 0 ? (
              <ul
                className={cn(
                  "divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/40 ring-1 ring-sand/10",
                  casesLoading && "opacity-60",
                )}
              >
                {casesData.recentCases.map((row) => (
                  <CaseRow key={`case-${row.caseId}-${row.userId}-${row.createdAt}`} row={row} />
                ))}
              </ul>
            ) : null}
            {casesData && casesData.pages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs tabular-nums text-crema/60">{casesData.total} casi</span>
                <Pagination
                  page={casesData.page}
                  totalPages={casesData.pages}
                  onChange={setCasesPage}
                  scrollToId="dash-mod-cases"
                />
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

    </div>
  );
}
