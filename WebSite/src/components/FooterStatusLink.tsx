"use client";

import { useEffect, useState } from "react";
import { page } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { loadStatus, overallStatus, type OverallStatus } from "@/lib/status";
import { cn } from "@/lib/cn";
import { pollInterval } from "@/lib/device-fx";
import { isOnline } from "@/lib/online";
import { SmartLink } from "./SmartLink";
import { footerUnderlineClass } from "./NavUnderline";

const HREF = page("/status/");
const POLL_MS_BASE = 60_000;

/**
 * Link footer → /status/ con pallino + etichetta dallo stato reale (Uptime Kuma).
 */
export function FooterStatusLink({ active }: { active?: boolean }) {
  const { t } = useI18n();
  const [st, setSt] = useState<OverallStatus>(() => overallStatus(null));

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (document.hidden || !isOnline()) return;
      loadStatus("").then((d) => {
        if (alive) setSt(overallStatus(d));
      });
    };
    tick();
    const id = window.setInterval(tick, pollInterval(POLL_MS_BASE));
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <SmartLink
      href={HREF}
      className={cn(footerUnderlineClass(active), "inline-flex items-center gap-1.5")}
      title={t("footer.statusTitle")}
    >
      <span className="relative flex size-1.5" aria-hidden>
        <span className={cn("absolute inline-flex size-full animate-ping rounded-full", st.ping)} />
        <span className={cn("relative inline-flex size-1.5 rounded-full", st.led)} />
      </span>
      <span>{t(st.labelKey)}</span>
    </SmartLink>
  );
}
