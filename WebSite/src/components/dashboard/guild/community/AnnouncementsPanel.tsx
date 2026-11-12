"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Tags, Trash2 } from "lucide-react";
import { MultiSelect, Select } from "@/components/ui/Select";
import { NumberField } from "@/components/ui/NumberField";
import { cn } from "@/lib/cn";
import {
  communityApi,
  emptyDraft,
  type AnnouncementsConfig,
  type NamedAnnounceKey,
  type NamedAnnounceSlot,
  type RoleAnnounceRule,
} from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, SettingRow, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { ChannelField, DiscordMessagePreview, DmExtra, DraftEditor, EditorWithPreview, roleOptions, useCommunity, useSampleVars } from "./shared";

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

type AnnouncementsTab = "boost" | "ruolinuovi" | "clantag" | "status" | "inviti";

const TAB_BLURB: Record<AnnouncementsTab, string> = {
  boost: "Un messaggio quando qualcuno boosta il server: uno per il primo boost e uno per quelli dopo.",
  clantag: "Annuncio quando qualcuno prende la tag clan (ruolo Guilded).",
  status: "Annuncio Fan: il bot dà il ruolo da solo a chi mette il link del server nello status.",
  inviti: "Annunci ai traguardi inviti: Promoter (5), Propulsor (25), Catalyst (100).",
  ruolinuovi: "Regole libere per altri ruoli (Supporter, Verified, Patron, Donator…). Clan tag, status e inviti stanno nelle loro schede.",
};

const NAMED_GROUPS: Record<"clantag" | "status" | "inviti", { key: NamedAnnounceKey; title: string; hint: string }[]> = {
  clantag: [{ key: "clantag", title: "Clan tag", hint: "Quando qualcuno ottiene il ruolo Guilded dalla tag." }],
  status: [{ key: "fan", title: "Fan (status)", hint: "Link del server nello status Discord: ruolo dato in automatico." }],
  inviti: [
    { key: "promoter", title: "Promoter — 5 inviti", hint: "Primo traguardo con il link personalizzato." },
    { key: "propulsor", title: "Propulsor — 25 inviti", hint: "Secondo traguardo." },
    { key: "catalyst", title: "Catalyst — 100 inviti", hint: "Traguardo massimo." },
  ],
};

function emptyNamed(key: NamedAnnounceKey, name: string): NamedAnnounceSlot {
  return {
    id: `named:${key}`,
    name,
    enabled: false,
    roleId: null,
    channelId: null,
    cooldownHours: 24,
    draft: emptyDraft({
      content: "{user}",
      mentionUsers: true,
      mentionRoles: true,
      embed: { ...emptyDraft().embed, title: name, description: "{user} ha ottenuto {role}!" },
    }),
  };
}

function ensureNamed(cfg: AnnouncementsConfig): AnnouncementsConfig["named"] {
  const n = cfg.named || ({} as AnnouncementsConfig["named"]);
  return {
    clantag: n.clantag || emptyNamed("clantag", "Clan tag"),
    fan: n.fan || emptyNamed("fan", "Fan (status)"),
    promoter: n.promoter || emptyNamed("promoter", "Promoter"),
    propulsor: n.propulsor || emptyNamed("propulsor", "Propulsor"),
    catalyst: n.catalyst || emptyNamed("catalyst", "Catalyst"),
  };
}

