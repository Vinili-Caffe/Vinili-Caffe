"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Headphones, Mic, Music2, Radio } from "lucide-react";
import { MultiSelect, Select } from "@/components/ui/Select";
import { NumberField } from "@/components/ui/NumberField";
import {
  communityApi,
  type VoiceAlwaysOnCatalog,
  type VoiceAlwaysOnConfig,
  type VoiceConfig,
} from "@/lib/dashboard-community";
import { normalizeVocaleModuleTab, type VocaleModuleTabId } from "../../guildSections";
import { Field, FormGroup, Notice, RowsSkeleton, SettingRow, Toggle, TrackUnsaved, fieldClass } from "../bits";
import { roleOptions, useCommunity } from "./shared";

const EMPTY_ALWAYS_ON: VoiceAlwaysOnConfig = {
  enabled: false,
  voiceChannelId: null,
  source: "radio",
  radioId: "rtl1025",
};

/** Fallback se l’API non manda il catalogo (allineato a musicAlwaysOnCatalog). */
const FALLBACK_RADIOS: { id: string; label: string }[] = [
  { id: "rtl1025", label: "RTL 102.5" },
  { id: "rtlbest", label: "RTL 102.5 Best" },
  { id: "rtlgroove", label: "RTL 102.5 Groove" },
  { id: "rtllounge", label: "RTL 102.5 Lounge" },
  { id: "radiofreccia", label: "Radiofreccia" },
  { id: "radiozeta", label: "Radio Zeta" },
  { id: "rds", label: "RDS" },
  { id: "rdsrelax", label: "RDS Relax" },
  { id: "radio105", label: "Radio 105" },
  { id: "radio105classics", label: "105 Classics" },
  { id: "radio105miami", label: "105 Miami" },
  { id: "radio105hiphop", label: "105 Hip Hop & RnB" },
  { id: "radio105zoo", label: "105 Zoo" },
  { id: "radio105hits", label: "105 Hits" },
  { id: "radio105rap", label: "105 Rap Italia" },
  { id: "virgin", label: "Virgin Radio" },
  { id: "virginhits", label: "Virgin Radio Rock Hits" },
  { id: "virginclassics", label: "Virgin Radio Classic Rock" },
  { id: "virginalt", label: "Virgin Radio Rock Alternative" },
  { id: "virgin70", label: "Virgin Radio Rock '70" },
  { id: "virgin80", label: "Virgin Radio Rock '80" },
  { id: "virgin90", label: "Virgin Radio Rock '90" },
  { id: "virginballads", label: "Virgin Radio Rock Ballads" },
  { id: "virginparty", label: "Virgin Radio Rock Party" },
  { id: "virginacdc", label: "Virgin Rockstar AC/DC" },
  { id: "virginaerosmith", label: "Virgin Rockstar Aerosmith" },
  { id: "virgingnr", label: "Virgin Rockstar Guns N' Roses" },
  { id: "virginoasis", label: "Virgin Rockstar Oasis" },
  { id: "virginvasco", label: "Virgin MUSIC STAR Vasco" },
  { id: "virginpinodaniele", label: "Virgin MUSIC STAR Pino Daniele" },
  { id: "r101", label: "R101" },
  { id: "r101italy", label: "R101 Made in Italy" },
  { id: "r101legend", label: "R101 Enjoy The Music" },
  { id: "rai1", label: "Rai Radio 1" },
  { id: "rai2", label: "Rai Radio 2" },
  { id: "rai3", label: "Rai Radio 3" },
  { id: "raituttait", label: "Rai Tutta Italiana" },
  { id: "raiclassica", label: "Rai Radio Classica" },
  { id: "raiisoradio", label: "Rai IsoRadio" },
  { id: "raigiparlamento", label: "Rai GR Parlamento" },
  { id: "raitechete", label: "Rai Radio Techetè" },
  { id: "railive", label: "Rai Radio Live" },
  { id: "radio24", label: "Radio 24" },
  { id: "kisskiss", label: "Radio Kiss Kiss" },
  { id: "kisskissitalia", label: "Kiss Kiss Italia" },
  { id: "kisskissnapoli", label: "Kiss Kiss Napoli" },
  { id: "kisskisshits", label: "Kiss Kiss Hits" },
  { id: "kisskisshistory", label: "Kiss Kiss History Hits" },
  { id: "rmc", label: "Radio Monte Carlo" },
  { id: "rmc2", label: "RMC 2" },
  { id: "rmchits", label: "RMC Hits" },
  { id: "rmcgreatest", label: "RMC Greatest Hits / Buddha-Bar" },
  { id: "rmcitalia", label: "RMC Italia" },
  { id: "rmclove", label: "RMC Love Songs" },
  { id: "rmcgreatartists", label: "RMC Great Artists" },
  { id: "rmc80", label: "RMC 80" },
  { id: "rmc90", label: "RMC 90" },
  { id: "rmcmarine", label: "RMC Marine" },
  { id: "rmcnewclassics", label: "RMC New Classics" },
  { id: "rmcnights", label: "RMC Nights Story" },
  { id: "rmcromantic", label: "RMC Romantic Rock" },
  { id: "rmcparty", label: "RMC Party" },
  { id: "rmcjazz", label: "RMC Jazz" },
  { id: "rmcvip", label: "RMC VIP Lounge" },
  { id: "rmcvoyage", label: "RMC Voyage Voyage" },
  { id: "rmcdisco", label: "RMC Disco Funk" },
  { id: "rmcsport", label: "RMC Sport Network" },
  { id: "radioitalia", label: "Radio Italia" },
  { id: "radioitaliatrend", label: "Radio Italia Trend" },
  { id: "subasio", label: "Radio Subasio" },
  { id: "subasioplus", label: "Radio Subasio +" },
  { id: "subasioamore", label: "Subasio Per un'ora d'amore" },
  { id: "subasiocollection", label: "Subasio Collection" },
  { id: "umhitsitalia", label: "United Music Hits Italia" },
  { id: "umitalia2000", label: "United Music Italia 2000" },
  { id: "umitalia60", label: "United Music Italia 60" },
  { id: "umitalia80", label: "United Music Italia 80" },
  { id: "umitalia90", label: "United Music Italia 90" },
  { id: "umitalia70", label: "United Music Italia 70" },
  { id: "popolare", label: "Radio Popolare" },
  { id: "sportiva", label: "Radio Sportiva" },
  { id: "radicale", label: "Radio Radicale" },
  { id: "lifegate", label: "LifeGate Radio" },
  { id: "bianconera", label: "Radio Bianconera" },
  { id: "discoradio", label: "Discoradio" },
  { id: "dancefloor90", label: "Dancefloor 90s" },
  { id: "discofunk", label: "70 80 Disco Funk" },
  { id: "ritmo80", label: "Ritmo 80" },
  { id: "romantica", label: "Romantica Radio" },
  { id: "veniceclassic", label: "Venice Classic Radio" },
  { id: "funkycorner", label: "Funky Corner Radio" },
  { id: "rtr99pooh", label: "RTR 99 Canale Pooh" },
  { id: "ballaballa", label: "Radio Balla Balla" },
  { id: "relaxitalia", label: "Radio Relax Italia" },
  { id: "zorro", label: "Radio Zorro" },
  { id: "lattemiele", label: "Lattemiele" },
  { id: "bruno", label: "Radio Bruno" },
  { id: "studioplus", label: "Radio Studio Più" },
  { id: "ibiza", label: "Radio Ibiza" },
  { id: "numberone", label: "Radio Number One" },
  { id: "norba", label: "Radio Norba" },
  { id: "norbamusic", label: "Radio Norba Music" },
  { id: "bella", label: "Radio Bella & Monella" },
  { id: "sorriso", label: "Radio Sorriso" },
  { id: "marilu", label: "Radio Marilù" },
  { id: "holiday", label: "Radio Holiday" },
  { id: "maria", label: "Radio Maria" },
  { id: "cuore", label: "Radio Cuore" },
  { id: "margherita", label: "Radio Margherita" },
  { id: "radiorock", label: "Radio Rock" },
  { id: "marte", label: "Radio Marte" },
  { id: "armisa", label: "Radio Armisa" },
  { id: "playstudio", label: "Radio Playstudio" },
  { id: "pico", label: "Radio Pico" },
];

