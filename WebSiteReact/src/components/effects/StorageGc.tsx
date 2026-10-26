"use client";

import { useEffect } from "react";
import { runStorageGc } from "@/lib/storage-gc-boot";

/** Re-sweep dopo hydrate (copre chiavi scritte da script legacy / tab parallele). */
export function StorageGc() {
  useEffect(() => {
    runStorageGc(true);
  }, []);
  return null;
}
