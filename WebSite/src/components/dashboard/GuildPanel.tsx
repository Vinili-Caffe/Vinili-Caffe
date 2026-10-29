"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Diamond,
  Handshake,
  Info,
  LogIn,
  Server,
  Settings2,
  Terminal,
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
import { DashboardShell } from "./DashboardShell";
import { Toggle } from "./guild/bits";

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
type Section = "settings" | "commands" | "tickets" | "partnership";

const SECTIONS: { id: Section; label: string; icon: typeof Settings2 }[] = [
  { id: "settings", label: "Impostazioni", icon: Settings2 },
  { id: "commands", label: "Comandi", icon: Terminal },
  { id: "tickets", label: "Ticket", icon: Ticket },
  { id: "partnership", label: "Partnership", icon: Handshake },
];

function GuildHeader({
  guild,
  premiumActive,
}: {
  guild: GuildOverview;
  premiumActive: boolean;
}) {
  const initial = (guild.name.trim().charAt(0) || "?").toUpperCase();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-3.5 ring-1 ring-sand/12 sm:p-4">
      {guild.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={guild.iconUrl}
          alt=""
          width={48}
          height={48}
          className="size-12 rounded-xl object-cover ring-1 ring-sand/20"
        />
      ) : (
        <span className="flex size-12 items-center justify-center rounded-xl bg-espresso font-display text-lg font-semibold text-crema/70 ring-1 ring-sand/20">
          {initial}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate font-display text-2xl font-semibold text-crema">{guild.name}</h2>
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
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-crema/50">
          {guild.memberCount != null ? (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden />
              <span className="lining-nums">{guild.memberCount}</span> membri
            </span>
          ) : null}
          {guild.onlineCount != null ? (
            <span className="lining-nums text-crema/40">{guild.onlineCount} online</span>
          ) : null}
          <span className="font-mono text-[0.65rem] text-crema/35">{guild.id}</span>
        </p>
      </div>
      <SmartLink
        href={dashHref("/dashboard/")}
        className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-3 py-1.5 text-xs font-semibold text-crema/70 ring-1 ring-sand/20 transition hover:ring-sand/40"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Server
      </SmartLink>
    </div>
  );
}

