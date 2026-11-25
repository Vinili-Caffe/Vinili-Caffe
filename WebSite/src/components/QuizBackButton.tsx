"use client";

import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";
import { stripLocale, useSitePathname } from "@/lib/locale-path";

/**
 * In tutte le pagine dei quiz: un tasto sempre a portata per tornare subito indietro
 * (partita del Number Quiz → categorie, pagine di un Music Quiz → Music Quiz, il resto → pagina Quiz).
 */
function backFor(path: string): { href: string; label: string } | null {
  const p = stripLocale(path).replace(/\/?$/, "/");
  if (p === "/quiz/") return null;
  if (p.startsWith("/quiz/numeri/") && p !== "/quiz/numeri/") return { href: "/quiz/numeri/", label: "Categorie" };
  if (p.startsWith("/music-quiz/") && p !== "/music-quiz/") return { href: "/music-quiz/", label: "Music Quiz" };
  if (p.startsWith("/quiz/") || p.startsWith("/music-quiz/") || p.startsWith("/wordle/")) return { href: "/quiz/", label: "Quiz" };
  return null;
}

export function QuizBackButton() {
  const path = useSitePathname();
  const back = backFor(path);
  if (!back) return null;
  return (
    <motion.div
      key={back.href}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="pointer-events-none fixed left-3 top-[4.75rem] z-[60] sm:left-5 sm:top-20"
    >
      <SmartLink
        href={page(back.href)}
        aria-label={`Torna a ${back.label}`}
        className="pointer-events-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-espresso/85 pl-2.5 pr-4 text-xs font-bold uppercase tracking-wide text-crema shadow-lg ring-1 ring-sand/20 backdrop-blur transition hover:bg-caramel hover:text-ink"
      >
        <ArrowLeft className="size-4" /> {back.label}
      </SmartLink>
    </motion.div>
  );
}
