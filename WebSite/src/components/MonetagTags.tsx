"use client";

import { useEffect } from "react";
import { ensureMonetagScripts } from "@/lib/monetag";

/** Carica i tag Monetag OnClick + Vignette (dashboard) una volta per sessione. */
export function MonetagTags() {
  useEffect(() => {
    void ensureMonetagScripts();
  }, []);
  return null;
}
