"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { confirmDialog } from "@/components/ui";

/*
 * Modifiche non salvate nella dashboard.
 * - i pannelli si segnano qui (useUnsavedChanges): cambiare scheda o pagina chiede conferma;
 * - se passano anche "salva" e "annulla", compare la barra in basso (GlobalSaveBar) con i due tasti.
 */
type Actions = { onSave?: () => unknown | Promise<unknown>; onReset?: () => void };
type Entry = { key: symbol; actions: React.MutableRefObject<Actions> };

const pending = new Map<symbol, Entry>();
const listeners = new Set<() => void>();
let snapshot = 0;
let skipBeforeUnload = false;

function emit() {
  snapshot += 1;
  for (const l of listeners) l();
}

/** Da usare nei pannelli con un tasto Salva: finché `dirty` è vero, cambiare scheda o pagina chiede conferma. */
export function useUnsavedChanges(dirty: boolean, actions?: Actions) {
  const ref = useRef<Actions>(actions || {});
  useEffect(() => {
    ref.current = actions || {};
  });
  useEffect(() => {
    if (!dirty) return;
    const key = Symbol("unsaved");
    pending.set(key, { key, actions: ref });
    emit();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (skipBeforeUnload) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      pending.delete(key);
      emit();
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);
}

export function hasUnsavedChanges() {
  return pending.size > 0;
}

/** Per la barra in basso: c'è qualcosa da salvare con i tasti? */
export function useUnsavedState() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => 0,
  );
  const entries = [...pending.values()];
  return {
    count: entries.length,
    canSave: entries.some((e) => typeof e.actions.current.onSave === "function"),
    canReset: entries.some((e) => typeof e.actions.current.onReset === "function"),
    saveAll: async () => {
      for (const e of entries) await e.actions.current.onSave?.();
    },
    resetAll: () => {
      for (const e of entries) e.actions.current.onReset?.();
    },
  };
}

/** true = si può uscire (nessuna modifica, oppure confermato). */
export async function confirmLeaveUnsaved(): Promise<boolean> {
  if (!hasUnsavedChanges()) return true;
  const ok = await confirmDialog({
    title: "Modifiche non salvate",
    message: "Hai cambiato qualcosa senza salvare. Se esci ora le modifiche vanno perse.",
    confirmLabel: "Esci senza salvare",
    cancelLabel: "Resta qui",
    danger: true,
  });
  if (ok) {
    /* uscita confermata: niente secondo avviso del browser */
    pending.clear();
    emit();
    skipBeforeUnload = true;
    window.setTimeout(() => (skipBeforeUnload = false), 3000);
  }
  return ok;
}
