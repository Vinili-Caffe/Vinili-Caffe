import { showToast } from "@/components/ui/toast";

export const DELETE_UNDO_MS = 5000;

type Pending = { timer: number };

let pending: Pending | null = null;

function clearPending() {
  if (pending) {
    window.clearTimeout(pending.timer);
    pending = null;
  }
}

/** Rimuove subito dall’UI; DELETE API solo dopo la finestra undo (nessun restore lato server). */
export function scheduleDeferredDelete(opts: {
  onRemove: () => void;
  onRestore: () => void;
  commit: () => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  clearPending();
  opts.onRemove();
  showToast("Eliminato", false, {
    ms: DELETE_UNDO_MS,
    action: {
      label: "Annulla",
      onClick: () => {
        clearPending();
        opts.onRestore();
        showToast("Eliminazione annullata", false, { ms: 1800 });
      },
    },
  });
  pending = {
    timer: window.setTimeout(async () => {
      pending = null;
      const r = await opts.commit();
      if (!r.ok) {
        opts.onRestore();
        showToast(r.message || "Eliminazione non riuscita", true);
      }
    }, DELETE_UNDO_MS),
  };
}
