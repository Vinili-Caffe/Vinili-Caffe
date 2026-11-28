"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Gift, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadReviewHook, saveReviewHook, testReviewHook, type BoardListing, type ReviewHookConfig, type ReviewHookData } from "@/lib/boards";
import type { CommunityData } from "@/lib/dashboard-community";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { Field, Notice, PageSection as Section, RowsSkeleton, Toggle, TrackUnsaved } from "@/components/dashboard/guild/bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, EditorWithPreview, roleOptions, sampleVars } from "@/components/dashboard/guild/community/shared";

const THANKS_PLACEHOLDERS = [
  { token: "{user}", hint: "chi ha recensito" },
  { token: "{username}", hint: "il suo nome" },
  { token: "{stars}", hint: "stelle (⭐…)" },
  { token: "{review}", hint: "testo della recensione" },
  { token: "{reward}", hint: "riga ricompensa" },
  { token: "{sent}", hint: "quando è stata inviata" },
  { token: "{link}", hint: "link alla scheda" },
  { token: "{service}", hint: "Vinili & Caffè" },
  { token: "{server}", hint: "il tuo server" },
];

/** Annuncio come le recensioni sito sul main; livelli solo sul principale; ruolo permanente. */
export function ReviewHookTab({ listing, token, compact = false }: { listing: BoardListing; token: string; compact?: boolean }) {
  const { user } = useAuth();
  const [data, setData] = useState<ReviewHookData | null>(null);
  const [cfg, setCfg] = useState<ReviewHookConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");

  useEffect(() => {
    let alive = true;
    void loadReviewHook(token, listing.id).then((r) => {
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
  const isMain = Boolean(data?.isMainGuild);
  const vars = useMemo(() => {
    const fake = { guild: { id: data?.guild?.id || listing.discordId, name: data?.guild?.name || listing.name, icon: null, banner: null, memberCount: null } } as unknown as CommunityData;
    const roleId = String(cfg?.roleId || "").trim();
    const levels = isMain ? Number(cfg?.rewardLevels ?? 0) : 0;
    const link = data?.listingLink || "https://www.viniliecaffe.it/vetrina/";
    let reward = `Grazie per il supporto!`;
    if (levels > 0) reward = `**+${levels} livelli** per aver lasciato una recensione.${roleId ? ` Ruolo <@&${roleId}>.` : ""}`;
    else if (roleId) reward = `Ruolo <@&${roleId}> per la tua recensione.`;
    return {
      ...sampleVars(fake, {}, user),
      service,
      stars: "⭐⭐⭐⭐⭐",
      review: "Server bellissimo, staff attivo e tanti eventi!",
      link,
      sent: `<t:${Math.floor(Date.now() / 1000)}:R>`,
      reward,
    };
  }, [data, listing, user, service, cfg?.roleId, cfg?.rewardLevels, isMain]);

  if (err) return <Notice error>{err}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const set = (p: Partial<ReviewHookConfig>) => setCfg({ ...cfg, ...p });
  const roles = [{ value: "", label: "— Nessuno —" }, ...roleOptions(data.pickers.roles, data.guild?.id)];
  const roleName = data.pickers.roles.find((r) => r.id === cfg.roleId)?.name || null;
  const channels = data.pickers.textChannels;
  const showLevels = isMain && cfg.rewardLevels > 0;

  const save = async () => {
    setBusy("save");
    const payload = isMain ? cfg : { ...cfg, rewardLevels: 0 };
    const r = await saveReviewHook(token, listing.id, payload);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    setCfg(r.data.config);
    setSaved(JSON.stringify(r.data.config));
    showToast(r.data.message || "Impostazioni salvate");
  };
  const test = async () => {
    setBusy("test");
    const r = await testReviewHook(token, listing.id, isMain ? cfg : { ...cfg, rewardLevels: 0 });
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || "Messaggio di prova inviato");
  };

  return (
    <div className="space-y-6">
      {!compact ? (
        <div className="border-b border-sand/10 pb-6">
          <h2 className="font-display text-4xl font-semibold">Recensioni</h2>
          <p className="mt-1 max-w-2xl text-crema/55">
            Annuncio nel canale come le recensioni sul sito del server principale
            {isMain ? ", con livelli una tantum" : ""}
            {cfg.roleId || roleName ? " e ruolo permanente" : ""}
            . Una sola recensione per utente.
          </p>
        </div>
      ) : null}

      {!data.botInGuild ? <Notice error>Il bot di Vinili &amp; Caffè non è nel server: invitalo per ringraziamenti e ruoli.</Notice> : null}
      {data.seededFromMain ? <Notice>Partenza dal layout del server principale. Puoi modificarlo e salvare.</Notice> : null}

      <div
        className={cn("flex items-center gap-3 rounded-2xl bg-espresso/45 p-4 ring-1 transition-colors", cfg.enabled ? "ring-sand/20" : "opacity-80 ring-sand/10")}
        style={cfg.enabled ? { boxShadow: "inset 3px 0 0 #d99a5b" } : undefined}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#d99a5b] text-base font-semibold text-ink" aria-hidden>
          R
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-crema">Premi per le recensioni</p>
          <p className="truncate text-xs text-crema/55">
            {cfg.enabled
              ? [
                  "Attivo",
                  showLevels ? `+${cfg.rewardLevels} livelli` : null,
                  roleName ? `@${roleName}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Spento"}
          </p>
        </div>
        <button
          type="button"
          disabled={busy === "test" || !cfg.channelId}
          onClick={() => void test()}
          title={cfg.channelId ? "Manda nel canale il messaggio di prova" : "Scegli prima il canale"}
          className="hidden items-center gap-1.5 rounded-full bg-crema/10 px-3.5 py-2 text-xs font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-40 sm:inline-flex"
        >
          <FlaskConical className="size-3.5" /> {busy === "test" ? "Invio…" : "Prova"}
        </button>
        <Toggle size="sm" checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="Recensioni" />
      </div>

      <div className={cn("space-y-5 transition-opacity", !cfg.enabled && "pointer-events-none opacity-45")} aria-disabled={!cfg.enabled}>
        <Section
          icon={Gift}
          title="Ricompensa"
          text={
            isMain
              ? "Vale per /recensioni/ e per la scheda in Vetrina: livelli una tantum, ruolo permanente."
              : "Ruolo permanente a chi recensisce (una volta sola). I livelli restano sul server principale."
          }
        >
          <div className="space-y-3">
            <p className="rounded-xl bg-espresso/45 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-sand/10">
              {showLevels ? (
                <>
                  Chi recensisce riceve <span className="font-semibold text-crema">+{cfg.rewardLevels} livelli</span>
                  {roleName ? (
                    <>
                      {" "}
                      e il ruolo <span className="font-semibold text-ember">@{roleName}</span>.
                    </>
                  ) : (
                    <>.</>
                  )}
                </>
              ) : roleName ? (
                <>
                  Ruolo <span className="font-semibold text-ember">@{roleName}</span> (permanente).
                </>
              ) : (
                <>{isMain ? "Nessun premio: alza i livelli oppure scegli un ruolo." : "Nessun ruolo scelto."}</>
              )}
            </p>
            <div className={cn("grid grid-cols-1 gap-3", isMain ? "sm:grid-cols-2" : "sm:grid-cols-1 sm:max-w-md")}>
              {isMain ? (
                <Field label="Livelli in regalo" hint="0 = spento">
                  <NumberField value={cfg.rewardLevels} min={0} max={100} onChange={(v) => set({ rewardLevels: Math.max(0, Math.floor(Number(v) || 0)) })} aria-label="Livelli" />
                </Field>
              ) : null}
              <Field label="Ruolo" hint="Permanente · una sola recensione">
                <Select value={cfg.roleId || ""} onChange={(v) => set({ roleId: v || null })} options={roles} className="mt-1.5 h-11 rounded-lg" />
              </Field>
            </div>
          </div>
        </Section>

        <Section
          icon={Sparkles}
          title="Messaggio"
          text={isMain ? "Stesso annuncio per /recensioni/ e per le recensioni sulla scheda in Vetrina." : "Annuncio nel canale a ogni nuova recensione sulla scheda."}
          right={<Toggle size="sm" checked={cfg.thanksEnabled} onChange={(v) => set({ thanksEnabled: v })} label="Messaggio" />}
        >
          <div className="mb-4 max-w-md">
            <ChannelField label="Canale" hint="Vuoto = nessun messaggio, solo premi." value={cfg.channelId} channels={channels} onChange={(channelId) => set({ channelId })} />
          </div>
          {cfg.thanksEnabled && cfg.channelId ? (
            <EditorWithPreview
              editor={<DraftEditor value={cfg.draft} onChange={(d) => set({ draft: d })} emojis={data.pickers.emojis} placeholders={THANKS_PLACEHOLDERS} maxButtons={5} />}
              preview={<DiscordMessagePreview noTest bot={data.bot} draft={cfg.draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
            />
          ) : (
            <p className="rounded-xl bg-espresso/45 px-3 py-6 text-center text-sm text-crema/55 ring-1 ring-sand/10">
              {!cfg.channelId ? "Scegli il canale per il messaggio." : "Il messaggio è spento."}
            </p>
          )}

          <div className="mt-4 flex justify-end sm:hidden">
            <button type="button" disabled={busy === "test" || !cfg.channelId} onClick={() => void test()} className="inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25 disabled:opacity-40">
              <FlaskConical className="size-4" /> Prova
            </button>
          </div>
        </Section>
      </div>

      <TrackUnsaved dirty={dirty} onSave={save} onReset={() => setCfg(JSON.parse(saved) as ReviewHookConfig)} />
      {busy === "save" ? <span className="sr-only">Salvataggio…</span> : null}
    </div>
  );
}
