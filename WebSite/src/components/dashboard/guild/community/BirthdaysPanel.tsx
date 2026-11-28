"use client";

import { useEffect, useMemo, useState } from "react";
import { Cake, ExternalLink, Plus, Trash2, Users, Zap } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { communityApi, type BirthdaysConfig } from "@/lib/dashboard-community";
import { page } from "@/lib/site";
import { Field, FormGroup, Notice, RowsSkeleton, Toggle, TrackUnsaved, fieldClass, labelClass, miniBtn } from "../bits";
import { cn } from "@/lib/cn";
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
const EXP_PLACEHOLDERS = [...PLACEHOLDERS, { token: "{exptext}", hint: "la riga del ×2 EXP (se Livelli è acceso)" }];

const DM_PLACEHOLDERS = [
  { token: "{username}", hint: "il suo nome" },
  { token: "{user}", hint: "menzione" },
  { token: "{agetext}", hint: "\"Oggi compie 20 anni.\" (vuoto se nascosta)" },
  { token: "{server}", hint: "nome del server" },
];

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));

const DEFAULT_AGE_BRACKETS: NonNullable<BirthdaysConfig["ageBrackets"]> = {
  enabled: true,
  minAge: 13,
  brackets: [
    { maxAge: 14, roleId: "" },
    { maxAge: 16, roleId: "" },
    { maxAge: 18, roleId: "" },
    { maxAge: 999, roleId: "" },
  ],
};

function resolveAgeBrackets(cfg: BirthdaysConfig): NonNullable<BirthdaysConfig["ageBrackets"]> {
  const ab = cfg.ageBrackets;
  if (!ab) return DEFAULT_AGE_BRACKETS;
  return {
    enabled: ab.enabled !== false,
    minAge: Number.isFinite(ab.minAge) ? ab.minAge : DEFAULT_AGE_BRACKETS.minAge,
    brackets: ab.brackets?.length ? ab.brackets : DEFAULT_AGE_BRACKETS.brackets,
  };
}

