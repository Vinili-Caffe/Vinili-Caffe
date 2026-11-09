"use client";

import { useEffect, useState } from "react";
import { MultiSelect } from "@/components/ui/Select";
import { LOG_EVENT_LABELS, communityApi, type ServerLogs } from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, SettingRow, Toggle, fieldClass, primaryMini } from "../bits";
import { ChannelField, useCommunity } from "./shared";

const DEFAULT: ServerLogs = { enabled: false, channelId: null, events: {}, ignoredChannelIds: [], ignoreBots: true };

export function ServerLogsPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, error } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<ServerLogs | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const v = data.serverLogs || DEFAULT;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copia locale modificabile dei dati caricati
    setCfg(v);
    setSaved(JSON.stringify(v));
  }, [data]);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;
  const dirty = JSON.stringify(cfg) !== saved;
  const on = (id: string) => cfg.events?.[id] !== false;

  const save = async () => {
    setBusy(true);
    const r = await communityApi.saveServerLogs(token, guildId, cfg);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    setCfg(r.data.serverLogs);
    setSaved(JSON.stringify(r.data.serverLogs));
    onToast("Log del server salvati.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10">
        <Toggle checked={cfg.enabled} onChange={(enabled) => setCfg({ ...cfg, enabled })} label="Attiva i log del server" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-crema">Log del server</p>
          <p className="text-xs text-crema/55">Il bot scrive in un canale cosa succede: messaggi cancellati, chi entra ed esce, ruoli, ban…</p>
        </div>
        <button type="button" className={primaryMini} disabled={!dirty || busy} onClick={() => void save()}>
          {dirty ? "Salva modifiche" : "Salvato"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ChannelField label="Canale dei log" value={cfg.channelId} channels={data.pickers.textChannels} onChange={(channelId) => setCfg({ ...cfg, channelId })} hint="Meglio un canale visibile solo allo staff." />
        <Field label="Canali da ignorare" hint="I messaggi in questi canali non finiscono nei log.">
          <MultiSelect
            value={cfg.ignoredChannelIds}
            onChange={(ignoredChannelIds) => setCfg({ ...cfg, ignoredChannelIds })}
            options={data.pickers.textChannels.map((c) => ({ value: c.id, label: `#${c.name}` }))}
            placeholder="Nessuno"
            className={fieldClass}
          />
        </Field>
      </div>

      <FormGroup title="Cosa registrare">
        <div className="grid gap-x-6 sm:grid-cols-2">
          {LOG_EVENT_LABELS.map((e) => (
            <SettingRow key={e.id} title={e.label} description={e.hint || undefined}>
              <Toggle size="sm" checked={on(e.id)} onChange={(v) => setCfg({ ...cfg, events: { ...cfg.events, [e.id]: v } })} label={e.label} />
            </SettingRow>
          ))}
        </div>
        <div className="mt-3 border-t border-sand/[0.08] pt-3">
          <SettingRow title="Ignora i bot" description="Non registrare messaggi e azioni dei bot.">
            <Toggle size="sm" checked={cfg.ignoreBots} onChange={(ignoreBots) => setCfg({ ...cfg, ignoreBots })} label="Ignora i bot" />
          </SettingRow>
        </div>
      </FormGroup>

      <p className="text-xs text-crema/50">
        Dei messaggi cancellati il bot vede il testo solo se erano arrivati mentre era acceso: quelli molto vecchi compaiono senza testo.
      </p>
    </div>
  );
}
