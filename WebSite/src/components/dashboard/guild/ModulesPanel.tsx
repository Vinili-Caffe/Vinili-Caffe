"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AudioLines,
  Gamepad2,
  Gauge,
  Gavel,
  Gift,
  Handshake,
  Lock,
  Megaphone,
  MessageSquareReply,
  Music2,
  PartyPopper,
  Pin,
  Rocket,
  Search,
  Settings2,
  Tags,
  TerminalSquare,
  Ticket,
  Vote,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { communityApi } from "@/lib/dashboard-community";
import { Notice, RowsSkeleton, Toggle, fieldClass } from "./bits";
import type { GuildSectionId } from "../guildSections";

type ModuleMeta = { id: string; title: string; text: string; icon: LucideIcon; page?: GuildSectionId; tag?: string };

/* ordine e testi delle schede (gli id sono quelli del bot) */
const META: ModuleMeta[] = [
  { id: "tickets", title: "Ticket", text: "Assistenza privata con pannelli, form, team dello staff e archivio.", icon: Ticket, page: "tickets" },
  { id: "moderation", title: "Moderazione", text: "Comandi di moderazione, punizioni automatiche, ricorsi e registro.", icon: Gavel, page: "moderation" },
  { id: "partnership", title: "Partnership", text: "Partner in automatico con regole, filtri, manager e storico.", icon: Handshake, page: "partnership" },
  { id: "bacheca", title: "Bacheca", text: "I messaggi più apprezzati finiscono in bacheca.", icon: Pin, page: "bacheca" },
  { id: "benvenuto", title: "Annunci automatici", text: "Benvenuto, addio, boost, ruoli d'ingresso e annunci dei ruoli.", icon: PartyPopper, page: "benvenuto" },
  { id: "messaggi", title: "Messaggi", text: "Messaggi del bot da mandare subito o a orari fissi.", icon: Megaphone, page: "messaggi" },
  { id: "comandipers", title: "Comandi personalizzati", text: "Comandi tuoi con la risposta che decidi tu.", icon: TerminalSquare, page: "comandipers" },
  { id: "ruoli", title: "Ruoli automatici", text: "Pannelli dove i membri si prendono i ruoli da soli.", icon: Tags, page: "ruoli" },
  { id: "risposte", title: "Risposte automatiche", text: "Il bot risponde quando qualcuno scrive certe parole.", icon: MessageSquareReply, page: "risposte" },
  { id: "contatori", title: "Contatori", text: "Canali con numeri sempre aggiornati: membri, boost, online.", icon: Gauge, page: "contatori" },
  { id: "bump", title: "Bump", text: "Ringraziamenti, ricompense e promemoria per Disboard e Discadia.", icon: Rocket, page: "bump" },
  { id: "voti", title: "Voti", text: "Voti su Top.gg e Discadia con ruolo e promemoria.", icon: Vote, page: "voti" },
  { id: "giveaway", title: "Giveaway", text: "Estrazioni a premi con requisiti e vincitori scelti dal bot.", icon: Gift, page: "giveaway" },
  { id: "sondaggi", title: "Sondaggi", text: "Domande al server con voto e risultati in diretta.", icon: Vote, page: "sondaggi" },
  { id: "utility", title: "Utility", text: "Comandi di servizio: avatar, info, promemoria e simili.", icon: Wrench, page: "commands", tag: "Comandi" },
  { id: "music", title: "Musica", text: "Il bot suona musica nei canali vocali.", icon: Music2, page: "commands", tag: "Comandi" },
  { id: "tts", title: "TTS", text: "Il bot legge ad alta voce i messaggi nei vocali.", icon: AudioLines, page: "commands", tag: "Comandi" },
  { id: "minigames", title: "Minigiochi", text: "Giochi veloci in chat per far passare il tempo.", icon: Gamepad2, page: "commands", tag: "Comandi" },
];

type Row = { id: string; on: boolean; locked: boolean };

