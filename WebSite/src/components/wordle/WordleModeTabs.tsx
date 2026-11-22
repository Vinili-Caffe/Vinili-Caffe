"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";

type Props = { active: "classic" | "quad" };

function link(href: string, on: boolean, label: string) {
  return (
    <Link
      href={href}
      className={cn(
        "font-display text-sm tracking-wide transition sm:text-base",
        on
          ? "text-sand underline decoration-caramel/70 decoration-2 underline-offset-[6px]"
          : "text-crema/40 hover:text-crema/70",
      )}
      aria-current={on ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

/** Switch classico / ×4 sotto il titolo pagina. */
export function WordleModeTabs({ active }: Props) {
  const { t } = useI18n();
  return (
    <nav
      className="mx-auto mb-3 flex items-baseline justify-center gap-3 px-4 sm:gap-4"
      aria-label={t("wordle.modeAria")}
    >
      {link("/wordle/", active === "classic", t("wordle.modeOne"))}
      <span className="select-none text-crema/20" aria-hidden>
        ·
      </span>
      {link("/wordle/quattro/", active === "quad", t("wordle.modeFour"))}
    </nav>
  );
}
