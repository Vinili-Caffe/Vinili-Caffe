"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Bot, Diamond, Info, LayoutGrid, Lock, LogIn, Plus, Search, Server, Settings2, ShieldAlert } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SmartLink } from "@/components/SmartLink";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  checkDashboardAccess,
  dashHref,
  guildMeta,
  guildPageHref,
  guildStatusBadge,
  listManageableGuilds,
  readGuildsCache,
  readLastGuildId,
  selectGuild,
  type DashboardGuild,
} from "@/lib/dashboard";
import { DashboardShell } from "./DashboardShell";
import { StateCard, StatTile, dashPrimaryBtn, dashSecondaryBtn, discordBtn } from "./guild/bits";

type Gate = "loading" | "login" | "locked" | "scope" | "ready";

function Badge({ tone, label }: { tone: "premium" | "ok" | "warn" | "main"; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold ring-1",
        tone === "premium" && "bg-caramel/15 text-ember ring-caramel/35",
        tone === "ok" && "bg-[#5f9a6a]/15 text-[#9fd0a8] light:text-[#2f6b3f] ring-[#5f9a6a]/30",
        tone === "warn" && "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c] ring-[#a83a2c]/30",
        tone === "main" && "bg-crema/10 text-crema/80 ring-sand/25",
      )}
    >
      {tone === "premium" ? <Diamond className="size-3" aria-hidden /> : null}
      {tone === "ok" ? <span className="size-1.5 rounded-full bg-[#7fc48c]" aria-hidden /> : null}
      {label}
    </span>
  );
}

/** Card server stile dashboard bot: copertina sfocata dall'icona, icona grande, stato e pulsante. */
function GuildCard({ guild, last }: { guild: DashboardGuild; last?: boolean }) {
  const status = guildStatusBadge(guild);
  const href = guildPageHref(guild.id);
  const initial = (guild.name.trim().charAt(0) || "?").toUpperCase();

  return (
    <SmartLink
      href={href}
      onClick={() => {
        selectGuild(guild.id);
      }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl bg-roast/80 ring-1 ring-sand/10 transition duration-200",
        "hover:-translate-y-0.5 hover:ring-sand/30 hover:shadow-[0_24px_50px_-30px_rgba(0,0,0,0.9)]",
        guild.premiumActive && "ring-caramel/30",
      )}
    >
      <span className="relative block h-20 overflow-hidden bg-mocha" aria-hidden>
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guild.iconUrl} alt="" className="size-full scale-125 object-cover opacity-45 blur-xl" loading="lazy" decoding="async" />
        ) : (
          <span className="absolute inset-0 bg-gradient-to-br from-caramel/25 via-mocha to-roast" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-roast/90 to-transparent" />
        {last ? (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-espresso/70 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-crema/70 ring-1 ring-sand/15">
            Ultimo aperto
          </span>
        ) : null}
      </span>

      <span className="relative -mt-8 flex items-end gap-3 px-4">
        <span className="relative shrink-0">
          {guild.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={guild.iconUrl}
              alt=""
              width={64}
              height={64}
              className="size-16 rounded-2xl object-cover ring-4 ring-roast"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-2xl bg-mocha font-display text-2xl font-semibold text-crema/70 ring-4 ring-roast" aria-hidden>
              {initial}
            </span>
          )}
          {guild.premiumActive ? (
            <span
              className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-caramel text-ink ring-2 ring-roast"
              title="Vinili Premium attivo"
              aria-hidden
            >
              <Diamond className="size-2.5" />
            </span>
          ) : null}
        </span>
        <span className="mb-1 flex flex-wrap gap-1">
          {guild.premiumActive ? <Badge tone="premium" label="Premium" /> : null}
          <Badge tone={status.tone} label={status.label} />
        </span>
      </span>

      <span className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <span className="block truncate font-semibold text-crema">{guild.name}</span>
        <span className="mt-0.5 block truncate text-xs text-crema/60">{guildMeta(guild)}</span>
        <span
          className={cn(
            "mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
            guild.botPresent
              ? "bg-crema/[0.06] text-crema/85 ring-1 ring-sand/15 group-hover:bg-gradient-to-r group-hover:from-caramel group-hover:to-ember group-hover:text-ink group-hover:ring-transparent"
              : "bg-[#5865f2]/90 text-white group-hover:bg-[#5865f2]",
          )}
        >
          {guild.botPresent ? (
            <>
              <Settings2 className="size-4" aria-hidden /> Configura
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden /> Invita il bot
            </>
          )}
          <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </span>
    </SmartLink>
  );
}

