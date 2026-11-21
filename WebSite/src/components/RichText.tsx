"use client";

import { page } from "@/lib/site";
import { roleIdFromLabel } from "@/lib/official-role-ids";
import { useGuildMentions } from "./GuildMentionsProvider";
import { SmartLink } from "./SmartLink";

/** Mini-markup: **grassetto**, [[etichetta|/percorso/]], <<ruolo>> (nome Discord live se noto). */
export function RichText({ text }: { text: string }) {
  const catalog = useGuildMentions();
  const parts = text.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|<<[^>]+>>)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <strong key={i} className="font-semibold text-crema">{p.slice(2, -2)}</strong>;
        if (p.startsWith("<<")) {
          const inner = p.slice(2, -2).trim();
          const id =
            roleIdFromLabel(inner) ||
            inner.match(/^(?:@&|role:)?(\d{16,22})$/)?.[1] ||
            null;
          const live = id && catalog.roles[id] ? catalog.roles[id] : inner.replace(/^@&/, "");
          return (
            <span
              key={i}
              className="inline-block max-w-full break-words rounded-md bg-[#5865f2]/20 px-1.5 py-0.5 font-medium leading-snug text-[#c9cdfb] light:bg-[#5865f2]/15 light:text-[#3c45a5]"
              title={id ? `ruolo ${id}` : undefined}
            >
              @{live}
            </span>
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
