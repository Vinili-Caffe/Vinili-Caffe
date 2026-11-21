"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, FlaskConical, Gift, Heart, MessageSquareHeart, Rocket } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadBumpHook, saveBumpHook, testBumpHook, type BoardListing, type BumpHookConfig, type BumpHookData } from "@/lib/boards";
import type { CommunityData } from "@/lib/dashboard-community";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { Field, Notice, PageSection as Section, RowsSkeleton, Toggle, TrackUnsaved } from "@/components/dashboard/guild/bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, EditorWithPreview, roleOptions, sampleVars } from "@/components/dashboard/guild/community/shared";

const THANKS_BASE = [
  { token: "{user}", hint: "chi ha fatto il bump" },
  { token: "{username}", hint: "il suo nome" },
  { token: "{count}", hint: "bump totali di quella persona" },
  { token: "{service}", hint: "Vinili & Caffè" },
  { token: "{server}", hint: "il tuo server" },
];
const THANKS_EXP = [
  { token: "{exp}", hint: "EXP guadagnati" },
  { token: "{bonus}", hint: "bonus rapida/streak: mettilo su una riga sua (se vuoto la riga sparisce)" },
  { token: "{streak}", hint: "streak" },
  { token: "{level}", hint: "livello dopo il bump" },
];
const REMINDER_PLACEHOLDERS = [
  { token: "{role}", hint: "il ruolo da avvisare" },
  { token: "{service}", hint: "Vinili & Caffè" },
  { token: "{server}", hint: "il tuo server" },
];
const fmtHours = (h: number) => (h === 1 ? "1 ora" : h % 24 === 0 ? (h === 24 ? "1 giorno" : `${h / 24} giorni`) : `${h} ore`);

function plainDraft(content: string): BumpHookConfig["draft"] {
  return {
    content,
    embed: {
      enabled: false,
      title: "",
      description: "",
      color: "",
      imageUrl: "",
      thumbnailUrl: "",
      footerText: "",
      timestamp: false,
      authorName: "",
      authorIconUrl: "",
    },
    buttons: [],
  };
}

const BUMP_THANKS_PRESETS = [
  { id: "classic", label: "Classico", draft: () => plainDraft("{user} grazie per il bump su **{service}**! 💙 Hai fatto {count} bump.") },
  {
    id: "streak",
    label: "Streak + EXP",
    draft: () =>
      plainDraft("{user} bump su **{server}** registrato!\nTotale: {count} · streak {streak}\n{bonus}\n+{exp} EXP → livello {level}"),
  },
] as const;

const BUMP_REMINDER_PRESETS = [
  {
    id: "slash",
    label: "/bump",
    draft: () => plainDraft("{role} si può di nuovo fare il bump su **{service}**! Usa il comando `/bump`."),
  },
  {
    id: "soft",
    label: "Soft",
    draft: () => plainDraft("Hey {role}: **{server}** può di nuovo salire in vetrina. Digita `/bump` quando vuoi."),
  },
] as const;

