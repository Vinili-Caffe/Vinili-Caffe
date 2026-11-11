import { SmartLink } from "./SmartLink";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";

/** Avviso diritti + link segnalazioni copyright sugli upload pubblici. */
export function UploadRightsHint({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <p className={cn("text-xs leading-relaxed", tone === "light" ? "text-ink/50" : "text-crema/45", className)}>
      Caricando dichiari di avere i diritti sull&apos;immagine. Segnalazioni copyright:{" "}
      <SmartLink href={page("/copyright/#segnalazioni-e-dmca")} className={cn("font-semibold underline-offset-2 hover:underline", tone === "light" ? "text-[#9a5a24]" : "text-ember")}>
        procedura e rimozione
      </SmartLink>
      .
    </p>
  );
}
