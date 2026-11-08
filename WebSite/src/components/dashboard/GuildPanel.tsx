"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bot,
  Clock3,
  Diamond,
  Hash,
  Info,
  LayoutGrid,
  Lock,
  LogIn,
  Megaphone,
  MousePointerClick,
  Pin,
  Plus,
  Search,
  Server,
  SlidersHorizontal,
  Ticket,
  Users,
} from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  checkDashboardAccess,
  dashHref,
  isGuildId,
  readLastGuildId,
  selectGuild,
} from "@/lib/dashboard";
import {
  BOARD_FEATURES,
  EMPTY_SETTINGS_PICKERS,
  buildCommandAclBody,
  isCommandEnabled,
  loadGuildPanel,
  normalizePrefixInput,
  patchGuildCommandAcl,
  patchGuildCommandEnabled,
  patchGuildCommands,
  patchGuildSettings,
  readGuildIdFromSearch,
  type BoardFeatures,
  type CatalogCategory,
  type CommandAcl,
  type CommandsPayload,
  type GuildOverview,
  type GuildSettings,
  type SettingsPickers,
  type TicketsSummary,
} from "@/lib/dashboard-guild";
import dynamic from "next/dynamic";
import { DashboardShell, GUILD_SECTIONS, isGuildSection, type GuildSectionId } from "./DashboardShell";
import {
  DashToast,
  Panel,
  StateCard,
  StatTile,
  Toggle,
  dashPrimaryBtn,
  dashSecondaryBtn,
  discordBtn,
} from "./guild/bits";

const CommandAclEditor = dynamic(() => import("./guild/CommandAcl").then((m) => m.CommandAcl), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});
const PartnershipPanel = dynamic(() => import("./guild/PartnershipPanel").then((m) => m.PartnershipPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});
const TicketDesk = dynamic(() => import("./guild/TicketDesk").then((m) => m.TicketDesk), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

type Gate = "loading" | "login" | "locked" | "noid" | "ready";
type Section = GuildSectionId;

const SECTION_LEAD: Record<Section, string> = {
  settings: "Prefisso, canale aggiornamenti e moduli della bacheca.",
  commands: "Attiva o disattiva i comandi e scegli chi può usarli e dove.",
  tickets: "Ticket aperti, pannelli, moduli, team e blacklist.",
  partnership: "Configurazione e gestione delle partnership del server.",
};

const fieldCls =
  "w-full rounded-lg bg-espresso/70 px-3 py-2 text-sm text-crema ring-1 ring-sand/15 outline-none transition focus:ring-caramel/45 disabled:opacity-50";

function readSectionFromSearch(search: string): Section | null {
  try {
    const v = String(new URLSearchParams(search).get("s") || "");
    return isGuildSection(v) ? v : null;
  } catch {
    return null;
  }
}

/** Testata del server: copertina sfocata, icona, badge e numeri principali. */
function GuildHero({
  guild,
  premiumActive,
  tickets,
  prefix,
  onTickets,
}: {
  guild: GuildOverview;
  premiumActive: boolean;
  tickets: TicketsSummary | null;
  prefix: string | null;
  onTickets: () => void;
}) {
  const initial = (guild.name.trim().charAt(0) || "?").toUpperCase();
  return (
    <section className="overflow-hidden rounded-2xl bg-roast/80 ring-1 ring-sand/10">
      <div className="relative h-24 overflow-hidden bg-mocha sm:h-28" aria-hidden>
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guild.iconUrl} alt="" className="size-full scale-125 object-cover opacity-40 blur-2xl" />
        ) : (
          <span className="absolute inset-0 bg-gradient-to-br from-caramel/25 via-mocha to-roast" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-roast to-transparent" />
      </div>
      <div className="relative -mt-12 flex flex-wrap items-end gap-4 px-4 sm:px-6">
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guild.iconUrl}
            alt=""
            width={80}
            height={80}
            className="size-20 shrink-0 rounded-2xl object-cover ring-4 ring-roast"
          />
        ) : (
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-mocha font-display text-3xl font-semibold text-crema/70 ring-4 ring-roast">
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-display text-2xl font-semibold text-crema sm:text-3xl">{guild.name}</h2>
            {premiumActive ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-caramel/15 px-2 py-0.5 text-[0.7rem] font-semibold text-ember ring-1 ring-caramel/35">
                <Diamond className="size-3" aria-hidden /> Premium
              </span>
            ) : null}
            {guild.isMainGuild ? (
              <span className="rounded-md bg-crema/10 px-2 py-0.5 text-[0.7rem] font-semibold text-crema/80 ring-1 ring-sand/25">
                Principale
              </span>
            ) : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-crema/45">
            <span className={cn("inline-flex items-center gap-1.5", guild.botPresent ? "text-[#9fd0a8] light:text-[#2f6b3f]" : "text-[#f0a493] light:text-[#a83a2c]")}>
              <span className={cn("size-1.5 rounded-full", guild.botPresent ? "bg-[#7fc48c]" : "bg-[#e0735f]")} aria-hidden />
              {guild.botPresent ? "Vinili è nel server" : "Vinili non è nel server"}
            </span>
            <span className="font-mono text-[0.65rem] text-crema/30">{guild.id}</span>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-4 sm:px-6 sm:pb-5">
        <StatTile
          icon={<Users />}
          label="Membri"
          value={guild.memberCount != null ? guild.memberCount.toLocaleString("it-IT") : "—"}
          hint={guild.onlineCount != null ? `${guild.onlineCount.toLocaleString("it-IT")} online` : undefined}
        />
        <StatTile
          icon={<Ticket />}
          label="Ticket aperti"
          value={tickets ? tickets.overview.open : "—"}
          hint={tickets ? `${tickets.overview.closed24h} chiusi nelle 24h` : undefined}
          tone="accent"
          onClick={tickets ? onTickets : undefined}
        />
        <StatTile
          icon={<Clock3 />}
          label="In attesa"
          value={tickets ? tickets.overview.unclaimed : "—"}
          hint={tickets ? "senza staffer" : undefined}
          onClick={tickets ? onTickets : undefined}
        />
        <StatTile icon={<Hash />} label="Prefisso" value={<span className="font-mono">{prefix ?? "—"}</span>} hint="comandi testuali" />
      </div>
    </section>
  );
}

