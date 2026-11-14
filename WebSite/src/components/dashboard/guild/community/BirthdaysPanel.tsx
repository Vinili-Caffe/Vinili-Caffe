"use client";

import { useEffect, useMemo, useState } from "react";
import { Cake, Clock, ExternalLink } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { communityApi, type BirthdaysConfig } from "@/lib/dashboard-community";
import { page } from "@/lib/site";
import { Field, FormGroup, Notice, RowsSkeleton, TrackUnsaved, fieldClass } from "../bits";
import { ChannelField, DiscordMessagePreview, DmExtra, DraftEditor, EditorWithPreview, roleOptions, useCommunity, useSampleVars } from "./shared";

const PLACEHOLDERS = [
  { token: "{users}", hint: "chi compie gli anni (menzioni, anche più di uno)" },
  { token: "{agetext}", hint: "\"Oggi compie 20 anni.\" (vuoto se l'età è nascosta)" },
  { token: "{age}", hint: "l'età, se è uno solo e la mostra" },
  { token: "{count}", hint: "quanti compiono gli anni oggi" },
  { token: "{username}", hint: "nome del primo festeggiato" },
  { token: "{avatar}", hint: "foto del primo festeggiato (per immagini)" },
  { token: "{server}", hint: "nome del server" },
];
const MAIN_PLACEHOLDERS = [...PLACEHOLDERS, { token: "{exptext}", hint: "la riga del ×2 EXP (solo sul principale)" }];

const DM_PLACEHOLDERS = [
  { token: "{username}", hint: "il suo nome" },
  { token: "{user}", hint: "menzione" },
  { token: "{agetext}", hint: "\"Oggi compie 20 anni.\" (vuoto se nascosta)" },
  { token: "{server}", hint: "nome del server" },
];

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));

export function BirthdaysPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data } = useCommunity(guildId, token);
  const baseVars = useSampleVars(data);
  const [cfg, setCfg] = useState<BirthdaysConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [meta, setMeta] = useState<{ isMain: boolean; imported: boolean; timezone: string }>({ isMain: false, imported: false, timezone: "Europe/Rome" });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void communityApi.getBirthdays(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      setCfg(r.data.config);
      setSaved(JSON.stringify(r.data.config));
      setMeta({ isMain: r.data.isMainGuild === true, imported: r.data.imported === true, timezone: r.data.timezone || "Europe/Rome" });
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  /* anteprima: due festeggiati d'esempio, uno con l'età visibile */
  const vars = useMemo(
    () => ({
      ...baseVars,
      users: `${baseVars.user || "@Mario"} e @Giulia`,
      count: "2",
      age: "",
      agetext: "Oggi compiono **20** e **25** anni.",
      exptext: meta.isMain ? " E per oggi c'è un **×2 EXP**!" : "",
    }),
    [baseVars, meta.isMain],
  );
  const dmVars = useMemo(() => ({ ...baseVars, age: "20", agetext: "Oggi compie **20** anni." }), [baseVars]);

  if (loadError && !cfg) return <Notice error>{loadError}</Notice>;
  if (!cfg || !data) return <RowsSkeleton rows={6} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const channels = data.pickers.textChannels;
  const set = (patch: Partial<BirthdaysConfig>) => setCfg({ ...cfg, ...patch });

  const save = async () => {
    const r = await communityApi.saveBirthdays(token, guildId, cfg);
    if (!r.ok) return onToast(r.message, true);
    setCfg(r.data.config);
    setSaved(JSON.stringify(r.data.config));
    setMeta((m) => ({ ...m, imported: false }));
    onToast("Compleanni salvati.");
  };
  const reset = () => {
    try {
      setCfg(JSON.parse(saved));
    } catch {}
  };

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={dirty} onSave={save} onReset={reset} />
      {meta.imported ? <Notice>Ho importato l&apos;annuncio dei compleanni che il bot fa adesso su questo server. Ruolo, ruoli d&apos;età e ×2 EXP restano come prima.</Notice> : null}

      <p className="text-sm text-crema/60">
        Ognuno imposta il compleanno una volta sola da{" "}
        <a href={page("/personalizza/?target=birthday")} className="font-semibold text-ember underline-offset-2 hover:underline">
          Personalizza
        </a>{" "}
        e vale in tutti i server con il bot. Qui scegli come festeggiarlo in questo server; chi non vuole annunci può spegnerli dal suo profilo.
      </p>

      <FormGroup title="Annuncio" description="Più compleanni nello stesso giorno finiscono in un solo messaggio.">
        <div className="grid gap-3 sm:grid-cols-3">
          <ChannelField label="Canale" hint="Vuoto = niente annuncio." value={cfg.channelId} channels={channels} onChange={(channelId) => set({ channelId })} />
          <Field label="Ora dell'annuncio" hint={`Fuso del server: ${meta.timezone}.`}>
            <Select value={String(cfg.hour)} onChange={(v) => set({ hour: Number(v) || 0 })} className={fieldClass} options={HOURS} />
          </Field>
          <Field label="Ruolo del giorno" hint="Dato per tutto il giorno, tolto il giorno dopo.">
            <Select
              value={cfg.roleId || ""}
              onChange={(v) => set({ roleId: v || null })}
              className={fieldClass}
              options={[{ value: "", label: "Nessun ruolo" }, ...roleOptions(data.pickers.roles, guildId)]}
            />
          </Field>
        </div>
        {cfg.channelId ? (
          <div className="mt-4">
            <EditorWithPreview
              editor={
                <DraftEditor
                  key="bday"
                  value={cfg.draft}
                  onChange={(draft) => set({ draft })}
                  emojis={data.pickers.emojis}
                  placeholders={meta.isMain ? MAIN_PLACEHOLDERS : PLACEHOLDERS}
                  maxButtons={data.limits.buttons}
                />
              }
              preview={<DiscordMessagePreview testChannelId={cfg.channelId} bot={data.bot} draft={cfg.draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
            />
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm text-crema/55">
            <Cake className="size-4 text-ember" aria-hidden /> Scegli un canale per scrivere il messaggio di auguri.
          </p>
        )}
      </FormGroup>

      <DmExtra
        editorKey="bday-dm"
        value={cfg.dm}
        onChange={(dm) => set({ dm })}
        data={data}
        vars={dmVars}
        placeholders={DM_PLACEHOLDERS}
        hint="A chi compie gli anni. Se è in più server col bot, riceve un solo privato al giorno."
      />

      <FormGroup title="Boost EXP" description="Il moltiplicatore di EXP nel giorno del compleanno.">
        <p className="flex items-start gap-2 text-sm text-crema/60">
          <Clock className="mt-0.5 size-4 shrink-0 text-crema/45" aria-hidden />
          {meta.isMain
            ? "Su questo server chi compie gli anni ha il ×2 EXP per tutta la giornata. Per citarlo nel messaggio usa {exptext}."
            : "Il boost EXP nel giorno del compleanno arriverà quando i livelli saranno disponibili anche su questo server."}
        </p>
        <a href={page("/personalizza/?target=birthday")} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-crema/55 hover:text-crema">
          <ExternalLink className="size-3.5" aria-hidden /> Il tuo compleanno su Personalizza
        </a>
      </FormGroup>
    </div>
  );
}
