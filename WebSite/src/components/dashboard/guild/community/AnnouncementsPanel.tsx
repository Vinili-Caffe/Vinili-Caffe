"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Tags, Trash2 } from "lucide-react";
import { MultiSelect } from "@/components/ui/Select";
import { NumberField } from "@/components/ui/NumberField";
import { cn } from "@/lib/cn";
import { communityApi, emptyDraft, type AnnouncementsConfig, type RoleAnnounceRule } from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, SettingRow, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, roleOptions, sampleVars, useCommunity } from "./shared";

const BOOST_PLACEHOLDERS = [
  { token: "{user}", hint: "chi ha boostato" },
  { token: "{username}", hint: "il suo nome" },
  { token: "{avatar}", hint: "la sua foto (per immagini)" },
  { token: "{boosts}", hint: "boost totali del server" },
  { token: "{tier}", hint: "livello boost del server" },
  { token: "{server}", hint: "nome del server" },
];
const ROLE_PLACEHOLDERS = [
  { token: "{user}", hint: "chi ha ricevuto il ruolo" },
  { token: "{username}", hint: "il suo nome" },
  { token: "{avatar}", hint: "la sua foto (per immagini)" },
  { token: "{role}", hint: "il ruolo (menzione)" },
  { token: "{role.name}", hint: "il nome del ruolo" },
  { token: "{server}", hint: "nome del server" },
];

