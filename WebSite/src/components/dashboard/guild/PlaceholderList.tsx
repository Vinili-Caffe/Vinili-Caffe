"use client";

import { useState } from "react";
import { Braces, Check } from "lucide-react";
import { Disclosure } from "@/components/ui";
import { cn } from "@/lib/cn";

/* Stessi segnaposto del bot (Bots: partnershipEmbedTemplate.ts + embedVarHelpPacks.ts, testi IT). Senza alias. */
export const PARTNERSHIP_PLACEHOLDERS: { group: string; items: { token: string; hint: string; sample: string }[] }[] = [
  {
    group: "Server",
    items: [
      { token: "{guild}", hint: "Nome del server dove pubblichi la partnership.", sample: "Vinili & Caffè" },
      { token: "{guild.id}", hint: "ID numerico del server.", sample: "1329080093599076474" },
      { token: "{guild.link}", hint: "Invito permanente del canale partnership.", sample: "discord.gg/viniliecaffe" },
      { token: "{guild.icon}", hint: "URL dell'icona del tuo server.", sample: "https://cdn.discordapp.com/icons/…" },
    ],
  },
  {
    group: "Server partner",
    items: [
      { token: "{partner}", hint: "Nome del server con cui fai la partnership.", sample: "Server Partner" },
      { token: "{partner.icon}", hint: "URL dell'icona del server partner.", sample: "https://cdn.discordapp.com/icons/…" },
    ],
  },
  {
    group: "Chi fa la partnership",
    items: [
      { token: "{user}", hint: "Menzione dell'utente che ha fatto la partnership.", sample: "@utente" },
      { token: "{user.username}", hint: "Nome visualizzato dell'utente.", sample: "Utente" },
      { token: "{user.tag}", hint: "Username Discord dell'utente.", sample: "utente" },
      { token: "{user.id}", hint: "ID Discord dell'utente.", sample: "123456789012345678" },
      { token: "{user.points}", hint: "Partner che può ancora spendere nello shop.", sample: "12" },
      { token: "{user.partnerships.count}", hint: "Partnership fatte in tutto.", sample: "40" },
      { token: "{user.partnerships.week}", hint: "Partnership negli ultimi 7 giorni.", sample: "5" },
      { token: "{user.partnerships.day}", hint: "Partnership nelle ultime 24 ore.", sample: "1" },
      { token: "{user.avatar}", hint: "URL dell'avatar dell'utente.", sample: "https://cdn.discordapp.com/avatars/…" },
    ],
  },
  {
    group: "Manager",
    items: [
      { token: "{manager}", hint: "Menzione del manager della partnership.", sample: "@manager" },
      { token: "{manager.username}", hint: "Nome del manager.", sample: "Manager" },
      { token: "{manager.id}", hint: "ID del manager, se c'è.", sample: "123456789012345678" },
      { token: "{manager.badges}", hint: "Badge in vetrina del manager.", sample: "🏅" },
      { token: "{manager.avatar}", hint: "URL dell'avatar del manager.", sample: "https://cdn.discordapp.com/avatars/…" },
    ],
  },
  {
    group: "Altro",
    items: [
      { token: "{ping}", hint: "Ping principale del messaggio (ruolo, @here o @everyone).", sample: "@here" },
      { token: "{pings}", hint: "Tutti i ping applicati insieme.", sample: "@here @Partner" },
      { token: "{timestamp}", hint: "Data della partnership (\"2 minuti fa\").", sample: "adesso" },
      { token: "{rewards.inChannel}", hint: "\" in #canale-premi\" se c'è un canale premi, altrimenti \"!\".", sample: " in #premi" },
    ],
  },
];

/** Valori d'esempio per MessagePreview: { "guild": "Vinili & Caffè", "user.points": "12", … } (più gli alias). */
export const PARTNERSHIP_SAMPLES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const g of PARTNERSHIP_PLACEHOLDERS) for (const it of g.items) out[it.token.slice(1, -1)] = it.sample;
  const alias: Record<string, string> = {
    server: "guild",
    "server.name": "guild",
    "guild.name": "guild",
    "server.id": "guild.id",
    "server.link": "guild.link",
    "server.icon": "guild.icon",
    "partner.name": "partner",
    "partner.avatar": "partner.icon",
    "user.icon": "user.avatar",
    "manager.icon": "manager.avatar",
    "manager.tag": "manager.username",
    points: "user.points",
    "user.points.spendable": "user.points",
    "user.partnerships.total": "user.partnerships.count",
  };
  for (const [a, b] of Object.entries(alias)) out[a] = out[b];
  return out;
})();

/** Elenco dei segnaposto: un clic lo inserisce nel campo dove stavi scrivendo. */
export function PlaceholderList({ onInsert }: { onInsert: (token: string) => void }) {
  const [last, setLast] = useState("");
  return (
    <Disclosure
      title={
        <span className="inline-flex items-center gap-2">
          <Braces className="size-4 text-ember" aria-hidden /> Segnaposto disponibili
        </span>
      }
      className="mt-1"
    >
      <p className="mb-3 text-xs text-crema/60">Clicca un segnaposto per inserirlo dove hai il cursore (titolo o testo). Il bot lo sostituisce col valore vero.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {PARTNERSHIP_PLACEHOLDERS.map((g) => (
          <section key={g.group}>
            <h4 className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/60">{g.group}</h4>
            <ul className="space-y-1">
              {g.items.map((it) => (
                <li key={it.token}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault() /* il campo resta col cursore dov'era */}
                    onClick={() => {
                      onInsert(it.token);
                      setLast(it.token);
                      window.setTimeout(() => setLast((cur) => (cur === it.token ? "" : cur)), 1200);
                    }}
                    className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-crema/[0.05]"
                  >
                    <code className={cn("shrink-0 rounded bg-espresso/80 px-1.5 py-0.5 font-mono text-xs ring-1 ring-sand/15", last === it.token ? "text-[#9fd0a8] light:text-[#2f6b3f]" : "text-ember")}>
                      {last === it.token ? <Check className="inline size-3" aria-hidden /> : null} {it.token}
                    </code>
                    <span className="min-w-0 text-xs leading-relaxed text-crema/70">{it.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Disclosure>
  );
}
