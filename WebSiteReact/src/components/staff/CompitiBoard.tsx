"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  Send,
  Shuffle,
  X,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { confirmDialog, openLightbox, showToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import {
  COMPITI_NOTE_MAX,
  COMPITI_PROOFS_MAX,
  filesToDataUrls,
  loadCompiti,
  reviewCompiti,
  saveCompiti,
  statusLabel,
  swapCompitiTask,
  type CompitiMonthEntry,
  type CompitiPayload,
  type CompitiProof,
  type CompitiTaskMeta,
} from "@/lib/staffCompiti";
import { useStaff } from "./StaffShell";

type PendingProof = { dataUrl: string; name: string; mime: string };

function isImgProof(p: { url?: string; mime?: string; dataUrl?: string }) {
  const mime = String(p.mime || "");
  if (mime.startsWith("image/")) return true;
  const src = p.url || p.dataUrl || "";
  return /\.(jpe?g|png|gif|webp|bmp)(\?|#|$)/i.test(src);
}

function weekIsFuture(w: CompitiMonthEntry | undefined, currentWeekKey: string) {
  if (!w) return false;
  if (w.isFuture) return true;
  if (w.isCurrent) return false;
  return Boolean(w.weekKey && currentWeekKey && w.weekKey > currentWeekKey);
}

function weekStatusBit(w: CompitiMonthEntry) {
  const st = String(w.status || "");
  if (w.taskId) return w.label || w.taskId;
  if (w.label && w.label !== "Nessun compito") return w.label;
  if (st === "approved") return w.autoSubmitted ? "auto · confermato" : "confermato";
  if (st === "submitted") return w.autoSubmitted ? "auto · in revisione" : "in revisione";
  if (st === "rejected") return "rifiutato";
  if (st === "missed") return "non completato";
  return "nessun invio";
}

function weekNiceLabel(w: CompitiMonthEntry, index: number, currentWeekKey: string) {
  if (w.isCurrent) return "Questa settimana";
  if (weekIsFuture(w, currentWeekKey)) return "Prossima";
  return `Settimana ${index + 1}`;
}

function pillClass(kind?: string) {
  if (kind === "done") return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30";
  if (kind === "fail") return "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c] ring-[#a83a2c]/30";
  if (kind === "review") return "bg-caramel/15 text-ember ring-caramel/30";
  if (kind === "retry") return "bg-amber-500/15 text-amber-100 ring-amber-500/30";
  return "bg-crema/8 text-crema/55 ring-sand/15";
}

/**
 * Libro dei compiti (parity sito vecchio): copertina → indice + pagina,
 * scambi, bozza/prove, scadenza, archivio settimane, revisione High Staff.
 */
export function CompitiBoard() {
  const { token } = useStaff();
  const [data, setData] = useState<CompitiPayload | null>(null);
  const [targetId, setTargetId] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<PendingProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [bookOpen, setBookOpen] = useState(false);
  const [flipDir, setFlipDir] = useState<1 | -1>(1);

  const hs = Boolean(data?.mode === "highstaff" || data?.canReview);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const applyCompiti = useCallback(
    (d: CompitiPayload, opts?: { quiet?: boolean }) => {
      const quiet = Boolean(opts?.quiet);
      setData(d);
      setError("");
      if (d.targetUserId && d.targetUserId !== targetId) setTargetId(d.targetUserId);
      if (quiet) return;

      const pages = d.mode === "highstaff" || d.canReview ? d.monthEntries || [] : d.plan.tasks || [];
      let idx = 0;
      if (d.mode === "highstaff" || d.canReview) {
        const cur = (d.monthEntries || []).findIndex((w) => w.isCurrent);
        idx = cur >= 0 ? cur : 0;
      } else if (d.progress.taskId) {
        const ti = (d.plan.tasks || []).findIndex((t) => t.id === d.progress.taskId);
        idx = ti >= 0 ? ti : 0;
      }
      setPageIndex(Math.min(Math.max(0, idx), Math.max(0, pages.length - 1)));
      setNote(d.progress.note || "");
      setPending([]);
    },
    [targetId],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadCompiti(token, { userId: targetId || undefined, skipStaffList: false }).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setError(r.message);
        setData(null);
        setLoading(false);
        return;
      }
      applyCompiti(r.data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [token, targetId, reload, applyCompiti]);

  useLiveRefresh(
    async () => {
      const r = await loadCompiti(token, { userId: targetId || undefined, skipStaffList: false });
      if (r.ok) applyCompiti(r.data, { quiet: true });
    },
    { intervalMs: 90_000, enabled: Boolean(token), boot: false, topics: ["staff_compiti"] },
  );

  const pool: CompitiTaskMeta[] = data?.plan.tasks || [];
  const weeks: CompitiMonthEntry[] = data?.monthEntries || [];
  const locked = useMemo(() => new Set(data?.progress.lockedTaskIds || []), [data]);
  const staffList = data?.staffList || [];
  const staffIndex = useMemo(() => {
    const i = staffList.findIndex((s) => s.userId === data?.targetUserId);
    return i < 0 ? 0 : i;
  }, [staffList, data?.targetUserId]);

  const pageCount = hs ? weeks.length : pool.length;
  const task = !hs ? pool[pageIndex] : undefined;
  const hsEntry = hs ? weeks[pageIndex] : undefined;

  const progress = data?.progress;
  const canRetry = Boolean(
    progress &&
      !progress.isAuto &&
      (progress.canRetry || (progress.status === "rejected" && data?.deadlines?.submitOpen)),
  );

  const staffCanEdit = useMemo(() => {
    if (!data || hs || !data.canSubmit) return false;
    if (!data.deadlines?.submitOpen) return false;
    const st = progress?.status || "draft";
    if (st === "approved" || st === "missed" || st === "skipped" || st === "submitted") return false;
    return st === "draft" || st === "rejected" || !st;
  }, [data, hs, progress?.status]);

  const selectedId = progress?.taskId || "";
  const viewingCurrentTask = Boolean(task && selectedId === task.id);
  const viewingLocked = Boolean(task && locked.has(task.id) && selectedId !== task.id);
  const canEditLeaf = Boolean(
    staffCanEdit && task && !viewingLocked && (viewingCurrentTask || !selectedId || canRetry),
  );

  const leafStatus = useMemo(() => {
    if (!data || !progress) return { label: "Da fare", kind: "todo" };
    if (hs && hsEntry) {
      const future = weekIsFuture(hsEntry, data.weekKey);
      const empty =
        !hsEntry.taskId &&
        !(hsEntry.proofs || []).length &&
        hsEntry.status !== "submitted" &&
        hsEntry.status !== "approved" &&
        hsEntry.status !== "rejected";
      if (empty) return { label: future ? "Successiva" : "Nessun invio", kind: "todo" };
      return hsEntry.pill || { label: statusLabel(hsEntry.status, hsEntry.autoSubmitted), kind: "todo" };
    }
    if (!task) return progress.pill || { label: "Da fare", kind: "todo" };
    if (viewingCurrentTask || !selectedId) return progress.pill || { label: "Da fare", kind: "todo" };
    if (viewingLocked) return { label: "Usato", kind: "fail" };
    return { label: "Disponibile", kind: "todo" };
  }, [data, progress, hs, hsEntry, task, viewingCurrentTask, selectedId, viewingLocked]);

  const deadlineHint = useMemo(() => {
    if (!data) return "";
    if (hs) {
      if (!hsEntry) return "";
      if (hsEntry.status === "submitted" && !weekIsFuture(hsEntry, data.weekKey)) {
        return `${hsEntry.isCurrent ? "Settimana corrente" : "Settimana precedente"} · Conferma o Rifiuta`;
      }
      if (hsEntry.isCurrent) return "Settimana corrente";
      if (weekIsFuture(hsEntry, data.weekKey)) return "Settimana successiva";
      return "Settimane precedenti";
    }
    if (progress?.isAuto && progress.status === "submitted") {
      return "In attesa di Conferma / Rifiuta da High Staff";
    }
    if (task?.auto && selectedId === task.id && progress?.status === "draft") {
      return "Selezionato: si completa quando scatta il trigger";
    }
    if (task?.auto && !selectedId) return "Seleziona questo compito per la settimana";
    if (canRetry) return "Rifiutato: puoi riprovare entro domenica 18:00";
    return data.deadlines?.submitOpen ? "Puoi consegnare fino a domenica 18:00" : "Scadenza invio superata";
  }, [data, hs, hsEntry, progress, task, selectedId, canRetry]);

  const monthHint = useMemo(() => {
    if (!data || !progress) return "";
    const used = progress.monthDistinct || 0;
    const weeksN = progress.monthRequired || weeks.length || pool.length || 4;
    const bridge = data.plan.monthBridgeNote ? " · Pool fisso (no re-roll all'1)" : "";
    return hs
      ? `Revisiona le settimane · ${used} / ${weeksN} chiuse questo mese`
      : `Scegli 1 compito a settimana · ${used} / ${weeksN} settimane del mese${bridge}`;
  }, [data, progress, hs, weeks.length, pool.length]);

  const showReview = Boolean(
    data?.canReview &&
      !busy &&
      (hs
        ? hsEntry && hsEntry.status === "submitted" && !weekIsFuture(hsEntry, data.weekKey)
        : progress?.status === "submitted"),
  );

  const leafTitle = hs
    ? hsEntry
      ? weekIsFuture(hsEntry, data?.weekKey || "")
        ? "Settimana successiva"
        : hsEntry.label || hsEntry.taskId || "Settimana"
      : "Nessuna settimana"
    : task?.label || "Compito";

  const leafMeta = (() => {
    if (hs && hsEntry) {
      const st = hsEntry.status;
      const tail =
        st === "submitted"
          ? " · In revisione"
          : st === "approved"
            ? " · Confermato"
            : st === "rejected"
              ? " · Rifiutato"
              : st === "missed"
                ? " · Non completato"
                : hsEntry.taskId
                  ? " · Bozza staff"
                  : weekIsFuture(hsEntry, data?.weekKey || "")
                    ? " · Successiva"
                    : " · Nessun invio";
      return `${weekNiceLabel(hsEntry, pageIndex, data?.weekKey || "")}${tail}`;
    }
    if (task?.auto) {
      if (viewingCurrentTask) {
        return progress?.status === "submitted" ? "In attesa High Staff" : "Selezionato per questa settimana";
      }
    }
    return `Pagina ${pageIndex + 1} di ${Math.max(1, pageCount)}`;
  })();

  const displayNote = hs
    ? String(hsEntry?.note || "")
    : viewingCurrentTask || !selectedId || canRetry
      ? note
      : "";

  const displayProofs: CompitiProof[] = hs
    ? hsEntry?.proofs || []
    : viewingCurrentTask || !selectedId
      ? progress?.proofs || []
      : [];

  function goPage(next: number, dir: 1 | -1) {
    if (next < 0 || next >= pageCount || busy) return;
    setFlipDir(dir);
    setPageIndex(next);
    if (!hs && data) {
      const t = pool[next];
      if (t && (data.progress.taskId === t.id || !data.progress.taskId)) {
        setNote(data.progress.note || "");
      } else {
        setNote("");
      }
      setPending([]);
    }
  }

  async function doSave(submit: boolean) {
    if (!data || !task || busy) return;
    if (viewingLocked) {
      showToast("Compito già usato questo mese.", true);
      return;
    }
    if (submit && task.auto) {
      showToast("Questo compito si completa da solo: selezionalo e basta.", true);
      return;
    }
    if (
      submit &&
      !note.trim() &&
      !pending.length &&
      !(progress?.proofs || []).length
    ) {
      showToast("Per inviare serve una nota e/o almeno una prova.", true);
      return;
    }
    setBusy(true);
    const r = await saveCompiti(token, {
      taskId: task.id,
      note: note.slice(0, COMPITI_NOTE_MAX),
      submit,
      proofs: pending.map((p) => p.dataUrl),
    });
    setBusy(false);
    if (!r.ok) {
      showToast(r.message, true);
      return;
    }
    showToast(
      submit
        ? "Inviato in revisione High Staff."
        : task.auto
          ? "Compito selezionato per questa settimana."
          : "Bozza salvata.",
    );
    refresh();
  }

  async function doSwap(id: string) {
    if (!data || hs || busy) return;
    if ((data.plan.swapsLeft || 0) < 1) {
      showToast("Nessuno scambio rimasto questo mese.", true);
      return;
    }
    const ok = await confirmDialog({
      title: "Cambia compito",
      message: "Sostituisci questo compito con un altro a caso dal catalogo?",
      confirmLabel: "Cambia",
    });
    if (!ok) return;
    setBusy(true);
    const r = await swapCompitiTask(token, id);
    setBusy(false);
    if (!r.ok) {
      showToast(r.message, true);
      return;
    }
    showToast(r.data.message || "Compito sostituito.");
    refresh();
  }

  async function doReview(decision: "approve" | "reject") {
    if (!data || !data.canReview || busy) return;
    const weekKey = hs ? hsEntry?.weekKey : data.weekKey;
    const ok = await confirmDialog({
      title: decision === "approve" ? "Conferma compito" : "Rifiuta compito",
      message:
        decision === "approve"
          ? "Confermi le prove di questa settimana?"
          : "Rifiuti le prove? Lo staff può riprovare entro domenica 18:00 se la scadenza è aperta.",
      confirmLabel: decision === "approve" ? "Conferma" : "Rifiuta",
      danger: decision === "reject",
    });
    if (!ok) return;
    setBusy(true);
    const r = await reviewCompiti(token, {
      userId: data.targetUserId,
      decision,
      weekKey,
    });
    setBusy(false);
    if (!r.ok) {
      showToast(r.message, true);
      return;
    }
    showToast(r.data.message || (decision === "approve" ? "Confermato." : "Rifiutato."));
    refresh();
  }

  function canSwapTask(t: CompitiTaskMeta) {
    if (!data || hs || !data.canSubmit || busy) return false;
    if ((data.plan.swapsLeft || 0) < 1) return false;
    if (locked.has(t.id) && selectedId !== t.id) return false;
    if (selectedId === t.id) {
      const st = progress?.status || "";
      if (st === "approved" || st === "missed" || st === "skipped" || st === "submitted") return false;
    }
    return true;
  }

  if (loading && !data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="mx-auto h-72 max-w-sm animate-pulse rounded-[1.6rem] bg-roast/70 ring-1 ring-sand/12" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <p className="rounded-3xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/30">
        {error}
      </p>
    );
  }

  if (!data) return null;

  const swapsLeft = data.plan.swapsLeft || 0;
  const coverReady = !loading;

  /* ── Copertina ── */
  if (!bookOpen) {
    return (
      <div className="relative mx-auto w-full max-w-md">
        {hs && staffList.length > 1 ? (
          <div className="mb-4 flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="Staff precedente"
              disabled={staffIndex <= 0}
              onClick={() => setTargetId(staffList[staffIndex - 1]?.userId || "")}
              className="rounded-full bg-roast/80 p-2 text-crema/70 ring-1 ring-sand/15 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-roast/80 px-3 py-1.5 ring-1 ring-sand/15">
              <Avatar userId={data.targetUserId || data.identity.userId} src={data.identity.avatarUrl} name={data.identity.displayName} className="size-7 text-[0.65rem]" />
              <span className="truncate text-sm font-semibold">{data.identity.displayName}</span>
            </div>
            <button
              type="button"
              aria-label="Staff successivo"
              disabled={staffIndex >= staffList.length - 1}
              onClick={() => setTargetId(staffList[staffIndex + 1]?.userId || "")}
              className="rounded-full bg-roast/80 p-2 text-crema/70 ring-1 ring-sand/15 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          disabled={!coverReady}
          aria-label="Apri il libro dei compiti"
          onClick={() => coverReady && setBookOpen(true)}
          className={cn(
            "group relative block w-full overflow-hidden rounded-[1.6rem] text-left shadow-[0_30px_60px_-28px_rgba(0,0,0,0.85)] ring-1 ring-sand/20 transition",
            coverReady ? "hover:brightness-110" : "cursor-wait opacity-70",
          )}
        >
          <span
            className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/40 to-transparent"
            aria-hidden
          />
          <span className="scheme-dark flex min-h-[22rem] flex-col justify-between bg-gradient-to-br from-[#6a442c] via-[#4a2e1c] to-[#2a1810] p-8 sm:min-h-[26rem] sm:p-10">
            <span className="inline-flex w-fit rounded-full bg-crema/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-sand/80 ring-1 ring-sand/20">
              Staff
            </span>
            <span>
              <span className="font-display block text-4xl font-semibold tracking-tight text-crema sm:text-5xl">
                Compiti
              </span>
              <span className="mt-1 block text-lg text-crema/55">settimanali</span>
            </span>
            <span className="flex items-center gap-2 text-sm font-medium text-sand/70">
              <BookOpen className="size-4" />
              {coverReady ? "Tocca per aprire" : "Caricamento…"}
            </span>
          </span>
        </button>
        <p className="mt-3 text-center text-xs text-crema/40">
          {hs ? monthHint : `Questa settimana · ${progress?.pill?.label || "Da fare"}`}
        </p>
      </div>
    );
  }

  /* ── Libro aperto ── */
  return (
    <div className="space-y-3">
      {hs && staffList.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1 rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-2 ring-1 ring-sand/12">
          <button
            type="button"
            aria-label="Staff precedente"
            disabled={busy || staffIndex <= 0}
            onClick={() => setTargetId(staffList[staffIndex - 1]?.userId || "")}
            className="rounded-full p-2 text-crema/60 hover:bg-crema/8 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <Avatar userId={data.targetUserId || data.identity.userId} src={data.identity.avatarUrl} name={data.identity.displayName} className="size-9 text-xs" />
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold">{data.identity.displayName}</p>
            <p className="text-[0.65rem] text-crema/45">
              @{data.identity.username || "staff"} · {staffIndex + 1}/{staffList.length}
            </p>
          </div>
          <button
            type="button"
            aria-label="Staff successivo"
            disabled={busy || staffIndex >= staffList.length - 1}
            onClick={() => setTargetId(staffList[staffIndex + 1]?.userId || "")}
            className="rounded-full p-2 text-crema/60 hover:bg-crema/8 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[1.6rem] bg-roast/80 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 lg:grid lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
        {/* Indice (pagina sinistra) */}
        <aside className="border-b border-sand/10 bg-gradient-to-b from-mocha/90 to-roast/90 p-4 lg:border-b-0 lg:border-r lg:border-sand/10">
          <div className="mb-3 flex items-center gap-3">
            <Avatar userId={data.targetUserId || data.identity.userId} src={data.identity.avatarUrl} name={data.identity.displayName} className="size-11 text-sm" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-crema">{data.identity.displayName}</p>
              <p className="text-xs text-crema/45">@{data.identity.username || "staff"}</p>
            </div>
          </div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-caramel">
            {hs ? "Settimane" : "Questa settimana"}
          </p>
          <p className="mt-1 text-sm text-crema/70">
            {hs
              ? monthHint
              : `${progress?.monthDistinct || 0} / ${progress?.monthRequired || 5} svolti · ${progress?.pill?.label || "Da fare"}`}
          </p>
          <h2 className="mt-4 font-display text-xl text-crema">{hs ? "Settimane" : "Indice"}</h2>
          <ul className="mt-2 space-y-1" aria-label={hs ? "Indice settimane" : "Indice compiti"}>
            {hs
              ? weeks.map((w, i) => {
                  const future = weekIsFuture(w, data.weekKey);
                  const mark =
                    w.status === "approved"
                      ? "✓"
                      : w.status === "submitted"
                        ? "…"
                        : w.status === "missed" || w.status === "rejected"
                          ? "✗"
                          : future
                            ? "·"
                            : String(i + 1);
                  return (
                    <li key={w.weekKey}>
                      <button
                        type="button"
                        onClick={() => goPage(i, i > pageIndex ? 1 : -1)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition",
                          pageIndex === i ? "bg-caramel/20 text-ember ring-1 ring-caramel/35" : "hover:bg-crema/6",
                          w.isCurrent && pageIndex !== i && "ring-1 ring-sand/20",
                          future && "opacity-55",
                        )}
                      >
                        <span className="mt-0.5 w-4 shrink-0 text-center text-xs text-crema/45">{mark}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold leading-snug">
                            {weekNiceLabel(w, i, data.weekKey)}
                          </span>
                          <span className="block truncate text-xs text-crema/45">{weekStatusBit(w)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })
              : pool.map((t, i) => {
                  const used = locked.has(t.id) && selectedId !== t.id;
                  const picked = selectedId === t.id;
                  const showSwap = canSwapTask(t);
                  return (
                    <li key={t.id} className="flex gap-1">
                      <button
                        type="button"
                        disabled={used || busy}
                        onClick={() => goPage(i, i > pageIndex ? 1 : -1)}
                        className={cn(
                          "flex min-w-0 flex-1 items-start gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition",
                          pageIndex === i ? "bg-caramel/20 text-ember ring-1 ring-caramel/35" : "hover:bg-crema/6",
                          picked && pageIndex !== i && "bg-crema/6",
                          used && "opacity-40",
                        )}
                      >
                        <span className="mt-0.5 w-4 shrink-0 text-center text-xs text-crema/45">
                          {used ? "✗" : picked ? "✓" : String(i + 1)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold leading-snug">{t.label}</span>
                          {t.auto ? (
                            <span className="text-[0.65rem] uppercase tracking-wider text-crema/40">Auto</span>
                          ) : null}
                        </span>
                      </button>
                      {showSwap ? (
                        <button
                          type="button"
                          title="Cambia con un altro a caso"
                          aria-label="Cambia compito"
                          disabled={busy}
                          onClick={() => doSwap(t.id)}
                          className="shrink-0 self-center rounded-lg bg-crema/8 p-2 text-crema/55 ring-1 ring-sand/15 hover:text-ember"
                        >
                          <Shuffle className="size-3.5" />
                        </button>
                      ) : (
                        <span className="w-9 shrink-0" aria-hidden />
                      )}
                    </li>
                  );
                })}
            {!pageCount ? (
              <li className="px-2 py-3 text-sm text-crema/45">
                {hs ? "Nessuna settimana" : "Pool mensile in preparazione…"}
              </li>
            ) : null}
          </ul>
          {!hs ? (
            <p className="mt-3 text-[0.7rem] text-crema/40">
              {swapsLeft > 0
                ? `Scambi: ${swapsLeft} · tap ⇄ accanto al compito`
                : `Nessuno scambio rimasto${data.plan.swapBonus ? "" : " (1/mese)"}`}
            </p>
          ) : null}
          <p className="mt-2 text-[0.7rem] text-crema/35">Tocca una voce o usa le frecce per voltare pagina.</p>
        </aside>

        {/* Foglia (pagina destra) */}
        <section className="relative min-h-[28rem] bg-gradient-to-br from-[#f3e6d2]/[0.07] to-transparent p-4 sm:p-6">
          <AnimatePresence mode="wait" custom={flipDir}>
            <motion.div
              key={`${hs ? hsEntry?.weekKey : task?.id}-${pageIndex}`}
              custom={flipDir}
              initial={{ opacity: 0, x: flipDir * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: flipDir * -28 }}
              transition={{ duration: 0.22 }}
              className="space-y-4"
            >
              {hs &&
              hsEntry &&
              !hsEntry.taskId &&
              !(hsEntry.proofs || []).length &&
              hsEntry.status !== "submitted" &&
              hsEntry.status !== "approved" &&
              hsEntry.status !== "rejected" ? (
                <p className="rounded-2xl bg-crema/6 px-3 py-2 text-sm text-crema/55 ring-1 ring-sand/10">
                  {weekIsFuture(hsEntry, data.weekKey)
                    ? "Settimana successiva: ancora niente da revisionare."
                    : "Questo staff non ha ancora inviato prove per la settimana."}
                </p>
              ) : null}

              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs text-crema/45">{leafMeta}</p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider ring-1",
                    pillClass(leafStatus.kind),
                  )}
                >
                  {leafStatus.label}
                </span>
              </div>

              <h2 className="font-display text-2xl font-semibold text-crema sm:text-3xl">{leafTitle}</h2>

              {/* Prove (in HS prima della nota) */}
              {hs ? (
                <ProofsBlock
                  proofs={displayProofs}
                  pending={[]}
                  canEdit={false}
                  hs
                  autoEmpty={Boolean(hsEntry?.autoSubmitted && hsEntry.status === "approved")}
                  submittedEmpty={hsEntry?.status === "approved" || hsEntry?.status === "submitted"}
                />
              ) : null}

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-crema/45">
                  {hs ? "Nota dello staff" : "Scrivi"}
                </span>
                <textarea
                  value={hs ? displayNote : note}
                  onChange={(e) => !hs && setNote(e.target.value.slice(0, COMPITI_NOTE_MAX))}
                  disabled={hs || !canEditLeaf || busy || Boolean(task?.auto)}
                  readOnly={hs}
                  rows={4}
                  maxLength={COMPITI_NOTE_MAX}
                  placeholder={
                    hs
                      ? weekIsFuture(hsEntry, data.weekKey)
                        ? "Questa settimana non è ancora iniziata."
                        : "Lo staff non ha inviato nulla in questa settimana."
                      : task?.auto
                        ? "Questo compito si completa automaticamente"
                        : "Scrivi cosa hai fatto…"
                  }
                  className="mt-1 w-full resize-y rounded-xl bg-espresso/70 px-3 py-2 text-sm text-crema ring-1 ring-sand/20 disabled:opacity-60"
                />
                {!hs && !task?.auto ? (
                  <span className="mt-1 block text-right text-[0.7rem] text-crema/35 lining-nums">
                    {note.length}/{COMPITI_NOTE_MAX}
                  </span>
                ) : null}
              </label>

              {!hs ? (
                <ProofsBlock
                  proofs={displayProofs}
                  pending={pending}
                  canEdit={canEditLeaf && !task?.auto}
                  onAdd={async (files) => {
                    const urls = await filesToDataUrls(files, COMPITI_PROOFS_MAX - pending.length);
                    setPending((prev) =>
                      [
                        ...prev,
                        ...urls.map((dataUrl, i) => ({
                          dataUrl,
                          name: files[i]?.name || `file-${i + 1}`,
                          mime: files[i]?.type || "",
                        })),
                      ].slice(0, COMPITI_PROOFS_MAX),
                    );
                  }}
                  onRemovePending={(i) => setPending((prev) => prev.filter((_, j) => j !== i))}
                  autoEmpty={Boolean(progress?.autoSubmitted && progress.status === "approved")}
                  submittedEmpty={progress?.status === "approved" || progress?.status === "submitted"}
                />
              ) : null}

              <p className="text-sm text-crema/55">{deadlineHint}</p>
              <p className="text-xs text-crema/40">{monthHint}</p>
              {data.newStaffGrace?.active && !hs ? (
                <p className="text-sm text-caramel/90">{data.newStaffGrace.message}</p>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                {!hs && data.canSubmit ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || !canEditLeaf || (Boolean(task?.auto) && viewingLocked)}
                      onClick={() => doSave(false)}
                      className="inline-flex items-center gap-2 rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold text-crema ring-1 ring-sand/20 disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      {task?.auto ? "Seleziona per questa settimana" : "Salva bozza"}
                    </button>
                    {!task?.auto ? (
                      <button
                        type="button"
                        disabled={busy || !canEditLeaf}
                        onClick={() => doSave(true)}
                        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                      >
                        <Send className="size-4" />
                        {canRetry ? "Reinvia prove" : "Invia prove"}
                      </button>
                    ) : null}
                  </>
                ) : null}

                {showReview ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => doReview("approve")}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-500/35 disabled:opacity-40"
                    >
                      <Check className="size-4" /> Conferma
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => doReview("reject")}
                      className="inline-flex items-center gap-2 rounded-full bg-[#a83a2c]/25 px-4 py-2 text-sm font-semibold text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/40 disabled:opacity-40"
                    >
                      <X className="size-4" /> Rifiuta
                    </button>
                  </>
                ) : null}

                {hs && !showReview && hsEntry ? (
                  <p className="text-sm text-crema/45">
                    {hsEntry.status === "submitted"
                      ? "…"
                      : "Nessuna settimana da revisionare per questo staff con i filtri attuali."}
                  </p>
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between gap-2" role="group" aria-label="Navigazione pagine">
            <button
              type="button"
              aria-label="Pagina precedente"
              disabled={pageIndex <= 0 || busy}
              onClick={() => goPage(pageIndex - 1, -1)}
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-3 py-2 text-sm text-crema/70 ring-1 ring-sand/15 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" /> Indietro
            </button>
            <button
              type="button"
              aria-label="Pagina successiva"
              disabled={pageIndex >= pageCount - 1 || busy || pageCount < 1}
              onClick={() => goPage(pageIndex + 1, 1)}
              className="inline-flex items-center gap-1.5 rounded-full bg-caramel/20 px-3 py-2 text-sm font-semibold text-ember ring-1 ring-caramel/30 disabled:opacity-30"
            >
              Avanti <ChevronRight className="size-4" />
            </button>
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={() => setBookOpen(false)}
        className="text-xs text-crema/40 underline-offset-2 hover:text-crema/70 hover:underline"
      >
        Chiudi il libro
      </button>
    </div>
  );
}

function ProofsBlock({
  proofs,
  pending,
  canEdit,
  hs,
  onAdd,
  onRemovePending,
  autoEmpty,
  submittedEmpty,
}: {
  proofs: CompitiProof[];
  pending: PendingProof[];
  canEdit: boolean;
  hs?: boolean;
  onAdd?: (files: File[]) => void | Promise<void>;
  onRemovePending?: (i: number) => void;
  autoEmpty?: boolean;
  submittedEmpty?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-crema/45">
          {hs ? "Prove allegate" : "Prove (foto / file)"}
        </span>
        {canEdit ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-crema/8 px-3 py-1 text-xs font-semibold text-crema/75 ring-1 ring-sand/15 hover:text-crema">
            + Aggiungi
            <input
              type="file"
              accept="image/*,.pdf,text/plain,application/pdf"
              multiple
              className="sr-only"
              onChange={async (e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = "";
                if (files.length && onAdd) await onAdd(files);
              }}
            />
          </label>
        ) : null}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {proofs.map((p) => {
          const img = isImgProof(p);
          return (
            <li key={p.id || p.url}>
              {img && p.url ? (
                <button
                  type="button"
                  onClick={() => openLightbox([{ src: p.url, alt: p.name || "prova" }])}
                  className="block size-24 overflow-hidden rounded-xl bg-crema/8 ring-1 ring-sand/15"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.name || "prova"} className="size-full object-cover" loading="lazy" />
                </button>
              ) : (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex size-24 flex-col items-center justify-center gap-1 rounded-xl bg-crema/8 px-2 text-center text-[0.65rem] text-crema/70 ring-1 ring-sand/15"
                >
                  <Paperclip className="size-4" />
                  <span className="line-clamp-2">{p.name || "file"}</span>
                </a>
              )}
            </li>
          );
        })}
        {pending.map((p, i) => (
          <li key={`pend-${i}`} className="relative">
            <div className="size-24 overflow-hidden rounded-xl bg-caramel/15 ring-1 ring-caramel/30">
              {isImgProof(p) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.dataUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center px-1 text-center text-[0.65rem] text-ember">
                  {p.name}
                </span>
              )}
            </div>
            {onRemovePending ? (
              <button
                type="button"
                aria-label="Rimuovi"
                onClick={() => onRemovePending(i)}
                className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#a83a2c] text-xs text-white"
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
        {!proofs.length && !pending.length ? (
          <li className="text-sm text-crema/40">
            {autoEmpty
              ? "Completato in automatico · nessuna prova file"
              : submittedEmpty
                ? "Nessuna prova file allegata"
                : "Nessuna prova allegata"}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
