"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redirect a home quando una pagina gated non è accessibile.
 * Soft replace (niente hard reload); fallback assign solo se la SPA non muove.
 */
export function AccessHomeRedirect({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    try {
      router.replace("/");
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => {
      if (location.pathname === "/" || location.pathname === "") return;
      try {
        window.location.replace("/");
      } catch {
        window.location.href = "/";
      }
    }, 2000);
    return () => window.clearTimeout(t);
  }, [active, router]);

  if (!active) return null;

  return (
    <section
      className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center px-6 pb-20"
      aria-busy="true"
      aria-label="Reindirizzamento"
    >
      <div className="h-40 animate-pulse rounded-3xl bg-crema/8" />
    </section>
  );
}