const PRESENCE: Record<string, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-[#23a55a]" },
  idle: { label: "Inattivo", dot: "bg-[#f0b232]" },
  dnd: { label: "Non disturbare", dot: "bg-[#f23f43]" },
  offline: { label: "Offline", dot: "bg-[#80848e]" },
  invisible: { label: "Offline", dot: "bg-[#80848e]" },
};

/** Il bot come appare su Discord in questo server, con lo stato attuale e il cambio del nickname. */
function BotIdentityCard({
  settings,
  canCustomize,
  saving,
  onSaveNick,
}: {
  settings: GuildSettings;
  canCustomize: boolean;
  saving: boolean;
  onSaveNick: (nick: string | null) => Promise<boolean>;
}) {
  const [nick, setNick] = useState(settings.botNickname ?? "");
  useEffect(() => setNick(settings.botNickname ?? ""), [settings.botNickname]);

  const presence = PRESENCE[settings.botPresence?.status || "online"] ?? PRESENCE.online;
  const shownName = nick.trim() || settings.botUsername || "Vinili";
  const changed = nick.trim() !== (settings.botNickname ?? "").trim();

  const submit = async () => {
    if (!changed || saving || !canCustomize) return;
    const ok = await onSaveNick(nick.trim() || null);
    if (!ok) setNick(settings.botNickname ?? "");
  };

  return (
    <Panel icon={<Bot />} title="Il bot in questo server" description="Anteprima live" className="h-fit">
      <div className="rounded-xl bg-espresso/60 p-3 ring-1 ring-sand/10">
        <div className="flex items-center gap-3">
          <span className="relative shrink-0">
            {settings.botAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.botAvatarUrl} alt="" width={44} height={44} className="size-11 rounded-full" />
            ) : (
              <span className="flex size-11 items-center justify-center rounded-full bg-mocha text-crema/50">
                <Bot className="size-5" aria-hidden />
              </span>
            )}
            <span
              className={cn("absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-[3px] ring-espresso", presence.dot)}
              title={presence.label}
              aria-hidden
            />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold text-crema">
              <span className="truncate">{shownName}</span>
              <span className="shrink-0 rounded bg-[#5865f2] px-1 py-px text-[0.55rem] font-bold uppercase text-white">Bot</span>
            </p>
            <p className="truncate text-xs text-crema/45" title={settings.botPresence?.text || presence.label}>
              {settings.botPresence?.text || presence.label}
            </p>
          </div>
        </div>
      </div>

      <label htmlFor="bot-nick" className="mt-4 block">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-crema/70">
          Nickname nel server
          {!canCustomize ? <Lock className="size-3 text-crema/35" aria-label="Premium" /> : null}
        </span>
        <input
          id="bot-nick"
          name="bot-nick"
          value={nick}
          maxLength={32}
          disabled={saving || !canCustomize}
          placeholder={settings.botUsername || "Vinili"}
          onChange={(e) => setNick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          className={cn(fieldCls, "mt-1.5")}
        />
      </label>
      {canCustomize ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={!changed || saving} onClick={() => void submit()} className={cn(dashPrimaryBtn, "px-3 py-1.5 text-xs")}>
            Salva
          </button>
          {settings.botNickname ? (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setNick("");
                const ok = await onSaveNick(null);
                if (!ok) setNick(settings.botNickname ?? "");
              }}
              className={cn(dashSecondaryBtn, "px-3 py-1.5 text-xs")}
            >
              Ripristina
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-crema/40">Per cambiare il nickname del bot serve Vinili Premium.</p>
      )}
    </Panel>
  );
}

