"use client";

import { useEffect } from "react";

/** Se `?vc_phone_preview=1` (iframe nell’iPhone), snellisce la chrome. */
export function PhonePreviewMode() {
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("vc_phone_preview") !== "1") return;
    } catch {
      return;
    }
    document.documentElement.classList.add("vc-phone-preview");
    return () => document.documentElement.classList.remove("vc-phone-preview");
  }, []);
  return null;
}
