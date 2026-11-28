"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { markNavSeenWithToken } from "@/lib/nav-activity";

/** All’apertura di confessionale / feedback / recensioni: toglie il bollino ! */
export function NavActivitySeen({ path }: { path: string }) {
  const { ready, token } = useAuth();

  useEffect(() => {
    if (!ready) return;
    markNavSeenWithToken(path, token);
  }, [ready, token, path]);

  return null;
}
