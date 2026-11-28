"use client";

import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

/** Riquadro unico: accedi con Discord per continuare. */
export function LoginRequired({ title, text }: { title?: string; text?: string }) {
  const { login, ready } = useAuth();
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="rounded-[2rem] bg-gradient-to-b from-caramel/[0.12] via-roast/85 to-roast p-8 ring-1 ring-sand/15">
        <p className="font-display text-3xl font-semibold">{title ?? t("login.requiredTitle")}</p>
        <p className="mt-3 text-sm text-crema/65">{text ?? t("login.requiredText")}</p>
        <button
          type="button"
          disabled={!ready}
          onClick={login}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-50"
        >
          <LogIn className="size-4" /> {t("auth.loginDiscord")}
        </button>
      </div>
    </section>
  );
}
