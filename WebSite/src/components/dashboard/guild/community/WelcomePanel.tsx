"use client";

import { useEffect, useState } from "react";
import { HandHeart, UserPlus } from "lucide-react";
import { MultiSelect } from "@/components/ui/Select";
import { NumberField } from "@/components/ui/NumberField";
import { cn } from "@/lib/cn";
import {
  communityApi,
  emptyDraft,
  type LevelsConfig,
  type LevelsExpBonus,
  type WelcomeSettings,
} from "@/lib/dashboard-community";
import { ExpandableTextarea, Field, FormGroup, Notice, SettingRow, RowsSkeleton, Toggle, TrackUnsaved, fieldClass, labelClass } from "../bits";
import { ChannelField, DiscordMessagePreview, TestDraftButton, DmExtra, DraftEditor, EditorWithPreview, MEMBER_PLACEHOLDERS, roleOptions, useCommunity, useSampleVars } from "./shared";

type Tab = "welcome" | "goodbye";

const GOODBYE_DM_DEFAULT = { enabled: false, draft: emptyDraft({ content: "Ciao {username}, ci mancherai in **{server}**!", embed: { ...emptyDraft().embed, enabled: false } }) };

const WELCOME_GREETING_DEFAULT: LevelsExpBonus = { enabled: true, amount: 30, channelIds: [] };

const BONUS_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione di chi dà il saluto" },
  { token: "{username}", hint: "nome visualizzato" },
  { token: "{amount}", hint: "EXP regalati" },
  { token: "{avatar}", hint: "foto profilo (campi immagine)" },
  { token: "{server}", hint: "nome del server" },
];

