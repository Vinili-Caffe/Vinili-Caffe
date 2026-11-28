"use client";

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { Select } from "@/components/ui/Select";
import { showToast } from "@/components/ui";
import { Toggle } from "@/components/dashboard/guild/bits";
import { loadBotPrefs, patchBotPrefs, type BotPrefs } from "@/lib/dashboard-profile";

/** Una preferenza: testo a sinistra, controllo a destra, sulla stessa riga. */
function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-crema">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-crema/55">{description}</p>
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

/**
 * Preferenze del bot nel tuo profilo: valgono in tutti i server dove usi Vinili
 * (comandi partnership: ping, risposte private, lingua).
 */
export function BotPrefsCard({ token }: { token: string }) {
  const [data, setData] = useState<BotPrefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadBotPrefs(token).then((r) => alive && r.ok && setData(r.data));
    return () => {
      alive = false;
    };
  }, [token]);

  if (!data) return null;

  const patch = async (body: Partial<BotPrefs["prefs"]>, ok: string) => {
    setBusy(true);
    const r = await patchBotPrefs(token, body);
    setBusy(false);
    if (!r.ok) return showToast(r.message, true);
    setData(r.data);
    showToast(ok);
  };

  return (
    <Reveal>
      <div className="mb-5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-caramel">
          <Settings2 className="size-4" aria-hidden /> Solo per te
        </p>
        <h2 className="mt-1.5 font-display text-3xl font-semibold sm:text-4xl">Preferenze del bot</h2>
        <p className="mt-1.5 text-sm text-crema/55">Valgono in tutti i server dove usi Vinili.</p>
      </div>
      <div className="divide-y divide-sand/10 overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.06] via-roast/80 to-roast ring-1 ring-sand/12">
        <Row title="Niente ping nelle mie partnership" description="Quando sei tu il manager, il messaggio di partnership non ti menziona.">
          <Toggle
            size="sm"
            checked={data.prefs.suppressManagerPing}
            disabled={busy}
            label="Niente ping nelle mie partnership"
            onChange={(v) => void patch({ suppressManagerPing: v }, "Preferenza salvata.")}
          />
        </Row>
        <Row title="Risposte dei comandi solo per me" description="Le risposte dei comandi partnership le vedi solo tu.">
          <Toggle
            size="sm"
            checked={data.prefs.ephemeralCommands}
            disabled={busy}
            label="Risposte dei comandi solo per me"
            onChange={(v) => void patch({ ephemeralCommands: v }, "Preferenza salvata.")}
          />
        </Row>
        {data.languages.length ? (
          <Row title="Lingua del bot" description="Lingua dei messaggi che il bot ti manda.">
            <Select
              aria-label="Lingua del bot"
              size="sm"
              value={data.prefs.language}
              disabled={busy}
              onChange={(v) => void patch({ language: v }, "Lingua salvata.")}
              options={data.languages.map((l) => ({ value: l.code, label: `${l.flag} ${l.label}`.trim() }))}
              className="min-w-36"
            />
          </Row>
        ) : null}
      </div>
    </Reveal>
  );
}
