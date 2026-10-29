"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { bindPresence } from "@/lib/presence";
import { readRealToken } from "@/lib/view-as";

/** Heartbeat globale: montato da SiteShell. I pallini stanno nei thread. */
export function PresenceRoot() {
  const { ready, token } = useAuth();
  const path = usePathname() || "/";

  useEffect(() => {
    if (!ready) return;
    // Token reale, anche in anteprima ospite (la UI maschera useAuth().token).
    return bindPresence(readRealToken(), path);
  }, [ready, path, token]);

  return null;
}