export function BirthdaysPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data } = useCommunity(guildId, token);
  const baseVars = useSampleVars(data);
  const [cfg, setCfg] = useState<BirthdaysConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [meta, setMeta] = useState<{ isMain: boolean; levelsActive: boolean; imported: boolean; timezone: string }>({
    isMain: false,
    levelsActive: false,
    imported: false,
    timezone: "Europe/Rome",
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void communityApi.getBirthdays(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      setCfg(r.data.config);
      setSaved(JSON.stringify(r.data.config));
      setMeta({
        isMain: r.data.isMainGuild === true,
        levelsActive: r.data.levelsActive === true,
        imported: r.data.imported === true,
        timezone: r.data.timezone || "Europe/Rome",
      });
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  const expBoost = cfg?.expBoost || { enabled: true, multiplier: 2 };
  /* anteprima: due festeggiati d'esempio, uno con l'età visibile */
  const vars = useMemo(
    () => {
      const m = expBoost.multiplier;
      const label = Number.isInteger(m) ? String(m) : String(m);
      return {
        ...baseVars,
        users: `${baseVars.user || "@Mario"} e @Giulia`,
        count: "2",
        age: "",
        agetext: "Oggi compiono **20** e **25** anni.",
        exptext: meta.levelsActive && expBoost.enabled ? ` E per oggi c'è un **×${label} EXP**!` : "",
      };
    },
    [baseVars, meta.levelsActive, expBoost.enabled, expBoost.multiplier],
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
                  placeholders={meta.levelsActive ? EXP_PLACEHOLDERS : PLACEHOLDERS}
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

      {meta.isMain ? (
        <FormGroup title="Ruoli d'età" description="Ruoli assegnati in base all'età dichiarata. Sotto l'età minima i ruoli fascia vengono tolti.">
          {(() => {
            const ab = resolveAgeBrackets(cfg);
            const roles = roleOptions(data.pickers.roles, guildId);
            const setAb = (patch: Partial<typeof ab>) => set({ ageBrackets: { ...ab, ...patch } });
            const setBracket = (i: number, patch: Partial<(typeof ab.brackets)[0]>) =>
              setAb({ brackets: ab.brackets.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
            const roleColor = (id: string) => {
              const c = data.pickers.roles.find((r) => r.id === id)?.color;
              return c && c !== "#000000" ? c : "#99aab5";
            };
            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm text-crema/70">
                    <Users className="size-4 text-ember" aria-hidden />
                    Una fascia per età massima; al compleanno o all&apos;aggiornamento del profilo il bot aggiorna i ruoli.
                  </p>
                  <Toggle size="sm" checked={ab.enabled} onChange={(enabled) => setAb({ enabled })} label="Ruoli d'età" />
                </div>
                <div className={cn(!ab.enabled && "pointer-events-none opacity-45")}>
                  <Field label="Età minima" hint="Sotto questa età: nessun ruolo fascia (vengono rimossi).">
                    <NumberField value={ab.minAge} min={0} max={30} disabled={!ab.enabled} onChange={(v) => setAb({ minAge: Math.max(0, Math.min(30, Math.floor(Number(v) || 0))) })} aria-label="Età minima ruoli fascia" />
                  </Field>
                  <div className="mt-3">
                    <p className={labelClass}>Fasce</p>
                    {ab.brackets.length ? (
                      <ul className="mt-2 space-y-2">
                        {ab.brackets.map((row, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Fino a</span>
                            <div className="w-24 shrink-0">
                              <NumberField className="!mt-0" value={row.maxAge} min={1} max={200} disabled={!ab.enabled} onChange={(v) => setBracket(i, { maxAge: Math.max(1, Math.min(200, Math.floor(Number(v) || 1))) })} aria-label="Età massima fascia" />
                            </div>
                            <span className="text-xs text-crema/50">anni</span>
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(row.roleId) }} aria-hidden />
                            <div className="min-w-[10rem] flex-1">
                              <Select value={row.roleId} onChange={(roleId) => setBracket(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} disabled={!ab.enabled} aria-label="Ruolo fascia d'età" />
                            </div>
                            <button
                              type="button"
                              className={cn(miniBtn, "!px-2")}
                              disabled={!ab.enabled || ab.brackets.length <= 1}
                              onClick={() => setAb({ brackets: ab.brackets.filter((_, j) => j !== i) })}
                              aria-label="Togli fascia"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 rounded-2xl border border-dashed border-sand/15 px-4 py-4 text-center text-sm text-crema/50">Nessuna fascia configurata.</p>
                    )}
                    <button
                      type="button"
                      className={cn(miniBtn, "mt-2")}
                      disabled={!ab.enabled || !roles.length || ab.brackets.length >= 12}
                      onClick={() => {
                        const last = ab.brackets[ab.brackets.length - 1];
                        const maxAge = Math.min(200, (last?.maxAge || ab.minAge) + 2);
                        setAb({
                          brackets: [...ab.brackets, { maxAge, roleId: roles.find((r) => !ab.brackets.some((b) => b.roleId === r.value))?.value || roles[0]?.value || "" }],
                        });
                      }}
                    >
                      <Plus className="size-3.5" aria-hidden /> Aggiungi fascia
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </FormGroup>
      ) : null}

      <FormGroup title="Boost EXP" description="Moltiplicatore sul ruolo del giorno (si allinea al modulo Livelli).">
        {meta.levelsActive ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-crema/70">
                <Zap className="size-4 text-ember" aria-hidden />
                Nel messaggio usa {"{exptext}"} per citare il boost.
              </p>
              <Toggle
                size="sm"
                checked={expBoost.enabled}
                onChange={(enabled) => set({ expBoost: { ...expBoost, enabled } })}
                label="Boost EXP compleanno"
              />
            </div>
            <Field label="Moltiplicatore" hint="Es. 2 = ×2 EXP per tutta la giornata.">
              <NumberField
                value={expBoost.multiplier}
                min={1}
                max={20}
                step={0.1}
                disabled={!expBoost.enabled}
                onChange={(v) => set({ expBoost: { ...expBoost, multiplier: Math.max(1, Number(v) || 2) } })}
                aria-label="Moltiplicatore EXP compleanno"
              />
            </Field>
            <a href="?s=livelli&t=exp" className="inline-flex items-center gap-1.5 text-xs font-semibold text-crema/55 hover:text-crema">
              <ExternalLink className="size-3.5" aria-hidden /> Apri Livelli & EXP
            </a>
          </div>
        ) : (
          <Notice>
            Boost EXP compleanno: accendi il modulo Livelli &amp; EXP da Moduli. Poi qui puoi impostare il moltiplicatore sul ruolo del giorno.
          </Notice>
        )}
        <a href={page("/personalizza/?target=birthday")} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-crema/55 hover:text-crema">
          <ExternalLink className="size-3.5" aria-hidden /> Il tuo compleanno su Personalizza
        </a>
      </FormGroup>
    </div>
  );
}
