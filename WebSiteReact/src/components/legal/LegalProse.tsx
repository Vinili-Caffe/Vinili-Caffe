import { page } from "@/lib/site";
import { SmartLink } from "../SmartLink";

/**
 * Mini-markup legale (da HTML vecchio): **grassetto**, *corsivo*, `codice`, [[etichetta|/percorso/]].
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

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\])/g);
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
        const m = p.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
        if (m) {
          const href = m[2].startsWith("/") ? page(m[2]) : m[2];
          const external = /^https?:/.test(href) && !href.includes("viniliecaffe.it");
          return (
            <SmartLink
              key={i}
              href={href}
              {...(external ? { target: "_blank", rel: "noopener" } : {})}
              className="font-medium text-caramel underline decoration-caramel/40 underline-offset-4 transition-colors hover:text-ember"
            >
              {m[1]}
            </SmartLink>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
