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

  /* Solo logo: su telefono la label rubava posto alla campanella notifiche. */
  return (
    <SmartLink
      href={href}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-caramel/95 text-ink shadow-[0_8px_24px_-10px_rgba(0,0,0,0.75)] ring-1 ring-sand/45 transition-colors hover:bg-sand",
        className,
      )}
      title={item.title || label}
      aria-label={item.title || label}
    >
      <Ghost className="size-[1.15rem] shrink-0" strokeWidth={2.25} />
    </SmartLink>
  );
}
