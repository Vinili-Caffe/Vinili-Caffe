"use client";

import React, { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import { AnimatePresence, motion, type MotionProps } from "motion/react";
import { cn } from "@/lib/cn";

export function AnimatedListItem({ children }: { children: React.ReactNode }) {
  const animations: MotionProps = {
    initial: { scale: 0.92, opacity: 0, y: -8 },
    animate: { scale: 1, opacity: 1, y: 0, originY: 0 },
    exit: { scale: 0.92, opacity: 0, y: -6 },
    transition: { type: "spring", stiffness: 350, damping: 40 },
  };
  return (
    <motion.div {...animations} layout className="w-full">
      {children}
    </motion.div>
  );
}

export interface AnimatedListProps extends ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode;
  /** ms tra un item e il successivo (reveal a cascata). */
  delay?: number;
  /** Se true, mostra subito tutti gli item (solo animazione enter). */
  showAll?: boolean;
}

/** Lista a cascata (Magic UI) — usata per le notifiche in arrivo. */
export const AnimatedList = React.memo(function AnimatedList({
  children,
  className,
  delay = 120,
  showAll = false,
  ...props
}: AnimatedListProps) {
  const childrenArray = useMemo(() => React.Children.toArray(children), [children]);
  const [index, setIndex] = useState(showAll ? Math.max(0, childrenArray.length - 1) : 0);

  useEffect(() => {
    if (showAll) {
      setIndex(Math.max(0, childrenArray.length - 1));
      return;
    }
    setIndex(0);
  }, [childrenArray.length, showAll]);

  useEffect(() => {
    if (showAll) return;
    if (index >= childrenArray.length - 1) return;
    const t = window.setTimeout(() => setIndex((i) => i + 1), delay);
    return () => window.clearTimeout(t);
  }, [index, delay, childrenArray.length, showAll]);

  const itemsToShow = useMemo(() => {
    const slice = childrenArray.slice(0, index + 1);
    return slice;
  }, [index, childrenArray]);

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)} {...props}>
      <AnimatePresence initial={false}>
        {itemsToShow.map((item) => (
          <AnimatedListItem key={(item as React.ReactElement).key ?? String(item)}>{item}</AnimatedListItem>
        ))}
      </AnimatePresence>
    </div>
  );
});
