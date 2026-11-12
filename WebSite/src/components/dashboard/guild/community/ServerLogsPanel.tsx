"use client";

import { useEffect, useState } from "react";
import { MultiSelect, Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { LOG_EVENT_GROUPS, communityApi, type ServerLogs } from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, SettingRow, Toggle, fieldClass, primaryMini } from "../bits";
import { ChannelField, useCommunity } from "./shared";

const DEFAULT: ServerLogs = { enabled: false, channelId: null, channels: {}, events: {}, ignoredChannelIds: [], ignoreBots: true };

/** Log del server: dentro Moderazione. Ogni evento può andare in un canale suo (se no, nel canale generale). */
export function ServerLogsPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, error } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<ServerLogs | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const v = { ...DEFAULT, ...(data.serverLogs || {}), channels: data.serverLogs?.channels || {} };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copia locale modificabile dei dati caricati
    setCfg(v);
    setSaved(JSON.stringify(v));
  }, [data]);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={6} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const channels = data.pickers.textChannels;
  const chName = (id: string | null | undefined) => (id ? channels.find((c) => c.id === id)?.name : null);
  const on = (id: string) => cfg.events?.[id] !== false;
  const chOf = (id: string) => cfg.channels?.[id] || "";
  const setEventChannel = (id: string, channelId: string) => {
    const next = { ...(cfg.channels || {}) };
    if (channelId) next[id] = channelId;
    else delete next[id];
    setCfg({ ...cfg, channels: next });
  };
  const channelOptions = [
    { value: "", label: cfg.channelId ? `Generale (#${chName(cfg.channelId) || "canale"})` : "Canale generale" },
    ...channels.map((c) => ({ value: c.id, label: `#${c.name}` })),
  ];

  const save = async () => {
    setBusy(true);
    const r = await communityApi.saveServerLogs(token, guildId, cfg);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    const v = { ...DEFAULT, ...r.data.serverLogs, channels: r.data.serverLogs.channels || {} };
    setCfg(v);
    setSaved(JSON.stringify(v));
    onToast("Log del server salvati.");
  };

  const activeCount = LOG_EVENT_GROUPS.flatMap((g) => g.events).filter((e) => on(e.id)).length;
  const customCount = Object.keys(cfg.channels || {}).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
        <Toggle checked={cfg.enabled} onChange={(enabled) => setCfg({ ...cfg, enabled })} label="Attiva i log del server" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-crema">Log del server</p>
          <p className="text-xs text-crema/55">
            {activeCount} eventi attivi{customCount ? ` · ${customCount} con un canale tutto loro` : ""}. Il bot scrive cosa succede nel server.
          </p>
        </div>
        <button type="button" className={primaryMini} disabled={!dirty || busy} onClick={() => void save()}>
          {dirty ? "Salva modifiche" : "Salvato"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ChannelField
          label="Canale generale"
          value={cfg.channelId}
          channels={channels}
          onChange={(channelId) => setCfg({ ...cfg, channelId })}
          hint="Dove vanno gli eventi senza un canale scelto. Meglio un canale visibile solo allo staff."
        />
        <Field label="Canali da ignorare" hint="Messaggi e vocali di questi canali non finiscono nei log.">
          <MultiSelect
            value={cfg.ignoredChannelIds}
            onChange={(ignoredChannelIds) => setCfg({ ...cfg, ignoredChannelIds })}
            options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))}
            placeholder="Nessuno"
            className={fieldClass}
          />
        </Field>
      </div>

      {LOG_EVENT_GROUPS.map((g) => {
        const groupChannels = new Set(g.events.map((e) => chOf(e.id)));
        const groupValue = groupChannels.size === 1 ? [...groupChannels][0] : "__mixed";
        return (
          <FormGroup key={g.id} title={g.label}>
            <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
              <span className="text-xs text-crema/55">Canale per tutto il gruppo</span>
              <div className="w-56">
                <Select
                  size="sm"
                  value={groupValue}
                  onChange={(v) => {
                    if (v === "__mixed") return;
                    const next = { ...(cfg.channels || {}) };
                    for (const e of g.events) {
                      if (v) next[e.id] = v;
                      else delete next[e.id];
                    }
                    setCfg({ ...cfg, channels: next });
                  }}
                  options={[...(groupValue === "__mixed" ? [{ value: "__mixed", label: "Canali diversi" }] : []), ...channelOptions]}
                  aria-label={`Canale per ${g.label}`}
                />
              </div>
            </div>
            <ul className="divide-y divide-sand/[0.08]">
              {g.events.map((e) => (
                <li key={e.id} className={cn("flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0", !on(e.id) && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-crema">{e.label}</p>
                    {e.hint ? <p className="text-xs text-crema/55">{e.hint}</p> : null}
                  </div>
                  <div className="w-56">
                    <Select size="sm" value={chOf(e.id)} onChange={(v) => setEventChannel(e.id, v)} options={channelOptions} disabled={!on(e.id)} aria-label={`Canale per ${e.label}`} />
                  </div>
                  <Toggle size="sm" checked={on(e.id)} onChange={(v) => setCfg({ ...cfg, events: { ...cfg.events, [e.id]: v } })} label={e.label} />
                </li>
              ))}
            </ul>
          </FormGroup>
        );
      })}

      <FormGroup title="Altre opzioni">
        <SettingRow title="Ignora i bot" description="Non registrare messaggi e azioni dei bot.">
          <Toggle size="sm" checked={cfg.ignoreBots} onChange={(ignoreBots) => setCfg({ ...cfg, ignoreBots })} label="Ignora i bot" />
        </SettingRow>
      </FormGroup>

      <p className="text-xs text-crema/50">
        Dei messaggi cancellati il bot vede il testo solo se erano arrivati mentre era acceso: quelli molto vecchi compaiono senza testo. I cambi di permessi e
        posizione di canali e ruoli non vengono registrati, per non riempire il canale.
      </p>
    </div>
  );
}
