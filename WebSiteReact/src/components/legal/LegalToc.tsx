"use client";

import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
import { SmartLink } from "../SmartLink";

export type LegalTocSection = { id: string; title: string };

type LegalSibling = { slug: string; href: string; label: string };

/** Indice laterale sticky per documenti legali (sezioni h2). */
export function LegalToc({
  sections,
  active,
  siblings,
}: {
  sections: LegalTocSection[];
  active: string;
  siblings?: LegalSibling[];
}) {
  if (!sections.length) return null;

  return (
    <aside className="border-b border-sand/10 bg-espresso/40 px-4 py-5 lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-8">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-caramel">Indice</p>
      <nav aria-label="Indice del documento" className="mt-4">
        <ol className="space-y-1">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={cn(
                  "flex gap-2 rounded-lg px-2.5 py-1.5 text-sm leading-snug transition-colors",
                  active === s.id
                    ? "bg-caramel/15 text-crema ring-1 ring-caramel/30"
                    : "text-crema/55 hover:bg-crema/[0.04] hover:text-crema/85",
                )}
              >
                <span className="w-5 shrink-0 font-mono text-[0.7rem] tabular-nums text-sand/50">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {siblings?.length ? (
        <div className="mt-8 border-t border-sand/10 pt-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-caramel">Altre policy</p>
          <ul className="mt-3 space-y-1.5">
            {siblings.map((s) => (
              <li key={s.slug}>
                <SmartLink
                  href={page(s.href)}
                  className="block rounded-lg px-2.5 py-1.5 text-sm text-crema/55 transition-colors hover:bg-crema/[0.04] hover:text-crema/90"
                >
                  {s.label}
                </SmartLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