/** Come la tab Bump della dashboard, ma per i bump della scheda in Vetrina (sito e /bump). */
export function BumpHookTab({ listing, token }: { listing: BoardListing; token: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<BumpHookData | null>(null);
  const [cfg, setCfg] = useState<BumpHookConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "thanks" | "reminder">("");
  const [kind, setKind] = useState<"thanks" | "reminder">("thanks");

  useEffect(() => {
    let alive = true;
    void loadBumpHook(token, listing.id).then((r) => {
      if (!alive) return;
      if (!r.ok) return setErr(r.message);
      setData(r.data);
      setCfg(r.data.config);
      setSaved(JSON.stringify(r.data.config));
    });
    return () => {
      alive = false;
    };
  }, [token, listing.id]);

  const service = data?.serviceName || "Vinili & Caffè";
  const vars = useMemo(() => {
    const fake = { guild: { id: data?.guild?.id || listing.discordId, name: data?.guild?.name || listing.name, icon: null, banner: null, memberCount: null } } as unknown as CommunityData;
    return {
      ...sampleVars(fake, {}, user),
      service,
      count: "12",
      role: cfg?.reminderRoleId ? `<@&${cfg.reminderRoleId}>` : "",
      exp: "150",
      streak: "3",
      bonus: "🔥 Streak 3 **+20 exp**",
      level: "42",
    };
  }, [data, listing, user, service, cfg?.reminderRoleId]);

  if (err) return <Notice error>{err}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const set = (p: Partial<BumpHookConfig>) => setCfg({ ...cfg, ...p });
  const roles = [{ value: "", label: "— Nessuno —" }, ...roleOptions(data.pickers.roles, data.guild?.id)];
  const roleName = (id: string | null) => (id ? data.pickers.roles.find((r) => r.id === id)?.name || "ruolo" : null);
  const channels = data.pickers.textChannels;
  const msgOn = kind === "thanks" ? cfg.thanksEnabled : cfg.reminderEnabled;
  const draft = kind === "thanks" ? cfg.draft : cfg.reminderDraft;

  const save = async () => {
    setBusy("save");
    const r = await saveBumpHook(token, listing.id, cfg);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    setCfg(r.data.config);
    setSaved(JSON.stringify(r.data.config));
    showToast(r.data.message || "Impostazioni salvate");
  };
  const test = async (which: "thanks" | "reminder") => {
    setBusy(which);
    const r = await testBumpHook(token, listing.id, cfg, which);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || "Messaggio di prova inviato");
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-sand/10 pb-6">
        <h2 className="font-display text-4xl font-semibold">Bump</h2>
        <p className="mt-1 max-w-2xl text-crema/55">
          Quando qualcuno fa il bump della scheda (dal sito o con <code className="rounded bg-espresso/70 px-1.5 py-0.5 text-crema/80">/bump</code> nel server), il bot ringrazia, dà la ricompensa e avvisa quando si può rifare: ogni 2 ore.
        </p>
      </div>

      {!data.botInGuild ? <Notice error>Il bot di Vinili &amp; Caffè non è nel server: invitalo per ringraziamenti, ruoli e promemoria.</Notice> : null}

      {/* interruttore generale */}
      <div
        className={cn("flex items-center gap-3 rounded-2xl bg-espresso/45 p-4 ring-1 transition-colors", cfg.enabled ? "ring-sand/20" : "opacity-80 ring-sand/10")}
        style={cfg.enabled ? { boxShadow: "inset 3px 0 0 #d99a5b" } : undefined}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#d99a5b] text-ink" aria-hidden>
          <Rocket className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-crema">Vetrina</p>
          <p className="truncate text-xs text-crema/55">{cfg.enabled ? "Si fa il bump ogni 2 ore" : "Spento"}</p>
        </div>
        <Toggle size="sm" checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="Attiva i bump" />
      </div>

      <div className={cn("space-y-5 transition-opacity", !cfg.enabled && "pointer-events-none opacity-45")} aria-disabled={!cfg.enabled}>
        <Section
          icon={MessageSquareHeart}
          title="Messaggi"
          text="Il ringraziamento risponde al bump; il promemoria avvisa quando si può rifare."
          right={
            <Toggle
              size="sm"
              checked={msgOn}
              onChange={(v) => set(kind === "thanks" ? { thanksEnabled: v } : { reminderEnabled: v })}
              label={kind === "thanks" ? "Ringraziamento" : "Promemoria"}
            />
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "thanks", label: "Ringraziamento", icon: Heart },
                { id: "reminder", label: "Promemoria", icon: BellRing },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={kind === t.id}
                  onClick={() => setKind(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                    kind === t.id ? "bg-crema text-ink" : "bg-espresso/60 text-crema/60 ring-1 ring-sand/15 hover:text-crema",
                  )}
                >
                  <Icon className="size-3.5" /> {t.label}
                </button>
              );
            })}
            <button
              type="button"
              disabled={Boolean(busy) || !msgOn || !(kind === "thanks" ? cfg.channelId : cfg.reminderChannelId || cfg.channelId)}
              onClick={() => void test(kind)}
              title="Manda il messaggio nel canale come se avessi fatto tu il bump"
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-3.5 py-1.5 text-xs font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-40"
            >
              <FlaskConical className="size-3.5" /> {busy === kind ? "Invio…" : "Prova"}
            </button>
          </div>

          {kind === "thanks" ? (
            <div className="mb-4 max-w-md">
              <ChannelField
                label="Canale"
                hint="Vuoto = risponde dove si usa /bump; i bump dal sito scrivono qui solo se scegli un canale."
                value={cfg.channelId}
                channels={channels}
                onChange={(channelId) => set({ channelId })}
              />
            </div>
          ) : cfg.reminderEnabled ? (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ChannelField label="Canale" hint="Vuoto = dove è stato fatto l'ultimo bump." value={cfg.reminderChannelId} channels={channels} onChange={(reminderChannelId) => set({ reminderChannelId })} />
              <Field label="Ruolo da avvisare" hint="Vuoto = nessun ping.">
                <Select value={cfg.reminderRoleId || ""} onChange={(v) => set({ reminderRoleId: v || null })} options={roles} className="mt-1.5 h-11 rounded-lg" />
              </Field>
            </div>
          ) : null}

          {msgOn ? (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(kind === "thanks" ? BUMP_THANKS_PRESETS : BUMP_REMINDER_PRESETS)
                  .filter((p) => p.id !== "streak" || data.isMain)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        set(
                          kind === "thanks"
                            ? { draft: p.draft() as BumpHookConfig["draft"] }
                            : { reminderDraft: p.draft() as BumpHookConfig["reminderDraft"] },
                        )
                      }
                      className="rounded-full bg-crema/8 px-3 py-1 text-xs font-semibold text-crema/70 ring-1 ring-sand/15 hover:bg-crema/12 hover:text-crema"
                    >
                      Preset · {p.label}
                    </button>
                  ))}
              </div>
              <EditorWithPreview
                editor={
                  <DraftEditor
                    key={kind}
                    value={draft}
                    onChange={(d) => set(kind === "thanks" ? { draft: d } : { reminderDraft: d })}
                    emojis={data.pickers.emojis}
                    placeholders={kind === "thanks" ? (data.isMain ? [...THANKS_BASE, ...THANKS_EXP] : THANKS_BASE) : REMINDER_PLACEHOLDERS}
                    maxButtons={5}
                  />
                }
                preview={<DiscordMessagePreview noTest bot={data.bot} draft={draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
              />
            </>
          ) : (
            <p className="rounded-xl bg-espresso/45 px-3 py-6 text-center text-sm text-crema/55 ring-1 ring-sand/10">
              {kind === "thanks" ? "Il ringraziamento è spento." : "Il promemoria è spento."} Accendilo con l&apos;interruttore qui sopra.
            </p>
          )}
        </Section>

        <Section icon={Gift} title="Ricompensa" text="Un ruolo a tempo per chi fa il bump; il bot lo toglie da solo allo scadere.">
          <div className="space-y-3">
            <p className="rounded-xl bg-espresso/45 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-sand/10">
              {roleName(cfg.rewardRoleId) ? (
                <>
                  Chi fa il bump riceve <span className="font-semibold text-ember">@{roleName(cfg.rewardRoleId)}</span> per <span className="font-semibold text-crema">{fmtHours(cfg.hours)}</span>.
                </>
              ) : (
                <>Nessun ruolo: scegline uno qui sotto se vuoi premiare chi fa il bump.</>
              )}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <Field label="Ruolo">
                <Select value={cfg.rewardRoleId || ""} onChange={(v) => set({ rewardRoleId: v || null })} options={roles} className="mt-1.5 h-11 rounded-lg" />
              </Field>
              <Field label="Per quante ore">
                <NumberField value={cfg.hours} min={1} max={720} onChange={(v) => set({ hours: Number(v) || 1 })} aria-label="Ore" />
              </Field>
            </div>
          </div>
        </Section>

        {data.isMain ? <p className="text-xs text-crema/45">Sul server principale chi fa il bump prende anche gli EXP, con le stesse regole del bump di Disboard.</p> : null}
      </div>

      <TrackUnsaved dirty={dirty} onSave={save} onReset={() => setCfg(JSON.parse(saved) as BumpHookConfig)} />
      {busy === "save" ? <span className="sr-only">Salvataggio…</span> : null}
    </div>
  );
}
