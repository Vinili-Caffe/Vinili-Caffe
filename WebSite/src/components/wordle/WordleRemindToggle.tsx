"use client";

import { useState } from "react";
import { Bell, BellOff, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DISCORD_INVITE } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";

type Props = {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  className?: string;
};

/** Opt-in promemoria mezzanotte (sito; DM se push non attiva). */
export function WordleRemindToggle({ enabled, onEnabledChange, className }: Props) {
  const { token, login, ready } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [hintGuild, setHintGuild] = useState(false);

  const toggle = async () => {
    if (!token) {
      login();
      return;
    }
    setBusy(true);
    setHint("");
    setHintGuild(false);
    try {
      const r = await fetch("/webhooks/site-wordle/remind", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const j = await r.json().catch(() => null);
      if (!j?.ok) {
        if (j?.error === "not_in_guild") {
          setHint(t("wordle.remindNeedGuild"));
          setHintGuild(true);
        } else {
          setHint(j?.message || t("wordle.remindFail"));
        }
        return;
      }
      const next = Boolean(j.remindEnabled);
      onEnabledChange(next);
      setHint(next ? t("wordle.remindEnabledMsg") : t("wordle.remindDisabledMsg"));
      window.setTimeout(() => setHint(""), 2800);
    } catch {
      setHint(t("wordle.remindBusy"));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition",
          enabled
            ? "text-ember hover:text-caramel"
            : "text-crema/45 hover:text-crema/70",
        )}
      >
        {token ? (
          enabled ? (
            <>
              <Bell className="size-3.5" /> {t("wordle.remindOn")}
            </>
          ) : (
            <>
              <BellOff className="size-3.5" /> {t("wordle.remindOff")}
            </>
          )
        ) : (
          <>
            <LogIn className="size-3.5" /> {t("wordle.remindLogin")}
          </>
        )}
      </button>
      {hint ? (
        <p className="text-center text-[0.7rem] text-crema/50">
          {hintGuild ? (
            <>
              {hint}{" "}
              <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" className="text-ember underline">
                Discord
              </a>
            </>
          ) : (
            hint
          )}
        </p>
      ) : null}
    </div>
  );
}
