"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, type BumpExp, type BumpExpKey, type BumpService, type BumpVotesConfig, type VoteService } from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, SettingRow, Toggle, fieldClass, miniBtn, primaryMini } from "../bits";
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
/* segnaposto in più sul server principale, dove c'è l'EXP */
const EXP_PLACEHOLDERS = [
  { token: "{exp}", hint: "EXP guadagnati" },
  { token: "{bonus}", hint: "righe dei bonus (rapida, streak)" },
  { token: "{streak}", hint: "serie attuale" },
];
const EXP_LABEL: Record<BumpExpKey, string> = { disboard: "Bump su Disboard", discadia: "Bump su Discadia", topgg: "Voto su Top.gg", discadiaVote: "Voto su Discadia" };

const VOTE_PLACEHOLDERS = [
  { token: "{user}", hint: "chi ha votato" },
  { token: "{service}", hint: "Top.gg o Discadia" },
  { token: "{count}", hint: "voti totali di quella persona" },
];
const SERVICE_LABEL = { disboard: "Disboard", discadia: "Discadia" } as const;
const VOTE_LABEL = { topgg: "Top.gg", discadia: "Discadia" } as const;

/** Scelta del servizio di cui modificare il messaggio. */
function ServiceTabs<K extends string>({ value, onChange, labels }: { value: K; onChange: (k: K) => void; labels: Record<K, string> }) {
  return (
    <div className="inline-grid grid-flow-col gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="tablist">
      {(Object.keys(labels) as K[]).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={cn("rounded-md px-3 py-1 text-sm font-semibold transition-colors", value === k ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema")}
        >
          {labels[k]}
        </button>
      ))}
    </div>
  );
}

