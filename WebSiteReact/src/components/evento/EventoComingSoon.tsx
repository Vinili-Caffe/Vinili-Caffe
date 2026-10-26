import { EVENTO_BRAND } from "@/lib/evento-starwars";

/** Blocco centrale ·in preparazione· (come le pagine cine: card + scroll). */
export function EventoComingSoon({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 pb-24">
      <div className="scheme-dark relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b1220] via-[#12101a] to-[#1a140c] p-7 ring-1 ring-sand/20 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-crema/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 size-40 rounded-full bg-[#4aa3ff]/10 blur-3xl" />
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-crema/80">
          {EVENTO_BRAND} · in preparazione
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold text-crema sm:text-4xl">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-crema/70 sm:text-base">{text}</p>
        <p className="mt-6 text-xs text-crema/45">
          Bot + sito: le regole e le ricompense arriveranno quando apriamo la finestra evento.
        </p>
      </div>
    </div>
  );
}
