"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  CalendarClock,
  Clock3,
  HardDrive,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Checkbox, confirmDialog } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  backupApi,
  type BackupListItem,
  type BackupPreview,
  type BackupSettings,
  type BackupSummary,
  type CreateStatus,
  type LoadAction,
  type LoadSession,
  type LoadStatus,
} from "@/lib/dashboard-backup";
import {
  Field,
  Notice,
  PageHero,
  PageSection,
  Pills,
  RowsSkeleton,
  Toggle,
  TrackUnsaved,
  dangerBtn,
  fieldClass,
  miniBtn,
  primaryMini,
} from "./bits";
import { BackupPreviewView } from "./BackupPreviewView";

/** Preset messaggi: pochi valori chiari, non una griglia tecnica. */
const MANUAL_MSG_PRESETS = [
  { value: "0", label: "Nessuno" },
  { value: "500", label: "Pochi (500 / canale)" },
  { value: "2500", label: "Standard (2.500 / canale)" },
  { value: "10000", label: "Tanti (10.000 / canale)" },
];

const AUTO_MSG_PRESETS = [
  { value: "0", label: "Nessuno (consigliato)" },
  { value: "100", label: "Pochi (100 / canale)" },
  { value: "500", label: "Medi (500 / canale)" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}));

const MINUTE_OPTIONS = [
  { value: "0", label: ":00" },
  { value: "15", label: ":15" },
  { value: "30", label: ":30" },
  { value: "45", label: ":45" },
];

type Tab = "archive" | "settings";
type WizardStep = "actions" | "preflight";

