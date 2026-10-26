import type { ReactNode } from "react";
import { EVENTO_BRAND, EVENTO_KICKER } from "@/lib/evento-starwars";

/** Hero cinematico (sostituisce PageHero sul ramo evento). */
export function EventoHero({
  title,
  text,
  accent,
  icon,
}: {
  title: string;
  text: string;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <section className="relative mx-auto max-w-4xl px-5 pb-6 pt-8 text-center sm:pt-12">
      <div
        className="pointer-events-none absolute left-1/2 top-4 h-40 w-[min(90%,36rem)] -translate-x-1/2 rounded-full bg-[#2ea8ff]/15 blur-3xl"
        aria-hidden
      />
      <p className="relative text-[0.68rem] font-semibold uppercase tracking-[0.38em] text-[#c9a227]">
        {EVENTO_KICKER}
      </p>
      <div className="relative mt-4 flex flex-col items-center gap-3">
        {icon ? (
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#c9a227]/15 text-[#e4c76b] ring-1 ring-[#c9a227]/35 [&>svg]:size-6">
            {icon}
          </span>
        ) : null}
        <h1 className="font-display text-4xl font-semibold tracking-[0.06em] text-[#f0e6c8] sm:text-5xl md:text-6xl">
          {title}
          {accent ? (
            <>
              {" "}
              <span className="bg-gradient-to-r from-[#e4c76b] via-[#f0e6c8] to-[#2ea8ff] bg-clip-text text-transparent">
                {accent}
              </span>
            </>
          ) : null}
        </h1>
      </div>
      <p className="relative mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[#f0e6c8]/65 sm:text-base">
        {text}
      </p>
      <p className="relative mt-3 text-[0.62rem] uppercase tracking-[0.4em] text-[#f0e6c8]/35">
        {EVENTO_BRAND} · Vinili &amp; Caffè
      </p>
    </section>
  );
}
