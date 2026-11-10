"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, Rocket, Star, Trophy } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { communityApi, type BumpVotesConfig, type BumpVotesLeaderboard } from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, SettingRow, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, roleOptions, sampleVars, useCommunity } from "./shared";

const BUMP_PLACEHOLDERS = [
  { token: "{user}", hint: "chi ha bumpato" },
  { token: "{service}", hint: "Disboard o Discadia" },
  { token: "{count}", hint: "bump totali di quella persona" },
];
const REMINDER_PLACEHOLDERS = [
  { token: "{role}", hint: "il ruolo da avvisare" },
  { token: "{service}", hint: "Disboard o Discadia" },
];
const VOTE_PLACEHOLDERS = [
  { token: "{user}", hint: "chi ha votato" },
  { token: "{service}", hint: "Top.gg o Discadia" },
  { token: "{count}", hint: "voti totali di quella persona" },
];
const SERVICE_LABEL = { disboard: "Disboard", discadia: "Discadia" } as const;

/** Pagina "Bump e voti": sui server tenant tutto personalizzabile; sul principale le automazioni del bot. */
export function BumpVotesPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, error } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<BumpVotesConfig | null>(null);
  const [urls, setUrls] = useState<{ topgg: string; discadia: string } | null>(null);
  const [isMain, setIsMain] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [board, setBoard] = useState<BumpVotesLeaderboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [imported, setImported] = useState(false);
  const vars = useMemo(() => ({ ...sampleVars(data), service: "Disboard", count: "12", role: "@Bumper" }), [data]);

  useEffect(() => {
    let alive = true;
    void communityApi.getBumpVotes(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      setIsMain(r.data.isMainGuild === true);
      setImported(r.data.imported === true);
      if (r.data.config) setCfg(r.data.config);
      if (r.data.urls) setUrls(r.data.urls);
    });
    void communityApi.bumpVotesLeaderboard(token, guildId).then((r) => {
      if (alive && r.ok) setBoard({ bumps: r.data.bumps || [], votes: r.data.votes || [] });
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  if (loadError && isMain == null) return <Notice error>{loadError}</Notice>;
  if (isMain == null) return <RowsSkeleton rows={4} />;
  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;

  const set = (next: BumpVotesConfig) => {
    setCfg(next);
    setDirty(true);
  };
  const roles = [{ value: "", label: "— Nessuno —" }, ...roleOptions(data.pickers.roles, guildId)];
  const channels = data.pickers.textChannels;

  const save = async () => {
    setBusy(true);
    const r = await communityApi.saveBumpVotes(token, guildId, cfg);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    setCfg(r.data.config);
    setUrls(r.data.urls);
    setDirty(false);
    onToast("Bump e voti salvati.");
  };

  const regen = async () => {
    setBusy(true);
    const r = await communityApi.regenBumpVotesToken(token, guildId);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    setCfg((c) => (c ? { ...c, votes: { ...c.votes, token: r.data.config.votes.token } } : c));
    setUrls(r.data.urls);
    onToast("Nuovo indirizzo creato: aggiornalo su Top.gg e Discadia.");
  };

  const reset = async (which: "bumps" | "votes") => {
    const r = await communityApi.resetBumpVotesLeaderboard(token, guildId, which);
    if (!r.ok) return onToast(r.message, true);
    setBoard((b) => (b ? { ...b, [which]: [] } : b));
    onToast("Classifica azzerata.");
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => onToast("Copiato."),
      () => onToast("Copia non riuscita.", true),
    );
  };

  const rewardFields = (reward: BumpVotesConfig["reward"], onChange: (r: BumpVotesConfig["reward"]) => void) => (
    <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
      <Field label="Ruolo di ricompensa" hint="Vuoto = nessun ruolo.">
        <Select value={reward.roleId || ""} onChange={(v) => onChange({ ...reward, roleId: v || null })} options={roles} className="mt-1.5 h-11 rounded-lg" />
      </Field>
      <Field label="Per quante ore">
        <NumberField value={reward.hours} min={1} max={720} onChange={(v) => onChange({ ...reward, hours: Number(v) || 1 })} aria-label="Ore" />
      </Field>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-crema/60">Il bot riconosce i bump di Disboard e Discadia e i voti su Top.gg e Discadia: ringrazia, dà un ruolo a tempo e avvisa quando si può bumpare di nuovo.</p>
        <button type="button" className={primaryMini} disabled={busy || !dirty} onClick={() => void save()}>
          Salva
        </button>
      </div>

      {imported ? (
        <Notice>Ho importato le impostazioni di adesso del server principale: attese, ringraziamento, promemoria con il ruolo dei bump, canale e testo dei voti, ruolo Voter. Sono spente: accendile quando vuoi passare al modulo.</Notice>
      ) : null}
      {isMain ? (
        <Notice>
          Server principale: finché qui i bump sono spenti resta attivo il sistema classico del bot (EXP, serie e promemoria). Accendendo un servizio qui, quello classico si ferma per quel servizio. I voti passano al modulo quando incolli i nuovi indirizzi su Top.gg e Discadia.
        </Notice>
      ) : null}

      <FormGroup title="Bump" description="Quando qualcuno usa /bump di Disboard o Discadia in questo server.">
        <SettingRow title="Attiva i bump" description="Ringraziamento, ricompensa e promemoria.">
          <Toggle checked={cfg.enabled} onChange={(enabled) => set({ ...cfg, enabled })} label="Attiva i bump" />
        </SettingRow>
        {cfg.enabled ? (
          <div className="mt-3 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["disboard", "discadia"] as const).map((s) => (
                <div key={s} className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-crema">{SERVICE_LABEL[s]}</span>
                    <Toggle size="sm" checked={cfg.services[s].enabled} onChange={(enabled) => set({ ...cfg, services: { ...cfg.services, [s]: { ...cfg.services[s], enabled } } })} label={SERVICE_LABEL[s]} />
                  </div>
                  <Field label="Minuti prima del prossimo bump">
                    <NumberField value={cfg.services[s].cooldownMinutes} min={5} max={10080} onChange={(v) => set({ ...cfg, services: { ...cfg.services, [s]: { ...cfg.services[s], cooldownMinutes: Number(v) || 5 } } })} aria-label="Minuti" />
                  </Field>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
              <SettingRow title="Messaggio di ringraziamento" description="Risponde al messaggio del bump.">
                <Toggle size="sm" checked={cfg.thanks.enabled} onChange={(enabled) => set({ ...cfg, thanks: { ...cfg.thanks, enabled } })} label="Ringraziamento" />
              </SettingRow>
              {cfg.thanks.enabled ? (
                <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                  <DraftEditor value={cfg.thanks.draft} onChange={(draft) => set({ ...cfg, thanks: { ...cfg.thanks, draft } })} emojis={data.pickers.emojis} placeholders={BUMP_PLACEHOLDERS} maxButtons={data.limits.buttons} />
                  <DiscordMessagePreview bot={data.bot} draft={cfg.thanks.draft} vars={vars} roles={data.pickers.roles} channels={channels} />
                </div>
              ) : null}
            </div>

            <div className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
              <SettingRow title="Promemoria" description="Quando si può bumpare di nuovo, il bot lo scrive.">
                <Toggle size="sm" checked={cfg.reminder.enabled} onChange={(enabled) => set({ ...cfg, reminder: { ...cfg.reminder, enabled } })} label="Promemoria" />
              </SettingRow>
              {cfg.reminder.enabled ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ChannelField label="Canale" hint="Vuoto = dove è stato fatto il bump." value={cfg.reminder.channelId} channels={channels} onChange={(channelId) => set({ ...cfg, reminder: { ...cfg.reminder, channelId } })} />
                    <Field label="Ruolo da avvisare" hint="Vuoto = nessun ping.">
                      <Select value={cfg.reminder.roleId || ""} onChange={(v) => set({ ...cfg, reminder: { ...cfg.reminder, roleId: v || null } })} options={roles} className="mt-1.5 h-11 rounded-lg" />
                    </Field>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                    <DraftEditor value={cfg.reminder.draft} onChange={(draft) => set({ ...cfg, reminder: { ...cfg.reminder, draft } })} emojis={data.pickers.emojis} placeholders={REMINDER_PLACEHOLDERS} maxButtons={data.limits.buttons} />
                    <DiscordMessagePreview bot={data.bot} draft={cfg.reminder.draft} vars={vars} roles={data.pickers.roles} channels={channels} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
              <p className="mb-2 text-sm font-semibold text-crema">Ricompensa per il bump</p>
              {rewardFields(cfg.reward, (reward) => set({ ...cfg, reward }))}
            </div>
          </div>
        ) : null}
      </FormGroup>

      <FormGroup title="Voti" description="Collega la scheda del server su Top.gg o Discadia: a ogni voto il bot ringrazia e dà il ruolo.">
        <SettingRow title="Attiva i voti" description="Servono gli indirizzi qui sotto, da incollare nelle impostazioni webhook dei siti.">
          <Toggle checked={cfg.votes.enabled} onChange={(enabled) => set({ ...cfg, votes: { ...cfg.votes, enabled } })} label="Attiva i voti" />
        </SettingRow>
        {cfg.votes.enabled ? (
          <div className="mt-3 space-y-4">
            {dirty ? <Notice>Salva prima di collegare i siti: gli indirizzi funzionano dopo il salvataggio.</Notice> : null}
            {(["topgg", "discadia"] as const).map((s) => (
              <div key={s} className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-crema">{s === "topgg" ? "Top.gg" : "Discadia"}</span>
                  <Toggle size="sm" checked={cfg.votes[s]} onChange={(on) => set({ ...cfg, votes: { ...cfg.votes, [s]: on } })} label={s === "topgg" ? "Top.gg" : "Discadia"} />
                </div>
                {cfg.votes[s] && urls ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input readOnly value={urls[s]} className={`${fieldClass} mt-0 font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} aria-label="Indirizzo webhook" />
                    <button type="button" className={miniBtn} onClick={() => copy(urls[s])} aria-label="Copia">
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                ) : null}
                {cfg.votes[s] ? (
                  <p className="mt-1.5 text-xs text-crema/55">
                    {s === "topgg"
                      ? "Su Top.gg: pagina del server → Webhooks → incolla l'indirizzo come Webhook URL (nel campo Authorization puoi lasciare quello che vuoi)."
                      : "Su Discadia: impostazioni del server → Webhook dei voti → incolla l'indirizzo."}
                  </p>
                ) : null}
              </div>
            ))}
            <button type="button" className={miniBtn} disabled={busy} onClick={() => void regen()}>
              <RefreshCw className="size-3.5" /> Crea un nuovo indirizzo
            </button>

            <ChannelField label="Canale dei ringraziamenti" hint="Vuoto = nessun messaggio, solo il ruolo." value={cfg.votes.channelId} channels={channels} onChange={(channelId) => set({ ...cfg, votes: { ...cfg.votes, channelId } })} />
            {cfg.votes.channelId ? (
              <div className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
                <SettingRow title="Messaggio di ringraziamento" description="Scritto nel canale scelto a ogni voto.">
                  <Toggle size="sm" checked={cfg.votes.thanks.enabled} onChange={(enabled) => set({ ...cfg, votes: { ...cfg.votes, thanks: { ...cfg.votes.thanks, enabled } } })} label="Ringraziamento voti" />
                </SettingRow>
                {cfg.votes.thanks.enabled ? (
                  <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                    <DraftEditor value={cfg.votes.thanks.draft} onChange={(draft) => set({ ...cfg, votes: { ...cfg.votes, thanks: { ...cfg.votes.thanks, draft } } })} emojis={data.pickers.emojis} placeholders={VOTE_PLACEHOLDERS} maxButtons={data.limits.buttons} />
                    <DiscordMessagePreview bot={data.bot} draft={cfg.votes.thanks.draft} vars={{ ...vars, service: "Top.gg" }} roles={data.pickers.roles} channels={channels} />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
              <p className="mb-2 text-sm font-semibold text-crema">Ricompensa per il voto</p>
              {rewardFields(cfg.votes.reward, (reward) => set({ ...cfg, votes: { ...cfg.votes, reward } }))}
            </div>
          </div>
        ) : null}
      </FormGroup>

      <FormGroup title="Classifica" description="Chi ha bumpato e votato di più su questo server.">
        <div className="grid gap-4 md:grid-cols-2">
          {(["bumps", "votes"] as const).map((which) => {
            const list = board?.[which] || [];
            return (
              <div key={which} className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-crema">
                    {which === "bumps" ? <Rocket className="size-4 text-ember" /> : <Star className="size-4 text-ember" />}
                    {which === "bumps" ? "Bump" : "Voti"}
                  </span>
                  {list.length ? (
                    <button type="button" className={dangerBtn} onClick={() => void reset(which)}>
                      Azzera
                    </button>
                  ) : null}
                </div>
                {!board ? (
                  <RowsSkeleton rows={3} />
                ) : list.length ? (
                  <ol className="space-y-1">
                    {list.map((row, i) => (
                      <li key={row.id} className="flex items-center gap-2 text-sm">
                        <span className="w-6 text-right tabular-nums text-crema/50">{i + 1}.</span>
                        {i === 0 ? <Trophy className="size-3.5 text-ember" /> : null}
                        <span className="min-w-0 flex-1 truncate text-crema" translate="no">
                          {row.name}
                        </span>
                        <span className="tabular-nums font-semibold text-crema/80">{row.count}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-crema/50">Ancora nessuno.</p>
                )}
              </div>
            );
          })}
        </div>
      </FormGroup>

      {dirty ? (
        <div className="sticky bottom-3 z-10 flex justify-end">
          <button type="button" className={primaryMini} disabled={busy} onClick={() => void save()}>
            Salva le modifiche
          </button>
        </div>
      ) : null}
    </div>
  );
}
