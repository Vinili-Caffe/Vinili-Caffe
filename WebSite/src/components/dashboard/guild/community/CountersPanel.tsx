"use client";

import { useEffect, useState } from "react";
import { Gauge, Plus, Trash2, Volume2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, type Counter, type CounterType } from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { useCommunity } from "./shared";

const TYPES: { value: CounterType; label: string; template: string }[] = [
  { value: "members", label: "Membri (bot compresi)", template: "👥 Membri: {count}" },
  { value: "humans", label: "Membri senza bot", template: "👤 Membri: {count}" },
  { value: "bots", label: "Solo bot", template: "🤖 Bot: {count}" },
  { value: "online", label: "Attivi adesso (online + inattivi + non disturbare)", template: "✨ Attivi: {count}" },
  { value: "statusOnline", label: "Online", template: "🟢 Online: {count}" },
  { value: "idle", label: "Inattivi", template: "🌙 Inattivi: {count}" },
  { value: "dnd", label: "Non disturbare", template: "⛔ Non disturbare: {count}" },
  { value: "offline", label: "Offline", template: "⚫ Offline: {count}" },
  { value: "boosts", label: "Boost", template: "🚀 Boost: {count}" },
  { value: "boostTier", label: "Livello boost", template: "💎 Livello: {count}" },
  { value: "channels", label: "Canali", template: "💬 Canali: {count}" },
  { value: "roles", label: "Ruoli", template: "🎭 Ruoli: {count}" },
  { value: "emojis", label: "Emoji", template: "😀 Emoji: {count}" },
];
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label || t;

export function CountersPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, setData, error } = useCommunity(guildId, token);
  const [type, setType] = useState<CounterType>("members");
  const [template, setTemplate] = useState(TYPES[0].template);
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Partial<Record<CounterType, number>> | null>(null);

  useEffect(() => {
    let alive = true;
    void communityApi.counterValues(token, guildId).then((r) => {
      if (alive && r.ok) setValues(r.data.values);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);
  const preview = (tpl: string, t: CounterType) => {
    const n = values?.[t];
    return tpl.replace(/\{count\}/g, typeof n === "number" ? n.toLocaleString("it-IT") : "…");
  };

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <RowsSkeleton rows={3} />;
  const rows = data.counters || [];
  const setRows = (next: Counter[]) => setData((d) => (d ? { ...d, counters: next } : d));

  const create = async () => {
    if (!template.includes("{count}")) return onToast("Il testo deve contenere {count}, dove va il numero.", true);
    setBusy("create");
    const r = await communityApi.createCounter(token, guildId, { type, template, categoryId: categoryId || null });
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setRows([...rows, r.data.counter]);
    onToast(`Contatore creato: ${r.data.counter.lastName}`);
  };

  const rename = async (c: Counter) => {
    const t = editing[c.id];
    if (t == null || t === c.template) return;
    if (!t.includes("{count}")) return onToast("Il testo deve contenere {count}.", true);
    setBusy(c.id);
    const r = await communityApi.updateCounter(token, guildId, c.id, { template: t });
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setRows(rows.map((x) => (x.id === c.id ? r.data.counter : x)));
    setEditing((e) => {
      const n = { ...e };
      delete n[c.id];
      return n;
    });
    onToast("Contatore aggiornato.");
  };

  const remove = async (c: Counter) => {
    setBusy(c.id);
    const r = await communityApi.deleteCounter(token, guildId, c.id);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setRows(rows.filter((x) => x.id !== c.id));
    onToast("Contatore e canale eliminati.");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-crema/60">
        Canali vocali bloccati che mostrano un numero del server. Il bot li aggiorna ogni 10 minuti (Discord non permette di più).
      </p>

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-caramel/12 text-ember">
                <Volume2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-crema" translate="no">{values ? preview(editing[c.id] ?? c.template, c.type) : c.lastName || "—"}</p>
                <p className="text-xs text-crema/55">{c.channelId ? typeLabel(c.type) : "Canale cancellato su Discord"}</p>
              </div>
              <input
                value={editing[c.id] ?? c.template}
                maxLength={90}
                onChange={(e) => setEditing((x) => ({ ...x, [c.id]: e.target.value }))}
                aria-label="Testo del contatore"
                className={cn(fieldClass, "mt-0 w-56 py-1.5")}
              />
              {editing[c.id] != null && editing[c.id] !== c.template ? (
                <button type="button" className={primaryMini} disabled={!!busy} onClick={() => void rename(c)}>
                  Salva
                </button>
              ) : null}
              <button type="button" aria-label="Elimina contatore" className={dangerBtn} disabled={!!busy} onClick={() => void remove(c)}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Gauge} title="Nessun contatore" text="Crea il primo: il bot aggiunge un canale vocale col numero aggiornato." />
      )}

      {rows.length < data.limits.counters ? (
        <FormGroup title="Nuovo contatore" description="Scrivi {count} dove deve andare il numero.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Cosa conta">
              <Select
                value={type}
                onChange={(v) => {
                  const t = TYPES.find((x) => x.value === v) || TYPES[0];
                  if (TYPES.some((x) => x.template === template)) setTemplate(t.template);
                  setType(t.value);
                }}
                options={TYPES.map((t) => ({ value: t.value, label: t.label }))}
                className="mt-1.5 h-11 rounded-lg"
              />
            </Field>
            <Field label="Testo del canale">
              <input value={template} maxLength={90} onChange={(e) => setTemplate(e.target.value)} className={cn(fieldClass, "h-11 py-0")} />
            </Field>
            <Field label="Categoria (facoltativa)">
              <Select
                value={categoryId}
                onChange={setCategoryId}
                options={[{ value: "", label: "— In cima, fuori dalle categorie —" }, ...data.pickers.categories.map((c) => ({ value: c.id, label: c.name }))]}
                className="mt-1.5 h-11 rounded-lg"
              />
            </Field>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-crema/55">
              Anteprima: <span className="font-semibold text-crema/85" translate="no">{preview(template, type)}</span>
            </p>
            <button type="button" className={primaryMini} disabled={!!busy} onClick={() => void create()}>
              <Plus className="size-3.5" /> Crea contatore
            </button>
          </div>
        </FormGroup>
      ) : (
        <p className={cn(miniBtn, "pointer-events-none")}>Hai raggiunto il massimo di {data.limits.counters} contatori.</p>
      )}
    </div>
  );
}
