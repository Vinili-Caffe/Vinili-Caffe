"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { LEGAL_SIBLINGS, type LegalBlock, type LegalDoc } from "@/lib/legal";
import { page } from "@/lib/site";
import { SmartLink } from "../SmartLink";
import { LegalProse } from "./LegalProse";
import { LegalToc } from "./LegalToc";

/** Documento legale: carta + indice laterale con ancore. Sobrio, niente effetti. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const [active, setActive] = useState(doc.sections[0]?.id ?? "");

  useEffect(() => {
    const nodes = doc.sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!nodes.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    for (const n of nodes) obs.observe(n);
    return () => obs.disconnect();
  }, [doc.sections]);

  const siblings = LEGAL_SIBLINGS.filter((s) => s.slug !== doc.slug);

  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      {/* foglio: metafora carta / tipografia */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-mocha to-roast/90 ring-1 ring-sand/15 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.65)]">
        {/* bordo superiore tipo foglio rilegato */}
        <div className="flex items-center gap-3 border-b border-sand/10 bg-crema/[0.03] px-5 py-3 sm:px-8">
          <span className="flex size-8 items-center justify-center rounded-lg bg-caramel/15 text-ember ring-1 ring-caramel/25">
            <ScrollText className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold text-crema">{doc.h1}</p>
            <p className="truncate text-xs text-sand/70">
              {doc.updatedIso && doc.updatedLabel
                ? `${doc.updatedPrefix} ${doc.updatedLabel}`
                : doc.subtitle || "Documento ufficiale"}
            </p>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[15.5rem_1fr]">
          <LegalToc sections={doc.sections} active={active} siblings={siblings} />

          {/* corpo tipografico */}
          <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
            <div className="mx-auto max-w-2xl space-y-10">
              {doc.sections.map((sec, i) => (
                <article key={sec.id} id={sec.id} className="scroll-mt-28">
                  <header className="mb-5 border-b border-sand/12 pb-3">
                    <p className="font-mono text-[0.65rem] tabular-nums tracking-wider text-sand/45">
                      § {String(i + 1).padStart(2, "0")}
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-semibold text-crema sm:text-3xl">{sec.title}</h2>
                  </header>
                  <div className="space-y-4 text-[0.98rem] leading-relaxed text-crema/75">
                    {sec.blocks.map((b, bi) => (
                      <Block key={bi} block={b} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p>
          <LegalProse text={block.text} />
        </p>
      );
    case "label":
      return (
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">
          <LegalProse text={block.text} />
        </p>
      );
    case "h3":
      return (
        <h3 className="pt-2 font-display text-xl font-semibold text-crema">
          <LegalProse text={block.text} />
        </h3>
      );
    case "h4":
      return (
        <h4 className="font-display text-lg font-semibold text-crema/90">
          <LegalProse text={block.text} />
        </h4>
      );
    case "ul":
      return (
        <ul className="list-none space-y-2 pl-0">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-caramel/70" aria-hidden />
              <span className="min-w-0">
                <LegalProse text={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-sand/15">
          <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-espresso/60">
                {block.headers.map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold text-crema">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-sand/10">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-3 text-crema/70">
                      <LegalProse text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "fact":
      return (
        <div className="rounded-2xl bg-espresso/50 p-4 ring-1 ring-sand/12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-lg font-semibold text-crema">{block.title}</h4>
            {block.badge && (
              <span className="rounded-full bg-caramel/15 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ember ring-1 ring-caramel/25">
                {block.badge}
              </span>
            )}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-crema/70">
            {block.items.map((it, i) => (
              <li key={i}>
                {it.k ? (
                  <>
                    <span className="font-semibold text-crema/90">{it.k}</span>
                    {" — "}
                    <LegalProse text={it.v} />
                  </>
                ) : (
                  <LegalProse text={it.v} />
                )}
              </li>
            ))}
          </ul>
        </div>
      );
    case "kvlist":
      return (
        <ul className="space-y-1.5 text-sm">
          {block.items.map((it, i) => (
            <li key={i}>
              {it.k ? (
                <>
                  <span className="font-semibold text-crema/90">{it.k}</span>
                  {" — "}
                  <LegalProse text={it.v} />
                </>
              ) : (
                <LegalProse text={it.v} />
              )}
            </li>
          ))}
        </ul>
      );
    case "pre":
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-espresso/70 p-4 font-mono text-[0.78rem] leading-relaxed text-crema/70 ring-1 ring-sand/12 sm:p-5 sm:text-[0.82rem]">
          {block.text}
        </pre>
      );
    case "cta":
      return (
        <p className="pt-2">
          <SmartLink
            href={page(block.href)}
            className="inline-flex items-center rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5"
          >
            {block.label}
          </SmartLink>
        </p>
      );
    default:
      return null;
  }
}
