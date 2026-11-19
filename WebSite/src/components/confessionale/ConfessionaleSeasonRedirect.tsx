"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isPropositiSeason } from "@/lib/site-effects";
import { page } from "@/lib/site";

/** In stagione Capodanno il confessionale lascia posto ai buoni propositi. */
export function ConfessionaleSeasonRedirect() {
  const router = useRouter();
  useEffect(() => {
    const go = () => {
      if (isPropositiSeason()) router.replace(page("/propositi/"));
    };
    go();
    const id = window.setInterval(go, 30_000);
    return () => window.clearInterval(id);
  }, [router]);
  return null;
}
