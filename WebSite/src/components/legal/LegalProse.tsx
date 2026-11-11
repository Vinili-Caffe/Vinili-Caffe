import { page } from "@/lib/site";
import { SmartLink } from "../SmartLink";

/**
 * Mini-markup legale: **grassetto**, *corsivo*, `codice`,
 * [[etichetta|/percorso/]] oppure [etichetta](https://… / /percorso/).
 * A capo nel testo → <br />.
 */
export function LegalProse({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  return (
    <span className={className}>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          <Inline text={line} />
        </span>
      ))}
    </span>
  );
}

const LINK_CLASS =
  "font-medium text-caramel underline decoration-caramel/40 underline-offset-4 transition-colors hover:text-ember";

function ProseLink({ href, label }: { href: string; label: string }) {
  const resolved = href.startsWith("/") ? page(href) : href;
  const external = /^https?:/.test(resolved) && !resolved.includes("viniliecaffe.it");
  return (
    <SmartLink href={resolved} {...(external ? { target: "_blank", rel: "noopener" } : {})} className={LINK_CLASS}>
      {label}
    </SmartLink>
  );
}

function Inline({ text }: { text: string }) {
  /* wiki [[a|b]] prima dei markdown [a](b), così non si spezzano */
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-crema">
              {p.slice(2, -2)}
            </strong>
          );
        }
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
          return (
            <em key={i} className="italic text-crema/85">
              {p.slice(1, -1)}
            </em>
          );
        }
        if (p.startsWith("`") && p.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-espresso/80 px-1.5 py-0.5 font-mono text-[0.9em] text-ember ring-1 ring-sand/15">
              {p.slice(1, -1)}
            </code>
          );
        }
        const wiki = p.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
        if (wiki) return <ProseLink key={i} label={wiki[1]} href={wiki[2]} />;
        const md = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (md) return <ProseLink key={i} label={md[1]} href={md[2]} />;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
