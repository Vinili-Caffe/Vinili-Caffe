"use client";

import { useEffect } from "react";
import { confirmDialog } from "@/components/ui";

/* Modifiche non salvate nella dashboard: i pannelli si segnano qui, la navigazione chiede prima di uscire. */
const pending = new Set<symbol>();
let skipBeforeUnload = false;

/** Da usare nei pannelli con un tasto Salva: finché `dirty` è vero, cambiare scheda o pagina chiede conferma. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const key = Symbol("unsaved");
    pending.add(key);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (skipBeforeUnload) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      pending.delete(key);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);
}

export function hasUnsavedChanges() {
  return pending.size > 0;
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
    skipBeforeUnload = true;
    window.setTimeout(() => (skipBeforeUnload = false), 3000);
  }
  return ok;
}
