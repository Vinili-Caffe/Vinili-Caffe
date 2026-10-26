"use client";

import { useEffect } from "react";
import { bootstrapSiteRealtime } from "@/lib/site-realtime";

/** Tiene aperto il WS realtime di sito (notifiche / inbox / ticket). */
export function RealtimeBoot() {
  useEffect(() => bootstrapSiteRealtime(), []);
  return null;
}
