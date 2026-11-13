"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { applyPartnershipFilters, type PartnershipFilterFlags } from "@/lib/partnership-filters";
import { ExpandableTextarea, FormGroup, miniBtn } from "./bits";
import { MessagePreview } from "./MessagePreview";

type Named = { id: string; name: string };

/* esempio con un po' di tutto, così ogni filtro cambia qualcosa */
const SAMPLE = [
  "||☕ Benvenuti nel nostro server!|| Musica, chiacchiere e caffè​ <:vinile:1234567890123456789>",
  "",
  "Chiedete a <@123456789012345678> o passate in <#123456789012345678>: @everyone è il benvenuto!",
  "Il nostro sito: https://esempio.it",
  "https://discord.gg/esempio",
  "https://discord.gg/altroserver",
].join("\n");

/** Prova dei filtri: scrivi una descrizione e vedi subito come la lascia il bot con i filtri accesi. */
export function PartnerFiltersPreview({ filters, roles = [], channels = [] }: { filters: PartnershipFilterFlags; roles?: Named[]; channels?: Named[] }) {
  const [text, setText] = useState(SAMPLE);
  const out = applyPartnershipFilters(text, filters);
  const changed = out !== text.trim();
  return (
    <FormGroup
      title="Prova i filtri"
      description="Scrivi o incolla una descrizione: qui sotto vedi come la manda il bot con i filtri accesi adesso."
      action={
        text !== SAMPLE ? (
          <button type="button" className={miniBtn} onClick={() => setText(SAMPLE)}>
            <RotateCcw className="size-3.5" aria-hidden /> Esempio
          </button>
        ) : null
      }
    >
      <ExpandableTextarea name="partner-filter-test" value={text} rows={6} maxLength={4000} onChange={(e) => setText(e.target.value)} aria-label="Descrizione di prova" />
      {out ? (
        <MessagePreview text={out} roles={roles} channels={channels} />
      ) : (
        <p className="mt-3 text-sm text-crema/55">Con questi filtri non resta niente della descrizione.</p>
      )}
      <p className="mt-2 text-xs text-crema/50">{changed ? "I filtri hanno cambiato il testo." : "Con questi filtri il testo resta uguale."}</p>
    </FormGroup>
  );
}
