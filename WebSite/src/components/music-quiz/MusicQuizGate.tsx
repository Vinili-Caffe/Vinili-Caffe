"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { loadStaffAccess } from "@/lib/staff";
import { DISCORD_INVITE, page } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { SmartLink } from "@/components/SmartLink";

/** High staff only — senza accesso mostra messaggio + CTA. */
export function MusicQuizGate({ children }: { children: React.ReactNode }) {
  const { token, ready, login } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState<"loading" | "ok" | "denied" | "login">("loading");

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setState("login");
      return;
    }
    let alive = true;
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      if (r.ok && r.data.isHighStaff) setState("ok");
      else setState("denied");
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-crema/50">
        {t("musicQuiz.loading")}
      </div>
    );
  }

  if (state === "login" || state === "denied") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
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
          <SmartLink
            href={page("/")}
            className="rounded-full px-4 py-2 text-sm text-crema/60 ring-1 ring-sand/20 transition hover:text-crema"
          >
            {t("musicQuiz.homeCta")}
          </SmartLink>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