/** Annunci automatici → Boost, Clan tag, Status, Inviti, Ruoli custom. */
export function AnnouncementsPanel({
  guildId,
  token,
  onToast,
  tab,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  tab: AnnouncementsTab;
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
  const [openNamed, setOpenNamed] = useState<string | null>(null);
  const baseVars = useSampleVars(data);
  const vars = useMemo(() => {
    const role = data?.pickers.roles.find((r) => !r.managed);
    return { ...baseVars, boosts: "14", tier: "2", role: role ? `<@&${role.id}>` : "@Ruolo", "role.name": role?.name || "Ruolo" };
  }, [baseVars, data]);

  useEffect(() => {
    let alive = true;
    void communityApi.getAnnouncements(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      const config = r.data.config;
      setCfg({ ...config, named: ensureNamed(config) });
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
    setCfg({ ...next, named: ensureNamed(next) });
    setDirty(true);
  };
  const channels = data.pickers.textChannels;
  const named = ensureNamed(cfg);
  const reservedRoleIds = new Set(
    (Object.values(named) as NamedAnnounceSlot[]).map((s) => s.roleId).filter((id): id is string => Boolean(id)),
  );

  const save = async () => {
    setBusy(true);
    const r = await communityApi.saveAnnouncements(token, guildId, { ...cfg, named });
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    setCfg({ ...r.data.config, named: ensureNamed(r.data.config) });
    setDirty(false);
    onToast("Annunci salvati.");
  };

  const saveBar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-crema/60">{TAB_BLURB[tab]}</p>
      <button type="button" className={primaryMini} disabled={busy || !dirty} onClick={() => void save()}>
        Salva
      </button>
    </div>
  );

  const slotVars = (slot: NamedAnnounceSlot) => {
    const role = data.pickers.roles.find((x) => x.id === slot.roleId);
    return role ? { ...vars, role: `<@&${role.id}>`, "role.name": role.name } : vars;
  };

  const setNamed = (key: NamedAnnounceKey, patch: Partial<NamedAnnounceSlot>) => {
    set({ ...cfg, named: { ...named, [key]: { ...named[key], ...patch } } });
  };

  if (tab === "boost") {
    const b = cfg.boost;
    const draft = boostTab === "first" ? b.firstDraft : b.repeatDraft;
    return (
      <div className="space-y-4">
        {imported ? <Notice>Ho importato l&apos;annuncio dei boost del server principale (primo boost e doppio boost). È spento: accendilo quando vuoi usarlo.</Notice> : null}
        {saveBar}
        <FormGroup title="Annuncio dei boost">
          <SettingRow title="Annuncia nel canale" description="Ogni volta che qualcuno boosta il server. Spento + privato acceso = solo in privato.">
            <Toggle checked={b.enabled} onChange={(enabled) => set({ ...cfg, boost: { ...b, enabled } })} label="Annuncia i boost nel canale" />
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
              <EditorWithPreview
                editor={
                    <DraftEditor
                      key={boostTab}
                      value={draft}
                      onChange={(d) => set({ ...cfg, boost: boostTab === "first" ? { ...b, firstDraft: d } : { ...b, repeatDraft: d } })}
                      emojis={data.pickers.emojis}
                      placeholders={BOOST_PLACEHOLDERS}
                      maxButtons={data.limits.buttons}
                    />
                }
                preview={<DiscordMessagePreview bot={data.bot} draft={draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
              />
            </div>
          ) : null}
        </FormGroup>
        <FormGroup title="Ruoli da dare" description="Vinili li dà a chi boosta, anche con l'annuncio spento. Il ruolo del bot deve stare sopra questi ruoli.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Al primo boost">
              <MultiSelect
                value={b.firstRoleIds || []}
                onChange={(ids) => set({ ...cfg, boost: { ...b, firstRoleIds: ids.slice(0, 10) } })}
                options={roleOptions(data.pickers.roles, guildId)}
                placeholder="Nessuno"
                className={fieldClass}
              />
            </Field>
            <Field label="Dal secondo boost" hint="Si aggiungono a quelli del primo.">
              <MultiSelect
                value={b.repeatRoleIds || []}
                onChange={(ids) => set({ ...cfg, boost: { ...b, repeatRoleIds: ids.slice(0, 10) } })}
                options={roleOptions(data.pickers.roles, guildId)}
                placeholder="Nessuno"
                className={fieldClass}
              />
            </Field>
          </div>
          <div className="mt-3">
            <SettingRow title="Toglili quando il boost finisce" description="Come fa Discord con il ruolo Server Booster.">
              <Toggle size="sm" checked={b.removeRolesOnEnd !== false} onChange={(removeRolesOnEnd) => set({ ...cfg, boost: { ...b, removeRolesOnEnd } })} label="Togli i ruoli quando il boost finisce" />
            </SettingRow>
          </div>
        </FormGroup>
        <DmExtra
          editorKey="boost"
          value={b.dm}
          onChange={(dm) => set({ ...cfg, boost: { ...b, dm } })}
          data={data}
          vars={vars}
          placeholders={BOOST_PLACEHOLDERS}
          hint="A chi boosta, sia al primo boost che ai successivi. Funziona anche con l'annuncio nel canale spento."
        />
      </div>
    );
  }

  if (tab === "clantag" || tab === "status" || tab === "inviti") {
    const group = NAMED_GROUPS[tab];
    return (
      <div className="space-y-4">
        {imported ? (
          <Notice>
            Ho importato i testi del server principale. Sono spenti: i draft valgono già in chat; accendi lo switch se vuoi gestirli solo da qui (senza il messaggio classico del bot).
          </Notice>
        ) : null}
        {saveBar}
        <FormGroup title={tab === "clantag" ? "Clan tag" : tab === "status" ? "Status" : "Traguardi inviti"}>
          <div className="space-y-2">
            {group.map(({ key, title, hint }) => {
              const slot = named[key];
              const open = openNamed === key || group.length === 1;
              return (
                <div key={key} className="rounded-xl bg-espresso/40 ring-1 ring-sand/10">
                  <div className="flex items-center gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => setOpenNamed(open && group.length > 1 ? null : key)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Tags className="size-4 shrink-0 text-ember" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-crema">{title}</span>
                        <span className="block text-xs text-crema/50">{hint}</span>
                      </span>
                      {group.length > 1 ? <ChevronDown className={cn("size-4 text-crema/50 transition", open && "rotate-180")} aria-hidden /> : null}
                    </button>
                    <Toggle size="sm" checked={slot.enabled} onChange={(enabled) => setNamed(key, { enabled })} label={`Attiva ${title}`} />
                  </div>
                  {open ? (
                    <div className="space-y-3 border-t border-sand/10 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Ruolo" hint="L'annuncio parte quando qualcuno riceve questo ruolo.">
                          <Select
                            value={slot.roleId || ""}
                            onChange={(v) => setNamed(key, { roleId: v || null })}
                            options={[{ value: "", label: "— Nessuno —" }, ...roleOptions(data.pickers.roles, guildId).filter((o) => o.value === slot.roleId || !reservedRoleIds.has(o.value))]}
                            className="mt-1.5 h-11 rounded-lg"
                          />
                        </Field>
                        <ChannelField label="Canale" hint="Vuoto = niente messaggio in chat (va bene se usi solo il privato)." value={slot.channelId} channels={channels} onChange={(channelId) => setNamed(key, { channelId })} />
                        <Field label="Non ripetere entro (ore)" hint="Se il ruolo viene tolto e rimesso. 0 = sempre.">
                          <NumberField value={slot.cooldownHours} min={0} max={8760} onChange={(v) => setNamed(key, { cooldownHours: Number(v) || 0 })} aria-label="Ore" />
                        </Field>
                      </div>
                      {!slot.roleId ? <p className="text-xs text-amber-200/80">Scegli il ruolo: senza, questo annuncio non parte.</p> : null}
                      {key === "fan" && data.isMainGuild ? (
                        <Field
                          label="Cosa va scritto nello status"
                          hint="Uno per riga. Se lo status contiene uno di questi testi, il bot dà il ruolo e manda l'annuncio; se lo toglie, il ruolo va via. Vuoto = i link del server (.gg/viniliecaffe, discord.gg/viniliecaffe, viniliecaffe.it). Maiuscole e spazi non contano."
                        >
                          <textarea
                            rows={4}
                            value={(slot.statusTriggers || []).join("\n")}
                            placeholder={".gg/viniliecaffe\ndiscord.gg/viniliecaffe\nviniliecaffe.it"}
                            onChange={(e) => setNamed(key, { statusTriggers: e.target.value.split("\n").map((x) => x.slice(0, 100)).slice(0, 15) })}
                            className={cn(fieldClass, "font-mono")}
                          />
                        </Field>
                      ) : null}
                      <EditorWithPreview
                        editor={
                            <DraftEditor
                              key={key}
                              value={slot.draft}
                              onChange={(draft) => setNamed(key, { draft })}
                              emojis={data.pickers.emojis}
                              placeholders={ROLE_PLACEHOLDERS}
                              maxButtons={data.limits.buttons}
                            />
                        }
                        preview={<DiscordMessagePreview bot={data.bot} draft={slot.draft} vars={slotVars(slot)} roles={data.pickers.roles} channels={channels} />}
                      />
                      <DmExtra
                        editorKey={key}
                        value={slot.dm}
                        onChange={(dm) => setNamed(key, { dm })}
                        data={data}
                        vars={slotVars(slot)}
                        placeholders={ROLE_PLACEHOLDERS}
                        hint="A chi ottiene il ruolo."
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </FormGroup>
      </div>
    );
  }

  /* Ruoli custom */
  const rules = cfg.roles.rules.filter((r) => !r.roleIds.some((id) => reservedRoleIds.has(id)));
  const ruleVars = (r: RoleAnnounceRule) => {
    const role = data.pickers.roles.find((x) => x.id === r.roleIds[0]);
    return role ? { ...vars, role: `<@&${role.id}>`, "role.name": role.name } : vars;
  };
  const setRule = (id: string, p: Partial<RoleAnnounceRule>) =>
    set({ ...cfg, roles: { ...cfg.roles, rules: cfg.roles.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) } });
  const addRule = () => {
    const id = `r${Date.now().toString(36)}`;
    set({
      ...cfg,
      roles: {
        ...cfg.roles,
        rules: [
          ...cfg.roles.rules,
          {
            id,
            name: `Regola ${cfg.roles.rules.length + 1}`,
            enabled: true,
            roleIds: [],
            channelId: null,
            cooldownHours: 24,
            draft: emptyDraft({
              content: "{user}",
              mentionUsers: true,
              mentionRoles: true,
              embed: { ...emptyDraft().embed, title: "Nuovo ruolo!", description: "{user} ha ottenuto il ruolo {role}!" },
            }),
          },
        ],
      },
    });
    setOpenRule(id);
  };
  const customRoleOptions = roleOptions(data.pickers.roles, guildId).filter((o) => !reservedRoleIds.has(o.value));

  return (
    <div className="space-y-4">
      {imported ? (
        <Notice>
          Ho importato gli annunci ruolo del server principale (Verified, Patron, Follower, Donator/VIP…). Clan tag, status e inviti stanno nelle tab dedicate. Sono spenti: i draft valgono già in chat.
        </Notice>
      ) : null}
      {saveBar}
      <FormGroup title="Ruoli custom">
        <SettingRow title="Annuncia i ruoli" description="Accende o spegne tutte le regole custom qui sotto (non tocca clan/status/inviti).">
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
                      <ChannelField label="Canale" hint="Vuoto = niente messaggio in chat (va bene se usi solo il privato)." value={r.channelId} channels={channels} onChange={(channelId) => setRule(r.id, { channelId })} />
                      <Field label="Ruoli" hint="L'annuncio parte quando qualcuno riceve uno di questi.">
                        <MultiSelect
                          value={r.roleIds}
                          onChange={(roleIds) => setRule(r.id, { roleIds: roleIds.filter((id) => !reservedRoleIds.has(id)).slice(0, 25) })}
                          options={customRoleOptions}
                          placeholder="Scegli i ruoli"
                          className={fieldClass}
                        />
                      </Field>
                      <Field label="Non ripetere entro (ore)" hint="Se il ruolo viene tolto e rimesso. 0 = sempre.">
                        <NumberField value={r.cooldownHours} min={0} max={8760} onChange={(v) => setRule(r.id, { cooldownHours: Number(v) || 0 })} aria-label="Ore" />
                      </Field>
                    </div>
                    <EditorWithPreview
                      editor={
                          <DraftEditor key={r.id} value={r.draft} onChange={(draft) => setRule(r.id, { draft })} emojis={data.pickers.emojis} placeholders={ROLE_PLACEHOLDERS} maxButtons={data.limits.buttons} />
                      }
                      preview={<DiscordMessagePreview bot={data.bot} draft={r.draft} vars={ruleVars(r)} roles={data.pickers.roles} channels={channels} />}
                    />
                    <DmExtra
                      editorKey={r.id}
                      value={r.dm}
                      onChange={(dm) => setRule(r.id, { dm })}
                      data={data}
                      vars={ruleVars(r)}
                      placeholders={ROLE_PLACEHOLDERS}
                      hint="A chi ottiene il ruolo. Funziona anche senza canale: solo in privato."
                    />
                    <button type="button" className={dangerBtn} onClick={() => set({ ...cfg, roles: { ...cfg.roles, rules: cfg.roles.rules.filter((x) => x.id !== r.id) } })}>
                      <Trash2 className="size-3.5" /> Elimina la regola
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!rules.length ? <p className="text-sm text-crema/55">Nessuna regola: aggiungine una per annunciare un ruolo.</p> : null}
          <button type="button" className={miniBtn} disabled={cfg.roles.rules.length >= maxRules} onClick={addRule}>
            <Plus className="size-3.5" /> Aggiungi regola
          </button>
        </div>
      </FormGroup>
    </div>
  );
}
