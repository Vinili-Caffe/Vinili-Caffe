"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { markNotifsForPage } from "@/lib/notifications";

function entityIdFromHash(raw: string): string {
  const h = String(raw || "")
    .replace(/^#/, "")
    .trim();
  if (!h) return "";
  if (/^[a-f0-9]{24}$/i.test(h)) return h.toLowerCase();
  const m = /^(?:vc-suggestion-|vc-conf-card-|vc-review-|vc-bot-feedback-)?([a-f0-9]{24})$/i.exec(h);
  return m ? String(m[1] || "").toLowerCase() : "";
}

/**
 * Come sul sito vecchio (pushVisitDismiss1): se sei già sulla discussione/ticket
 * a cui punta una notifica, quella notifica si segna letta (e si spegne il banner OS).
 * Lista /feedback o /tickets da sola NON basta (notifVisitExact1).
 */
export function NotifPageRead() {
  const { ready, token } = useAuth();
  const pathname = usePathname();
  const search = useSearchParams();
  const last = useRef("");

  useEffect(() => {
    if (!ready || !token) return;

    const run = () => {
      const href = `${location.origin}${location.pathname}${location.search}${location.hash}`;
      const path = (location.pathname || "/").replace(/\/+$/, "") || "/";
      if (path === "/" || path === "/notifications") return;

      if (href === last.current) return;
      last.current = href;

      const q = new URLSearchParams(location.search);
      let tid = (
        q.get("ticketId") ||
        q.get("ticket") ||
        (/\/tickets/i.test(path) ? q.get("id") : "") ||
        (/\/feedback/i.test(path) ? q.get("id") || q.get("suggestion") : "") ||
        (/\/confessionale|\/recensioni/i.test(path) ? q.get("id") : "") ||
        ""
      ).trim();
      if (!/^[a-f0-9]{24}$/i.test(tid)) tid = entityIdFromHash(location.hash);
      const extra = /^[a-f0-9]{24}$/i.test(tid) ? { ticketIds: [tid.toLowerCase()] } : undefined;
      void markNotifsForPage(token, href, extra);
    };

    const t = window.setTimeout(run, 450);

    const onNav = () => {
      window.setTimeout(run, 80);
    };
    window.addEventListener("hashchange", onNav);
    window.addEventListener("popstate", onNav);
    /* Tickets/Feedback usano replaceState: Next searchParams non cambia → evento custom */
    window.addEventListener("vc:notif-page", onNav);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", onNav);
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("vc:notif-page", onNav);
    };
  }, [ready, token, pathname, search]);

  return null;
}
