"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CircleHelp, Info, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { setChromeOpen } from "@/lib/chrome-open";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { createStore } from "./store";

/**
 * Dialog di conferma (E8): confirm, alert, choose, prompt.
 * Stessa semantica di `VcDialog`, senza HTML grezzo nel messaggio.
 */

export type DialogChoice = { id: string; label: string; danger?: boolean };

export type DialogOptions = {
  title?: string;
  message?: ReactNode;
  danger?: boolean;
  confirmLabel?: string;
  okLabel?: string;
  cancelLabel?: string;
  choices?: DialogChoice[];
  label?: string;
  inputLabel?: string;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  maxLength?: number;
  multiline?: boolean;
};

type DialogKind = "confirm" | "alert" | "choose" | "prompt";

type DialogRequest = {
  id: number;
  kind: DialogKind;
  title: string;
  message: ReactNode;
  danger: boolean;
  confirmLabel: string;
  cancelLabel: string;
  choices: DialogChoice[];
  fieldLabel: string;
  placeholder: string;
  defaultValue: string;
  maxLength: number;
  multiline: boolean;
  resolve: (value: boolean | string | null) => void;
};

const dialogStore = createStore<DialogRequest | null>(null);
let seq = 0;

function cancelValue(kind: DialogKind): boolean | string | null {
  if (kind === "confirm") return false;
  if (kind === "alert") return true;
  return null;
}

function finishDialog(value: boolean | string | null) {
  const cur = dialogStore.get();
  if (!cur) return;
  dialogStore.set(null);
  cur.resolve(value);
}

function openDialog(kind: DialogKind, opts: DialogOptions = {}): Promise<boolean | string | null> {
  const title = String(
    opts.title || (kind === "alert" ? "Avviso" : kind === "prompt" ? "Inserisci" : "Conferma"),
  ).trim();
  const confirmLabel = String(
    opts.confirmLabel || opts.okLabel || (kind === "alert" ? "OK" : "Conferma"),
  ).trim();
  const max = Number(opts.maxLength);
  const pending = dialogStore.get();
  if (pending) finishDialog(cancelValue(pending.kind));
  return new Promise((resolve) => {
    dialogStore.set({
      id: ++seq,
      kind,
      title,
      message: opts.message ?? "",
      danger: opts.danger === true,
      confirmLabel: confirmLabel || (kind === "alert" ? "OK" : "Conferma"),
      cancelLabel: String(opts.cancelLabel || "Annulla").trim() || "Annulla",
      choices: Array.isArray(opts.choices) ? opts.choices : [],
      fieldLabel: String(opts.label || opts.inputLabel || "").trim(),
      placeholder: String(opts.placeholder || "").trim(),
      defaultValue: String(opts.defaultValue != null ? opts.defaultValue : opts.value != null ? opts.value : ""),
      maxLength: Number.isFinite(max) && max >= 1 ? max : 500,
      multiline: opts.multiline === true,
      resolve,
    });
  });
}

export function confirmDialog(opts: DialogOptions = {}): Promise<boolean> {
  return openDialog("confirm", opts).then((v) => v === true);
}

export function alertDialog(opts: DialogOptions | string = {}): Promise<void> {
  const o = typeof opts === "string" ? { message: opts } : opts;
  return openDialog("alert", o).then(() => {});
}

export function chooseDialog(opts: DialogOptions = {}): Promise<string | null> {
  return openDialog("choose", { ...opts, danger: opts.danger === true }).then((v) =>
    typeof v === "string" && v ? v : null,
  );
}

export function promptDialog(opts: DialogOptions | string = {}): Promise<string | null> {
  const o = typeof opts === "string" ? { label: opts } : opts;
  return openDialog("prompt", o).then((v) => (v == null ? null : String(v)));
}

export function useDialog() {
  return { confirm: confirmDialog, alert: alertDialog, choose: chooseDialog, prompt: promptDialog };
}

