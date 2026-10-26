"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/cn";
import { AnimatedThemeToggler } from "./magicui/animated-theme-toggler";

const PREFS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Chiaro", icon: Sun },
  { id: "dark", label: "Scuro", icon: Moon },
  { id: "auto", label: "Auto", icon: Monitor },
];

/** Switch chiaro/scuro con reveal Magic UI (View Transitions). */
export function ThemeSwitch({ className }: { className?: string }) {
  return <AnimatedThemeToggler className={className} variant="circle" duration={480} />;
}

/** Three-way light / dark / auto (for user menu or footer). */
export function ThemePrefRow({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  return (
    <div
      className={cn("flex items-center gap-1 rounded-xl bg-crema/6 p-1 ring-1 ring-sand/12", className)}
      role="radiogroup"
      aria-label="Tema"
    >
      {PREFS.map(({ id, label, icon: Icon }) => {
        const on = pref === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => setPref(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
              on ? "bg-caramel/20 text-ember ring-1 ring-caramel/30" : "text-crema/55 hover:bg-crema/8 hover:text-crema",
            )}
          >
            <Icon className="size-3.5" />
            <span className="hidden min-[380px]:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