function SettingsSection({
  guildId,
  token,
  settings,
  pickers,
  error,
  onUpdated,
  onToast,
}: {
  guildId: string;
  token: string;
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45">
            Prefisso comandi
          </span>
          <input
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
            className="mt-1.5 w-full rounded-xl bg-espresso/70 px-3 py-2 font-mono text-sm text-crema ring-1 ring-sand/20 outline-none focus:ring-caramel/40 disabled:opacity-50"
          />
          {prefixLocked ? (
            <span className="mt-1 block text-xs text-crema/40">Bloccato sul server Vinili.</span>
          ) : null}
        </label>

        <label className="block">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45">
            Canale aggiornamenti
          </span>
          <Select
            value={updatesChannelId}
            disabled={updatesLocked || saving}
            onChange={async (next) => {
              setUpdatesChannelId(next);
              if (updatesLocked) return;
              const ok = await save(
                { updatesChannelId: next || null },
                "Canale aggiornamenti salvato.",
              );
              if (!ok) setUpdatesChannelId(settings.updatesChannelId ?? "");
            }}
            className="mt-1.5 w-full rounded-xl bg-espresso/70 px-3 py-2 text-sm text-crema ring-1 ring-sand/20 outline-none focus:ring-caramel/40 disabled:opacity-50"
            options={[
              { value: "", label: "— Nessuno —" },
              ...pickers.textChannels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
            ]}
          />
          {updatesLocked ? (
            <span className="mt-1 block text-xs text-crema/40">
              Sul server principale Vinili questo canale non si configura da dashboard.
            </span>
          ) : (
            <span className="mt-1 block text-xs text-crema/40">
              Inoltro degli aggiornamenti dal canale news di Vinili.
            </span>
          )}
        </label>
      </div>

      <div className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-crema">Bacheca</p>
            <p className="text-xs text-crema/45">Modulo citazioni / repost / clip / skullboard</p>
          </div>
          <Toggle
            checked={boardsEnabled}
            disabled={saving}
            label="Attiva bacheca"
            onChange={async (next) => {
              setBoardsEnabled(next);
              const ok = await save(
                { boards: { enabled: next, features } },
                next ? "Bacheca attiva." : "Bacheca disattivata.",
              );
              if (!ok) setBoardsEnabled(settings.boards.enabled !== false);
            }}
          />
        </div>

        <ul className="mt-3 divide-y divide-sand/10">
          {BOARD_FEATURES.map((feat) => (
            <li key={feat.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-crema">{feat.title}</p>
                <p className="truncate text-xs text-crema/40">{feat.hint}</p>
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
      </div>

      {settings.botUsername ? (
        <p className="text-xs text-crema/40">
          Bot: <span className="text-crema/65">{settings.botUsername}</span>
          {settings.botNickname ? (
            <>
              {" "}
              · nick: <span className="text-crema/65">{settings.botNickname}</span>
            </>
          ) : null}
        </p>
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
  const [busy, setBusy] = useState<string | null>(null);
  const [aclName, setAclName] = useState<string | null>(null);

  const categories = commands?.catalog ?? [];
  const activeCat: CatalogCategory | null = useMemo(() => {
    if (!commands) return null;
    if (cat === "all") return null;
    return categories.find((c) => c.id === cat) ?? null;
  }, [commands, categories, cat]);

  const rows = useMemo(() => {
    if (!commands) return [];
    if (activeCat) return activeCat.commands;
    return categories.flatMap((c) => c.commands);
  }, [commands, activeCat, categories]);

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

  return (
    <div className="space-y-3">
      <p className="text-xs text-crema/45">
        Prefisso attuale: <span className="font-mono text-crema/70">{commands.prefix}</span>. Attiva o
        disattiva i comandi per questo server.
      </p>
      {commands.discordWarning ? (
        <p className="flex gap-2 rounded-xl bg-caramel/10 px-3 py-2 text-xs text-crema/75 ring-1 ring-caramel/25">
          <Info className="mt-0.5 size-3.5 shrink-0 text-caramel" aria-hidden />
          {commands.discordWarning}
        </p>
      ) : null}

      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Categorie comandi">
        <button
          type="button"
          role="tab"
          aria-selected={cat === "all"}
          onClick={() => setCat("all")}
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1 text-[0.7rem] font-semibold transition-colors",
            cat === "all"
              ? "bg-caramel/20 text-ember ring-1 ring-caramel/35"
              : "bg-crema/5 text-crema/55 ring-1 ring-sand/12 hover:text-crema",
          )}
        >
          Tutti
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={cat === c.id}
            onClick={() => setCat(c.id)}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1 text-[0.7rem] font-semibold transition-colors",
              cat === c.id
                ? "bg-caramel/20 text-ember ring-1 ring-caramel/35"
                : "bg-crema/5 text-crema/55 ring-1 ring-sand/12 hover:text-crema",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-sand/10 rounded-xl bg-espresso/40 ring-1 ring-sand/12">
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-crema/45">Nessun comando in questa categoria.</li>
        ) : (
          rows.map((cmd) => {
            const acl = commands.commands[cmd.name];
            const on = isCommandEnabled(commands.commands, cmd.name);
            const locked = acl?.boardFeatureLocked === true;
            const category = categories.find((c) => c.commands.some((x) => x.name === cmd.name));
            const categoryNames = category?.commands.map((x) => x.name) || [cmd.name];
            return (
              <li key={cmd.name} className="px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-crema">
                        {cmd.kind === "slash" ? "/" : commands.prefix}
                        {cmd.displayName || cmd.name}
                      </span>
                      <span className="rounded bg-crema/8 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-crema/45">
                        {cmd.kind === "slash" ? "slash" : "prefix"}
                      </span>
                    </div>
                    {cmd.description ? (
                      <p className="mt-0.5 truncate text-xs text-crema/40">{cmd.description}</p>
                    ) : null}
                    {locked ? (
                      <p className="mt-0.5 text-[0.65rem] text-caramel/80">Bloccato da funzione bacheca</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-crema/50 ring-1 ring-sand/15 hover:text-crema"
                    aria-expanded={aclName === cmd.name}
                    onClick={() => setAclName(aclName === cmd.name ? null : cmd.name)}
                  >
                    Permessi
                  </button>
                  <Toggle
                    checked={on}
                    disabled={busy === cmd.name || locked}
                    label={`Attiva ${cmd.name}`}
                    onChange={(next) => toggle(cmd.name, next, acl)}
                  />
                </div>
                {aclName === cmd.name ? (
                  <CommandAclEditor
                    acl={
                      acl || {
                        enabled: on,
                        roleMode: null,
                        roleIds: [],
                        channelMode: null,
                        channelIds: [],
                      }
                    }
                    roles={pickers.roles}
                    channels={aclChannels}
                    busy={busy === cmd.name}
                    categoryNames={categoryNames}
                    onSave={(next) => saveAcl(cmd.name, next)}
                    onSaveCategory={(next) => saveCategoryAcl(categoryNames, next)}
                  />
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

/** Pannello server: impostazioni, comandi con ACL, ticket e partnership. */
export function GuildPanel() {
  const { ready, token, login } = useAuth();
  const [gate, setGate] = useState<Gate>("loading");
  const [guildId, setGuildId] = useState("");
  const [section, setSection] = useState<Section>("settings");
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

  const primaryBtn =
    "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]";
  const secondaryBtn =
    "inline-flex items-center justify-center gap-2 rounded-full bg-crema/8 px-5 py-2.5 text-sm font-semibold text-crema ring-1 ring-sand/25 transition hover:ring-sand/40";

  return (
    <DashboardShell
      title="Pannello server"
      lead="Impostazioni, comandi, ticket e partnership del server selezionato."
    >
      <AnimatePresence mode="wait">
        {(gate === "loading" || !ready) && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3 rounded-2xl bg-roast/60 p-5 ring-1 ring-sand/12"
            role="status"
          >
            <div className="h-14 animate-pulse rounded-2xl bg-espresso/50" />
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-crema/10" />
            <div className="h-40 animate-pulse rounded-2xl bg-espresso/40" />
            <p className="text-center text-sm text-crema/45">Caricamento pannello…</p>
          </motion.div>
        )}

        {gate === "login" && (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-8 text-center ring-1 ring-sand/12"
          >
            <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
              <Server className="size-5" />
            </span>
            <h2 className="mt-4 font-display text-2xl font-semibold">Accedi per continuare</h2>
            <p className="mt-2 text-sm text-crema/60">Per gestire un server serve il login Discord.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={login} className={primaryBtn}>
                <LogIn className="size-4" /> Accedi con Discord
              </button>
              <SmartLink href={dashHref("/dashboard/")} className={secondaryBtn}>
                Torna ai server
              </SmartLink>
            </div>
          </motion.div>
        )}

        {gate === "locked" && (
          <motion.div
            key="locked"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-8 text-center ring-1 ring-sand/12"
          >
            <h2 className="font-display text-2xl font-semibold">Accesso non disponibile</h2>
            <p className="mt-2 text-sm text-crema/60">
              Questa sezione non è disponibile con il tuo account.
            </p>
            <SmartLink href={dashHref("/dashboard/")} className={cn(secondaryBtn, "mt-5")}>
              Torna ai server
            </SmartLink>
          </motion.div>
        )}

        {gate === "noid" && (
          <motion.div
            key="noid"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-8 text-center ring-1 ring-sand/12"
          >
            <h2 className="font-display text-2xl font-semibold">Nessun server selezionato</h2>
            <p className="mt-2 text-sm text-crema/60">
              Scegli un server dalla home dashboard per aprire il pannello.
            </p>
            <SmartLink href={dashHref("/dashboard/")} className={cn(primaryBtn, "mt-5")}>
              Scegli un server
            </SmartLink>
          </motion.div>
        )}

        {gate === "ready" && overview && (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {error ? (
              <p className="rounded-xl bg-[#a83a2c]/15 px-3 py-2 text-sm text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/30">
                {error}
              </p>
            ) : null}

            <GuildHeader guild={overview} premiumActive={premiumActive} />

            {!overview.botPresent ? (
              <div className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-5 ring-1 ring-sand/12">
                <p className="text-sm text-crema/70">
                  {settingsError || "Il bot non è presente in questo server."}
                </p>
                {overview.inviteUrl ? (
                  <a
                    href={overview.inviteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(primaryBtn, "mt-4")}
                  >
                    Invita il bot
                  </a>
                ) : null}
              </div>
            ) : (
              <>
                {tickets ? (
                  <button
                    type="button"
                    onClick={() => setSection("tickets")}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-espresso/50 px-3.5 py-2.5 text-left text-sm ring-1 ring-sand/12 transition hover:ring-sand/30"
                  >
                    <span className="inline-flex items-center gap-2 font-medium text-crema">
                      <Ticket className="size-4 text-ember" aria-hidden />
                      Panoramica ticket
                    </span>
                    <span className="lining-nums text-xs text-crema/50">
                      {tickets.overview.open} aperti · {tickets.overview.unclaimed} in attesa ·{" "}
                      {tickets.overview.closed24h} chiusi/24h
                    </span>
                  </button>
                ) : null}

                <div
                  className="flex gap-1 overflow-x-auto pb-0.5"
                  role="tablist"
                  aria-label="Sezioni pannello"
                >
                  {SECTIONS.map((s) => {
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
                          "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                          on
                            ? "bg-caramel/15 text-ember ring-1 ring-caramel/30"
                            : "text-crema/55 hover:bg-crema/5 hover:text-crema",
                        )}
                      >
                        <Icon className="size-4 opacity-80" aria-hidden />
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-4 ring-1 ring-sand/12 sm:p-5">
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
                      ) : null}
                      {section === "partnership" && guildId && token ? (
                        <PartnershipPanel guildId={guildId} token={token} onToast={showToast} />
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </>
            )}
          </motion.div>
        )}

        {gate === "ready" && !overview && error ? (
          <motion.div
            key="err"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-6 text-center ring-1 ring-sand/12"
          >
            <p className="text-sm text-crema/70">{error}</p>
            <SmartLink href={dashHref("/dashboard/")} className={cn(secondaryBtn, "mt-4")}>
              Torna ai server
            </SmartLink>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn(
              "fixed bottom-5 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg",
              toast.err
                ? "bg-[#a83a2c] text-[#fff0ec]"
                : "bg-espresso text-crema ring-1 ring-caramel/40",
            )}
            role="status"
          >
            {toast.msg}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </DashboardShell>
  );
}