/** Pagina "Bump e voti": sui server tenant tutto personalizzabile; sul principale le automazioni del bot. */
export function BumpVotesPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, error } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<BumpVotesConfig | null>(null);
  const [urls, setUrls] = useState<{ topgg: string; discadia: string } | null>(null);
  const [isMain, setIsMain] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [imported, setImported] = useState(false);
  const [thanksTab, setThanksTab] = useState<BumpService>("disboard");
  const [reminderTab, setReminderTab] = useState<BumpService>("disboard");
  const [voteTab, setVoteTab] = useState<VoteService>("topgg");
  const vars = useMemo(() => ({ ...sampleVars(data), service: "Disboard", count: "12", role: "@Bumper", exp: "150", streak: "3", bonus: "🔥 Streak 3 **+20 exp**" }), [data]);

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

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => onToast("Copiato."),
      () => onToast("Copia non riuscita.", true),
    );
  };

  const setService = (s: BumpService, p: Partial<BumpVotesConfig["services"][BumpService]>) =>
    set({ ...cfg, services: { ...cfg.services, [s]: { ...cfg.services[s], ...p } } });
  const setExp = (k: BumpExpKey, p: Partial<BumpExp>) => cfg.exp && set({ ...cfg, exp: { ...cfg.exp, [k]: { ...cfg.exp[k], ...p } } });
  const bumpPh = isMain ? [...BUMP_PLACEHOLDERS, ...EXP_PLACEHOLDERS] : BUMP_PLACEHOLDERS;
  const votePh = isMain ? [...VOTE_PLACEHOLDERS, ...EXP_PLACEHOLDERS] : VOTE_PLACEHOLDERS;
  const setVoteService = (s: VoteService, p: Partial<BumpVotesConfig["votes"]["perService"][VoteService]>) =>
    set({ ...cfg, votes: { ...cfg.votes, perService: { ...cfg.votes.perService, [s]: { ...cfg.votes.perService[s], ...p } } } });

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
                <div className="mt-3 space-y-3">
                  <ServiceTabs value={thanksTab} onChange={setThanksTab} labels={SERVICE_LABEL} />
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                    <DraftEditor key={`thanks-${thanksTab}`} value={cfg.services[thanksTab].thanksDraft} onChange={(thanksDraft) => setService(thanksTab, { thanksDraft })} emojis={data.pickers.emojis} placeholders={bumpPh} maxButtons={data.limits.buttons} />
                    <DiscordMessagePreview bot={data.bot} draft={cfg.services[thanksTab].thanksDraft} vars={{ ...vars, service: SERVICE_LABEL[thanksTab] }} roles={data.pickers.roles} channels={channels} />
                  </div>
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
                  <ServiceTabs value={reminderTab} onChange={setReminderTab} labels={SERVICE_LABEL} />
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                    <DraftEditor key={`rem-${reminderTab}`} value={cfg.services[reminderTab].reminderDraft} onChange={(reminderDraft) => setService(reminderTab, { reminderDraft })} emojis={data.pickers.emojis} placeholders={REMINDER_PLACEHOLDERS} maxButtons={data.limits.buttons} />
                    <DiscordMessagePreview bot={data.bot} draft={cfg.services[reminderTab].reminderDraft} vars={{ ...vars, service: SERVICE_LABEL[reminderTab] }} roles={data.pickers.roles} channels={channels} />
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
                  <div className="mt-3 space-y-3">
                    <ServiceTabs value={voteTab} onChange={setVoteTab} labels={VOTE_LABEL} />
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                      <DraftEditor key={`vote-${voteTab}`} value={cfg.votes.perService[voteTab].draft} onChange={(draft) => setVoteService(voteTab, { draft })} emojis={data.pickers.emojis} placeholders={votePh} maxButtons={data.limits.buttons} />
                      <DiscordMessagePreview bot={data.bot} draft={cfg.votes.perService[voteTab].draft} vars={{ ...vars, service: VOTE_LABEL[voteTab] }} roles={data.pickers.roles} channels={channels} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
              <p className="mb-2 text-sm font-semibold text-crema">Ricompensa per il voto</p>
              <Field label="Ruolo di ricompensa" hint="Vuoto = nessun ruolo.">
                <Select value={cfg.votes.rewardRoleId || ""} onChange={(v) => set({ ...cfg, votes: { ...cfg.votes, rewardRoleId: v || null } })} options={roles} className="mt-1.5 h-11 rounded-lg" />
              </Field>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["topgg", "discadia"] as const).map((s) => (
                  <Field key={s} label={`Ore dopo un voto su ${VOTE_LABEL[s]}`}>
                    <NumberField value={cfg.votes.perService[s].hours} min={1} max={720} onChange={(v) => setVoteService(s, { hours: Number(v) || 1 })} aria-label={`Ore ${VOTE_LABEL[s]}`} />
                  </Field>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </FormGroup>

      {isMain && cfg.exp ? (
        <FormGroup title="EXP" description="Solo sul server principale, dove ci sono i livelli. Stessi calcoli del sistema classico: EXP di base, bonus se si risponde subito al promemoria e bonus per la serie.">
          <div className="grid gap-3 lg:grid-cols-2">
            {(Object.keys(EXP_LABEL) as BumpExpKey[]).map((k) => {
              const x = cfg.exp![k];
              const isVote = k === "topgg" || k === "discadiaVote";
              return (
                <div key={k} className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-crema">{EXP_LABEL[k]}</span>
                    <Toggle size="sm" checked={x.enabled} onChange={(enabled) => setExp(k, { enabled })} label={EXP_LABEL[k]} />
                  </div>
                  {x.enabled ? (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                      <Field label="EXP minimi">
                        <NumberField value={x.minExp} min={0} max={100000} onChange={(v) => setExp(k, { minExp: Number(v) || 0 })} aria-label="EXP minimi" />
                      </Field>
                      <Field label="EXP massimi" hint="Uguale ai minimi = sempre gli stessi.">
                        <NumberField value={x.maxExp} min={0} max={100000} onChange={(v) => setExp(k, { maxExp: Number(v) || 0 })} aria-label="EXP massimi" />
                      </Field>
                      {isVote ? (
                        <Field label="Primo voto" hint="0 = come gli altri.">
                          <NumberField value={x.firstTimeExp} min={0} max={100000} onChange={(v) => setExp(k, { firstTimeExp: Number(v) || 0 })} aria-label="EXP primo voto" />
                        </Field>
                      ) : null}
                      <Field label="Rapida: entro minuti" hint="0 = niente bonus.">
                        <NumberField value={x.fastWindowMinutes} min={0} max={1440} onChange={(v) => setExp(k, { fastWindowMinutes: Number(v) || 0 })} aria-label="Minuti risposta rapida" />
                      </Field>
                      <Field label="Rapida: moltiplicatore">
                        <input
                          type="number"
                          step={0.1}
                          min={1}
                          max={10}
                          value={x.fastMultiplier}
                          onChange={(e) => setExp(k, { fastMultiplier: Math.max(1, Number(e.target.value) || 1) })}
                          className={`${fieldClass} h-10 py-0`}
                          aria-label="Moltiplicatore risposta rapida"
                        />
                      </Field>
                      <Field label="Serie: % per volta">
                        <NumberField value={x.streakPercent} min={0} max={1000} onChange={(v) => setExp(k, { streakPercent: Number(v) || 0 })} aria-label="Percentuale serie" />
                      </Field>
                      <Field label="Serie: % massima">
                        <NumberField value={x.streakMaxPercent} min={0} max={10000} onChange={(v) => setExp(k, { streakMaxPercent: Number(v) || 0 })} aria-label="Percentuale massima serie" />
                      </Field>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </FormGroup>
      ) : null}


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