function SettingsSection({
  guildId,
  token,
  settings,
  pickers,
  error,
  canCustomize,
  onUpdated,
  onToast,
}: {
  guildId: string;
  token: string;
  canCustomize: boolean;
  settings: GuildSettings | null;
  pickers: SettingsPickers;
  error: string | null;
  onUpdated: (next: GuildSettings, pickers?: SettingsPickers) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [prefix, setPrefix] = useState(settings?.prefix ?? "+");
  const [updatesChannelId, setUpdatesChannelId] = useState(settings?.updatesChannelId ?? "");
  const [features, setFeatures] = useState<BoardFeatures>(
    settings?.boards.features ?? { quote: true, repost: true, clip: true, skull: true },
  );
  const [boardsEnabled, setBoardsEnabled] = useState(settings?.boards.enabled !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setPrefix(settings.prefix);
    setUpdatesChannelId(settings.updatesChannelId ?? "");
    setFeatures(settings.boards.features);
    setBoardsEnabled(settings.boards.enabled !== false);
  }, [settings]);

  const save = async (body: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    const res = await patchGuildSettings(token, guildId, body);
    setSaving(false);
    if (!res.ok) {
      onToast(res.message, true);
      return false;
    }
    onUpdated(res.data.settings, res.data.pickers);
    onToast(okMsg);
    return true;
  };

  if (error && !settings) {
    return (
      <p className="rounded-xl bg-caramel/10 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-caramel/25">
        {error}
      </p>
    );
  }
  if (!settings) return null;

  const prefixLocked = settings.prefixLocked;
  const updatesLocked = settings.updatesLocked;
  const activeFeatures = BOARD_FEATURES.filter((f) => features[f.id]).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        <Panel icon={<SlidersHorizontal />} title="Generale" description="Come si chiamano i comandi e dove arrivano le novità del bot.">
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="prefix" className="block">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-crema/70">
                <Hash className="size-3.5 text-crema/40" aria-hidden /> Prefisso comandi
                {prefixLocked ? <Lock className="size-3 text-crema/35" aria-label="Bloccato" /> : null}
              </span>
              <input
                id="prefix"
                name="prefix"
                value={prefix}
                maxLength={settings.prefixMaxLength}
                disabled={prefixLocked || saving}
                onChange={(e) => setPrefix(e.target.value)}
                onBlur={async () => {
                  if (prefixLocked || prefix === settings.prefix) return;
                  const parsed = normalizePrefixInput(prefix, settings.prefixMaxLength);
                  if (!parsed.ok) {
                    onToast(parsed.message, true);
                    setPrefix(settings.prefix);
                    return;
                  }
                  const ok = await save({ prefix: parsed.prefix }, "Prefisso salvato.");
                  if (!ok) setPrefix(settings.prefix);
                }}
                className={cn(fieldCls, "mt-1.5 font-mono")}
              />
              <span className="mt-1 block text-xs text-crema/35">
                {prefixLocked ? "Bloccato sul server Vinili." : "Si salva quando esci dal campo."}
              </span>
            </label>

            <label className="block">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-crema/70">
                <Megaphone className="size-3.5 text-crema/40" aria-hidden /> Canale aggiornamenti
                {updatesLocked ? <Lock className="size-3 text-crema/35" aria-label="Bloccato" /> : null}
              </span>
              <Select
                value={updatesChannelId}
                disabled={updatesLocked || saving}
                onChange={async (next) => {
                  setUpdatesChannelId(next);
                  if (updatesLocked) return;
                  const ok = await save({ updatesChannelId: next || null }, "Canale aggiornamenti salvato.");
                  if (!ok) setUpdatesChannelId(settings.updatesChannelId ?? "");
                }}
                className={cn(fieldCls, "mt-1.5")}
                options={[
                  { value: "", label: "— Nessuno —" },
                  ...pickers.textChannels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
                ]}
              />
              <span className="mt-1 block text-xs text-crema/35">
                {updatesLocked
                  ? "Sul server principale Vinili questo canale non si configura da dashboard."
                  : "Inoltro degli aggiornamenti dal canale news di Vinili."}
              </span>
            </label>
          </div>
        </Panel>

        <Panel
          icon={<Pin />}
          title="Bacheca"
          description={
            boardsEnabled
              ? `Modulo attivo · ${activeFeatures} di ${BOARD_FEATURES.length} funzioni accese`
              : "Modulo spento: citazioni, repost, clip e skullboard non funzionano."
          }
          aside={
            <Toggle
              checked={boardsEnabled}
              disabled={saving}
              label="Attiva bacheca"
              onChange={async (next) => {
                setBoardsEnabled(next);
                const ok = await save({ boards: { enabled: next, features } }, next ? "Bacheca attiva." : "Bacheca disattivata.");
                if (!ok) setBoardsEnabled(settings.boards.enabled !== false);
              }}
            />
          }
        >
          <ul className={cn("grid gap-2.5 sm:grid-cols-2", !boardsEnabled && "opacity-50")}>
            {BOARD_FEATURES.map((feat) => (
              <li
                key={feat.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl bg-espresso/55 p-3 ring-1 transition-colors",
                  features[feat.id] && boardsEnabled ? "ring-caramel/25" : "ring-sand/10",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-crema">{feat.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-crema/40">{feat.hint}</p>
                </div>
                <Toggle
                  checked={features[feat.id]}
                  disabled={saving || !boardsEnabled}
                  label={`Attiva ${feat.title}`}
                  onChange={async (next) => {
                    const nextFeats = { ...features, [feat.id]: next };
                    setFeatures(nextFeats);
                    const ok = await save(
                      { boards: { enabled: boardsEnabled, features: nextFeats } },
                      "Funzioni bacheca salvate.",
                    );
                    if (!ok) setFeatures(settings.boards.features);
                  }}
                />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {settings.botUsername ? (
        <BotIdentityCard
          settings={settings}
          canCustomize={canCustomize}
          saving={saving}
          onSaveNick={(nick) => save({ botNickname: nick }, nick ? "Nickname del bot aggiornato." : "Nickname del bot ripristinato.")}
        />
      ) : null}
    </div>
  );
}

function CommandsSection({
  guildId,
  token,
  commands,
  pickers,
  error,
  onUpdated,
  onToast,
}: {
  guildId: string;
  token: string;
  commands: CommandsPayload | null;
  pickers: SettingsPickers;
  error: string | null;
  onUpdated: (next: CommandsPayload) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [aclName, setAclName] = useState<string | null>(null);

  const categories = useMemo(() => commands?.catalog ?? [], [commands]);
  const activeCat: CatalogCategory | null = useMemo(() => {
    if (!commands) return null;
    if (cat === "all") return null;
    return categories.find((c) => c.id === cat) ?? null;
  }, [commands, categories, cat]);

  const rows = useMemo(() => {
    if (!commands) return [];
    const base = activeCat ? activeCat.commands : categories.flatMap((c) => c.commands);
    const q = query.trim().toLowerCase().replace(/^[/+!.]/, "");
    if (!q) return base;
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        String(c.displayName || "").toLowerCase().includes(q) ||
        String(c.description || "").toLowerCase().includes(q),
    );
  }, [commands, activeCat, categories, query]);

  const totals = useMemo(() => {
    if (!commands) return { all: 0, on: 0 };
    const all = categories.flatMap((c) => c.commands);
    return { all: all.length, on: all.filter((c) => isCommandEnabled(commands.commands, c.name)).length };
  }, [commands, categories]);

  if (error && !commands) {
    return (
      <p className="rounded-xl bg-caramel/10 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-caramel/25">
        {error}
      </p>
    );
  }
  if (!commands) return null;

  const toggle = async (name: string, next: boolean, prev: CommandAcl | undefined) => {
    if (prev?.boardFeatureLocked) {
      onToast("Comando bloccato: attiva prima la funzione bacheca collegata.", true);
      return;
    }
    setBusy(name);
    const optimistic = {
      ...commands,
      commands: {
        ...commands.commands,
        [name]: { ...(prev || { enabled: true, roleMode: null, roleIds: [], channelMode: null, channelIds: [] }), enabled: next },
      },
    };
    onUpdated(optimistic);
    const res = await patchGuildCommandEnabled(token, guildId, name, next, prev);
    setBusy(null);
    if (!res.ok) {
      onUpdated(commands);
      onToast(res.message, true);
      return;
    }
    onUpdated(res.data);
  };

  const saveAcl = async (name: string, next: CommandAcl) => {
    setBusy(name);
    const res = await patchGuildCommandAcl(token, guildId, name, next);
    setBusy(null);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    onUpdated(res.data);
    onToast("Impostazioni comando salvate.");
  };

  const saveCategoryAcl = async (names: string[], next: CommandAcl) => {
    const body = buildCommandAclBody(next);
    const payload: Record<string, CommandAcl | null> = {};
    for (const name of names) payload[name] = body;
    setBusy(names[0] || "cat");
    const res = await patchGuildCommands(token, guildId, payload);
    setBusy(null);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    onUpdated(res.data);
    onToast("Impostazioni comando salvate.");
  };

  const aclChannels = [...pickers.textChannels, ...pickers.voiceChannels];
  const chip = (on: boolean) =>
    cn(
      "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
      on ? "bg-caramel/20 text-ember ring-1 ring-caramel/35" : "bg-crema/[0.04] text-crema/55 ring-1 ring-sand/10 hover:text-crema",
    );

  return (
    <div className="space-y-4">
      {commands.discordWarning ? (
        <p className="flex gap-2 rounded-xl bg-caramel/10 px-3 py-2.5 text-xs text-crema/75 ring-1 ring-caramel/25">
          <Info className="mt-0.5 size-3.5 shrink-0 text-caramel" aria-hidden />
          {commands.discordWarning}
        </p>
      ) : null}

      <Panel
        title="Comandi"
        description={
          <>
            Prefisso attuale <span className="rounded bg-espresso/70 px-1 font-mono text-crema/75">{commands.prefix}</span> ·{" "}
            <span className="tabular-nums">
              {totals.on} attivi su {totals.all}
            </span>
          </>
        }
        bodyClassName="space-y-3 px-0 py-0 sm:px-0"
      >
        <div className="space-y-3 px-4 pt-4 sm:px-5">
          <label className="relative block">
            <span className="sr-only">Cerca comando</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/35" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca un comando…"
              className={cn(fieldCls, "pl-9 placeholder:text-crema/30")}
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Categorie comandi">
            <button type="button" role="tab" aria-selected={cat === "all"} onClick={() => setCat("all")} className={chip(cat === "all")}>
              Tutti <span className="ml-1 tabular-nums opacity-60">{totals.all}</span>
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={cat === c.id}
                onClick={() => setCat(c.id)}
                className={chip(cat === c.id)}
              >
                {c.label.charAt(0).toUpperCase() + c.label.slice(1)} <span className="ml-1 tabular-nums opacity-60">{c.commands.length}</span>
              </button>
            ))}
          </div>
        </div>

        <ul className="divide-y divide-sand/[0.07] border-t border-sand/[0.08]">
          {rows.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-crema/45">
              {query ? "Nessun comando con questo nome." : "Nessun comando in questa categoria."}
            </li>
          ) : (
            rows.map((cmd) => {
              const acl = commands.commands[cmd.name];
              const on = isCommandEnabled(commands.commands, cmd.name);
              const locked = acl?.boardFeatureLocked === true;
              const category = categories.find((c) => c.commands.some((x) => x.name === cmd.name));
              const categoryNames = category?.commands.map((x) => x.name) || [cmd.name];
              const restricted = Boolean(acl && ((acl.roleIds?.length ?? 0) > 0 || (acl.channelIds?.length ?? 0) > 0));
              /* menu contestuali (tasto destro su utente/messaggio): niente "/" e badge proprio */
              const context = cmd.kind === "slash" && (cmd.slashType === "user" || cmd.slashType === "message");
              const baseName = String(cmd.displayName || cmd.name).replace(/^\//, "");
              const shownName = context ? baseName : `${cmd.kind === "slash" ? "/" : commands.prefix}${baseName}`;
              const badge = context ? (cmd.slashType === "user" ? "menu utente" : "menu messaggio") : cmd.kind === "slash" ? "slash" : "prefix";
              const openAcl = aclName === cmd.name;
              return (
                <li key={cmd.name} className={cn("px-4 py-3 transition-colors sm:px-5", openAcl && "bg-espresso/40")}>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "hidden size-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold sm:flex",
                        on ? "bg-caramel/12 text-ember" : "bg-crema/[0.04] text-crema/30",
                      )}
                      aria-hidden
                    >
                      {context ? <MousePointerClick className="size-4" /> : cmd.kind === "slash" ? "/" : commands.prefix.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-sm font-semibold", !context && "font-mono", on ? "text-crema" : "text-crema/45")}>
                          {shownName}
                        </span>
                        <span className="rounded bg-crema/[0.06] px-1.5 py-px text-[0.58rem] font-semibold uppercase tracking-wider text-crema/40">
                          {badge}
                        </span>
                        {restricted ? (
                          <span className="rounded bg-caramel/12 px-1.5 py-px text-[0.58rem] font-semibold uppercase tracking-wider text-ember/90">
                            limitato
                          </span>
                        ) : null}
                      </div>
                      {cmd.description ? <p className="mt-0.5 truncate text-xs text-crema/40">{cmd.description}</p> : null}
                      {locked ? <p className="mt-0.5 text-[0.68rem] text-caramel/85">Bloccato da funzione bacheca</p> : null}
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition",
                        openAcl ? "bg-caramel/15 text-ember ring-caramel/30" : "text-crema/55 ring-sand/15 hover:text-crema hover:ring-sand/30",
                      )}
                      aria-expanded={openAcl}
                      onClick={() => setAclName(openAcl ? null : cmd.name)}
                    >
                      Permessi
                    </button>
                    <Toggle checked={on} disabled={busy === cmd.name || locked} label={`Attiva ${cmd.name}`} onChange={(next) => toggle(cmd.name, next, acl)} />
                  </div>
                  {openAcl ? (
                    <div className="mt-3">
                      <CommandAclEditor
                        acl={acl || { enabled: on, roleMode: null, roleIds: [], channelMode: null, channelIds: [] }}
                        roles={pickers.roles}
                        channels={aclChannels}
                        busy={busy === cmd.name}
                        categoryNames={categoryNames}
                        onSave={(next) => saveAcl(cmd.name, next)}
                        onSaveCategory={(next) => saveCategoryAcl(categoryNames, next)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </Panel>
    </div>
  );
}

/** Pannello server: impostazioni, comandi con ACL, ticket e partnership. */
export function GuildPanel() {
  const { ready, token, login } = useAuth();
  const [gate, setGate] = useState<Gate>("loading");
  const [guildId, setGuildId] = useState("");
  const [section, setSectionState] = useState<Section>("settings");
  const [overview, setOverview] = useState<GuildOverview | null>(null);
  const [settings, setSettings] = useState<GuildSettings | null>(null);
  const [pickers, setPickers] = useState<SettingsPickers>(EMPTY_SETTINGS_PICKERS);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [commands, setCommands] = useState<CommandsPayload | null>(null);
  const [commandsError, setCommandsError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketsSummary | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [premiumActive, setPremiumActive] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
  }, []);

  /* sezione anche nell'indirizzo (?s=…): ricaricando o condividendo il link si riapre la stessa */
  const setSection = useCallback((next: Section) => {
    setSectionState(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("s", next);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const fromUrl = readSectionFromSearch(window.location.search);
    if (fromUrl) setSectionState(fromUrl);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!ready) return;

    const fromUrl = readGuildIdFromSearch(typeof window !== "undefined" ? window.location.search : "");
    const fromLast = readLastGuildId();
    const id = fromUrl || fromLast;

    if (!token) {
      setGate("login");
      return;
    }
    if (!isGuildId(id)) {
      setGate("noid");
      setGuildId("");
      return;
    }

    if (fromUrl) selectGuild(fromUrl);
    else if (fromLast && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("id", fromLast);
      window.history.replaceState({}, "", url.toString());
    }

    setGuildId(id);
    let cancelled = false;

    (async () => {
      setGate("loading");
      setError("");

      const access = await checkDashboardAccess(token);
      if (cancelled) return;
      if (!access.ok) {
        if (access.status === 401) {
          setGate("login");
          return;
        }
        setError(access.message);
        setGate("ready");
        return;
      }
      if (access.access.blacklisted || !access.access.allowed) {
        setGate("locked");
        return;
      }

      const panel = await loadGuildPanel(token, id);
      if (cancelled) return;
      if (!panel.ok) {
        if (panel.status === 401) {
          setGate("login");
          return;
        }
        if (panel.status === 403) {
          setGate("locked");
          return;
        }
        setError(panel.message);
        setGate("ready");
        return;
      }

      const d = panel.data;
      setOverview(d.overview);
      setSettings(d.settings);
      setPickers(d.settingsPickers);
      setSettingsError(d.settingsError);
      setCommands(d.commands);
      setCommandsError(d.commandsError);
      setTickets(d.tickets);
      setTicketsError(d.ticketsError);
      setPremiumActive(d.premiumActive);
      setGate("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  const sectionMeta = GUILD_SECTIONS.find((s) => s.id === section) ?? GUILD_SECTIONS[0];
  const showSections = gate === "ready" && overview?.botPresent;

  return (
    <DashboardShell
      title={showSections ? sectionMeta.label : "Pannello server"}
      crumb={showSections ? sectionMeta.label : "Pannello"}
      lead={showSections ? SECTION_LEAD[section] : "Impostazioni, comandi, ticket e partnership del server selezionato."}
      guild={overview ? { id: overview.id, name: overview.name, iconUrl: overview.iconUrl } : null}
      guildNav={
        showSections
          ? { active: section, onSelect: setSection, badges: { tickets: tickets?.overview.unclaimed || undefined } }
          : undefined
      }
    >
      <AnimatePresence mode="wait">
        {(gate === "loading" || !ready) && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
            role="status"
            aria-label="Caricamento pannello"
          >
            <div className="h-56 animate-pulse rounded-2xl bg-roast/70 ring-1 ring-sand/10" />
            <div className="h-64 animate-pulse rounded-2xl bg-roast/60 ring-1 ring-sand/10" />
          </motion.div>
        )}

        {gate === "login" && (
          <motion.div key="login" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <StateCard
              icon={<Server />}
              title="Accedi per continuare"
              actions={
                <>
                  <button type="button" onClick={login} className={discordBtn}>
                    <LogIn className="size-4" /> Accedi con Discord
                  </button>
                  <SmartLink href={dashHref("/dashboard/")} className={dashSecondaryBtn}>
                    Torna ai server
                  </SmartLink>
                </>
              }
            >
              Per gestire un server serve il login Discord.
            </StateCard>
          </motion.div>
        )}

        {gate === "locked" && (
          <motion.div key="locked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <StateCard
              icon={<Lock />}
              title="Accesso non disponibile"
              actions={
                <SmartLink href={dashHref("/dashboard/")} className={dashSecondaryBtn}>
                  Torna ai server
                </SmartLink>
              }
            >
              Questa sezione non è disponibile con il tuo account.
            </StateCard>
          </motion.div>
        )}

        {gate === "noid" && (
          <motion.div key="noid" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <StateCard
              icon={<LayoutGrid />}
              title="Nessun server selezionato"
              actions={
                <SmartLink href={dashHref("/dashboard/")} className={dashPrimaryBtn}>
                  Scegli un server
                </SmartLink>
              }
            >
              Scegli un server dalla home dashboard per aprire il pannello.
            </StateCard>
          </motion.div>
        )}

        {gate === "ready" && overview && (
          <motion.div key="ready" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {error ? (
              <p className="rounded-xl bg-[#a83a2c]/15 px-3 py-2 text-sm text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/30">
                {error}
              </p>
            ) : null}

            <GuildHero
              guild={overview}
              premiumActive={premiumActive}
              tickets={overview.botPresent ? tickets : null}
              prefix={overview.botPresent ? settings?.prefix ?? commands?.prefix ?? null : null}
              onTickets={() => setSection("tickets")}
            />

            {!overview.botPresent ? (
              <StateCard
                icon={<Plus />}
                title="Aggiungi Vinili al server"
                actions={
                  overview.inviteUrl ? (
                    <a href={overview.inviteUrl} target="_blank" rel="noreferrer" className={discordBtn}>
                      <Plus className="size-4" aria-hidden /> Invita il bot
                    </a>
                  ) : null
                }
              >
                {settingsError || "Il bot non è presente in questo server."}
              </StateCard>
            ) : (
              <>
                {/* telefono e tablet: le sezioni anche qui (su pc sono nella sidebar) */}
                <div
                  className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 lg:hidden"
                  role="tablist"
                  aria-label="Sezioni pannello"
                >
                  {GUILD_SECTIONS.map((s) => {
                    const Icon = s.icon;
                    const on = section === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setSection(s.id)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                          on ? "bg-caramel/15 text-ember ring-1 ring-caramel/30" : "bg-roast/70 text-crema/55 ring-1 ring-sand/10",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {s.label}
                        {s.id === "tickets" && tickets?.overview.unclaimed ? (
                          <span className="rounded bg-caramel px-1 text-[0.6rem] font-bold tabular-nums text-ink">{tickets.overview.unclaimed}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={section}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {section === "settings" && guildId && token ? (
                      <SettingsSection
                        guildId={guildId}
                        token={token}
                        settings={settings}
                        pickers={pickers}
                        error={settingsError}
                        canCustomize={premiumActive || overview.isMainGuild || overview.isProtectedGuild}
                        onUpdated={(next, nextPickers) => {
                          setSettings(next);
                          if (nextPickers) setPickers(nextPickers);
                          setSettingsError(null);
                        }}
                        onToast={showToast}
                      />
                    ) : null}
                    {section === "commands" && guildId && token ? (
                      <CommandsSection
                        guildId={guildId}
                        token={token}
                        commands={commands}
                        pickers={pickers}
                        error={commandsError}
                        onUpdated={(next) => {
                          setCommands(next);
                          setCommandsError(null);
                        }}
                        onToast={showToast}
                      />
                    ) : null}
                    {section === "tickets" && guildId && token ? (
                      <Panel>
                        <TicketDesk
                          guildId={guildId}
                          token={token}
                          summary={tickets}
                          error={ticketsError}
                          isMainGuild={overview.isMainGuild}
                          onSummary={(next) => {
                            setTickets(next);
                            setTicketsError(null);
                          }}
                          onToast={showToast}
                        />
                      </Panel>
                    ) : null}
                    {section === "partnership" && guildId && token ? (
                      <Panel>
                        <PartnershipPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </>
            )}
          </motion.div>
        )}

        {gate === "ready" && !overview && error ? (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <StateCard
              icon={<Info />}
              title="Pannello non disponibile"
              actions={
                <SmartLink href={dashHref("/dashboard/")} className={dashSecondaryBtn}>
                  Torna ai server
                </SmartLink>
              }
            >
              {error}
            </StateCard>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DashToast toast={toast} />
    </DashboardShell>
  );
}
