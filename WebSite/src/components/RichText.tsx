import { page } from "@/lib/site";
import { SmartLink } from "./SmartLink";

/** Mini-markup dei testi: **grassetto**, [[etichetta|/percorso/ o https://…]], <<༄ Ruolo>> (menzione Discord). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|<<[^>]+>>)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <strong key={i} className="font-semibold text-crema">{p.slice(2, -2)}</strong>;
        if (p.startsWith("<<"))
          return (
            <span
              key={i}
              className="inline-block max-w-full break-words rounded-md bg-[#5865f2]/20 px-1.5 py-0.5 font-medium leading-snug text-[#c9cdfb] light:bg-[#5865f2]/15 light:text-[#3c45a5]"
            >
              @{p.slice(2, -2)}
            </span>
          );
        const m = p.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
        if (m) {
          const href = m[2].startsWith("/") ? page(m[2]) : m[2];
          const external = /^https?:/.test(href) && !href.includes("viniliecaffe.it");
          return (
            <SmartLink
              key={i}
              href={href}
              {...(external ? { target: "_blank", rel: "noopener" } : {})}
              className="font-semibold text-caramel underline decoration-caramel/45 underline-offset-[3px] transition-colors hover:text-ember hover:decoration-ember/60"
            >
              {m[1]}
            </SmartLink>
          );
        }
        return p;
      })}
    </>
  );
}
