"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRichFx } from "@/components/effects/DeviceFxProvider";
import { cn } from "@/lib/cn";

/**
 * Rotating Text (da React Bits): una parola che cambia ogni pochi secondi, lettere che entrano dal basso
 * una dopo l'altra. Il riquadro si allarga/stringe con la parola. Con DeviceFx off/lite resta la prima.
 */
export function RotatingText({ words, interval = 2400, className }: { words: string[]; interval?: number; className?: string }) {
  const rich = useRichFx();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!rich || words.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => window.clearInterval(id);
  }, [rich, words.length, interval]);

  const word = words[i] || "";
  return (
    <motion.span
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn("relative inline-flex overflow-hidden align-bottom", className)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={word} className="inline-flex whitespace-pre" aria-label={word}>
          {Array.from(word).map((ch, k) => (
            <motion.span
              key={k}
              aria-hidden
              initial={{ y: "110%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-120%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 28, delay: k * 0.025 }}
              className="inline-block"
            >
              {ch}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}