function nearestPreset(value: string, presets: { value: string; label: string }[]) {
  if (presets.some((o) => o.value === value)) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return presets[0]?.value || "0";
  let best = presets[0]?.value || "0";
  let bestDist = Infinity;
  for (const p of presets) {
    const d = Math.abs(Number(p.value) - n);
    if (d < bestDist) {
      bestDist = d;
      best = p.value;
    }
  }
  return best;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

function formatSize(bytes?: number | null) {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

function sourceLabel(source: string) {
  return source === "automatic" ? "Automatico" : "Manuale";
}

function isCreateRunning(status: CreateStatus) {
  if (!status) return false;
  const phase = String(status.phase || "").toLowerCase();
  return !["done", "failed", "completed"].includes(phase);
}

function createPercent(status: CreateStatus) {
  if (!status) return 0;
  return Math.max(0, Math.min(100, Math.floor(Number(status.percent || 0))));
}

function StatusStrip({
  tone,
  title,
  detail,
  meta,
  action,
  progress,
}: {
  tone: "caramel" | "ember" | "danger";
  title: string;
  detail?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  progress?: number | null;
}) {
  const tones = {
    caramel: "bg-caramel/[0.08] ring-caramel/25",
    ember: "bg-ember/[0.08] ring-ember/25",
    danger: "bg-[#a83a2c]/10 ring-[#a83a2c]/30",
  } as const;
  return (
    <div className={cn("rounded-2xl px-4 py-3.5 ring-1", tones[tone])}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-crema">{title}</p>
          {detail ? <div className="text-sm leading-relaxed text-crema/70">{detail}</div> : null}
          {meta ? <div className="text-xs text-crema/50">{meta}</div> : null}
        </div>
        {action}
      </div>
      {progress != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-espresso/70">
          <motion.div
            className="h-full rounded-full bg-caramel"
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function BackupPanel({
  guildId,
  token,
  onToast,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("archive");
  const [items, setItems] = useState<BackupListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [info, setInfo] = useState<BackupSummary | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(null);
  const [createStatus, setCreateStatus] = useState<CreateStatus>(null);

  const [actionsCatalog, setActionsCatalog] = useState<LoadAction[]>([]);
  const [limitOptions, setLimitOptions] = useState<{ value: string; label: string }[]>([]);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [settingsSaved, setSettingsSaved] = useState("");
  const [wizard, setWizard] = useState<{
    step: WizardStep;
    session: LoadSession;
    warnings?: string[];
    backup?: BackupSummary;
  } | null>(null);
  const [customizeRestore, setCustomizeRestore] = useState(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const settingsDirty = Boolean(settings) && JSON.stringify(settings) !== settingsSaved;

  useEffect(() => {
    let alive = true;
    void backupApi.list(token, guildId, { pageSize: 40 }).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setItems(r.data.items);
        setLoadStatus(r.data.loadStatus);
        setCreateStatus(r.data.createStatus);
        setListError(null);
      } else {
        setListError(r.message);
        setItems([]);
      }
    });
    void backupApi.loadActions(token, guildId).then((r) => {
      if (!alive || !r.ok) return;
      setActionsCatalog(r.data.actions);
      setLimitOptions(r.data.messagesLimitOptions);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token, nonce]);

  useEffect(() => {
    let alive = true;
    void backupApi.getSettings(token, guildId).then((r) => {
      if (!alive || !r.ok) return;
      setSettings(r.data.settings);
      setSettingsSaved(JSON.stringify(r.data.settings));
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  const saveSettings = async () => {
    if (!settings) return;
    setBusy("settings");
    // Asset e audit restano sensati in automatico: non li esponiamo in UI.
    const r = await backupApi.patchSettings(token, guildId, {
      manual: {
        ...settings.manual,
        includeAssetData: true,
        includeStructureAssetBytes: true,
        maxAuditLogs: 0,
      },
      automatic: {
        ...settings.automatic,
        includeAssetData: false,
        includeStructureAssetBytes: true,
        maxAuditLogs: 0,
      },
      retention: {
        ...settings.retention,
        minManualToKeep: Math.min(
          Math.max(3, Math.floor(Number(settings.retention.maxManual) / 4) || 3),
          Number(settings.retention.maxManual) || 1,
        ),
      },
    });
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setSettings(r.data.settings);
    setSettingsSaved(JSON.stringify(r.data.settings));
    onToast("Impostazioni backup salvate.");
  };

  const resetSettings = () => {
    try {
      setSettings(JSON.parse(settingsSaved) as BackupSettings);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const watchLoad = Boolean(loadStatus);
    const watchCreate = isCreateRunning(createStatus);
    if (!watchLoad && !watchCreate) return;
    let alive = true;
    const tick = async () => {
      const r = await backupApi.status(token, guildId);
      if (!alive || !r.ok) return;
      if (watchLoad) {
        setLoadStatus(r.data.loadStatus);
        if (!r.data.loadStatus) refresh();
      }
      if (watchCreate || r.data.createStatus) {
        const next = r.data.createStatus;
        setCreateStatus(next);
        const phase = String(next?.phase || "").toLowerCase();
        if (phase === "done") {
          onToast(`Backup ${next?.backupId || ""} creato.`);
          setCreateStatus(null);
          refresh();
        } else if (phase === "failed") {
          onToast(next?.error || "Creazione backup non riuscita.", true);
          setCreateStatus(null);
        }
      }
    };
    const id = window.setInterval(() => void tick(), 2500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [loadStatus?.backupId, loadStatus?.phase, createStatus?.phase, guildId, token, refresh, onToast]);

  const creating = isCreateRunning(createStatus);

  const create = async () => {
    const ok = await confirmDialog({
      title: "Crea backup del server?",
      message:
        "Il bot salva una copia completa di ruoli, canali, messaggi e impostazioni del server. Ci vuole qualche minuto: puoi anche chiudere la pagina, il salvataggio va avanti lo stesso.",
      confirmLabel: "Crea backup",
    });
    if (!ok) return;
    setBusy("create");
    const r = await backupApi.create(token, guildId);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setCreateStatus(r.data.createStatus);
    setTab("archive");
    onToast("Creazione avviata in background.");
  };

  const showInfo = async (row: BackupListItem) => {
    if (info?.backupId === row.backupId) {
      setInfo(null);
      setPreview(null);
      return;
    }
    setBusy(`info:${row.backupId}`);
    const r = await backupApi.get(token, guildId, row.backupId);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setInfo(r.data.backup);
    setPreview(r.data.preview || null);
    setTab("archive");
    if (!r.data.preview) onToast("Anteprima non disponibile per questo snapshot.", true);
  };

  const remove = async (row: BackupListItem) => {
    const ok = await confirmDialog({
      title: "Eliminare questo backup?",
      message: `La copia ${row.backupId} verrà cancellata per sempre.`,
      confirmLabel: "Elimina",
      danger: true,
    });
    if (!ok) return;
    setBusy(`del:${row.backupId}`);
    const r = await backupApi.remove(token, guildId, row.backupId);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    onToast("Backup eliminato.");
    if (info?.backupId === row.backupId) {
      setInfo(null);
      setPreview(null);
    }
    refresh();
  };

  const startRestore = async (row: BackupListItem) => {
    setBusy(`restore:${row.backupId}`);
    const r = await backupApi.createSession(token, guildId, { backupId: row.backupId });
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setCustomizeRestore(false);
    setWizard({ step: "actions", session: r.data.session });
    setTab("archive");
  };

  const patchWizard = async (patch: { actions?: string[]; messagesLimit?: string }) => {
    if (!wizard) return;
    setBusy("wizard");
    const r = await backupApi.patchSession(token, guildId, wizard.session.id, patch);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setWizard((w) => (w ? { ...w, session: r.data.session } : w));
  };

  const runPreflight = async () => {
    if (!wizard) return;
    setBusy("preflight");
    const r = await backupApi.preflight(token, guildId, wizard.session.id);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setWizard({
      step: "preflight",
      session: r.data.session,
      warnings: r.data.warnings,
      backup: r.data.backup,
    });
  };

  const confirmRestore = async () => {
    if (!wizard) return;
    const ok = await confirmDialog({
      title: "Confermi il ripristino?",
      message:
        "Attenzione: canali, ruoli e contenuti del server verranno cambiati secondo le scelte fatte. Prima di cominciare il bot salva da solo una copia dello stato attuale.",
      confirmLabel: "Avvia ripristino",
      danger: true,
    });
    if (!ok) return;
    setBusy("confirm");
    const r = await backupApi.confirm(token, guildId, wizard.session.id);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setWizard(null);
    setLoadStatus(r.data.loadStatus);
    onToast("Ripristino avviato. Puoi seguire lo stato qui sotto.");
  };

  const cancelLoad = async () => {
    setBusy("cancel");
    const r = await backupApi.cancel(token, guildId);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setLoadStatus(r.data.loadStatus);
    onToast("Annullamento richiesto: il ripristino si fermerà appena possibile.");
  };

  if (items === null && !listError) return <RowsSkeleton rows={6} />;

  const selectedActions = new Set(wizard?.session.actions || []);
  const allActionKeys = (actionsCatalog.length
    ? actionsCatalog.map((a) => a.key)
    : wizard?.session.actions || []) as string[];
  const isFullRestore =
    allActionKeys.length > 0 && allActionKeys.every((key) => selectedActions.has(key));
  const limitValue =
    wizard?.session.messagesLimit == null ? "ALL" : String(wizard.session.messagesLimit);
  const manualMsg = nearestPreset(
    String(settings?.manual.maxMessagesPerChannel ?? 2500),
    MANUAL_MSG_PRESETS,
  );
  const autoMsg = nearestPreset(
    String(settings?.automatic.maxMessagesPerChannel ?? 0),
    AUTO_MSG_PRESETS,
  );

  return (
    <div className="space-y-5">
      <TrackUnsaved dirty={settingsDirty} onSave={saveSettings} onReset={resetSettings} />
      <PageHero
        icon={Archive}
        title="Backup"
        text="Le copie salvate del server, con struttura, messaggi e impostazioni, pronte da ripristinare."
        aside={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={miniBtn} onClick={() => refresh()} disabled={Boolean(busy)}>
              <RefreshCw className="size-3.5" />
              Aggiorna
            </button>
            <button
              type="button"
              className={cn(primaryMini, "px-4 py-2 text-sm")}
              disabled={busy === "create" || creating}
              onClick={() => void create()}
            >
              {busy === "create" || creating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Archive className="size-3.5" />
              )}
              Crea snapshot
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pills
          ariaLabel="Sezioni backup"
          value={tab}
          onChange={setTab}
          options={[
            { id: "archive", label: "Archivio", icon: HardDrive },
            { id: "settings", label: "Impostazioni", icon: Settings2 },
          ]}
        />
        {settings?.automatic.enabled ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-crema/50">
            <CalendarClock className="size-3.5 text-ember" aria-hidden />
            Automatico alle {String(settings.automatic.hour).padStart(2, "0")}:
            {String(settings.automatic.minute).padStart(2, "0")}
          </p>
        ) : null}
      </div>

      {listError ? <Notice error>{listError}</Notice> : null}

      {creating && createStatus ? (
        <StatusStrip
          tone="caramel"
          title="Creazione snapshot in corso"
          detail={createStatus.label || "Salvataggio in background…"}
          meta="Puoi restare qui o cambiare pagina, il lavoro va avanti lo stesso. Finché non ha finito non si può avviare un ripristino."
          progress={createPercent(createStatus)}
          action={
            <span className="shrink-0 font-display text-2xl font-semibold tabular-nums text-caramel">
              {createPercent(createStatus)}%
            </span>
          }
        />
      ) : null}

      {loadStatus ? (
        <StatusStrip
          tone={loadStatus.cancelRequested ? "danger" : "ember"}
          title={loadStatus.cancelRequested ? "Annullamento ripristino…" : "Ripristino in corso"}
          detail={
            <>
              Snapshot <span className="font-mono text-caramel">{loadStatus.backupId}</span>
              {" · "}
              fase <span className="font-mono text-crema/80">{loadStatus.phase}</span>
              {" · "}
              elaborati <span className="tabular-nums">{loadStatus.processed}</span>
            </>
          }
          meta={loadStatus.checkpointId ? `Checkpoint ${loadStatus.checkpointId}` : undefined}
          action={
            <button
              type="button"
              className={dangerBtn}
              disabled={Boolean(busy) || loadStatus.cancelRequested}
              onClick={() => void cancelLoad()}
            >
              Annulla
            </button>
          }
        />
      ) : null}

      <AnimatePresence mode="wait">
        {tab === "archive" ? (
          <motion.div
            key="archive"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="space-y-4"
          >
            {!items?.length ? (
              <EmptyState
                icon={Archive}
                title="Archivio vuoto"
                text="Crea il primo snapshot del server. Da qui potrai rivederlo e ripristinarlo quando serve."
                action={
                  <button
                    type="button"
                    className={cn(primaryMini, "px-4 py-2 text-sm")}
                    disabled={busy === "create" || creating}
                    onClick={() => void create()}
                  >
                    <Archive className="size-3.5" />
                    Crea il primo snapshot
                  </button>
                }
              />
            ) : (
              <PageSection
                icon={HardDrive}
                title="Snapshot salvati"
                text="Apri un’anteprima quasi reale, ripristina oppure elimina. I più recenti stanno in alto."
              >
                <ul className="space-y-2">
                  {items.map((row) => {
                    const open = info?.backupId === row.backupId;
                    const auto = row.source === "automatic";
                    return (
                      <li key={row.backupId}>
                        <div
                          className={cn(
                            "rounded-2xl bg-espresso/45 p-3 ring-1 transition sm:p-3.5",
                            open ? "ring-caramel/40" : "ring-sand/12 hover:ring-sand/25",
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void showInfo(row)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-semibold tracking-wide text-caramel">
                                  {row.backupId}
                                </span>
                                <span
                                  className={cn(
                                    "rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1",
                                    auto
                                      ? "bg-crema/[0.04] text-crema/55 ring-sand/15"
                                      : "bg-caramel/10 text-ember ring-caramel/25",
                                  )}
                                >
                                  {sourceLabel(row.source)}
                                </span>
                              </div>
                              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-crema/55">
                                <span className="inline-flex items-center gap-1">
                                  <Clock3 className="size-3" aria-hidden />
                                  {formatWhen(row.createdAt)}
                                </span>
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <HardDrive className="size-3" aria-hidden />
                                  {formatSize(row.sizeBytes)}
                                </span>
                              </p>
                            </button>

                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                className={cn(miniBtn, open && "bg-caramel/15 text-crema ring-caramel/30")}
                                disabled={busy === `info:${row.backupId}` || busy === `del:${row.backupId}`}
                                onClick={() => void showInfo(row)}
                              >
                                {busy === `info:${row.backupId}` ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Info className="size-3.5" />
                                )}
                                Anteprima
                              </button>
                              <button
                                type="button"
                                className={miniBtn}
                                disabled={Boolean(busy) || Boolean(loadStatus) || creating}
                                onClick={() => void startRestore(row)}
                                title={creating ? "Aspetta la fine della creazione" : "Ripristina"}
                              >
                                <RotateCcw className="size-3.5" />
                                Ripristina
                              </button>
                              <button
                                type="button"
                                className={dangerBtn}
                                disabled={busy === `del:${row.backupId}` || busy === `info:${row.backupId}`}
                                onClick={() => void remove(row)}
                              >
                                {busy === `del:${row.backupId}` ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="size-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          <AnimatePresence initial={false}>
                            {open ? (
                              <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                              >
                                <div className="mt-3 border-t border-sand/10 pt-3">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-xs font-medium text-crema/40">
                                      Anteprima del server
                                    </p>
                                    <button
                                      type="button"
                                      className={miniBtn}
                                      onClick={() => {
                                        setInfo(null);
                                        setPreview(null);
                                      }}
                                    >
                                      <X className="size-3.5" />
                                      Chiudi
                                    </button>
                                  </div>
                                  {preview ? (
                                    <BackupPreviewView preview={preview} />
                                  ) : (
                                    <Notice>
                                      Anteprima non disponibile. Riprova, oppure crea un nuovo backup: quelli nuovi hanno
                                      l’anteprima completa.
                                    </Notice>
                                  )}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </PageSection>
            )}

            {wizard ? (
              <PageSection
                icon={RotateCcw}
                title={`Ripristina ${wizard.session.backupId}`}
                text="Se non cambi niente ripristina tutta la copia. Le modifiche al server sono definitive."
                right={
                  <button type="button" className={miniBtn} disabled={Boolean(busy)} onClick={() => setWizard(null)}>
                    <X className="size-3.5" />
                    Chiudi
                  </button>
                }
              >
                <div className="mb-4 flex items-center gap-2">
                  {(["actions", "preflight"] as const).map((step, i) => {
                    const active = wizard.step === step;
                    const done = wizard.step === "preflight" && step === "actions";
                    return (
                      <div key={step} className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded-full text-[0.7rem] font-semibold tabular-nums ring-1",
                            active
                              ? "bg-caramel/20 text-crema ring-caramel/40"
                              : done
                                ? "bg-crema/[0.08] text-crema/70 ring-sand/20"
                                : "bg-espresso/50 text-crema/40 ring-sand/10",
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className={cn("text-xs font-medium", active ? "text-crema" : "text-crema/45")}>
                          {step === "actions" ? "Opzioni" : "Conferma"}
                        </span>
                        {i === 0 ? <span className="mx-1 h-px w-6 bg-sand/20" aria-hidden /> : null}
                      </div>
                    );
                  })}
                </div>

                {wizard.step === "actions" ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5 rounded-2xl bg-ember/[0.08] px-3.5 py-3 text-sm text-crema/85 ring-1 ring-ember/25">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-ember" />
                      <p className="leading-relaxed text-pretty">
                        Operazione distruttiva: canali, ruoli e contenuti attuali possono essere sostituiti da quelli
                        dello snapshot.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-espresso/45 px-4 py-3.5 ring-1 ring-sand/15">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-crema">Ripristino completo</p>
                          <p className="mt-0.5 text-sm text-crema/55 text-pretty">
                            {isFullRestore
                              ? "Verrà ripristinato tutto quello che c’è nella copia (struttura, membri, messaggi, emoji…)."
                              : "Hai deselezionato alcune parti: non sarà un ripristino completo."}
                          </p>
                        </div>
                        {!isFullRestore ? (
                          <button
                            type="button"
                            className={miniBtn}
                            disabled={Boolean(busy) || !allActionKeys.length}
                            onClick={() => void patchWizard({ actions: allActionKeys })}
                          >
                            Ripristina tutto
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <Field label="Messaggi da ripristinare">
                      <Select
                        value={limitValue}
                        onChange={(v) => void patchWizard({ messagesLimit: v })}
                        options={(limitOptions.length
                          ? limitOptions
                          : [
                              { value: "ALL", label: "Tutti (integrale)" },
                              { value: "1000", label: "1.000" },
                            ]
                        ).map((o) => ({ value: o.value, label: o.label }))}
                      />
                    </Field>

                    <div>
                      <button
                        type="button"
                        className={cn(miniBtn, customizeRestore && "bg-caramel/15 ring-caramel/30")}
                        onClick={() => setCustomizeRestore((v) => !v)}
                      >
                        {customizeRestore ? "Nascondi personalizzazione" : "Personalizza cosa applicare"}
                      </button>
                      <AnimatePresence initial={false}>
                        {customizeRestore ? (
                          <motion.ul
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 grid gap-2 overflow-hidden sm:grid-cols-2"
                          >
                            {(actionsCatalog.length
                              ? actionsCatalog
                              : wizard.session.actions.map((key) => ({ key, label: key, description: "" }))
                            ).map((action) => {
                              const on = selectedActions.has(action.key);
                              const toggle = () => {
                                if (busy) return;
                                const next = new Set(selectedActions);
                                if (on) next.delete(action.key);
                                else next.add(action.key);
                                void patchWizard({ actions: [...next] });
                              };
                              return (
                                <li key={action.key}>
                                  <label
                                    className={cn(
                                      "flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition",
                                      on
                                        ? "bg-caramel/10 ring-caramel/35"
                                        : "bg-espresso/40 ring-sand/15 hover:bg-crema/[0.04] hover:ring-sand/30",
                                      busy && "cursor-not-allowed opacity-60",
                                    )}
                                  >
                                    <Checkbox
                                      checked={on}
                                      disabled={Boolean(busy)}
                                      aria-label={action.label}
                                      className="mt-0.5 size-4 rounded-md"
                                      onChange={() => toggle()}
                                    />
                                    <span className="min-w-0">
                                      <span className="block text-sm font-medium text-crema">{action.label}</span>
                                      {action.description ? (
                                        <span className="mt-0.5 block text-xs leading-relaxed text-crema/50">
                                          {action.description}
                                        </span>
                                      ) : null}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </motion.ul>
                        ) : null}
                      </AnimatePresence>
                    </div>

                    <button
                      type="button"
                      className={cn(primaryMini, "px-4 py-2 text-sm")}
                      disabled={Boolean(busy)}
                      onClick={() => void runPreflight()}
                    >
                      {busy === "preflight" ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      Continua al riepilogo
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(wizard.warnings || []).map((w) => (
                      <Notice key={w}>{w}</Notice>
                    ))}
                    {wizard.backup ? (
                      <p className="text-sm leading-relaxed text-crema/70 text-pretty">
                        Snapshot del {formatWhen(wizard.backup.createdAt)} · {wizard.backup.counts.channels} canali ·{" "}
                        {wizard.backup.counts.roles} ruoli · {wizard.backup.counts.messages} messaggi
                        {isFullRestore ? " · ripristino completo" : " · ripristino parziale"}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        className={miniBtn}
                        disabled={Boolean(busy)}
                        onClick={() => setWizard((w) => (w ? { ...w, step: "actions", warnings: undefined } : w))}
                      >
                        Indietro
                      </button>
                      <button
                        type="button"
                        className={cn(dangerBtn, "px-4 py-2 text-sm")}
                        disabled={Boolean(busy)}
                        onClick={() => void confirmRestore()}
                      >
                        {busy === "confirm" ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        Conferma ripristino
                      </button>
                    </div>
                  </div>
                )}
              </PageSection>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="space-y-4"
          >
            {!settings ? (
              <RowsSkeleton rows={3} />
            ) : (
              <>
                <PageSection
                  title="Cosa includere"
                  text="Struttura, emoji e immagini del server ci sono sempre. Qui scegli solo quanto salvare delle chat."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Messaggi nel backup manuale">
                      <Select
                        value={manualMsg}
                        onChange={(v) =>
                          setSettings({
                            ...settings,
                            manual: { ...settings.manual, maxMessagesPerChannel: Number(v) },
                          })
                        }
                        options={MANUAL_MSG_PRESETS}
                        disabled={busy === "settings"}
                      />
                    </Field>
                    <Field label="Messaggi nel backup automatico" hint="Gli automatici restano leggeri senza chat">
                      <Select
                        value={autoMsg}
                        onChange={(v) =>
                          setSettings({
                            ...settings,
                            automatic: { ...settings.automatic, maxMessagesPerChannel: Number(v) },
                          })
                        }
                        options={AUTO_MSG_PRESETS}
                        disabled={busy === "settings" || !settings.automatic.enabled}
                      />
                    </Field>
                  </div>
                </PageSection>

                <PageSection
                  title="Programma automatico"
                  text="Una copia del server ogni notte, senza doverti ricordare di farla."
                  right={
                    <Toggle
                      size="sm"
                      checked={settings.automatic.enabled}
                      disabled={busy === "settings"}
                      label="Backup automatico"
                      onChange={(enabled) =>
                        setSettings({
                          ...settings,
                          automatic: { ...settings.automatic, enabled },
                        })
                      }
                    />
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Ora (Rome)">
                      <div className="mt-1.5">
                        <Select
                          value={String(settings.automatic.hour)}
                          onChange={(v) =>
                            setSettings({
                              ...settings,
                              automatic: { ...settings.automatic, hour: Number(v) },
                            })
                          }
                          options={HOUR_OPTIONS}
                          disabled={busy === "settings" || !settings.automatic.enabled}
                          className="h-[2.625rem] bg-espresso/70 py-0"
                        />
                      </div>
                    </Field>
                    <Field label="Minuto">
                      <div className="mt-1.5">
                        <Select
                          value={String(settings.automatic.minute)}
                          onChange={(v) =>
                            setSettings({
                              ...settings,
                              automatic: { ...settings.automatic, minute: Number(v) },
                            })
                          }
                          options={MINUTE_OPTIONS}
                          disabled={busy === "settings" || !settings.automatic.enabled}
                          className="h-[2.625rem] bg-espresso/70 py-0"
                        />
                      </div>
                    </Field>
                    <Field label="Da tenere">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        className={cn(fieldClass, "h-[2.625rem]")}
                        value={settings.automatic.keepCount}
                        disabled={busy === "settings" || !settings.automatic.enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            automatic: {
                              ...settings.automatic,
                              keepCount: Number(e.target.value) || 1,
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                </PageSection>

                <PageSection
                  title="Conservazione"
                  text="Quante copie manuali tenere e per quanto tempo, prima che il bot cancelli le più vecchie."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Max snapshot manuali">
                      <input
                        type="number"
                        min={1}
                        max={200}
                        className={fieldClass}
                        value={settings.retention.maxManual}
                        disabled={busy === "settings"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            retention: {
                              ...settings.retention,
                              maxManual: Number(e.target.value) || 1,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Età massima (giorni)">
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        className={fieldClass}
                        value={settings.retention.maxManualAgeDays}
                        disabled={busy === "settings"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            retention: {
                              ...settings.retention,
                              maxManualAgeDays: Number(e.target.value) || 1,
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                </PageSection>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
