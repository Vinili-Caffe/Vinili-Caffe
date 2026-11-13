"use client";

import { useEffect, useState } from "react";
import { BOT_FEEDBACK_API, FeedbackApiProvider } from "@/lib/feedback-api";
import { FeedbackBoard } from "./FeedbackBoard";

/**
 * Feedback del sito: Community e Staff (lavagna del server) più "Bot" (lavagna del bot Vinili),
 * tutte nello stesso switcher in alto. /feedback/#bot apre direttamente quella del bot.
 */
export function SiteFeedback() {
  const [bot, setBot] = useState(false);
  /* accesso alla lavagna staff: noto subito (salvato nel browser) e confermato quando la lavagna del sito risponde */
  const [staffAllowed, setStaffAllowed] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (localStorage.getItem("vc-feedback-staff") === "1") setStaffAllowed(true);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const onStaffAccess = (allowed: boolean) => {
    setStaffAllowed(allowed);
    try {
      if (allowed) localStorage.setItem("vc-feedback-staff", "1");
      else localStorage.removeItem("vc-feedback-staff");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const read = () => setBot(location.hash === "#bot");
    const t = window.setTimeout(read, 0);
    window.addEventListener("hashchange", read);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", read);
    };
  }, []);

  const select = (nextBot: boolean, staff = false) => {
    try {
      const url = new URL(window.location.href);
      url.hash = nextBot ? "bot" : "";
      if (staff) url.searchParams.set("board", "staff");
      else url.searchParams.delete("board");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* ignore */
    }
    setBot(nextBot);
  };

  return bot ? (
    <FeedbackApiProvider api={BOT_FEEDBACK_API}>
      <FeedbackBoard key="bot" title="Idee per Vinili" botTab={{ active: true, onSelect: select, staffAllowed }} />
    </FeedbackApiProvider>
  ) : (
    <FeedbackBoard key="site" botTab={{ active: false, onSelect: select, staffAllowed, onStaffAccess }} />
  );
}
