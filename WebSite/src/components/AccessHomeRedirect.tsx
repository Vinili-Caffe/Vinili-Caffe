"use client";

import { SmartLink } from "@/components/SmartLink";

/**
 * Pagina gated non accessibile: resta sulla URL (niente bounce → home dopo soft-nav).
 * Prima faceva router.replace("/") a 350ms e confondeva la navigazione SPA.
 */
export function AccessHomeRedirect({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <section
      className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center gap-6 px-6 pb-20 text-center"
      aria-label="Accesso non disponibile"
    >
      <div>
        <p className="font-display text-2xl font-semibold text-crema">Ancora chiuso</p>
        <p className="mt-3 text-sm leading-relaxed text-crema/65">
          Questa sezione non è aperta al pubblico in questo momento. Torna più tardi oppure riparti dalla home.
        </p>
      </div>
      <SmartLink
        href="/"
        className="inline-flex items-center justify-center self-center rounded-full bg-crema/10 px-6 py-3 text-sm font-semibold text-crema ring-1 ring-sand/25 transition hover:bg-crema/15"
      >
        Vai alla home
      </SmartLink>
    </section>
  );
}
