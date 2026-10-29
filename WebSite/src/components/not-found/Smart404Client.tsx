"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Disc3 } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { resolveSmart404 } from "@/lib/smart404";

/** Alias → redirect; genitore noto → link “Prova …”. Solo percorsi del catalogo. */
export function Smart404Client({ hintId }: { hintId: string }) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const resolved = useMemo(() => resolveSmart404(pathname, search), [pathname, search]);

  useEffect(() => {
    if (resolved.kind !== "redirect") return;
    try {
      window.location.replace(resolved.href);
    } catch {
      window.location.href = resolved.href;
    }
  }, [resolved]);

  useEffect(() => {
    const el = document.getElementById(hintId);
    if (!el) return;
    if (resolved.kind === "redirect") {
      el.textContent = "Ti sto portando alla pagina giusta…";
      return;
    }
    el.textContent = resolved.hint;
  }, [resolved, hintId]);

  if (resolved.kind !== "suggest") return null;

  return (
    <SmartLink
      href={resolved.href}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-caramel/10 px-4 py-3 text-sm font-semibold text-caramel ring-1 ring-caramel/35 transition hover:bg-caramel/15"
    >
      <Disc3 className="size-4" aria-hidden />
      {resolved.label}
    </SmartLink>
  );
}

export function BackButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        window.location.href = "/";
      }}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-crema/8 px-4 py-3 text-sm font-semibold text-crema ring-1 ring-sand/25 transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] hover:ring-sand/40"
    >
      {/* icona inline per non forzare lucide nel server parent */}
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Torna indietro
    </button>
  );
}
