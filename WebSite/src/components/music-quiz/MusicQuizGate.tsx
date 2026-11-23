"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { loadStaffAccess } from "@/lib/staff";
import { DISCORD_INVITE, page } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { SmartLink } from "@/components/SmartLink";
import { isDiscordActivity } from "@/lib/discordActivity";
import { cn } from "@/lib/cn";

/** High staff only — senza accesso mostra messaggio + CTA. */
export function MusicQuizGate({ children }: { children: React.ReactNode }) {
  const { token, ready, login } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState<"loading" | "ok" | "denied" | "login">("loading");
  const [activity, setActivity] = useState(false);

  useEffect(() => {
    setActivity(isDiscordActivity());
  }, []);

  useEffect(() => {
    /* Auth appesa (Attività Discord / rete): non restare su «Caricamento…» all'infinito */
    if (!ready) {
      const t = window.setTimeout(() => setState("login"), 14_000);
      return () => window.clearTimeout(t);
    }
    if (!token) {
      setState("login");
      return;
    }
    let alive = true;
    const fail = window.setTimeout(() => {
      if (alive) setState("denied");
    }, 12_000);
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      window.clearTimeout(fail);
      if (r.ok && r.data.isHighStaff) setState("ok");
      else setState("denied");
    });
    return () => {
      alive = false;
      window.clearTimeout(fail);
    };
  }, [ready, token]);

  const pad = cn("mx-auto max-w-lg px-4 pb-16 text-center", activity ? "pt-10" : "pt-28");

  if (state === "loading") {
    return <div className={cn(pad, "text-sm text-crema/50")}>{t("musicQuiz.loading")}</div>;
  }

  if (state === "login" || state === "denied") {
    return (
      <div className={pad}>
        <p className="font-display text-2xl text-crema">{t("musicQuiz.gateTitle")}</p>
        <p className="mt-3 text-sm leading-relaxed text-crema/55">
          {state === "login" ? t("musicQuiz.gateLogin") : t("musicQuiz.gateDenied")}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {state === "login" ? (
            <button
              type="button"
              onClick={() => login()}
              className="rounded-full bg-caramel px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-ember"
            >
              {t("musicQuiz.loginCta")}
            </button>
          ) : (
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-caramel px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-ember"
            >
              {t("musicQuiz.discordCta")}
            </a>
          )}
          {!activity ? (
            <SmartLink
              href={page("/")}
              className="rounded-full px-4 py-2 text-sm text-crema/60 ring-1 ring-sand/20 transition hover:text-crema"
            >
              {t("musicQuiz.homeCta")}
            </SmartLink>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
