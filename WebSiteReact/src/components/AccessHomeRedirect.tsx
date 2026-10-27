"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Redirect a home quando una pagina gated non è accessibile.
 * Aspetta un tick (anti race gate/auth) e preferisce soft replace.
 */
export function AccessHomeRedirect({ active }: { active: boolean }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const fired = useRef(false);

  useEffect(() => {
    if (!active) {
      fired.current = false;
      return;
    }
    // Non buttare via subito: lascia finire hydrate/auth (bounce → home)
    const soft = window.setTimeout(() => {
      if (fired.current) return;
      if (!active) return;
      fired.current = true;
      try {
        router.replace("/");
      } catch {
        /* ignore */
      }
    }, 350);

    const hard = window.setTimeout(() => {
      if (location.pathname === "/" || location.pathname === "") return;
      // solo se siamo ancora sulla pagina gated
      const still =
        pathname.startsWith("/evento") ||
        pathname.startsWith("/puzzle") ||
        pathname.startsWith("/contest") ||
        pathname.startsWith("/seratafilm");
      if (!still && !location.pathname.startsWith("/evento") && !location.pathname.startsWith("/puzzle")) {
        return;
      }
      try {
        window.location.replace("/");
      } catch {
        window.location.href = "/";
      }
    }, 2800);

    return () => {
      window.clearTimeout(soft);
      window.clearTimeout(hard);
    };
  }, [active, router, pathname]);

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
