"use client";

import { useState } from "react";
import {
  Ban,
  Calendar,
  Folder,
  Hash,
  Megaphone,
  MessagesSquare,
  Shield,
  Sparkles,
  Users,
  Volume2,
  Webhook,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { BackupPreview, BackupPreviewChannel } from "@/lib/dashboard-backup";

function roleColor(color: number) {
  if (!color) return "#b5bac1";
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Colore ruolo leggibile su fondo scuro (evita marroni/gialli morti). */
function roleTextColor(color: number) {
  if (!color) return "#dbdee1";
  const hex = roleColor(color);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.22) {
    const lift = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.45));
    return `#${[lift(r), lift(g), lift(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return hex;
}

function channelIcon(type: number) {
  if (type === 2 || type === 13) return Volume2;
  if (type === 5) return Megaphone;
  if (type === 4) return Folder;
  if (type === 15 || type === 16) return MessagesSquare;
  return Hash;
}

function channelLabel(channel: BackupPreviewChannel) {
  const raw = String(channel.name || "").replace(/^#\s*/, "").trim() || "canale";
  return raw;
}

function ChannelRow({ channel, depth = 0 }: { channel: BackupPreviewChannel; depth?: number }) {
  const Icon = channelIcon(channel.type);
  const isCategory = channel.type === 4;
  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-[5px] text-[0.8125rem] leading-none",
          isCategory
            ? "mt-2.5 mb-0.5 text-xs font-semibold text-[#949ba4]"
            : "text-[#dbdee1] hover:bg-white/[0.04]",
        )}
        style={{ paddingLeft: `${0.45 + depth * 0.7}rem` }}
      >
        {!isCategory ? <Icon className="size-3.5 shrink-0 text-[#80848e]" aria-hidden /> : null}
        <span className="min-w-0 truncate">{channelLabel(channel)}</span>
        {channel.nsfw ? <span className="text-[0.62rem] font-semibold text-ember/90">NSFW</span> : null}
      </div>
      {channel.children?.length ? (
        <ul>
          {channel.children.map((child) => (
            <ChannelRow key={child.id} channel={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function MetaStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-crema/40">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-crema">{value}</p>
    </div>
  );
}

function MediaThumb({
  src,
  name,
  sizeClass,
}: {
  src: string | null;
  name: string;
  sizeClass: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        title={name}
        className={cn(
          "inline-flex items-center justify-center truncate rounded-md bg-[#2b2d31] px-0.5 text-center text-[0.55rem] leading-tight text-[#b5bac1]",
          sizeClass,
        )}
      >
        {name.slice(0, 6)}
      </span>
    );
  }
  return (
     
    <img
      src={src}
      alt={name}
      title={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("rounded-md bg-[#2b2d31] object-contain p-0.5", sizeClass)}
    />
  );
}

export function BackupPreviewView({ preview }: { preview: BackupPreview }) {
  const g = preview.guild;
  const roles = preview.roles.filter((r) => r.name !== "@everyone");
  const tree = preview.channelTree || [];
  const channelCount =
    (preview.stats?.channels as number | undefined) ||
    tree.reduce((n, node) => n + 1 + (node.children?.length || 0), 0);

  return (
    <div className="rounded-2xl bg-[#1e1f22] ring-1 ring-sand/15">
      {/* Header server */}
      <div className="relative overflow-hidden rounded-t-2xl">
        <div className="relative h-24 bg-[#111214] sm:h-28">
          {g.bannerURL ? (
             
            <img src={g.bannerURL} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, #3d2a1c 0%, #1a110c 45%, #0e0906 100%)",
              }}
              aria-hidden
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1e1f22] via-[#1e1f22]/35 to-transparent" />
        </div>
        <div className="relative -mt-8 flex items-end gap-3 px-4 pb-3 sm:px-5">
          <div className="size-16 shrink-0 overflow-hidden rounded-2xl bg-[#111214] ring-[3px] ring-[#1e1f22] sm:size-[4.5rem]">
            {g.iconURL ? (
               
              <img src={g.iconURL} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center font-display text-2xl font-semibold text-crema/55">
                {(g.name || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h3 className="truncate font-display text-xl font-semibold text-crema sm:text-2xl">
              {g.name || "Server"}
            </h3>
            <p className="mt-0.5 text-xs text-[#b5bac1] sm:text-sm">
              <span className="tabular-nums">{g.memberCount.toLocaleString("it-IT")}</span> membri
              {" · "}
              <span className="tabular-nums">{channelCount}</span> canali
              {" · "}
              {preview.source === "automatic" ? "Automatico" : "Manuale"}
              {preview.sizeBytes
                ? ` · ${Math.max(1, Math.round(preview.sizeBytes / (1024 * 1024)))} MB`
                : ""}
            </p>
          </div>
        </div>
        {g.description ? (
          <p className="border-t border-white/[0.06] px-4 py-2.5 text-sm leading-relaxed text-[#b5bac1] text-pretty sm:px-5">
            {g.description}
          </p>
        ) : null}
        <div className="grid grid-cols-4 gap-2 border-t border-white/[0.06] px-4 py-3 sm:grid-cols-8 sm:px-5">
          <MetaStat label="Ruoli" value={roles.length} />
          <MetaStat
            label="Emoji"
            value={preview.stats?.emojis ?? preview.emojis.length}
          />
          <MetaStat label="Messaggi" value={preview.messages.total} />
          <MetaStat label="Ban" value={preview.bans.count} />
          <MetaStat label="Invite" value={preview.invites.count} />
          <MetaStat label="Webhook" value={preview.webhooks.count} />
          <MetaStat label="Eventi" value={preview.events.length} />
          <MetaStat label="Tier boost" value={g.premiumTier > 0 ? `Livello ${g.premiumTier}` : "—"} />
        </div>
      </div>

      {/* Corpo stile Discord: sidebar canali + pannello */}
      <div className="grid border-t border-white/[0.06] lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)]">
        <aside className="border-b border-white/[0.06] bg-[#2b2d31] lg:border-b-0 lg:border-r lg:border-white/[0.06]">
          <div className="sticky top-0 z-[1] border-b border-black/20 bg-[#2b2d31] px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-[#949ba4]">
              Canali
              <span className="ml-1.5 tabular-nums text-[#6d6f78]">{channelCount}</span>
            </p>
          </div>
          <ul className="max-h-[22rem] space-y-0 overflow-y-auto overscroll-contain px-2 py-2 lg:max-h-[32rem]">
            {tree.length ? (
              tree.map((ch) => <ChannelRow key={ch.id} channel={ch} />)
            ) : (
              <li className="px-2 py-3 text-sm text-[#949ba4]">Nessun canale nello snapshot</li>
            )}
          </ul>
          {preview.threads.count ? (
            <p className="border-t border-black/20 px-3 py-2 text-xs text-[#949ba4]">
              {preview.threads.count} thread / post forum
            </p>
          ) : null}
        </aside>

        <div className="min-w-0 bg-[#313338]">
          <div className="border-b border-black/20 px-4 py-3 sm:px-5">
            <p className="text-xs font-semibold text-[#949ba4]">
              Ruoli
              <span className="ml-1.5 tabular-nums text-[#6d6f78]">{roles.length}</span>
            </p>
            <ul className="mt-2.5 flex max-h-52 flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
              {roles.length ? (
                roles.map((role) => (
                  <li key={role.id} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-white/[0.03]">
                    <span
                      className="size-3 shrink-0 rounded-full ring-1 ring-black/30"
                      style={{ backgroundColor: roleColor(role.color) }}
                      aria-hidden
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-sm font-medium"
                      style={{ color: roleTextColor(role.color) }}
                    >
                      {role.name}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {role.hoist ? (
                        <span className="rounded bg-black/25 px-1.5 py-0.5 text-xs text-[#b5bac1]">
                          hoist
                        </span>
                      ) : null}
                      {role.managed ? (
                        <span className="rounded bg-black/25 px-1.5 py-0.5 text-xs text-[#b5bac1]">
                          bot
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-[#949ba4]">Nessun ruolo</li>
              )}
            </ul>
          </div>

          {preview.emojis.length ? (
            <div className="border-b border-black/20 px-4 py-3 sm:px-5">
              <p className="text-xs font-semibold text-[#949ba4]">
                Emoji
                <span className="ml-1.5 tabular-nums text-[#6d6f78]">
                  {preview.stats?.emojis ?? preview.emojis.length}
                </span>
              </p>
              <div className="mt-2.5 flex max-h-40 flex-wrap gap-1 overflow-y-auto overscroll-contain pr-1">
                {preview.emojis.map((e) => (
                  <MediaThumb
                    key={e.id || e.name}
                    src={e.url}
                    name={`:${e.name}:`}
                    sizeClass="size-6"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {preview.stickers.length ? (
            <div className="border-b border-black/20 px-4 py-3 sm:px-5">
              <p className="text-xs font-semibold text-[#949ba4]">
                Sticker
                <span className="ml-1.5 tabular-nums text-[#6d6f78]">
                  {preview.stats?.stickers ?? preview.stickers.length}
                </span>
              </p>
              <div className="mt-2.5 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto overscroll-contain pr-1">
                {preview.stickers.map((s) => (
                  <MediaThumb
                    key={s.id || s.name}
                    src={s.url}
                    name={s.name}
                    sizeClass="size-9"
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="px-4 py-3 sm:px-5">
            {preview.messages.byChannelTop.length ? (
              <>
                <p className="text-xs font-semibold text-[#949ba4]">
                  Messaggi per canale
                </p>
                <ul className="mt-2 space-y-1">
                  {preview.messages.byChannelTop.map((row) => (
                    <li
                      key={row.channelId}
                      className="flex items-center justify-between gap-2 text-sm text-[#dbdee1]"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                        <Hash className="size-3.5 shrink-0 text-[#80848e]" aria-hidden />
                        <span className="truncate">{String(row.channelName || "").replace(/^#/, "")}</span>
                      </span>
                      <span className="tabular-nums text-[#949ba4]">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : preview.messages.total === 0 ? (
              <p className="text-xs leading-relaxed text-[#949ba4] text-pretty">
                Nessun messaggio nello snapshot. Se è automatico, alza il limite in «Cosa salvare».
              </p>
            ) : (
              <p className="text-sm text-[#dbdee1]">
                <MessagesSquare className="mr-1.5 inline size-3.5 text-[#80848e]" aria-hidden />
                <span className="tabular-nums font-semibold">{preview.messages.total}</span> messaggi salvati
              </p>
            )}

            {preview.bans.sample.length ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-[#949ba4]">
                  Ban
                </p>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-sm">
                  {preview.bans.sample.map((b, i) => (
                    <li key={`${b.tag}-${i}`} className="truncate text-[#dbdee1]">
                      <Ban className="mr-1.5 inline size-3 text-[#80848e]" aria-hidden />
                      {b.tag}
                      {b.reason ? <span className="text-[#949ba4]"> — {b.reason}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(preview.events.length > 0 || preview.automodRules.count > 0 || preview.webhooks.count > 0) && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#b5bac1]">
                {preview.events.length ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-black/20 px-2 py-1">
                    <Calendar className="size-3" aria-hidden />
                    {preview.events.length} eventi
                  </span>
                ) : null}
                {preview.automodRules.count ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-black/20 px-2 py-1">
                    <Shield className="size-3" aria-hidden />
                    {preview.automodRules.count} AutoMod
                  </span>
                ) : null}
                {preview.webhooks.count ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-black/20 px-2 py-1">
                    <Webhook className="size-3" aria-hidden />
                    {preview.webhooks.count} webhook
                  </span>
                ) : null}
                {preview.invites.count ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-black/20 px-2 py-1">
                    <Link2 className="size-3" aria-hidden />
                    {preview.invites.count} invite
                  </span>
                ) : null}
                {g.premiumTier ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-black/20 px-2 py-1">
                    <Sparkles className="size-3" aria-hidden />
                    Tier boost livello {g.premiumTier}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-md bg-black/20 px-2 py-1">
                  <Users className="size-3" aria-hidden />
                  {preview.members.count} membri in snapshot
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
