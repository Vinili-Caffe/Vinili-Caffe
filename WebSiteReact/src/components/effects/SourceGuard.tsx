"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { OWNER_DISCORD_IDS } from "@/lib/source-guard-boot";

/** Sync bypass owner + re-applica classe soft (React riscrive className su <html>). */
export function SourceGuard() {
  const { user } = useAuth();

  useEffect(() => {
    try {
      if (!window.__vcSourceGuardOff) {
        document.documentElement.classList.add("vc-source-guard-soft");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const id = String(user?.id || "").trim();
    if (!id || !OWNER_DISCORD_IDS.has(id)) return;
    try {
      localStorage.setItem("vc-source-guard-owner-uid", id);
      localStorage.setItem("vc-source-guard-off", "1");
      window.__vcSourceGuardOff = true;
      document.documentElement.classList.remove("vc-source-guard-soft");
      window.__vcSourceGuardApi?.off?.();
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  return null;
}

declare global {
  interface Window {
    __vcSourceGuardOff?: boolean;
    __vcSourceGuardApi?: { off: () => void; on: () => void };
  }
}
