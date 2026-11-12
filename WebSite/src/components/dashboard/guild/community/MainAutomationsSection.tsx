"use client";

import { useEffect, useState } from "react";
import { Workflow } from "lucide-react";
import { communityApi, type MainAutomation } from "@/lib/dashboard-community";
import { FormGroup, Notice, RowsSkeleton, Toggle } from "../bits";

/** Automazioni fisse del bot sul server principale (bump, voti, serata film…): solo accese/spente. */
export function MainAutomationsSection({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const [items, setItems] = useState<MainAutomation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void communityApi.listMainAutomations(token, guildId).then((r) => {
      if (!alive) return;
      if (r.ok) setItems(r.data.automations);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  if (error && !items) return <Notice error>{error}</Notice>;
  if (!items) return <RowsSkeleton rows={3} />;

  const toggle = async (a: MainAutomation, enabled: boolean) => {
    setBusy(a.key);
    const r = await communityApi.setMainAutomation(token, guildId, a.key, enabled);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setItems(r.data.automations);
    onToast(enabled ? `${a.name}: accesa.` : `${a.name}: spenta.`);
  };

  return (
    <FormGroup title="Automazioni del server" description="Cose che il bot fa da solo sui messaggi di certi canali. Qui puoi spegnerle e riaccenderle.">
      <ul className="space-y-1.5">
        {items.map((a) => (
          <li key={a.key} className="flex items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
            <Workflow className="size-4 shrink-0 text-ember" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-crema">{a.name}</span>
              <span className="block text-xs text-crema/55">{a.description}</span>
            </span>
            <Toggle size="sm" checked={a.enabled} disabled={busy === a.key} onChange={(v) => void toggle(a, v)} label={a.name} />
          </li>
        ))}
      </ul>
    </FormGroup>
  );
}
