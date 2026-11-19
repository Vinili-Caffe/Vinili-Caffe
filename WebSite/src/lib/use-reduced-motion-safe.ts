"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Come `useReducedMotion`, ma resta `false` fino a dopo il mount.
 * Così SSR e primo paint client disegnano lo stesso albero (niente React #418
 * quando il browser ha prefers-reduced-motion e il server no).
 */
export function useReducedMotionSafe(): boolean {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && reduce === true;
}
