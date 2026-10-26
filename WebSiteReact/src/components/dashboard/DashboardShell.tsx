"use client";

import { usePathname } from "next/navigation";
import {
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  MessageSquarePlus,
  NotebookPen,
  ScrollText,
  UserRound,
} from "lucide-react";
import { SiteShell } from "@/components/SiteShell";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";

/** Navigazione densa del pannello bot (stile mixer / strumento). */
const NAV = [
  { href: "/dashboard/", label: "Server", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/faq/", label: "FAQ", icon: HelpCircle },
  { href: "/dashboard/feedback/", label: "Feedback", icon: MessageSquarePlus },
  { href: "/dashboard/recensioni/", label: "Recensioni", icon: NotebookPen },
  { href: "/dashboard/premium/", label: "Premium", icon: CreditCard },
  { href: "/dashboard/profilo/", label: "Profilo", icon: UserRound },
  { href: "/dashboard/transcript/", label: "Transcript", icon: ScrollText },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (exact) return p === href;
  return p === href || p.startsWith(href);
}

export function DashboardShell({
  title,
  lead,
  children,
  bare,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
  /** Senza sidebar (es. transcript a schermo intero). */
  bare?: boolean;
}) {
  const pathname = usePathname() || "/";

  if (bare) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32">{children}</div>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32">
        <header className="mb-6 border-b border-sand/10 pb-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-caramel">Dashboard</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-crema sm:text-4xl">{title}</h1>
          {lead && <p className="mt-2 max-w-2xl text-sm text-crema/55">{lead}</p>}
        </header>

        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          <aside className="lg:w-52 lg:shrink-0">
            <nav
              aria-label="Dashboard"
              className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
            >
              {NAV.map((item) => {
                const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
                const Icon = item.icon;
                return (
                  <SmartLink
                    key={item.href}
                    href={page(item.href)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-caramel/15 text-ember ring-1 ring-caramel/30"
                        : "text-crema/55 hover:bg-crema/5 hover:text-crema",
                    )}
                  >
                    <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                    {item.label}
                  </SmartLink>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </SiteShell>
  );
}
