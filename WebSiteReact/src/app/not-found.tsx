import type { Metadata } from "next";
import { Suspense } from "react";
import { Home } from "lucide-react";
import { SiteShell } from "@/components/SiteShell";
import { SmartLink } from "@/components/SmartLink";
import { SkippingVinyl } from "@/components/not-found/SkippingVinyl";
import { BackButton, Smart404Client } from "@/components/not-found/Smart404Client";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/404/",
    title: "Pagina non trovata",
    notFound: true,
  }),
  robots: { index: false, follow: false },
};

const HINT_ID = "vc-404-hint";

/** 404 statico (`out/404.html` con `output: "export"`). */
export default function NotFound() {
  return (
    <SiteShell>
      <section className="relative mx-auto max-w-lg px-6 pb-24 pt-32 sm:pt-40" aria-labelledby="vc-404-title">
        <div className="rounded-3xl bg-roast/70 p-6 ring-1 ring-sand/12 sm:p-8">
          <SkippingVinyl className="mb-6" />

          <p
            className="text-center font-display text-6xl font-semibold leading-none text-caramel lining-nums sm:text-7xl"
            aria-hidden
          >
            404
          </p>
          <p className="mt-3 text-center font-script text-2xl text-ember/90">qui non c’è nulla</p>
          <h1 id="vc-404-title" className="mt-2 text-center font-display text-3xl font-semibold sm:text-4xl">
            Pagina non trovata
          </h1>
          <p id={HINT_ID} className="mt-3 text-center text-sm text-sand/80 sm:text-base">
            Questa pagina non esiste. Torna indietro o alla home.
          </p>

          <div className="mt-7 flex flex-col gap-3">
            <BackButton />

            <SmartLink
              href="/"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-3 text-sm font-semibold text-ink shadow-[0_18px_40px_-20px_rgba(212,145,80,0.55)] transition hover:-translate-y-0.5"
            >
              <Home className="size-4" aria-hidden />
              Homepage
            </SmartLink>

            <Suspense fallback={null}>
              <Smart404Client hintId={HINT_ID} />
            </Suspense>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
