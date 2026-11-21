"use client";

import { useMemo, useState } from "react";
import { Check, Code2, Copy, ExternalLink } from "lucide-react";
import type { BoardListing } from "@/lib/boards";
import { page, SITE_ORIGIN } from "@/lib/site";
import { showToast } from "@/components/ui";
import { PageSection as Section } from "@/components/dashboard/guild/bits";
import { SmartLink } from "@/components/SmartLink";
import { EmbedWidgetView } from "@/components/vetrina/EmbedWidget";
import { cn } from "@/lib/cn";

const SIZES = [
  { id: "compact", label: "Compatto", width: 360, height: 140 },
  { id: "wide", label: "Largo", width: 480, height: 140 },
] as const;

/** Widget embed (stile top.gg): anteprima + codice iframe da mettere sul sito. */
export function EmbedTab({ listing }: { listing: BoardListing }) {
  const [sizeId, setSizeId] = useState<(typeof SIZES)[number]["id"]>("compact");
  const [copied, setCopied] = useState(false);
  const size = SIZES.find((s) => s.id === sizeId) || SIZES[0];

  const embedUrl = useMemo(() => {
    const slug = encodeURIComponent(listing.slug || listing.id);
    return `${SITE_ORIGIN}${page(`/vetrina/embed/?slug=${slug}`)}`;
  }, [listing.slug, listing.id]);

  const snippet = useMemo(() => {
    const title = (listing.name || "Vetrina").replace(/"/g, "&quot;");
    return `<iframe src="${embedUrl}" width="${size.width}" height="${size.height}" style="border:0;border-radius:16px;overflow:hidden;max-width:100%" loading="lazy" title="${title}"></iframe>`;
  }, [embedUrl, size.width, size.height, listing.name]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      showToast("Codice embed copiato");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("Non riesco a copiare il codice", true);
    }
  }

  if (listing.status !== "approved") {
    return (
      <Section
        title="Widget embed"
        text="Il widget è disponibile quando la scheda è approvata e pubblica in vetrina."
      >
        <p className="rounded-2xl bg-crema/5 px-4 py-3 text-sm text-crema/60 ring-1 ring-sand/12">
          Stato attuale: <span className="font-semibold text-crema/80">{listing.status}</span>
        </p>
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title="Widget embed"
        text={
          listing.kind === "server"
            ? "Metti questo riquadro sul sito o nel server di supporto: Vota + Bump verso la scheda."
            : "Metti questo riquadro sul tuo sito: mostra la scheda e un bottone per votare, come su top.gg."
        }
      >
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSizeId(s.id)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold ring-1 transition",
                sizeId === s.id
                  ? "bg-caramel/20 text-ember ring-caramel/40"
                  : "bg-crema/5 text-crema/65 ring-sand/15 hover:bg-crema/10 hover:text-crema",
              )}
            >
              {s.label}
              <span className="ml-1.5 text-crema/40">
                {s.width}×{s.height}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl bg-espresso/60 p-5 ring-1 ring-sand/12 sm:p-6">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-crema/40">Anteprima</p>
          {/* Inline (non iframe): il CSP del sito bloccava frame same-origin senza frame-src 'self'. */}
          <div className="mt-4 flex justify-center overflow-x-auto">
            <EmbedWidgetView listing={listing} width={size.width} className="shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)]" />
          </div>
        </div>
      </Section>

      <Section title="Codice HTML" text="Incolla questo iframe nella pagina del tuo sito o nella bio.">
        <div className="relative">
          <pre className="overflow-x-auto rounded-2xl bg-espresso/80 p-4 pr-28 text-xs leading-relaxed text-crema/80 ring-1 ring-sand/12 sm:text-sm">
            <code>{snippet}</code>
          </pre>
          <button
            type="button"
            onClick={() => void copy()}
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-3.5 py-2 text-xs font-bold text-ink shadow-sm transition hover:-translate-y-0.5"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copiato" : "Copia"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={embedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema/80 ring-1 ring-sand/20 hover:bg-crema/12"
          >
            <Code2 className="size-4" /> Apri widget
            <ExternalLink className="size-3.5 opacity-60" />
          </a>
          <SmartLink
            href={page(`/vetrina/scheda/?slug=${encodeURIComponent(listing.slug)}`)}
            className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema/80 ring-1 ring-sand/20 hover:bg-crema/12"
          >
            Vedi la scheda
          </SmartLink>
        </div>
      </Section>

      {listing.kind === "server" ? (
        <Section
          title="Bump nel server di supporto"
          text="Oltre all’embed: attiva la tab Bump e ricorda `/bump` in un canale #info o #bump del support server."
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm text-crema/70">
            <li>Invita Vinili &amp; Caffè nel server (o nel support) e apri Gestisci → Bump.</li>
            <li>Accendi ringraziamento + promemoria; usa un preset «/bump».</li>
            <li>Incolla il widget sopra sul sito del support, oppure un messaggio sticky con il link scheda.</li>
            <li>
              In Discord: «Ogni 2 ore qualcuno digita <code className="rounded bg-espresso/70 px-1.5 py-0.5 text-crema/85">/bump</code> per tenere la community in vetrina.»
            </li>
          </ol>
          <SmartLink
            href={page(`/vetrina/modifica/?id=${encodeURIComponent(listing.id)}&tab=bump`)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-caramel/15 px-4 py-2 text-sm font-semibold text-ember ring-1 ring-caramel/30 hover:bg-caramel/25"
          >
            Apri impostazioni Bump
          </SmartLink>
        </Section>
      ) : (
        <Section
          title="Support server"
          text="Collega un server di supporto in Connessioni, poi lì attiva Bump sulla scheda server (se in vetrina) e metti questo widget nella bio del bot."
        >
          <SmartLink
            href={page(`/vetrina/modifica/?id=${encodeURIComponent(listing.id)}&tab=connessioni`)}
            className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema/80 ring-1 ring-sand/20 hover:bg-crema/12"
          >
            Vai a Connessioni
          </SmartLink>
        </Section>
      )}
    </div>
  );
}