function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const nodes = [...root.querySelectorAll<HTMLElement>("button, input, textarea, [href]")].filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
  );
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const req = useSyncExternalStore(dialogStore.subscribe, dialogStore.get, () => null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef("");
  const seenId = useRef(0);
  if (req && seenId.current !== req.id) {
    seenId.current = req.id;
    draftRef.current = req.defaultValue;
  }
  if (!req) seenId.current = 0;

  useBodyScrollLock(!!req);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    return () => {
      const cur = dialogStore.get();
      if (!cur) return;
      dialogStore.set(null);
      cur.resolve(cancelValue(cur.kind));
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    draftRef.current = req.defaultValue;
    setChromeOpen("ui-dialog", true);
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finishDialog(cancelValue(req.kind));
        return;
      }
      if (e.key === "Enter") {
        const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() || "";
        if (req.kind === "alert") {
          e.preventDefault();
          finishDialog(true);
        } else if (req.kind === "prompt" && tag === "input") {
          e.preventDefault();
          finishDialog(draftRef.current);
        }
      } else if (e.key === "Tab" && panelRef.current) {
        trapTab(e, panelRef.current);
      }
    };
    document.addEventListener("keydown", onKey, true);
    const frame = window.requestAnimationFrame(() => {
      const root = panelRef.current;
      if (!root) return;
      const focus =
        req.kind === "prompt"
          ? root.querySelector<HTMLElement>("textarea, input")
          : root.querySelector<HTMLElement>(req.kind === "alert" ? "[data-vc-dialog='ok']" : "[data-vc-dialog='cancel']");
      try {
        focus?.focus({ preventScroll: true });
      } catch {
        focus?.focus();
      }
      if (req.kind === "prompt" && focus instanceof HTMLInputElement) focus.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey, true);
      setChromeOpen("ui-dialog", false);
      try {
        prevFocus?.focus({ preventScroll: true });
      } catch {
        /* il nodo può essere sparito */
      }
    };
  }, [req, mounted]);

  const hasMessage = req ? req.message !== "" && req.message != null : false;

  return (
    <>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {req ? (
              <motion.div
                key={req.id}
                data-vc-ui="dialog"
                className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center sm:p-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                <button
                  type="button"
                  aria-label="Chiudi"
                  data-vc-dialog="cancel"
                  className="absolute inset-0 bg-espresso/80"
                  onClick={() => finishDialog(cancelValue(req.kind))}
                />
                <motion.div
                  ref={panelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={titleId}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    "relative z-[1] w-full rounded-3xl bg-roast p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.65)] ring-1 ring-sand/15",
                    req.multiline ? "max-w-lg" : "max-w-md",
                  )}
                >
                  <DialogIcon kind={req.kind} danger={req.danger} />
                  <h2 id={titleId} className="font-display text-2xl font-semibold text-crema">
                    {req.title}
                  </h2>
                  {hasMessage ? <div className="mt-2 text-sm leading-relaxed text-sand">{req.message}</div> : null}
                  {req.kind === "prompt" ? (
                    <PromptField key={req.id} req={req} draftRef={draftRef} />
                  ) : null}
                  <div className={cn("mt-5 flex gap-2", req.kind === "choose" ? "flex-col" : "flex-wrap justify-end")}>
                    <DialogActions req={req} draftRef={draftRef} />
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function DialogIcon({ kind, danger }: { kind: DialogKind; danger: boolean }) {
  const Icon = kind === "alert" ? (danger ? AlertTriangle : Info) : kind === "prompt" ? Pencil : danger ? Trash2 : CircleHelp;
  return (
    <div
      aria-hidden
      className={cn(
        "mb-3 flex size-11 items-center justify-center rounded-xl ring-1",
        danger ? "bg-[#e2836f]/15 text-[#e2836f] light:text-[#a83a2c] ring-[#e2836f]/30" : "bg-caramel/15 text-ember ring-caramel/25",
      )}
    >
      <Icon className="size-5" />
    </div>
  );
}

function PromptField({
  req,
  draftRef,
}: {
  req: DialogRequest;
  draftRef: MutableRefObject<string>;
}) {
  const fieldId = useId();
  const common = {
    id: fieldId,
    defaultValue: req.defaultValue,
    placeholder: req.placeholder,
    maxLength: req.maxLength,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      draftRef.current = e.target.value;
    },
    className:
      "mt-1 w-full rounded-2xl bg-espresso/60 px-3 py-2.5 text-sm text-crema ring-1 ring-sand/20 outline-none placeholder:text-crema/35 focus:ring-caramel/50",
  };
  return (
    <div className="mt-4">
      {req.fieldLabel ? (
        <label htmlFor={fieldId} className="text-xs font-semibold uppercase tracking-[0.18em] text-caramel">
          {req.fieldLabel}
        </label>
      ) : (
        <label htmlFor={fieldId} className="sr-only">
          Motivo
        </label>
      )}
      {req.multiline ? (
        <textarea {...common} rows={8} className={cn(common.className, "min-h-40 max-h-[42vh] resize-y")} />
      ) : (
        <input {...common} type="text" autoComplete="off" />
      )}
    </div>
  );
}

function DialogActions({
  req,
  draftRef,
}: {
  req: DialogRequest;
  draftRef: MutableRefObject<string>;
}) {
  if (req.kind === "alert") {
    return (
      <button type="button" data-vc-dialog="ok" onClick={() => finishDialog(true)} className={primaryBtn}>
        {req.confirmLabel}
      </button>
    );
  }
  if (req.kind === "choose") {
    return (
      <>
        {req.choices.map((ch) => {
          const id = String(ch.id || "").trim();
          if (!id) return null;
          return (
            <button
              key={id}
              type="button"
              data-vc-dialog="choice"
              onClick={() => finishDialog(id)}
              className={ch.danger ? dangerBtn : primaryBtn}
            >
              {String(ch.label || id).trim()}
            </button>
          );
        })}
        <button type="button" data-vc-dialog="cancel" onClick={() => finishDialog(null)} className={secondaryBtn}>
          {req.cancelLabel}
        </button>
      </>
    );
  }
  return (
    <>
      <button type="button" data-vc-dialog="cancel" onClick={() => finishDialog(null)} className={secondaryBtn}>
        {req.cancelLabel}
      </button>
      <button
        type="button"
        data-vc-dialog="ok"
        onClick={() => finishDialog(req.kind === "prompt" ? draftRef.current : true)}
        className={req.danger ? dangerBtn : primaryBtn}
      >
        {req.confirmLabel}
      </button>
    </>
  );
}

const primaryBtn =
  "rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]";
const secondaryBtn =
  "rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema ring-1 ring-sand/25 transition-[transform,background-color,box-shadow] duration-200 ease-out hover:bg-crema/12 active:scale-[0.97]";
const dangerBtn =
  "rounded-full bg-[#e2836f] px-4 py-2 text-sm font-semibold text-ink transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]";
