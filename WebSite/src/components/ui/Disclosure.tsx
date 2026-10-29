"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Accordion custom al posto di &lt;details&gt;/&lt;summary&gt; nativi. */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  className,
  titleClassName,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  titleClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const uid = useId();
  return (
    <div className={cn("rounded-xl bg-espresso/30 ring-1 ring-sand/10", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-semibold text-crema transition hover:text-crema",
          titleClassName,
        )}
      >
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-crema/50 transition", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={`${uid}-panel`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-sand/10 px-3 pb-3 pt-2">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
