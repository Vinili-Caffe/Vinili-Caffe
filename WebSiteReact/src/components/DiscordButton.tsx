"use client";

import { motion } from "motion/react";
import { DISCORD_INVITE } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" aria-hidden className={className} fill="currentColor">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.44-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

export function DiscordButton({ label, className }: { label?: string; className?: string }) {
  const { t } = useI18n();
  return (
    <motion.a
      href={DISCORD_INVITE}
      target="_blank"
      rel="noopener"
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={cn(
        "group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-[#5865f2] px-6 py-3.5 font-semibold text-white",
        "shadow-[0_10px_30px_-10px_rgba(88,101,242,0.8)] ring-1 ring-white/15",
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/20 blur-md transition-transform duration-700 group-hover:translate-x-[300%]" />
      <DiscordIcon className="size-5" />
      {label ?? t("common.discord")}
    </motion.a>
  );
}
