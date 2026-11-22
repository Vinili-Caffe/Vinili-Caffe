"use client";

import { Delete } from "lucide-react";
import { KEYBOARD_ROWS, type KeyMarks, type Mark } from "@/lib/wordle";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";

const markClass = (m?: Mark) => {
  if (m === "g") return "bg-[#58a64b] text-white ring-[#58a64b]/60";
  if (m === "y") return "bg-[#c9a227] text-ink ring-[#c9a227]/50";
  if (m === "b") return "bg-mocha text-crema/45 ring-sand/10";
  return "bg-crema/8 text-crema ring-sand/20 hover:bg-crema/14";
};

type Props = {
  keyMarks: KeyMarks;
  disabled?: boolean;
  onKey: (key: string) => void;
  /** Tasti più bassi (Wordle ×4). */
  compact?: boolean;
};

/** Tastiera Wordle del minigioco. */
export function WordleKeyboard({ keyMarks, disabled, onKey, compact }: Props) {
  const { t } = useI18n();
  const keyH = compact
    ? "h-9 sm:h-10"
    : "h-12 sm:h-14";
  return (
    <div
      className={cn("mx-auto flex w-full flex-col gap-1", compact ? "max-w-3xl gap-1" : "max-w-lg gap-1.5")}
      role="group"
      aria-label={t("wordle.keyboardAria")}
    >
      {KEYBOARD_ROWS.map((line, idx) => (
        <div key={line} className={cn("flex justify-center", compact ? "gap-0.5 sm:gap-1" : "gap-1 sm:gap-1.5")}>
          {idx === 2 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onKey("Enter")}
              aria-label={t("wordle.enterAria")}
              className={cn(
                "inline-flex min-w-0 flex-[1.6] items-center justify-center rounded-xl px-2 text-[0.7rem] font-bold uppercase leading-none tracking-wide ring-1 transition sm:min-w-[4rem] sm:flex-none sm:text-xs",
                keyH,
                "bg-caramel/20 text-ember ring-caramel/35 hover:bg-caramel/30 disabled:opacity-50",
              )}
            >
              {t("wordle.enter")}
            </button>
          )}
          {line.split("").map((ch) => (
            <button
              key={ch}
              type="button"
              disabled={disabled}
              onClick={() => onKey(ch)}
              aria-label={t("wordle.letterAria", { letter: ch.toUpperCase() })}
              className={cn(
                "inline-flex min-w-0 max-w-10 flex-1 items-center justify-center rounded-xl text-sm font-bold uppercase leading-none ring-1 transition sm:w-10 sm:flex-none sm:text-base",
                keyH,
                "disabled:opacity-50",
                markClass(keyMarks[ch]),
              )}
            >
              {ch.toUpperCase()}
            </button>
          ))}
          {idx === 2 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onKey("Backspace")}
              aria-label={t("wordle.backspaceAria")}
              className={cn(
                "inline-flex min-w-0 flex-[1.6] items-center justify-center rounded-xl px-2 ring-1 transition sm:min-w-[4rem] sm:flex-none",
                keyH,
                "bg-crema/8 text-crema ring-sand/20 hover:bg-crema/14 disabled:opacity-50",
              )}
            >
              <Delete className="size-4 sm:size-5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
