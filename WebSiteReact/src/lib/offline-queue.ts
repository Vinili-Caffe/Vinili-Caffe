"use client";

import { useEffect, useRef } from "react";

/** Coda leggera in localStorage per azioni da ritentare al ritorno online. */

export type OfflineActionType = "vote" | "react" | "draft";

export type OfflineAction = {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  createdAt: number;
};

const STORAGE_KEY = "vc_offline_action_queue_v1";

type QueueListener = () => void;
const listeners = new Set<QueueListener>();
let onlineHookInstalled = false;
const onlineFlushHandlers = new Set<(items: OfflineAction[]) => Promise<void>>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function readRaw(): OfflineAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const type = o.type;
        if (type !== "vote" && type !== "react" && type !== "draft") return null;
        const id = String(o.id || "").trim();
        if (!id) return null;
        const payload = o.payload && typeof o.payload === "object" && !Array.isArray(o.payload) ? (o.payload as Record<string, unknown>) : {};
        const createdAt = Number(o.createdAt);
        return { id, type, payload, createdAt: Number.isFinite(createdAt) ? createdAt : Date.now() } satisfies OfflineAction;
      })
      .filter(Boolean) as OfflineAction[];
  } catch {
    return [];
  }
}

function writeRaw(items: OfflineAction[]) {
  if (typeof window === "undefined") return;
  try {
    if (!items.length) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
  notify();
}

export function isOfflineFetchFailure(err?: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  return false;
}

export function isOfflineApiFailure(err?: unknown, message?: string): boolean {
  if (isOfflineFetchFailure(err)) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const m = String(message || "").toLowerCase();
  return m.includes("connessione") && (m.includes("non riuscita") || m.includes("instabile"));
}

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/** Evita duplicati stretti (stesso type + payload serializzato). */
function dedupeKey(type: OfflineActionType, payload: Record<string, unknown>) {
  return `${type}:${JSON.stringify(payload)}`;
}

export function enqueue(type: OfflineActionType, payload: Record<string, unknown>): OfflineAction {
  const items = readRaw();
  const key = dedupeKey(type, payload);
  const existing = items.find((x) => dedupeKey(x.type, x.payload) === key);
  if (existing) {
    notify();
    return existing;
  }
  const action: OfflineAction = { id: newId(), type, payload, createdAt: Date.now() };
  writeRaw([...items, action]);
  return action;
}

export function peek(): OfflineAction[] {
  return readRaw();
}

export function list(): OfflineAction[] {
  return peek();
}

export function queueLength(): number {
  return peek().length;
}

export function remove(id: string): void {
  const items = readRaw().filter((x) => x.id !== id);
  writeRaw(items);
}

export function subscribeOfflineQueue(fn: QueueListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function flush(handler: (item: OfflineAction) => Promise<boolean>): Promise<number> {
  if (typeof window === "undefined") return 0;
  let done = 0;
  for (const item of peek()) {
    try {
      if (await handler(item)) {
        remove(item.id);
        done++;
      }
    } catch {
      /* retry later */
    }
  }
  return done;
}

async function runOnlineFlushes() {
  if (typeof window === "undefined" || !navigator.onLine) return;
  const items = peek();
  if (!items.length || !onlineFlushHandlers.size) return;
  for (const fn of onlineFlushHandlers) {
    try {
      await fn(items);
    } catch {
      /* handler decides removals via flush() */
    }
  }
}

function ensureOnlineListener() {
  if (typeof window === "undefined" || onlineHookInstalled) return;
  onlineHookInstalled = true;
  window.addEventListener("online", () => {
    void runOnlineFlushes();
  });
}

/**
 * Registra un handler chiamato su `online` (e subito se già online).
 * Il handler dovrebbe chiamare `flush()` per rimuovere gli item riusciti.
 */
export function useOfflineQueueFlush(handler: (item: OfflineAction) => Promise<boolean>, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    ensureOnlineListener();

    const wrapped = async () => {
      if (!navigator.onLine) return;
      await flush((item) => handlerRef.current(item));
    };

    onlineFlushHandlers.add(wrapped);
    if (navigator.onLine && queueLength() > 0) void wrapped();

    return () => {
      onlineFlushHandlers.delete(wrapped);
    };
  }, [enabled]);
}

export const OFFLINE_TOAST_VOTE = "Offline — voto in coda";
export const OFFLINE_TOAST_REACT = "Offline — reazione in coda";
export const OFFLINE_TOAST_DRAFT = "Bozza salvata in coda";
export const OFFLINE_TOAST_FLUSH_OK = "Azioni in coda inviate";