export function WelcomePanel({
  guildId,
  token,
  onToast,
  tab: tabProp = "welcome",
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  tab?: Tab;
}) {
  const tab = tabProp === "goodbye" ? "goodbye" : "welcome";
  const { data, error } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<WelcomeSettings | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [levelsCfg, setLevelsCfg] = useState<LevelsConfig | null>(null);
  const [levelsSaved, setLevelsSaved] = useState("");
  const [, setBusy] = useState<string | null>(null);
  const vars = useSampleVars(data);

  useEffect(() => {
    if (!data) return;
     
    setCfg(data.welcome);
    setSaved(JSON.stringify(data.welcome));
  }, [data]);

  useEffect(() => {
    if (tab !== "welcome") return;
    let alive = true;
    void communityApi.getLevels(token, guildId).then((r) => {
      if (!alive || !r.ok) return;
      setLevelsCfg(r.data.config);
      setLevelsSaved(JSON.stringify(r.data.config.bonuses?.welcomeGreeting || WELCOME_GREETING_DEFAULT));
    });
    return () => {
      alive = false;
    };
  }, [tab, token, guildId]);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;

  const greeting = levelsCfg?.bonuses?.welcomeGreeting || WELCOME_GREETING_DEFAULT;
  const firstDaily = levelsCfg?.bonuses?.firstMessageDaily || { enabled: true, amount: 150, channelIds: [] as string[] };
  const greetingDirty = tab === "welcome" && levelsCfg != null && JSON.stringify(greeting) !== levelsSaved;
  const dirty = JSON.stringify(cfg) !== saved || Boolean(data.isMainGuild && !data.welcomeSaved) || greetingDirty;
  const channels = data.pickers.textChannels;

  const setGreeting = (patch: Partial<LevelsExpBonus>) => {
    if (!levelsCfg) return;
    setLevelsCfg({
      ...levelsCfg,
      bonuses: {
        firstMessageDaily: firstDaily,
        welcomeGreeting: { ...greeting, ...patch },
      },
    });
  };

  const save = async () => {
    setBusy("save");
    const r = await communityApi.saveWelcome(token, guildId, cfg);
    if (!r.ok) {
      setBusy(null);
      return onToast(r.message, true);
    }
    setCfg(r.data.welcome);
    setSaved(JSON.stringify(r.data.welcome));

    if (tab === "welcome" && levelsCfg && greetingDirty) {
      /* solo bonuses: un full blob stale qui può sovrascrivere minigiochi/livelli salvati altrove */
      const lr = await communityApi.saveLevels(token, guildId, {
        bonuses: {
          firstMessageDaily: firstDaily,
          welcomeGreeting: greeting,
        },
      });
      if (!lr.ok) {
        setBusy(null);
        return onToast(lr.message, true);
      }
      setLevelsCfg(lr.data.config);
      setLevelsSaved(JSON.stringify(lr.data.config.bonuses?.welcomeGreeting || WELCOME_GREETING_DEFAULT));
    }

    setBusy(null);
    onToast(tab === "goodbye" ? "Addio salvato." : "Benvenuto salvato.");
  };

  const reset = () => {
    try {
      setCfg(JSON.parse(saved));
    } catch {}
    if (levelsCfg) {
      try {
        const g = JSON.parse(levelsSaved) as LevelsExpBonus;
        setLevelsCfg({
          ...levelsCfg,
          bonuses: { firstMessageDaily: firstDaily, welcomeGreeting: g },
        });
      } catch {}
    }
  };

  const k = tab;
  const p = cfg[k];
  const set = (patch: Partial<WelcomeSettings["welcome"]>) => setCfg({ ...cfg, [k]: { ...p, ...patch } });
  const greetingDraft = greeting.noticeDraft || emptyDraft();

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={dirty} onSave={save} onReset={reset} />
      {data.isMainGuild && !data.welcomeSaved ? (
        <Notice>
          Questi sono il benvenuto e il messaggio privato che il bot usa adesso in questo server. Quando salvi, li gestisci da qui: il bot userà i testi della dashboard al posto di quelli vecchi. Invite tracker e controlli d&apos;ingresso restano uguali.
        </Notice>
      ) : null}

      <p className="text-sm text-crema/60">
        {k === "welcome" ? "Un messaggio quando qualcuno entra nel server, più i ruoli automatici e il privato se vuoi." : "Un messaggio quando qualcuno esce dal server, più il privato se vuoi."}
      </p>

      <FormGroup title={k === "welcome" ? "Messaggio di benvenuto" : "Messaggio d'addio"}>
        <SettingRow
          title="Manda nel canale"
          description={k === "welcome" ? "Ogni volta che entra qualcuno. Spento + privato acceso = solo in privato." : "Ogni volta che qualcuno esce. Spento + privato acceso = solo in privato."}
        >
          <div className="flex items-center gap-3">
            <TestDraftButton draft={p.draft} vars={vars} channels={channels} testChannelId={p.channelId} />
            <Toggle checked={p.enabled} onChange={(enabled) => set({ enabled })} label={k === "welcome" ? "Attiva il benvenuto" : "Attiva l'addio"} />
          </div>
        </SettingRow>
      </FormGroup>

      <EditorWithPreview
        editor={
          <div className="space-y-4">
            <ChannelField label="Canale" value={p.channelId} channels={channels} onChange={(channelId) => set({ channelId })} />
            <DraftEditor key={k} value={p.draft} onChange={(draft) => set({ draft })} emojis={data.pickers.emojis} placeholders={MEMBER_PLACEHOLDERS} maxButtons={data.limits.buttons} />
          </div>
        }
        preview={<DiscordMessagePreview noTest bot={data.bot} draft={p.draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
      />

      {k === "welcome" ? (
        <>
          <section className="rounded-2xl bg-espresso/40 p-4 ring-1 ring-sand/10">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-caramel/12 text-ember">
                <UserPlus className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-crema">Ruoli automatici</p>
                <p className="text-xs text-crema/55">Dati a chi entra. Il ruolo del bot deve stare sopra questi ruoli; i bot che entrano non li ricevono.</p>
              </div>
            </div>
            <Field label="Ruoli">
              <MultiSelect
                value={cfg.autoRoleIds}
                onChange={(autoRoleIds) => setCfg({ ...cfg, autoRoleIds: autoRoleIds.slice(0, 10) })}
                options={roleOptions(data.pickers.roles, guildId)}
                placeholder="Nessuno"
                className={fieldClass}
              />
            </Field>
          </section>
          <DmExtra
            editorKey="welcome"
            value={cfg.dm}
            onChange={(dm) => setCfg({ ...cfg, dm })}
            data={data}
            vars={vars}
            placeholders={MEMBER_PLACEHOLDERS}
            hint="A chi entra. Non arriva a chi ha i messaggi privati chiusi."
          />

          {levelsCfg ? (
            <section className="rounded-2xl bg-espresso/40 p-4 ring-1 ring-sand/10">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-caramel/12 text-ember">
                  <HandHeart className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-crema">Saluto di benvenuto (EXP)</p>
                  <p className="text-xs text-crema/55">EXP a chi dà il benvenuto a un nuovo membro. Il messaggio di risposta si cancella dopo 12 secondi.</p>
                </div>
                <Toggle checked={greeting.enabled} onChange={(enabled) => setGreeting({ enabled })} label="Saluto di benvenuto" />
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                <Field label="EXP regalati">
                  <div className="mt-1.5">
                    <NumberField
                      className="!mt-0"
                      value={greeting.amount}
                      min={0}
                      max={100000}
                      onChange={(amount) => setGreeting({ amount: Math.max(0, Number(amount) || 0) })}
                      aria-label="EXP del saluto"
                    />
                  </div>
                </Field>
                <Field label="Canali" hint="Vuoto = regole attuali del bot.">
                  <MultiSelect
                    value={greeting.channelIds}
                    onChange={(channelIds) => setGreeting({ channelIds })}
                    options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))}
                    className={fieldClass}
                    placeholder="Predefinito"
                  />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Parole di saluto" hint="Una per riga. Vuoto = l’elenco predefinito del bot (wordReactions).">
                  <ExpandableTextarea
                    value={(greeting.words || []).join("\n")}
                    rows={5}
                    maxLength={8000}
                    placeholder={"Benvenut*\nBenvenuto\nCiao\n..."}
                    onChange={(e) => {
                      const words = e.target.value
                        .split(/\r?\n/)
                        .map((w) => w.trim())
                        .filter(Boolean)
                        .slice(0, 80);
                      setGreeting({ words });
                    }}
                    className={cn(fieldClass, "!mt-0 min-h-28 resize-y py-2.5 font-mono text-[0.8rem] leading-relaxed")}
                    aria-label="Parole che fanno scattare il saluto"
                  />
                </Field>
              </div>

              <div className="mt-4">
                <p className={cn(labelClass, "mb-2")}>Messaggio di risposta</p>
                <EditorWithPreview
                  editor={
                    <DraftEditor
                      key="welcome-greeting"
                      value={greetingDraft}
                      onChange={(noticeDraft) => setGreeting({ noticeDraft })}
                      emojis={data.pickers.emojis}
                      placeholders={BONUS_PLACEHOLDERS}
                      maxButtons={data.limits.buttons}
                    />
                  }
                  preview={
                    <DiscordMessagePreview
                      noTest
                      bot={data.bot}
                      draft={greetingDraft}
                      vars={{ ...vars, amount: String(greeting.amount), exp: String(greeting.amount) }}
                      roles={data.pickers.roles}
                      channels={channels}
                    />
                  }
                />
              </div>
            </section>
          ) : (
            <RowsSkeleton rows={2} />
          )}
        </>
      ) : (
        <DmExtra
          editorKey="goodbye"
          value={cfg.goodbyeDm || GOODBYE_DM_DEFAULT}
          onChange={(goodbyeDm) => setCfg({ ...cfg, goodbyeDm })}
          data={data}
          vars={vars}
          placeholders={MEMBER_PLACEHOLDERS}
          hint="A chi esce. Arriva solo se ha ancora un server in comune col bot e i privati aperti."
        />
      )}
    </div>
  );
}
