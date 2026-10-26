import { Check, Sparkles } from "lucide-react";
import type { Perk } from "@/lib/perks";
import { cn } from "@/lib/cn";
import { RichText } from "../RichText";

export function NewTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center gap-1 self-start overflow-hidden rounded-full bg-ember/15 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-ember ring-1 ring-ember/30",
        className,
      )}
    >
      <Sparkles className="size-3" /> Nuovo
      {/* Shiny Text (React Bits): un riflesso che passa ogni tanto; solo transform */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent animate-shine motion-reduce:hidden"
      />
    </span>
  );
}

export function PerkList({ perks, className }: { perks: Perk[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {perks.map((p) => (
        <li key={p.text} className="flex gap-2.5 text-[0.95rem] leading-relaxed text-crema/75">
          <Check className="mt-1 size-4 shrink-0 text-caramel" />
          <span className="min-w-0 inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0">
              <RichText text={p.text} />
            </span>
            {p.isNew ? <NewTag /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