/** Scelta del server: gate accesso + griglia rack. */
export function ServerPicker() {
  const { ready, token, login } = useAuth();
  const [gate, setGate] = useState<Gate>("loading");
  const [guilds, setGuilds] = useState<DashboardGuild[]>([]);
  const [error, setError] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setGate("login");
      setGuilds([]);
      setError("");
      return;
    }

    let cancelled = false;
    const cached = readGuildsCache();
    if (cached?.length) setGuilds(cached);

    (async () => {
      setGate("loading");
      setError("");
      setLoadingList(true);

      const access = await checkDashboardAccess(token);
      if (cancelled) return;
      if (!access.ok) {
        setLoadingList(false);
        if (access.status === 401) {
          setGate("login");
          return;
        }
        setError(access.message);
        setGate("ready");
        return;
      }
      if (access.access.blacklisted || !access.access.allowed) {
        setLoadingList(false);
        setGate("locked");
        return;
      }

      const list = await listManageableGuilds(token);
      if (cancelled) return;
      setLoadingList(false);

      if (!list.ok) {
        if (list.error === "missing_guilds_scope") {
          setGate("scope");
          return;
        }
        if (
          list.error === "high_staff_only" ||
          list.error === "forbidden" ||
          list.error === "bot_usage_blacklisted"
        ) {
          setGate("locked");
          return;
        }
        if (list.status === 401) {
          setGate("login");
          return;
        }
        setError(list.message);
        setGate("ready");
        return;
      }

      setGuilds(list.guilds);
      setGate("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(""), 4200);
    return () => window.clearTimeout(id);
  }, [error]);

  const lastGuildId = readLastGuildId();
  const sortedGuilds = useMemo(() => {
    if (!lastGuildId || guilds.length < 2) return guilds;
    const idx = guilds.findIndex((g) => g.id === lastGuildId);
    if (idx <= 0) return guilds;
    const next = [...guilds];
    const [last] = next.splice(idx, 1);
    next.unshift(last);
    return next;
  }, [guilds, lastGuildId]);
  const resumeGuild = lastGuildId ? guilds.find((g) => g.id === lastGuildId) : undefined;

  const [query, setQuery] = useState("");
  const shownGuilds = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sortedGuilds.filter((g) => g.name.toLowerCase().includes(q)) : sortedGuilds;
  }, [sortedGuilds, query]);
  const withBot = guilds.filter((g) => g.botPresent).length;
  const resumeName = resumeGuild ? (resumeGuild.name.length > 22 ? `${resumeGuild.name.slice(0, 21)}…` : resumeGuild.name) : "";

  return (
    <DashboardShell
      title="I miei server"
      crumb="Server"
      lead="Scegli un server per configurare Vinili: impostazioni, comandi, ticket e partnership."
    >
      <AnimatePresence mode="wait">
        {(gate === "loading" || !ready) && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            role="status"
            aria-live="polite"
            aria-label="Caricamento"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-[13.5rem] animate-pulse rounded-2xl bg-roast/70 ring-1 ring-sand/10" />
            ))}
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
                  <SmartLink href="/" className={dashSecondaryBtn}>
                    Torna alla Home
                  </SmartLink>
                </>
              }
            >
              <p>Per usare la dashboard accedi con Discord.</p>
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-caramel/10 px-3 py-2.5 text-left text-crema/75 ring-1 ring-caramel/25">
                <Info className="mt-0.5 size-4 shrink-0 text-caramel" aria-hidden />
                Se non riesci ad entrare, prova ad accedere di nuovo con Discord.
              </p>
            </StateCard>
          </motion.div>
        )}

        {gate === "locked" && (
          <motion.div key="locked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <StateCard
              icon={<Lock />}
              title="Non disponibile"
              actions={
                <SmartLink href="/" className={dashPrimaryBtn}>
                  Torna alla Home
                </SmartLink>
              }
            >
              Questa sezione non è disponibile con il tuo account.
            </StateCard>
          </motion.div>
        )}

        {gate === "scope" && (
          <motion.div key="scope" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <StateCard
              icon={<ShieldAlert />}
              title="Serve un nuovo login"
              actions={
                <button type="button" onClick={login} className={discordBtn}>
                  <LogIn className="size-4" /> Accedi di nuovo con Discord
                </button>
              }
            >
              Per mostrare i tuoi server serve un nuovo accesso con Discord.
            </StateCard>
          </motion.div>
        )}

        {gate === "ready" && (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <AnimatePresence>
              {error ? (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="alert"
                  className="rounded-xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/30"
                >
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>

            {loadingList ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-[13.5rem] animate-pulse rounded-2xl bg-roast/70 ring-1 ring-sand/10" />
                ))}
              </div>
            ) : guilds.length === 0 ? (
              <Reveal>
                <StateCard
                  icon={<Server />}
                  title="Nessun server trovato"
                  actions={
                    <>
                      <button type="button" onClick={login} className={discordBtn}>
                        Collega Discord
                      </button>
                      <SmartLink href={dashHref("/dashboard/profilo/")} className={dashSecondaryBtn}>
                        Apri profilo
                      </SmartLink>
                    </>
                  }
                >
                  Non abbiamo trovato server disponibili, oppure Vinili non è ancora presente.
                </StateCard>
              </Reveal>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-md">
                    <StatTile icon={<LayoutGrid />} label="Server gestibili" value={guilds.length} />
                    <StatTile icon={<Bot />} label="Con Vinili" value={withBot} tone="ok" />
                  </div>
                  {resumeGuild ? (
                    <SmartLink
                      href={guildPageHref(resumeGuild.id)}
                      onClick={() => selectGuild(resumeGuild.id)}
                      className={cn(dashPrimaryBtn, "w-full sm:ml-auto sm:w-auto")}
                    >
                      Riprendi da {resumeName}
                      <ArrowRight className="size-4" aria-hidden />
                    </SmartLink>
                  ) : null}
                </div>

                {guilds.length > 6 ? (
                  <label className="relative block sm:max-w-sm">
                    <span className="sr-only">Cerca server</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/50" aria-hidden />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cerca un server…"
                      className="w-full rounded-lg bg-roast/80 py-2 pl-9 pr-3 text-sm text-crema ring-1 ring-sand/15 outline-none placeholder:text-crema/50 focus:ring-caramel/40"
                    />
                  </label>
                ) : null}

                {shownGuilds.length === 0 ? (
                  <p className="rounded-xl bg-roast/60 px-4 py-6 text-center text-sm text-crema/60 ring-1 ring-sand/10">Nessun server con questo nome.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
                    {shownGuilds.map((g) => (
                      <GuildCard key={g.id} guild={g} last={g.id === lastGuildId && guilds.length > 1} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
