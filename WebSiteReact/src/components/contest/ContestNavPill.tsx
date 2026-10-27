"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Ghost } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchContestHighlight, type ContestHighlight } from "@/lib/contest";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";

/** Pill contest: dentro la navbar; clone fixed solo se la nav è nascosta. */
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
  }, [token, pathname]);

  if (!item) return null;
  const href = item.href || `/contest/${item.eventKey}/`;
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  /* Niente pill contest sull’immersione evento / puzzle. */
  if (p === "/evento/" || p.startsWith("/evento/") || p === "/puzzle/" || p.startsWith("/puzzle/")) {
    return null;
  }
  /* Nascondi solo sulla pagina del contest evidenziato (sei già lì). */
  if (
    pathname === href ||
    pathname === `/contest/${item.eventKey}` ||
    pathname.startsWith(`/contest/${item.eventKey}/`)
  ) {
    return null;
  }

  const label = item.pillLabel || "Contest";

  return (
    <SmartLink
      href={href}
      className={cn(
        "inline-flex max-w-[10rem] items-center gap-1.5 rounded-full bg-caramel/95 px-3 py-1.5 text-xs font-semibold tracking-wide text-ink shadow-[0_8px_24px_-10px_rgba(0,0,0,0.75)] ring-1 ring-sand/45 transition-colors hover:bg-sand",
        className,
      )}
      title={item.title}
    >
      <Ghost className="size-3.5 shrink-0" strokeWidth={2.25} />
      <span className="truncate">{label}</span>
    </SmartLink>
  );
}
