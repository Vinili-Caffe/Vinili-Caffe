"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { showToast } from "./toast";

/**
 * Bozze form (E8). Il sito vecchio usava sessionStorage; qui è localStorage,
 * come da piano, con lo stesso prefisso `vc_form_draft_v1:`.
 * Il valore sopravvive al refresh. `setDraft` / `touch` salvano; il restore è al mount.
 */

export const DRAFT_PREFIX = "vc_form_draft_v1:";
export const DRAFT_MAX_CHARS = 400_000;
const DEFAULT_GAP_MS = 3200;

let lastNotifyAt = 0;

export type DraftSaveOptions = {
  notify?: boolean;
  message?: string;
  ms?: number;
  minGapMs?: number;
};

export type FormDraftOptions<T> = {
  /** Default 180. */
  debounceMs?: number;
  /** Toast «Bozza salvata». Default true. */
  notify?: boolean;
  message?: string;
  /** Se true, ogni cambio di `value` dopo il restore viene salvato. Default false. */
  watch?: boolean;
  enabled?: boolean;
  isEmpty?: (value: T) => boolean;
  /** Chiave localStorage esatta (senza prefisso `vc_form_draft_v1:`). */
  storageKey?: string;
};

export type FormDraftApi<T> = {
  setDraft: (value: T) => void;
  touch: () => void;
  saveNow: () => void;
  clear: () => void;
  restored: boolean;
};

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function draftKey(name: string): string {
  return DRAFT_PREFIX + String(name || "").trim();
}

export function draftIsEmpty(value: unknown): boolean {
  if (value == null || value === "" || value === false) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

export function notifyDraftSaved(opts: DraftSaveOptions = {}): boolean {
  if (typeof window === "undefined") return false;
  const gap = Number(opts.minGapMs);
  const minGap = Number.isFinite(gap) && gap >= 0 ? gap : DEFAULT_GAP_MS;
  const now = Date.now();
  if (now - lastNotifyAt < minGap) return false;
  lastNotifyAt = now;
  const msg = String(opts.message || "Bozza salvata.").trim() || "Bozza salvata.";
  const ms = Number(opts.ms);
  showToast(msg, false, { ms: Number.isFinite(ms) && ms > 0 ? ms : 1400 });
  return true;
}

function resolveDraftKey(name: string, storageKey?: string): string {
  const sk = String(storageKey || "").trim();
  if (sk) return sk;
  return draftKey(name);
}

export function saveDraft<T>(name: string, data: T, opts: DraftSaveOptions & { storageKey?: string } = {}): boolean {
  if (typeof window === "undefined") return false;
  const s = storage();
  const key = resolveDraftKey(name, opts.storageKey);
  if (!s || key === DRAFT_PREFIX) return false;
  try {
    if (data == null || data === "") {
      s.removeItem(key);
      return true;
    }
    const payload = JSON.stringify({ at: Date.now(), data });
    if (payload.length > DRAFT_MAX_CHARS) return false;
    s.setItem(key, payload);
    if (opts.notify) notifyDraftSaved(opts);
    return true;
  } catch {
    return false;
  }
}

export function loadDraft<T>(name: string, storageKey?: string): T | null {
  if (typeof window === "undefined") return null;
  const s = storage();
  const key = resolveDraftKey(name, storageKey);
  if (!s || key === DRAFT_PREFIX) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: T };
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return null;
    return parsed.data as T;
  } catch {
    return null;
  }
}

export function clearDraft(name: string, storageKey?: string): void {
  if (typeof window === "undefined") return;
  const s = storage();
  const key = resolveDraftKey(name, storageKey);
  if (!s || key === DRAFT_PREFIX) return;
  try {
    s.removeItem(key);
  } catch {
    /* quota / private mode */
  }
}

export function useFormDraft<T>(name: string, value: T, setValue: (value: T) => void, opts: FormDraftOptions<T> = {}): FormDraftApi<T> {
  const valueRef = useRef(value);
  valueRef.current = value;
  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const timer = useRef<number | null>(null);
  const armed = useRef(false);
  const [restored, setRestored] = useState(false);

  const persist = useCallback(() => {
    const o = optsRef.current;
    if (o.enabled === false) return;
    const empty = o.isEmpty ?? draftIsEmpty;
    const v = valueRef.current;
    const sk = o.storageKey;
    if (empty(v)) clearDraft(name, sk);
    else saveDraft(name, v, { notify: o.notify !== false, message: o.message, storageKey: sk });
  }, [name]);

  const schedule = useCallback(() => {
    const ms = optsRef.current.debounceMs ?? 180;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      persist();
    }, ms);
  }, [persist]);

  useEffect(() => {
    armed.current = false;
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (optsRef.current.enabled === false) {
      const id = window.setTimeout(() => {
        armed.current = true;
        setRestored(true);
      }, 0);
      return () => window.clearTimeout(id);
    }
    const saved = loadDraft<T>(name, optsRef.current.storageKey);
    const empty = optsRef.current.isEmpty ?? draftIsEmpty;
    if (saved != null && !empty(saved)) {
      valueRef.current = saved;
      setValueRef.current(saved);
    }
    const id = window.setTimeout(() => {
      armed.current = true;
      setRestored(true);
    }, 0);
    return () => {
      armed.current = false;
      window.clearTimeout(id);
    };
  }, [name]);

  useEffect(() => {
    if (!opts.watch || !armed.current) return;
    schedule();
  }, [value, opts.watch, schedule]);

  const setDraft = useCallback(
    (next: T) => {
      valueRef.current = next;
      setValueRef.current(next);
      schedule();
    },
    [schedule],
  );

  const touch = useCallback(() => {
    schedule();
  }, [schedule]);

  const saveNow = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    persist();
  }, [persist]);

  const clear = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    clearDraft(name, optsRef.current.storageKey);
  }, [name]);

  return { setDraft, touch, saveNow, clear, restored };
}

/** Stato locale + bozza. `setDraft` aggiorna e salva. */
export function useDraftValue<T>(name: string, initial: T, opts?: FormDraftOptions<T>) {
  const [value, setValue] = useState(initial);
  const api = useFormDraft(name, value, setValue, opts);
  return [value, api.setDraft, api] as const;
}
