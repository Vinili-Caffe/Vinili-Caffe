"use client";

import { useEffect, useMemo, useState } from "react";
import { DoorOpen, Mail, PartyPopper, Send, UserPlus } from "lucide-react";
import { MultiSelect } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, type WelcomeSettings } from "@/lib/dashboard-community";
import { Field, Notice, RowsSkeleton, Toggle, fieldClass, miniBtn, primaryMini } from "../bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, EditorWithPreview, MEMBER_PLACEHOLDERS, roleOptions, sampleVars, useCommunity } from "./shared";

type Tab = "welcome" | "goodbye" | "dm" | "roles";

export function WelcomePanel({
  guildId,
  token,
  onToast,
  tab = "welcome",
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  tab?: Tab;
}) {
  const { data, error } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<WelcomeSettings | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const vars = useMemo(() => sampleVars(data), [data]);

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
    onToast("Benvenuto e addio salvati.");
  };

  const test = async (kind: "welcome" | "goodbye" | "dm") => {
    setBusy(`test-${kind}`);
    const r = await communityApi.testWelcome(token, guildId, kind, cfg);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    onToast(kind === "dm" ? "Ti ho mandato la prova in privato." : "Prova inviata nel canale, con te come nuovo membro.");
  };

  const part = (k: "welcome" | "goodbye") => {
    const p = cfg[k];
    const set = (patch: Partial<WelcomeSettings["welcome"]>) => setCfg({ ...cfg, [k]: { ...p, ...patch } });
    return (
      <EditorWithPreview
        editor={
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10">
              <Toggle checked={p.enabled} onChange={(enabled) => set({ enabled })} label={k === "welcome" ? "Attiva il benvenuto" : "Attiva l'addio"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-crema">{k === "welcome" ? "Messaggio quando entra qualcuno" : "Messaggio quando qualcuno esce"}</p>
                <p className="text-xs text-crema/55">{p.enabled ? "Attivo" : "Spento"}</p>
              </div>
              <button type="button" className={miniBtn} disabled={!!busy || !p.channelId} onClick={() => void test(k)}>
                <Send className="size-3.5" /> Prova
              </button>
            </div>
            <ChannelField label="Canale" value={p.channelId} channels={channels} onChange={(channelId) => set({ channelId })} />
            <DraftEditor key={k} value={p.draft} onChange={(draft) => set({ draft })} emojis={data.pickers.emojis} placeholders={MEMBER_PLACEHOLDERS} maxButtons={data.limits.buttons} />
          </div>
        }
        preview={<DiscordMessagePreview bot={data.bot} draft={p.draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
      />
    );
  };

  return (
    <div className="space-y-4">
      {data.isMainGuild && !data.welcomeSaved ? (
        <Notice>
          Questi sono il benvenuto e il messaggio privato che il bot usa adesso in questo server. Quando salvi, li gestisci da qui: il bot userà i testi della dashboard al posto di quelli vecchi. Invite tracker e controlli d&apos;ingresso restano uguali.
        </Notice>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-4">
        {[
          { icon: <PartyPopper className="size-4" />, label: "Benvenuto", on: cfg.welcome.enabled },
          { icon: <DoorOpen className="size-4" />, label: "Addio", on: cfg.goodbye.enabled },
          { icon: <Mail className="size-4" />, label: "Privato", on: cfg.dm.enabled },
          { icon: <UserPlus className="size-4" />, label: "Ruoli automatici", on: cfg.autoRoleIds.length > 0 },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 rounded-xl bg-espresso/45 p-2.5 ring-1 ring-sand/10">
            <span className={cn("flex size-8 items-center justify-center rounded-lg", s.on ? "bg-[#5f9a6a]/15 text-[#9fd0a8] light:text-[#2f6b3f]" : "bg-crema/[0.06] text-crema/50")}>{s.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-crema">{s.label}</span>
              <span className="block text-xs text-crema/55">{s.on ? "Attivo" : "Spento"}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className={primaryMini} disabled={!dirty || !!busy} onClick={() => void save()}>
          {dirty ? "Salva modifiche" : "Salvato"}
        </button>
      </div>

      {tab === "welcome" ? part("welcome") : null}
      {tab === "goodbye" ? part("goodbye") : null}
      {tab === "dm" ? (
        <EditorWithPreview
          editor={
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                <Toggle checked={cfg.dm.enabled} onChange={(enabled) => setCfg({ ...cfg, dm: { ...cfg.dm, enabled } })} label="Attiva il messaggio privato" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-crema">Messaggio privato a chi entra</p>
                  <p className="text-xs text-crema/55">Non arriva a chi ha i messaggi privati chiusi.</p>
                </div>
                <button type="button" className={miniBtn} disabled={!!busy} onClick={() => void test("dm")}>
                  <Send className="size-3.5" /> Mandalo a me
                </button>
              </div>
              <DraftEditor key="dm" value={cfg.dm.draft} onChange={(draft) => setCfg({ ...cfg, dm: { ...cfg.dm, draft } })} emojis={data.pickers.emojis} placeholders={MEMBER_PLACEHOLDERS} maxButtons={data.limits.buttons} />
            </div>
          }
          preview={<DiscordMessagePreview bot={data.bot} draft={cfg.dm.draft} vars={vars} roles={data.pickers.roles} channels={channels} />}
        />
      ) : null}
      {tab === "roles" ? (
        <div className="max-w-xl space-y-2">
          <Field label="Ruoli dati a chi entra" hint="Il ruolo del bot deve stare sopra questi ruoli. I bot che entrano non li ricevono.">
            <MultiSelect
              value={cfg.autoRoleIds}
              onChange={(autoRoleIds) => setCfg({ ...cfg, autoRoleIds: autoRoleIds.slice(0, 10) })}
              options={roleOptions(data.pickers.roles, guildId)}
              placeholder="Nessuno"
              className={fieldClass}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