function withAlwaysOn(cfg: VoiceConfig): VoiceConfig {
  return {
    ...cfg,
    music: {
      ...cfg.music,
      alwaysOn: {
        ...EMPTY_ALWAYS_ON,
        ...(cfg.music?.alwaysOn || {}),
        voiceChannelId: cfg.music?.alwaysOn?.voiceChannelId || null,
        radioId: cfg.music?.alwaysOn?.radioId || "rtl1025",
        source: cfg.music?.alwaysOn?.source === "chill" ? "chill" : "radio",
        enabled: cfg.music?.alwaysOn?.enabled === true,
      },
    },
  };
}

const TTS_LANGS = [
  { value: "it", label: "Italiano" },
  { value: "en-gb", label: "English (UK)" },
  { value: "en-us", label: "English (US)" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
];

const triOpts = [
  { value: "", label: "Default bot" },
  { value: "1", label: "Attivo" },
  { value: "0", label: "Spento" },
];

function triValue(v: boolean | null | undefined) {
  if (v === true) return "1";
  if (v === false) return "0";
  return "";
}

function triParse(v: string): boolean | null {
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

export function VoicePanel({
  guildId,
  token,
  onToast,
  tab,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  tab?: string;
}) {
  const { data } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<VoiceConfig | null>(null);
  const [catalog, setCatalog] = useState<VoiceAlwaysOnCatalog | null>(null);
  const [saved, setSaved] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const activeTab: VocaleModuleTabId = normalizeVocaleModuleTab(tab);

  useEffect(() => {
    let alive = true;
    void communityApi.getVoice(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      const next = withAlwaysOn(r.data.config);
      setCfg(next);
      setSaved(JSON.stringify(next));
      if (r.data.alwaysOnCatalog) setCatalog(r.data.alwaysOnCatalog);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  if (loadError && !cfg) return <Notice error>{loadError}</Notice>;
  if (!cfg || !data) return <RowsSkeleton rows={6} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const roles = roleOptions(data.pickers.roles, guildId);
  const channels = data.pickers.textChannels.map((c) => ({ value: c.id, label: `#${c.name}` }));
  const voiceChannels = (data.pickers.voiceChannels || []).map((c) => ({
    value: c.id,
    label: c.name.startsWith("🔊") || c.name.startsWith("#") ? c.name : `🔊 ${c.name}`,
  }));
  const setMusic = (patch: Partial<VoiceConfig["music"]>) => setCfg({ ...cfg, music: { ...cfg.music, ...patch } });
  const setAlwaysOn = (patch: Partial<VoiceAlwaysOnConfig>) =>
    setMusic({ alwaysOn: { ...cfg.music.alwaysOn, ...patch } });
  const setTts = (patch: Partial<VoiceConfig["tts"]>) => setCfg({ ...cfg, tts: { ...cfg.tts, ...patch } });

  const save = async () => {
    const payload = withAlwaysOn(cfg);
    const r = await communityApi.saveVoice(token, guildId, payload);
    if (!r.ok) return onToast(r.message, true);
    const next = withAlwaysOn(r.data.config);
    setCfg(next);
    setSaved(JSON.stringify(next));
    if (r.data.alwaysOnCatalog) setCatalog(r.data.alwaysOnCatalog);
    onToast("Impostazioni vocale salvate.");
  };

  const reset = () => {
    try {
      setCfg(JSON.parse(saved) as VoiceConfig);
    } catch (_) {}
  };

  const idleMin = Math.max(1, Math.round(cfg.music.inactivityLeaveMs / 60_000));
  const alwaysOn = cfg.music.alwaysOn || EMPTY_ALWAYS_ON;
  const radioList = catalog?.radios?.length && catalog.radios.length > 1 ? catalog.radios : FALLBACK_RADIOS;
  const radioOpts = radioList.map((r) => ({ value: r.id, label: r.label }));
  const chillLabel = catalog?.chill?.label || "Lofi chill 24/7";

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={dirty} onSave={save} onReset={reset} />

      <AnimatePresence mode="wait">
        {activeTab === "musica" ? (
          <motion.div
            key="musica"
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            <motion.div
              layout
              className="overflow-hidden rounded-2xl bg-gradient-to-br from-ember/20 via-espresso/55 to-mocha/45 p-4 ring-1 ring-sand/10"
              initial={{ scale: 0.98 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
            >
              <div className="flex items-start gap-3">
                <motion.span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ember/20 text-ember ring-1 ring-ember/30"
                  animate={{ rotate: [0, -6, 6, 0] }}
                  transition={{ duration: 0.7, delay: 0.15, ease: "easeInOut" }}
                >
                  <Music2 className="size-5" />
                </motion.span>
                <div>
                  <p className="font-semibold text-crema">Riproduzione</p>
                  <p className="mt-0.5 text-xs text-crema/55">
                    Volume iniziale, uscita se nessuno ascolta, chi può controllare la sessione.
                  </p>
                </div>
              </div>
            </motion.div>

            <FormGroup title="Impostazioni musica">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Volume default" hint="0–100 all’ingresso in vocale.">
                  <NumberField
                    value={cfg.music.defaultVolume}
                    min={0}
                    max={100}
                    onChange={(v) => setMusic({ defaultVolume: Math.max(0, Math.min(100, Math.floor(Number(v) || 0))) })}
                    aria-label="Volume default"
                  />
                </Field>
                <Field label="Leave se inattivo (minuti)" hint="Senza brano o VC vuoto. Ignorato se 24/7 è attivo.">
                  <NumberField
                    value={idleMin}
                    min={1}
                    max={60}
                    onChange={(v) =>
                      setMusic({
                        inactivityLeaveMs: Math.max(1, Math.min(60, Math.floor(Number(v) || 1))) * 60_000,
                      })
                    }
                    aria-label="Minuti inattività"
                  />
                </Field>
              </div>
              <Field
                label="Canali testo ammessi"
                hint="Vuoto = tutti. Se scegli canali, +play e i controlli musica funzionano solo lì."
              >
                <MultiSelect
                  value={cfg.music.textChannelIds}
                  onChange={(textChannelIds) => setMusic({ textChannelIds })}
                  options={channels}
                  placeholder="Tutti i canali"
                  className={fieldClass}
                />
              </Field>
              <Field
                label="Ruoli DJ"
                hint="Possono usare skip/pausa/volume anche se non hanno avviato la sessione. Vuoto = solo chi ha messo play."
              >
                <MultiSelect
                  value={cfg.music.djRoleIds}
                  onChange={(djRoleIds) => setMusic({ djRoleIds })}
                  options={roles}
                  placeholder="Nessuno (solo sessione)"
                  className={fieldClass}
                />
              </Field>
            </FormGroup>

            <FormGroup title="Canale 24/7">
              <motion.div
                layout
                className="mb-3 flex items-start gap-3 rounded-xl bg-crema/[0.04] p-3 ring-1 ring-sand/10"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/25">
                  <Radio className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-crema">Presenza continua</p>
                  <p className="mt-0.5 text-xs text-crema/55">
                    Il bot resta nel canale e riproduce una radio italiana o il video chill già impostato sul bot.
                    Con +play la coda utente ha priorità; a coda vuota riparte il 24/7.
                  </p>
                </div>
              </motion.div>
              <SettingRow title="Attivo 24/7" description="Entra e resta nel canale scelto.">
                <Toggle
                  size="sm"
                  checked={alwaysOn.enabled}
                  onChange={(enabled) => setAlwaysOn({ enabled })}
                  label="Attivo 24/7"
                />
              </SettingRow>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Canale vocale" hint="Dove resta il bot.">
                  <Select
                    value={alwaysOn.voiceChannelId || ""}
                    onChange={(voiceChannelId) => setAlwaysOn({ voiceChannelId: voiceChannelId || null })}
                    options={[{ value: "", label: "— Scegli canale —" }, ...voiceChannels]}
                    className={fieldClass}
                    aria-label="Canale vocale 24/7"
                  />
                </Field>
                <Field label="Sorgente" hint="Radio reale oppure chill fisso del bot.">
                  <Select
                    value={alwaysOn.source}
                    onChange={(source) => setAlwaysOn({ source: source === "chill" ? "chill" : "radio" })}
                    options={[
                      { value: "radio", label: "Radio italiana" },
                      { value: "chill", label: chillLabel },
                    ]}
                    className={fieldClass}
                    aria-label="Sorgente 24/7"
                  />
                </Field>
              </div>
              {alwaysOn.source === "radio" ? (
                <Field label="Radio" hint={`${radioOpts.length} stazioni italiane (stream pubblici).`}>
                  <Select
                    value={alwaysOn.radioId || radioOpts[0]?.value || "rtl1025"}
                    onChange={(radioId) => setAlwaysOn({ radioId })}
                    options={radioOpts}
                    searchable
                    searchPlaceholder="Cerca radio…"
                    className={fieldClass}
                    aria-label="Radio italiana"
                  />
                </Field>
              ) : (
                <p className="text-xs text-crema/50">
                  Chill 24/7: stream già configurato sul bot (non modificabile da qui).
                </p>
              )}
            </FormGroup>
          </motion.div>
        ) : (
          <motion.div
            key="tts"
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            <motion.div
              layout
              className="overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500/20 via-espresso/55 to-mocha/45 p-4 ring-1 ring-sand/10"
              initial={{ scale: 0.98 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
            >
              <div className="flex items-start gap-3">
                <motion.span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/25"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.65, delay: 0.12, ease: "easeInOut" }}
                >
                  <Mic className="size-5" />
                </motion.span>
                <div>
                  <p className="font-semibold text-crema">Text-to-speech</p>
                  <p className="mt-0.5 text-xs text-crema/55">
                    Legge i messaggi in vocale. “Default bot” lascia il valore di config del processo.
                  </p>
                </div>
              </div>
            </motion.div>

            <FormGroup title="Impostazioni TTS">
              <SettingRow title="TTS attivo" description="Se spento, il bot non legge i messaggi in questo server.">
                <Toggle size="sm" checked={cfg.tts.enabled !== false} onChange={(enabled) => setTts({ enabled })} label="TTS attivo" />
              </SettingRow>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Autojoin" hint="Entra in vocale da solo quando scrivi.">
                  <Select
                    value={triValue(cfg.tts.autojoin)}
                    onChange={(v) => setTts({ autojoin: triParse(v) })}
                    options={triOpts}
                    className={fieldClass}
                    aria-label="Autojoin TTS"
                  />
                </Field>
                <Field label="Nome utente" hint="Prefissa il messaggio con il nome.">
                  <Select
                    value={triValue(cfg.tts.includeUsername)}
                    onChange={(v) => setTts({ includeUsername: triParse(v) })}
                    options={triOpts}
                    className={fieldClass}
                    aria-label="Include username"
                  />
                </Field>
                <Field label="Resta connesso" hint="Non esce se la VC si svuota.">
                  <Select
                    value={triValue(cfg.tts.stayConnected)}
                    onChange={(v) => setTts({ stayConnected: triParse(v) })}
                    options={triOpts}
                    className={fieldClass}
                    aria-label="Stay connected"
                  />
                </Field>
                <Field label="Lingua default" hint="Se l’utente non ha una voce personale.">
                  <Select
                    value={cfg.tts.defaultLang || "it"}
                    onChange={(defaultLang) => setTts({ defaultLang })}
                    options={TTS_LANGS}
                    className={fieldClass}
                    aria-label="Lingua TTS"
                  />
                </Field>
              </div>
              <Field
                label="Canali testo ammessi"
                hint="Vuoto = tutti i canali collegati a una VC. Altrimenti solo questi."
              >
                <MultiSelect
                  value={cfg.tts.textChannelIds}
                  onChange={(textChannelIds) => setTts({ textChannelIds })}
                  options={channels}
                  placeholder="Tutti i canali"
                  className={fieldClass}
                />
              </Field>
            </FormGroup>

            <p className="flex items-center gap-2 text-xs text-crema/45">
              <Headphones className="size-3.5 shrink-0" aria-hidden />
              Musica e TTS non possono stare insieme nello stesso momento: se c’è play, il TTS aspetta.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
