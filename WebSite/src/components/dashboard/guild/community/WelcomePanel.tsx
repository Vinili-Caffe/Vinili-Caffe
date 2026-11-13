"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { MultiSelect } from "@/components/ui/Select";
import { communityApi, emptyDraft, type WelcomeSettings } from "@/lib/dashboard-community";
import { Field, Notice, RowsSkeleton, Toggle, TrackUnsaved, fieldClass } from "../bits";
import { ChannelField, DiscordMessagePreview, DmExtra, DraftEditor, EditorWithPreview, MEMBER_PLACEHOLDERS, roleOptions, useCommunity, useSampleVars } from "./shared";

/* "dm" e "roles" sono vecchi link: ora stanno dentro Benvenuto */
type Tab = "welcome" | "goodbye" | "dm" | "roles";

const GOODBYE_DM_DEFAULT = { enabled: false, draft: emptyDraft({ content: "Ciao {username}, ci mancherai in **{server}**!", embed: { ...emptyDraft().embed, enabled: false } }) };

export function WelcomePanel({
  guildId,
  token,
  onToast,
  tab: tabProp = "welcome",
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  tab?: Tab;
}) {
  const tab = tabProp === "goodbye" ? "goodbye" : "welcome";
  const { data, error } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<WelcomeSettings | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [, setBusy] = useState<string | null>(null);
  const vars = useSampleVars(data);

  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copia locale modificabile dei dati caricati
    setCfg(data.welcome);
    setSaved(JSON.stringify(data.welcome));
  }, [data]);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;

  const dirty = JSON.stringify(cfg) !== saved || Boolean(data.isMainGuild && !data.welcomeSaved);
  const channels = data.pickers.textChannels;

  const save = async () => {
    setBusy("save");
    const r = await communityApi.saveWelcome(token, guildId, cfg);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setCfg(r.data.welcome);
    setSaved(JSON.stringify(r.data.welcome));
    onToast(tab === "goodbye" ? "Addio salvato." : "Benvenuto salvato.");
  };

  const reset = () => {
    try {
      setCfg(JSON.parse(saved));
    } catch {}
  };

  const k = tab;
  const p = cfg[k];
  const set = (patch: Partial<WelcomeSettings["welcome"]>) => setCfg({ ...cfg, [k]: { ...p, ...patch } });

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={dirty} onSave={save} onReset={reset} />
      {data.isMainGuild && !data.welcomeSaved ? (
        <Notice>
          Questi sono il benvenuto e il messaggio privato che il bot usa adesso in questo server. Quando salvi, li gestisci da qui: il bot userà i testi della dashboard al posto di quelli vecchi. Invite tracker e controlli d&apos;ingresso restano uguali.
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
        <Toggle checked={p.enabled} onChange={(enabled) => set({ enabled })} label={k === "welcome" ? "Attiva il benvenuto" : "Attiva l'addio"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-crema">{k === "welcome" ? "Messaggio quando entra qualcuno" : "Messaggio quando qualcuno esce"}</p>
          <p className="text-xs text-crema/55">{p.enabled ? "Nel canale: attivo" : "Nel canale: spento (il privato qui sotto funziona lo stesso)"}</p>
        </div>
      </div>

      <EditorWithPreview
        editor={
          <div className="space-y-4">
            <ChannelField label="Canale" value={p.channelId} channels={channels} onChange={(channelId) => set({ channelId })} />
            <DraftEditor key={k} value={p.draft} onChange={(draft) => set({ draft })} emojis={data.pickers.emojis} placeholders={MEMBER_PLACEHOLDERS} maxButtons={data.limits.buttons} />
          </div>
        }
        preview={<DiscordMessagePreview testChannelId={p.channelId} bot={data.bot} draft={p.draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
      />

      {k === "welcome" ? (
        <>
          <section className="rounded-2xl bg-espresso/40 p-4 ring-1 ring-sand/10">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-caramel/12 text-ember">
                <UserPlus className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-crema">Ruoli automatici</p>
                <p className="text-xs text-crema/55">Dati a chi entra. Il ruolo del bot deve stare sopra questi ruoli; i bot che entrano non li ricevono.</p>
              </div>
            </div>
            <Field label="Ruoli">
              <MultiSelect
                value={cfg.autoRoleIds}
                onChange={(autoRoleIds) => setCfg({ ...cfg, autoRoleIds: autoRoleIds.slice(0, 10) })}
                options={roleOptions(data.pickers.roles, guildId)}
                placeholder="Nessuno"
                className={fieldClass}
              />
            </Field>
          </section>
          <DmExtra
            editorKey="welcome"
            value={cfg.dm}
            onChange={(dm) => setCfg({ ...cfg, dm })}
            data={data}
            vars={vars}
            placeholders={MEMBER_PLACEHOLDERS}
            hint="A chi entra. Non arriva a chi ha i messaggi privati chiusi."
          />
        </>
      ) : (
        <DmExtra
          editorKey="goodbye"
          value={cfg.goodbyeDm || GOODBYE_DM_DEFAULT}
          onChange={(goodbyeDm) => setCfg({ ...cfg, goodbyeDm })}
          data={data}
          vars={vars}
          placeholders={MEMBER_PLACEHOLDERS}
          hint="A chi esce. Arriva solo se ha ancora un server in comune col bot e i privati aperti."
        />
      )}
    </div>
  );
}
