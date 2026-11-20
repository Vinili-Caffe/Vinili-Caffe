"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, FlaskConical, Gift, Globe, MessageCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadVoteHook, saveVoteHook, testVoteHook, type BoardListing, type VoteHookConfig, type VoteHookData } from "@/lib/boards";
import type { CommunityData } from "@/lib/dashboard-community";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { Field, Notice, PageSection as Section, RowsSkeleton, Toggle, TrackUnsaved } from "@/components/dashboard/guild/bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, roleOptions, sampleVars } from "@/components/dashboard/guild/community/shared";

const THANKS_PLACEHOLDERS = [
  { token: "{user}", hint: "chi ha votato" },
  { token: "{username}", hint: "il suo nome" },
  { token: "{count}", hint: "quante volte ha votato" },
  { token: "{service}", hint: "Vinili & Caffè" },
  { token: "{server}", hint: "il tuo server" },
  { token: "{exp}", hint: "EXP guadagnati" },
  { token: "{bonus}", hint: "bonus rapida/streak: mettilo su una riga sua (se vuoto la riga sparisce)" },
  { token: "{streak}", hint: "giorni di streak" },
  { token: "{level}", hint: "livello dopo il voto" },
  { token: "{role}", hint: "ruolo ricompensa" },
  { token: "{hours}", hint: "ore del ruolo" },
];
const REMINDER_PLACEHOLDERS = [
  { token: "{server}", hint: "il tuo server" },
  { token: "{service}", hint: "Vinili & Caffè" },
  { token: "{link}", hint: "pagina per votare" },
];
const fmtHours = (h: number) => (h === 1 ? "1 ora" : h % 24 === 0 ? (h === 24 ? "1 giorno" : `${h / 24} giorni`) : `${h} ore`);