export function ModulesPanel({
  guildId,
  token,
  onToast,
  onOpen,
  onChanged,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  /** apre la pagina del modulo */
  onOpen: (section: GuildSectionId) => void;
  /** un modulo è stato acceso o spento (per aggiornare il menu) */
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    void communityApi.listModules(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.message);
      setRows(r.data.modules);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  const list = useMemo(() => {
    const byId = new Map((rows || []).map((r) => [r.id, r]));
    const needle = q.trim().toLowerCase();
    return META.filter((m) => byId.has(m.id))
      .filter((m) => !needle || m.title.toLowerCase().includes(needle) || m.text.toLowerCase().includes(needle))
      .map((m) => ({ ...m, ...(byId.get(m.id) as Row) }));
  }, [rows, q]);

  if (error && !rows) return <Notice error>{error}</Notice>;
  if (!rows) return <RowsSkeleton rows={6} />;

  const locked = rows.some((r) => r.locked);
  const onCount = rows.filter((r) => r.on).length;

  const toggle = async (id: string, on: boolean) => {
    setBusy(id);
    /* subito a schermo, poi conferma dal bot */
    setRows((cur) => (cur ? cur.map((r) => (r.id === id ? { ...r, on } : r)) : cur));
    const r = await communityApi.setModule(token, guildId, id, on);
    setBusy(null);
    if (!r.ok) {
      setRows((cur) => (cur ? cur.map((x) => (x.id === id ? { ...x, on: !on } : x)) : cur));
      return onToast(r.message, true);
    }
    setRows(r.data.modules);
    const title = META.find((m) => m.id === id)?.title || "Modulo";
    onToast(on ? `${title} acceso.` : `${title} spento: comandi e automatismi fermi.`);
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      {locked ? (
        <Notice>Sul server principale i moduli restano sempre accesi: qui vedi lo stato, ma non si possono spegnere.</Notice>
      ) : (
        <p className="text-sm text-crema/60">
          Spegnendo un modulo il bot smette di usarlo su questo server: niente comandi, messaggi o azioni automatiche. Le impostazioni restano salvate per quando lo riaccendi.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[14rem] flex-1">
          <span className="sr-only">Cerca un modulo</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/45" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un modulo…" className={cn(fieldClass, "mt-0 pl-9")} />
        </label>
        <span className="rounded-full bg-crema/[0.06] px-3 py-1 text-xs font-semibold tabular-nums text-crema/65">
          {onCount} accesi su {rows.length}
        </span>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl bg-espresso/40 px-4 py-8 text-center text-sm text-crema/55 ring-1 ring-sand/10">Nessun modulo con questo nome.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => {
            const Icon = m.icon;
            return (
              <motion.li
                key={m.id}
                layout
                className={cn(
                  "flex flex-col rounded-2xl p-4 ring-1 transition-colors",
                  m.on ? "bg-roast/70 ring-sand/15" : "bg-espresso/40 ring-sand/10",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1",
                      m.on ? "bg-gradient-to-br from-caramel/20 to-ember/5 text-ember ring-caramel/20" : "bg-crema/[0.05] text-crema/40 ring-sand/10",
                    )}
                  >
                    <Icon className="size-[1.1rem]" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={cn("font-semibold", m.on ? "text-crema" : "text-crema/60")}>{m.title}</p>
                      {m.tag ? <span className="rounded-full bg-crema/[0.06] px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wider text-crema/50">{m.tag}</span> : null}
                    </div>
                    <p className={cn("mt-0.5 text-xs font-semibold", m.on ? "text-emerald-300 light:text-emerald-700" : "text-crema/45")}>{m.on ? "Attivo" : "Disattivo"}</p>
                  </div>
                  {m.locked ? (
                    <span className="flex size-9 items-center justify-center text-crema/40" title="Sul server principale resta sempre acceso">
                      <Lock className="size-4" aria-hidden />
                    </span>
                  ) : (
                    <Toggle checked={m.on} disabled={busy === m.id} onChange={(v) => void toggle(m.id, v)} label={`${m.on ? "Spegni" : "Accendi"} ${m.title}`} />
                  )}
                </div>
                <p className={cn("mt-3 flex-1 text-sm leading-relaxed", m.on ? "text-crema/70" : "text-crema/45")}>{m.text}</p>
                {m.page ? (
                  <button
                    type="button"
                    onClick={() => onOpen(m.page as GuildSectionId)}
                    className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-crema/[0.05] px-3 py-1.5 text-xs font-semibold text-crema/75 ring-1 ring-sand/10 transition hover:bg-crema/[0.09] hover:text-crema"
                  >
                    <Settings2 className="size-3.5" aria-hidden /> {m.page === "commands" ? "Comandi" : "Impostazioni"}
                  </button>
                ) : null}
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