/** Annunci → Boost e Ruolo ottenuto. */
export function AnnouncementsPanel({
  guildId,
  token,
  onToast,
  tab,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  tab: "boost" | "ruolinuovi";
}) {
  const { data, error } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<AnnouncementsConfig | null>(null);
  const [maxRules, setMaxRules] = useState(20);
  const [imported, setImported] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [boostTab, setBoostTab] = useState<"first" | "repeat">("first");
  const [openRule, setOpenRule] = useState<string | null>(null);
  const vars = useMemo(() => {
    const role = data?.pickers.roles.find((r) => !r.managed);
    return { ...sampleVars(data), boosts: "14", tier: "2", role: role ? `<@&${role.id}>` : "@Ruolo", "role.name": role?.name || "Ruolo" };
  }, [data]);

  useEffect(() => {
    let alive = true;
    void communityApi.getAnnouncements(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      setCfg(r.data.config);
      setMaxRules(r.data.maxRules || 20);
      setImported(r.data.imported === true);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  if ((error && !data) || (loadError && !cfg)) return <Notice error>{error || loadError}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;

  const set = (next: AnnouncementsConfig) => {
    setCfg(next);
    setDirty(true);
  };
  const channels = data.pickers.textChannels;

  const save = async () => {
    setBusy(true);
    const r = await communityApi.saveAnnouncements(token, guildId, cfg);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    setCfg(r.data.config);
    setDirty(false);
    onToast("Annunci salvati.");
  };

  const saveBar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-crema/60">
        {tab === "boost" ? "Un messaggio quando qualcuno boosta il server: uno per il primo boost e uno per quelli dopo." : "Un messaggio quando qualcuno riceve certi ruoli, dati a mano o presi dai pannelli."}
      </p>
      <button type="button" className={primaryMini} disabled={busy || !dirty} onClick={() => void save()}>
        Salva
      </button>
    </div>
  );

  if (tab === "boost") {
    const b = cfg.boost;
    const draft = boostTab === "first" ? b.firstDraft : b.repeatDraft;
    return (
      <div className="space-y-4">
        {imported ? <Notice>Ho importato l&apos;annuncio dei boost del server principale (primo boost e doppio boost). È spento: accendilo quando vuoi usarlo.</Notice> : null}
        {saveBar}
        <FormGroup title="Annuncio dei boost">
          <SettingRow title="Annuncia i boost" description="Ogni volta che qualcuno boosta il server.">
            <Toggle checked={b.enabled} onChange={(enabled) => set({ ...cfg, boost: { ...b, enabled } })} label="Annuncia i boost" />
          </SettingRow>
          {b.enabled ? (
            <div className="mt-3 space-y-3">
              <ChannelField label="Canale" hint="Vuoto = il canale dei messaggi di sistema di Discord." value={b.channelId} channels={channels} onChange={(channelId) => set({ ...cfg, boost: { ...b, channelId } })} />
              <div className="inline-grid grid-flow-col gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="tablist">
                {(
                  [
                    ["first", "Primo boost"],
                    ["repeat", "Boost successivi"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={boostTab === k}
                    onClick={() => setBoostTab(k)}
                    className={cn("rounded-md px-3 py-1 text-sm font-semibold transition-colors", boostTab === k ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                <DraftEditor
                  key={boostTab}
                  value={draft}
                  onChange={(d) => set({ ...cfg, boost: boostTab === "first" ? { ...b, firstDraft: d } : { ...b, repeatDraft: d } })}
                  emojis={data.pickers.emojis}
                  placeholders={BOOST_PLACEHOLDERS}
                  maxButtons={data.limits.buttons}
                />
                <DiscordMessagePreview bot={data.bot} draft={draft} vars={vars} roles={data.pickers.roles} channels={channels} />
              </div>
            </div>
          ) : null}
        </FormGroup>
      </div>
    );
  }

  const rules = cfg.roles.rules;
  /* anteprima: il primo ruolo scelto nella regola (non uno a caso) */
  const ruleVars = (r: RoleAnnounceRule) => {
    const role = data.pickers.roles.find((x) => x.id === r.roleIds[0]);
    return role ? { ...vars, role: `<@&${role.id}>`, "role.name": role.name } : vars;
  };
  const setRule = (id: string, p: Partial<RoleAnnounceRule>) => set({ ...cfg, roles: { ...cfg.roles, rules: rules.map((r) => (r.id === id ? { ...r, ...p } : r)) } });
  const addRule = () => {
    const id = `r${Date.now().toString(36)}`;
    set({
      ...cfg,
      roles: {
        ...cfg.roles,
        rules: [
          ...rules,
          {
            id,
            name: `Regola ${rules.length + 1}`,
            enabled: true,
            roleIds: [],
            channelId: null,
            cooldownHours: 24,
            draft: emptyDraft({ content: "{user}", embed: { ...emptyDraft().embed, title: "Nuovo ruolo!", description: "{user} ha ottenuto il ruolo {role}!" } }),
          },
        ],
      },
    });
    setOpenRule(id);
  };

  return (
    <div className="space-y-4">
      {imported ? <Notice>Ho importato l&apos;annuncio del ruolo Guilded del server principale. È spento: accendilo quando vuoi usarlo.</Notice> : null}
      {saveBar}
      <FormGroup title="Annunci dei ruoli">
        <SettingRow title="Annuncia i ruoli" description="Accende o spegne tutte le regole qui sotto.">
          <Toggle checked={cfg.roles.enabled} onChange={(enabled) => set({ ...cfg, roles: { ...cfg.roles, enabled } })} label="Annuncia i ruoli" />
        </SettingRow>
        <div className="mt-3 space-y-2">
          {rules.map((r) => {
            const open = openRule === r.id;
            return (
              <div key={r.id} className="rounded-xl bg-espresso/40 ring-1 ring-sand/10">
                <div className="flex items-center gap-2 p-3">
                  <button type="button" onClick={() => setOpenRule(open ? null : r.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <Tags className="size-4 shrink-0 text-ember" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-crema">{r.name}</span>
                    <span className="text-xs text-crema/50">{r.roleIds.length ? `${r.roleIds.length} ${r.roleIds.length === 1 ? "ruolo" : "ruoli"}` : "nessun ruolo"}</span>
                    <ChevronDown className={cn("size-4 text-crema/50 transition", open && "rotate-180")} aria-hidden />
                  </button>
                  <Toggle size="sm" checked={r.enabled} onChange={(enabled) => setRule(r.id, { enabled })} label={`Attiva ${r.name}`} />
                </div>
                {open ? (
                  <div className="space-y-3 border-t border-sand/10 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Nome (solo per te)">
                        <input value={r.name} maxLength={80} onChange={(e) => setRule(r.id, { name: e.target.value })} className={fieldClass} />
                      </Field>
                      <ChannelField label="Canale" value={r.channelId} channels={channels} onChange={(channelId) => setRule(r.id, { channelId })} />
                      <Field label="Ruoli" hint="L'annuncio parte quando qualcuno riceve uno di questi.">
                        <MultiSelect value={r.roleIds} onChange={(roleIds) => setRule(r.id, { roleIds: roleIds.slice(0, 25) })} options={roleOptions(data.pickers.roles, guildId)} placeholder="Scegli i ruoli" className={fieldClass} />
                      </Field>
                      <Field label="Non ripetere entro (ore)" hint="Se il ruolo viene tolto e rimesso. 0 = sempre.">
                        <NumberField value={r.cooldownHours} min={0} max={8760} onChange={(v) => setRule(r.id, { cooldownHours: Number(v) || 0 })} aria-label="Ore" />
                      </Field>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                      <DraftEditor value={r.draft} onChange={(draft) => setRule(r.id, { draft })} emojis={data.pickers.emojis} placeholders={ROLE_PLACEHOLDERS} maxButtons={data.limits.buttons} />
                      <DiscordMessagePreview bot={data.bot} draft={r.draft} vars={ruleVars(r)} roles={data.pickers.roles} channels={channels} />
                    </div>
                    <button type="button" className={dangerBtn} onClick={() => set({ ...cfg, roles: { ...cfg.roles, rules: rules.filter((x) => x.id !== r.id) } })}>
                      <Trash2 className="size-3.5" /> Elimina la regola
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!rules.length ? <p className="text-sm text-crema/55">Nessuna regola: aggiungine una per annunciare un ruolo.</p> : null}
          <button type="button" className={miniBtn} disabled={rules.length >= maxRules} onClick={addRule}>
            <Plus className="size-3.5" /> Aggiungi regola
          </button>
        </div>
      </FormGroup>
    </div>
  );
}