/** Cosa fa il bot nel tuo server quando qualcuno vota la scheda: ringraziamento, ruolo, promemoria. */
export function VoteHookTab({ listing, token, compact = false }: { listing: BoardListing; token: string; compact?: boolean }) {
  const { user } = useAuth();
  const [data, setData] = useState<VoteHookData | null>(null);
  const [cfg, setCfg] = useState<VoteHookConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [msgKind, setMsgKind] = useState<"thanks" | "reminder">("thanks");

  useEffect(() => {
    let alive = true;
    void loadVoteHook(token, listing.id).then((r) => {
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
    const roleId = String(cfg?.roleId || "").trim();
    return {
      ...sampleVars(fake, {}, user),
      service,
      count: "12",
      link: `https://www.viniliecaffe.it/vetrina/vota/?slug=${listing.slug}`,
      /* stessi sample del modulo Voti: i draft seedati da Top.gg usano {exp}/{bonus} */
      exp: "150",
      streak: "3",
      bonus: "🔥 Streak 3 **+20 exp**",
      level: "42",
      fast: "0",
      hours: String(cfg?.hours || 12),
      role: roleId ? `<@&${roleId}>` : "",
    };
  }, [data, listing, user, service, cfg?.roleId, cfg?.hours]);

  if (err) return <Notice error>{err}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const set = (p: Partial<VoteHookConfig>) => setCfg({ ...cfg, ...p });
  const roles = [{ value: "", label: "— Nessuno —" }, ...roleOptions(data.pickers.roles, data.guild?.id)];
  const roleName = data.pickers.roles.find((r) => r.id === cfg.roleId)?.name || null;
  const channels = data.pickers.textChannels;

  const save = async () => {
    setBusy("save");
    const r = await saveVoteHook(token, listing.id, cfg);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    setCfg(r.data.config);
    setSaved(JSON.stringify(r.data.config));
    showToast(r.data.message || "Impostazioni salvate");
  };
  const test = async () => {
    setBusy("test");
    const r = await testVoteHook(token, listing.id, cfg);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || "Messaggio di prova inviato");
  };

  return (
    <div className="space-y-6">
      {!compact ? (
        <div className="border-b border-sand/10 pb-6">
          <h2 className="font-display text-4xl font-semibold">Voti</h2>
          <p className="mt-1 max-w-2xl text-crema/55">
            Quando qualcuno vota la scheda, il bot di Vinili &amp; Caffè lo ringrazia nel tuo server e gli dà un ruolo per qualche ora.
          </p>
        </div>
      ) : null}

      {!data.botInGuild ? <Notice error>Il bot di Vinili &amp; Caffè non è nel server: invitalo per ringraziamenti e ruoli.</Notice> : null}

      {/* interruttore generale */}
      <div
        className={cn("flex items-center gap-3 rounded-2xl bg-espresso/45 p-4 ring-1 transition-colors", cfg.enabled ? "ring-sand/20" : "opacity-80 ring-sand/10")}
        style={cfg.enabled ? { boxShadow: "inset 3px 0 0 #d99a5b" } : undefined}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#d99a5b] text-base font-bold text-ink" aria-hidden>
          V
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-crema">Vetrina</p>
          <p className="truncate text-xs text-crema/55">{cfg.enabled ? `Ruolo per ${fmtHours(cfg.hours)} dopo ogni voto` : "Spento"}</p>
        </div>
        <button
          type="button"
          disabled={busy === "test" || !cfg.channelId}
          onClick={() => void test()}
          title={cfg.channelId ? "Manda nel canale il ringraziamento come se avessi votato tu" : "Scegli prima il canale"}
          className="hidden items-center gap-1.5 rounded-full bg-crema/10 px-3.5 py-2 text-xs font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-40 sm:inline-flex"
        >
          <FlaskConical className="size-3.5" /> {busy === "test" ? "Invio…" : "Prova un voto"}
        </button>
        <Toggle size="sm" checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="Vetrina" />
      </div>

      <div className={cn("space-y-5 transition-opacity", !cfg.enabled && "pointer-events-none opacity-45")} aria-disabled={!cfg.enabled}>
        <Section icon={Gift} title="Ricompensa" text="Chi vota riceve il ruolo nel server; il bot lo toglie da solo allo scadere.">
          <div className="space-y-3">
            <p className="rounded-xl bg-espresso/45 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-sand/10">
              {roleName ? (
                <>
                  Chi vota riceve <span className="font-semibold text-ember">@{roleName}</span> per <span className="font-semibold text-crema">{fmtHours(cfg.hours)}</span>.
                </>
              ) : (
                <>Nessun ruolo: scegline uno qui sotto se vuoi premiare chi vota.</>
              )}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Ruolo">
                <Select value={cfg.roleId || ""} onChange={(v) => set({ roleId: v || null })} options={roles} className="mt-1.5 h-11 rounded-lg" />
              </Field>
              <Field label="Ore del ruolo dopo un voto">
                <NumberField value={cfg.hours} min={1} max={720} onChange={(v) => set({ hours: Number(v) || 1 })} aria-label="Ore del ruolo" />
              </Field>
            </div>
          </div>
        </Section>

        <Section
          icon={BellRing}
          title="Promemoria"
          text="Chi vota può chiedere di essere avvisato quando può rivotare: scegli come arriva l'avviso."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Come arriva il promemoria">
            {(
              [
                { id: "dm", icon: MessageCircle, title: "In privato su Discord", text: "Il bot gli scrive un messaggio privato (se non può, arriva la notifica sul sito)." },
                { id: "site", icon: Globe, title: "Solo notifica sul sito", text: "Nessun messaggio privato: solo la notifica sul sito di Vinili & Caffè." },
              ] as const
            ).map((o) => {
              const on = cfg.reminderMode === o.id;
              const Icon = o.icon;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ reminderMode: o.id })}
                  className={cn("flex gap-3 rounded-2xl p-4 text-left ring-1 transition-colors", on ? "bg-caramel/12 ring-caramel/50" : "bg-espresso/45 ring-sand/12 hover:ring-sand/25")}
                >
                  <Icon className={cn("mt-0.5 size-5 shrink-0", on ? "text-ember" : "text-crema/45")} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-crema">{o.title}</span>
                    <span className="mt-0.5 block text-xs text-crema/55">{o.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          icon={Sparkles}
          title="Messaggi"
          text={msgKind === "thanks" ? "A ogni voto il bot scrive nel canale scelto." : "Il messaggio privato del promemoria."}
          right={
            msgKind === "thanks" ? <Toggle size="sm" checked={cfg.thanksEnabled} onChange={(v) => set({ thanksEnabled: v })} label="Ringraziamento" /> : undefined
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "thanks", label: "Ringraziamento" },
                { id: "reminder", label: "Promemoria in privato" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={msgKind === t.id}
                onClick={() => setMsgKind(t.id)}
                className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors", msgKind === t.id ? "bg-crema text-ink" : "bg-espresso/60 text-crema/60 ring-1 ring-sand/15 hover:text-crema")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {msgKind === "thanks" ? (
            <>
              <div className="mb-4 max-w-md">
                <ChannelField label="Canale dei ringraziamenti" hint="Vuoto = nessun messaggio, solo il ruolo." value={cfg.channelId} channels={channels} onChange={(channelId) => set({ channelId })} />
              </div>
              {cfg.thanksEnabled && cfg.channelId ? (
                <Studio
                  editor={<DraftEditor key="thanks" value={cfg.draft} onChange={(d) => set({ draft: d })} emojis={data.pickers.emojis} placeholders={THANKS_PLACEHOLDERS} maxButtons={5} />}
                  preview={<DiscordMessagePreview noTest bot={data.bot} draft={cfg.draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
                />
              ) : (
                <p className="rounded-xl bg-espresso/45 px-3 py-6 text-center text-sm text-crema/55 ring-1 ring-sand/10">
                  {!cfg.channelId ? "Scegli il canale per scrivere il ringraziamento." : "Il ringraziamento è spento."}
                </p>
              )}
            </>
          ) : cfg.reminderMode === "dm" ? (
            <Studio
              editor={<DraftEditor key="reminder" value={cfg.reminderDraft} onChange={(d) => set({ reminderDraft: d })} emojis={data.pickers.emojis} placeholders={REMINDER_PLACEHOLDERS} maxButtons={5} />}
              preview={<DiscordMessagePreview noTest bot={data.bot} draft={cfg.reminderDraft} vars={vars} roles={data.pickers.roles} channels={channels} />}
            />
          ) : (
            <p className="rounded-xl bg-espresso/45 px-3 py-6 text-center text-sm text-crema/55 ring-1 ring-sand/10">Il promemoria arriva solo come notifica sul sito: niente messaggio privato da scrivere.</p>
          )}

          <div className="mt-4 flex justify-end sm:hidden">
            <button type="button" disabled={busy === "test" || !cfg.channelId} onClick={() => void test()} className="inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25 disabled:opacity-40">
              <FlaskConical className="size-4" /> Prova un voto
            </button>
          </div>
        </Section>
      </div>

      <TrackUnsaved dirty={dirty} onSave={save} onReset={() => setCfg(JSON.parse(saved) as VoteHookConfig)} />
      {busy === "save" ? <span className="sr-only">Salvataggio…</span> : null}
    </div>
  );
}

/** Editor e anteprima affiancati quando c'è spazio. */
function Studio({ editor, preview }: { editor: React.ReactNode; preview: React.ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0">{editor}</div>
        <div className="min-w-0">
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Anteprima</p>
          {preview}
        </div>
      </div>
    </div>
  );
}
