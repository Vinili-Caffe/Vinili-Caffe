"use client";

import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  icon?: LucideIcon;
  title: string;
  text?: string;
  action?: React.ReactNode;
  className?: string;
  tone?: "default" | "error";
};

/** Stato vuoto / errore uniforme (board community). */
export function EmptyState({ icon: Icon = Inbox, title, text, action, className, tone = "default" }: Props) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-col items-center justify-center rounded-3xl px-6 py-12 text-center ring-1",
        tone === "error" ? "bg-red-500/10 ring-red-400/25" : "bg-roast/50 ring-sand/12",
        className,
      )}
    >
      <span
        className={cn(
          "mb-4 flex size-12 items-center justify-center rounded-2xl ring-1",
          tone === "error" ? "bg-red-500/15 text-red-200 ring-red-400/30" : "bg-crema/8 text-caramel ring-sand/15",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="font-display text-xl font-semibold text-crema">{title}</p>
      {text ? <p className="mt-2 max-w-sm text-sm text-crema/55">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function BoardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-3xl bg-crema/[0.04] ring-1 ring-sand/10" />
      ))}
    </div>
  );
}
