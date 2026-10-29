"use client";

import { motion } from "motion/react";
import { Film } from "lucide-react";
import { filmTitle } from "@/lib/seratafilm";
import { page } from "@/lib/site";
import { SmartLink } from "../SmartLink";

/** Biglietto strappato: fine proiezione. */
export function GrazieBoard() {
  const title = filmTitle();
  return (
    <section className="mx-auto max-w-lg px-6 pb-24 text-center">
      <motion.div
        initial={{ opacity: 0, rotate: -2, y: 12 }}
        animate={{ opacity: 1, rotate: 0, y: 0 }}
        className="rounded-[2rem] bg-gradient-to-b from-mocha to-roast p-8 ring-1 ring-sand/15"
      >
        <Film className="mx-auto size-10 text-caramel" />
        <p className="mt-4 font-script text-3xl text-caramel">Grazie</p>
        <h2 className="mt-2 font-display text-4xl font-semibold">Serata conclusa</h2>
        <p className="mt-3 text-crema/65">
          Speriamo ti sia piaciuto <span className="text-sand">{title}</span>. Alla prossima serata film.
        </p>
        <SmartLink
          href={page("/seratafilm/")}
          className="mt-8 inline-flex rounded-full bg-crema/10 px-5 py-2.5 text-sm font-semibold ring-1 ring-sand/25"
        >
          Torna alla serata
        </SmartLink>
      </motion.div>
    </section>
  );
}
