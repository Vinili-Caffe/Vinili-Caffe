"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Bot, Users } from "lucide-react";
import { LeaderboardBrowser } from "./LeaderboardBrowser";
import { BotsLeaderboardBrowser } from "./BotsLeaderboardBrowser";
import type { LeaderPage } from "@/lib/leaderboard";
import type { BotsLeaderPage } from "@/lib/bots-leaderboard";
import { cn } from "@/lib/cn";

export type ClassificheScope = "community" | "bots";

const SCOPES: { id: ClassificheScope; label: string; icon: typeof Users }[] = [
  { id: "community", label: "Community", icon: Users },
  { id: "bots", label: "Bots", icon: Bot },
];

function readScopeFromUrl(): ClassificheScope {
  if (typeof window === "undefined") return "community";
  try {
    const v = new URLSearchParams(window.location.search).get("scope");
    return v === "bots" ? "bots" : "community";
  } catch {
    return "community";
  }
}

function writeScopeToUrl(scope: ClassificheScope) {
  try {
    const url = new URL(window.location.href);
    if (scope === "community") url.searchParams.delete("scope");
    else url.searchParams.set("scope", "bots");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

export function ClassificheBrowser({
  initialCommunity,
  initialBots,
  initialScope = "community",
}: {
  initialCommunity: LeaderPage | null;
  initialBots: BotsLeaderPage | null;
  initialScope?: ClassificheScope;
}) {
  const [scope, setScope] = useState<ClassificheScope>(initialScope);

  useEffect(() => {
    const fromUrl = readScopeFromUrl();
    if (fromUrl !== scope) setScope(fromUrl);
    // solo al mount: allinea URL (es. link dashboard)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (next: ClassificheScope) => {
    setScope(next);
    writeScopeToUrl(next);
  };

  return (
    <div>
      <LayoutGroup id="classifiche-scope">
        <div
          role="tablist"
          aria-label="Ambito classifiche"
          className="mx-auto mb-8 flex w-fit flex-wrap justify-center gap-1 rounded-full bg-crema/[0.06] p-1 ring-1 ring-sand/15"
        >
          {SCOPES.map((s) => {
            const active = scope === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => pick(s.id)}
                className={cn(
                  "relative isolate inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors",
                  active ? "text-espresso" : "text-crema/65 hover:text-crema",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="classifiche-scope-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-gradient-to-b from-crema to-sand"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="size-4" />
                {s.label}
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div
          key={scope}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {scope === "bots" ? (
            <BotsLeaderboardBrowser initial={initialBots} />
          ) : (
            <LeaderboardBrowser initial={initialCommunity} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
