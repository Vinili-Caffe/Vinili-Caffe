"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Ghost } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchContestHighlight, type ContestHighlight } from "@/lib/contest";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";

/** Pill contest in navbar: link diretto su tutte le pagine (nascosta sulla pagina del contest attivo). */
export function ContestNavPill({ className }: { className?: string }) {
  const { token } = useAuth();
  const pathname = usePathname() || "/";
  const [item, setItem] = useState<ContestHighlight | null>(null);

  useEffect(() => {
    let alive = true;
    fetchContestHighlight(token).then((h) => {
      if (alive) setItem(h);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (!item) return null;
  const href = item.href || `/contest/${item.eventKey}/`;
  if (pathname === href || pathname === `/contest/${item.eventKey}` || pathname.startsWith(`/contest/${item.eventKey}/`)) {
    return null;
  }

  const label = item.pillLabel || "Contest";

  return (
    <SmartLink
      href={href}
      className={cn(
        "inline-flex max-w-[9.5rem] items-center gap-1 rounded-full bg-caramel/90 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-ink ring-1 ring-sand/40 transition-colors hover:bg-sand sm:max-w-none sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs",
        className,
      )}
      title={item.title}
    >
      <Ghost className="size-3.5 shrink-0 sm:size-3.5" strokeWidth={2.25} />
      <span className="truncate">{label}</span>
    </SmartLink>
  );
}
