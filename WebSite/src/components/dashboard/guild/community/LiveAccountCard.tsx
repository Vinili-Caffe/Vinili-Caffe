"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Search, Trash2, UserRound, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { searchTicketMembers, type MemberHit } from "@/lib/dashboard-guild-ops";
import type { LiveAccount, LivePlatform } from "@/lib/dashboard-community";
import { Field, SettingRow, Toggle, dangerBtn, fieldClass } from "../bits";

export type LiveAccountMeta = {
  color: string;
  prefix: string;
  handleLabel: string;
  handlePlaceholder: string;
};

function MemberField({ guildId, token, value, onChange }: { guildId: string; token: string; value: string | null; onChange: (id: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<MemberHit | null>(null);

  useEffect(() => {
    if (!value || picked?.id === value) return;
    let alive = true;
    void searchTicketMembers(token, guildId, value).then((r) => {
      if (alive && r.ok) setPicked(r.data.find((m) => m.id === value) || null);
    });
    return () => {
      alive = false;
    };
  }, [value, picked?.id, token, guildId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) return;
    const timer = window.setTimeout(async () => {
      const r = await searchTicketMembers(token, guildId, q);
      if (r.ok) setHits(r.data);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, token, guildId]);

  const shown = query.trim().length >= 2 || /^\d{16,22}$/.test(query.trim()) ? hits : [];

  return (
    <Field label="Chi è su Discord" hint="Facoltativo: lo menziona nell'avviso al posto di {mention}.">
      {value ? (
        <div className="mt-1.5 flex h-11 items-center gap-2 rounded-xl bg-espresso/70 px-3 text-sm text-crema ring-1 ring-sand/15">
          <UserRound className="size-4 shrink-0 text-crema/50" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-semibold" translate="no">
            {picked?.id === value ? picked.label : `Utente ${value}`}
          </span>
          <button
            type="button"
            aria-label="Togli l'utente"
            className="rounded p-1 text-crema/55 hover:bg-crema/10 hover:text-crema"
            onClick={() => {
              onChange(null);
              setPicked(null);
            }}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-crema/45" aria-hidden />
          <input
            name="liveaccountcard-member"
            id="liveaccountcard-member"
            value={query}
            placeholder="Cerca un membro del server"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            className={cn(fieldClass, "mt-0 pl-8")}
          />
          {open && shown.length ? (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-xl bg-mocha p-1 shadow-xl ring-1 ring-sand/15">
              {shown.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-crema hover:bg-crema/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(m.id);
                      setPicked(m);
                      setQuery("");
                      setHits([]);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate font-semibold" translate="no">
                      {m.label}
                    </span>
                    {m.label !== m.username ? (
                      <span className="truncate text-xs text-crema/50" translate="no">
                        @{m.username}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Field>
  );
}

export function LiveAccountCard({
  platform,
  meta,
  acc,
  open,
  onToggle,
  onChange,
  onRemove,
  guildId,
  token,
  generalStage,
}: {
  platform: LivePlatform;
  meta: LiveAccountMeta;
  acc: LiveAccount;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<LiveAccount>) => void;
  onRemove: () => void;
  guildId: string;
  token: string;
  generalStage: string | null;
}) {
  const handle = acc.id.trim();
  const title = acc.displayName.trim() || handle || "Nuovo account";
  const chips = [
    acc.discordUserId ? "menzionato su Discord" : null,
    platform === "twitch" && acc.deleteAnnouncementOnOffline ? "avviso tolto a fine live" : null,
    platform === "twitch" && (acc.streamVoiceChannelId || generalStage) ? "rinomina il palco" : null,
  ].filter(Boolean) as string[];

  return (
    <div className={cn("rounded-2xl bg-espresso/40 ring-1 transition-colors", open ? "ring-sand/20" : "ring-sand/10")}>
      <div className="flex items-center gap-2 p-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
            style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
            aria-hidden
          >
            {(title.match(/[\p{L}\p{N}]/u) || ["?"])[0]}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm font-semibold", handle ? "text-crema" : "text-crema/55")} translate="no">
              {title}
            </span>
            <span className="block truncate text-xs text-crema/50" translate="no">
              {handle ? `${meta.prefix}${handle}` : "Scrivi il nome dell'account"}
              {chips.length ? ` · ${chips.join(" · ")}` : ""}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-crema/50 transition", open && "rotate-180")} aria-hidden />
        </button>
        <button type="button" className={cn(dangerBtn, "px-2")} onClick={onRemove} aria-label={`Togli ${title}`}>
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="space-y-3 border-t border-sand/10 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={meta.handleLabel}>
                  <div className="mt-1.5 flex items-stretch overflow-hidden rounded-xl bg-espresso/70 ring-1 ring-sand/15 focus-within:ring-2 focus-within:ring-caramel/45">
                    <span className="flex items-center border-r border-sand/10 px-3 text-sm text-crema/45" translate="no">
                      {meta.prefix}
                    </span>
                    <input
                      name="liveaccountcard-handle"
                      id="liveaccountcard-handle"
                      className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-crema outline-none placeholder:text-crema/45"
                      value={acc.id}
                      placeholder={meta.handlePlaceholder}
                      spellCheck={false}
                      autoCapitalize="off"
                      onChange={(e) => onChange({ id: e.target.value.trim().replace(/^@/, "").replace(/^https?:\/\/\S+?\/(@)?/, "") })}
                      aria-label={meta.handleLabel}
                    />
                  </div>
                </Field>
                <Field label="Nome nell'avviso" hint="Vuoto = il nome dell'account.">
                  <input
                    name="liveaccountcard-displayname"
                    id="liveaccountcard-displayname"
                    className={fieldClass}
                    value={acc.displayName}
                    placeholder={handle || "Nome"}
                    onChange={(e) => onChange({ displayName: e.target.value })}
                  />
                </Field>
              </div>
              <MemberField guildId={guildId} token={token} value={acc.discordUserId} onChange={(discordUserId) => onChange({ discordUserId })} />

              {platform === "twitch" ? (
                <div className="space-y-3 rounded-xl bg-crema/[0.025] p-3 ring-1 ring-sand/[0.08]">
                  <SettingRow title="Togli l'avviso a fine live" description="Quando la diretta finisce, il messaggio sparisce dal canale.">
                    <Toggle size="sm" checked={acc.deleteAnnouncementOnOffline} onChange={(deleteAnnouncementOnOffline) => onChange({ deleteAnnouncementOnOffline })} label="Togli l'avviso a fine live" />
                  </SettingRow>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Palco di questo account (ID)" hint={generalStage ? "Vuoto = quello delle Avanzate." : "Vuoto = nessun palco."}>
                      <input
                        name="liveaccountcard-stage"
                        id="liveaccountcard-stage"
                        className={fieldClass}
                        inputMode="numeric"
                        value={acc.streamVoiceChannelId || ""}
                        onChange={(e) => onChange({ streamVoiceChannelId: e.target.value.replace(/\D/g, "") || null })}
                      />
                    </Field>
                    <Field label="Nome del palco in live">
                      <input
                        name="liveaccountcard-voice-on"
                        id="liveaccountcard-voice-on"
                        className={fieldClass}
                        value={acc.voiceNameOn || ""}
                        placeholder="🔴 In live"
                        onChange={(e) => onChange({ voiceNameOn: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Nome del palco offline">
                      <input
                        name="liveaccountcard-voice-off"
                        id="liveaccountcard-voice-off"
                        className={fieldClass}
                        value={acc.voiceNameOff || ""}
                        placeholder="Palco"
                        onChange={(e) => onChange({ voiceNameOff: e.target.value || null })}
                      />
                    </Field>
                  </div>
                  <Field label="Argomento del palco in live">
                    <input
                      name="liveaccountcard-voice-status"
                      id="liveaccountcard-voice-status"
                      className={fieldClass}
                      value={acc.voiceStatusOn || ""}
                      onChange={(e) => onChange({ voiceStatusOn: e.target.value || null })}
                      placeholder={`Sono in live su https://www.twitch.tv/${handle || "…"}`}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
