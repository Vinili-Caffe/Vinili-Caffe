import { SmartLink } from "@/components/SmartLink";
import { EVENTO_BRAND } from "@/lib/evento-starwars";

export function EventoFooter() {
  return (
    <footer className="mt-auto border-t border-[#f0e6c8]/10 bg-[#05070f]/80 px-5 py-8 text-center">
      <p className="font-display text-lg tracking-[0.2em] text-crema/80">{EVENTO_BRAND}</p>
      <p className="mt-2 text-xs text-crema/40">
        Evento community ·{" "}
        <SmartLink href="/" className="text-caramel/90 underline-offset-2 hover:underline">
          Torna a Vinili &amp; Caffè
        </SmartLink>
      </p>
    </footer>
  );
}
