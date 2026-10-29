"use client";

import {
  CircleHelp,
  CreditCard,
  FileText,
  LayoutDashboard,
  Lightbulb,
  Server,
  Star,
  UserRound,
} from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";
import { DASH_NAV, dashHref, type DashNavId } from "@/lib/dashboard";

const ICONS: Record<DashNavId, React.ReactNode> = {
  servers: <Server className="size-4" />,
  guild: <LayoutDashboard className="size-4" />,
  premium: <CreditCard className="size-4" />,
  profilo: <UserRound className="size-4" />,
  faq: <CircleHelp className="size-4" />,
  feedback: <Lightbulb className="size-4" />,
  recensioni: <Star className="size-4" />,
  transcript: <FileText className="size-4" />,
};

/** Sidebar stub del mixer: canali verso le aree dashboard. */
export function DashboardSidebar({ active = "servers" }: { active?: DashNavId }) {
  return (
    <aside
      className="rounded-2xl bg-espresso/80 p-3 ring-1 ring-sand/15 sm:p-3.5"
      aria-label="Navigazione dashboard"
    >
      <div className="mb-3 flex items-center gap-2 px-1.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-caramel/15 text-[0.65rem] font-bold tracking-wider text-ember ring-1 ring-caramel/30">
          VU
        </span>
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-caramel">Dashboard</p>
          <p className="truncate text-xs text-crema/45">Dashboard bot</p>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible sm:pb-0" aria-label="Aree dashboard">
        {DASH_NAV.map((item) => {
          const on = item.id === active;
          return (
            <SmartLink
              key={item.id}
              href={dashHref(item.href)}
              title={item.hint}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                on
                  ? "bg-caramel/20 text-crema ring-1 ring-caramel/40"
                  : "text-crema/65 hover:bg-crema/[0.05] hover:text-crema",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg ring-1",
                  on ? "bg-caramel/20 text-ember ring-caramel/35" : "bg-crema/[0.04] text-sand/70 ring-sand/15",
                )}
              >
                {ICONS[item.id]}
              </span>
              <span className="whitespace-nowrap">{item.label}</span>
            </SmartLink>
          );
        })}
      </nav>
    </aside>
  );
}
