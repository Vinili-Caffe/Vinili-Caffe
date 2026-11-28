"use client";

import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

/** Gate login Discord uniforme (candidature, appelli, serata, tickets…). */
export function AuthGateCard({
  title,
  text,
  why,
}: {
  title?: string;
  text?: string;
  why?: string;
}) {
  const { login } = useAuth();
  const { t } = useI18n();
  const gateTitle = title ?? t("login.requiredTitle");
  const gateText = text ?? t("login.requiredText");
  const gateWhy = why ?? t("auth.gateWhy");
  return (
    <div className="mx-auto max-w-xl rounded-3xl bg-gradient-to-b from-caramel/[0.12] via-roast/85 to-roast p-10 text-center ring-1 ring-sand/15">
      <LogIn className="mx-auto size-10 text-ember" aria-hidden />
      <h1 className="mt-4 font-display text-3xl font-semibold text-crema">{gateTitle}</h1>
      <p className="mt-2 text-crema/65">{gateText}</p>
      <p className="mt-3 text-sm text-crema/50">{gateWhy}</p>
      <button
        type="button"
        onClick={login}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#5865f2] px-6 py-3 font-semibold text-white transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
      >
        <LogIn className="size-4" aria-hidden /> {t("auth.loginDiscord")}
      </button>
    </div>
  );
}
