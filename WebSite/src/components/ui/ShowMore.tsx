import { cn } from "@/lib/cn";

type Props = {
  remaining: number;
  onClick: () => void;
  /** Default: bordered footer row (liste in card). Pass `plain` for griglie senza card. */
  variant?: "footer" | "plain";
  className?: string;
};

/** Pulsante "Mostra altri" con conteggio rimanenti — slice client-side, niente lib extra. */
export function ShowMoreButton({ remaining, onClick, variant = "footer", className }: Props) {
  if (remaining <= 0) return null;
  return (
    <div
      className={cn(
        variant === "footer" && "border-t border-sand/10 px-4 py-3 sm:px-6",
        variant === "plain" && "mt-4 flex justify-center",
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-xl bg-crema/6 py-2.5 text-sm font-semibold text-crema/75 ring-1 ring-sand/15 transition-colors hover:bg-crema/10 hover:text-crema",
          variant === "footer" ? "w-full" : "px-6",
        )}
      >
        Mostra altri ({remaining} rimanenti)
      </button>
    </div>
  );
}
