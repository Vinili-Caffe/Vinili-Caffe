"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Diamond, Info, Lock, LogIn, Server, ShieldAlert } from "lucide-react";
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

type Gate = "loading" | "login" | "locked" | "scope" | "ready";

function Badge({ tone, label }: { tone: "premium" | "ok" | "warn" | "main"; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.7rem] font-semibold ring-1",
        tone === "premium" && "bg-caramel/15 text-ember ring-caramel/35",
        tone === "ok" && "bg-[#5f9a6a]/15 text-[#9fd0a8] light:text-[#2f6b3f] ring-[#5f9a6a]/30",
        tone === "warn" && "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c] ring-[#a83a2c]/30",
        tone === "main" && "bg-crema/10 text-crema/80 ring-sand/25",
      )}
    >
      {tone === "premium" ? <Diamond className="size-3" aria-hidden /> : null}
      {label}
    </span>
  );
}

function GuildCard({ guild }: { guild: DashboardGuild }) {
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
        "group flex items-center gap-3 rounded-2xl bg-espresso/55 p-3.5 ring-1 ring-sand/12 transition",
        "hover:-translate-y-0.5 hover:ring-sand/30",
        guild.premiumActive && "ring-caramel/35 shadow-[0_18px_40px_-28px_rgba(212,145,80,0.55)]",
      )}
    >
      <span className="relative shrink-0">
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guild.iconUrl}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-xl object-cover ring-1 ring-sand/20"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className="flex size-12 items-center justify-center rounded-xl bg-roast font-display text-lg font-semibold text-crema/70 ring-1 ring-sand/20"
            aria-hidden
          >
            {initial}
          </span>
        )}
        {guild.premiumActive ? (
          <span
            className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-caramel text-ink ring-2 ring-espresso"
            title="Vinili Premium attivo"
            aria-hidden
          >
            <Diamond className="size-2.5" />
          </span>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-crema">{guild.name}</span>
        <span className="mt-0.5 block truncate text-xs text-crema/50">{guildMeta(guild)}</span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          {guild.premiumActive ? <Badge tone="premium" label="Premium" /> : null}
          <Badge tone={status.tone} label={status.label} />
        </span>
      </span>

      <ArrowRight
        className="size-4 shrink-0 text-crema/30 transition group-hover:translate-x-0.5 group-hover:text-ember"
        aria-hidden
      />
    </SmartLink>
  );
}

function PanelCard({
  icon,
  title,
  children,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-roast/70 p-6 text-center ring-1 ring-sand/12 sm:p-8">
      <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25 [&>svg]:size-5">
        {icon}
      </span>
      <h2 className="mt-4 font-display text-2xl font-semibold sm:text-3xl">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-crema/60">{children}</div>
      {actions ? <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
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

  const primaryBtn =
    "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink transition hover:-translate-y-0.5";
  const secondaryBtn =
    "inline-flex items-center justify-center gap-2 rounded-full bg-crema/8 px-5 py-2.5 text-sm font-semibold text-crema ring-1 ring-sand/25 transition hover:ring-sand/40";

  return (
    <DashboardShell title="I tuoi server" lead="Gestisci configurazione e moduli per ogni server.">
      <AnimatePresence mode="wait">
        {(gate === "loading" || !ready) && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-roast/60 p-8 ring-1 ring-sand/12"
            role="status"
            aria-live="polite"
          >
            <div className="mx-auto max-w-sm space-y-3">
              <div className="h-3 animate-pulse rounded-full bg-crema/10" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-crema/10" />
              <div className="mt-6 grid gap-2">
                <div className="h-16 animate-pulse rounded-2xl bg-espresso/50" />
                <div className="h-16 animate-pulse rounded-2xl bg-espresso/50" />
                <div className="h-16 animate-pulse rounded-2xl bg-espresso/50" />
              </div>
              <p className="pt-2 text-center text-sm text-crema/45">Caricamento…</p>
            </div>
          </motion.div>
        )}

        {gate === "login" && (
          <motion.div key="login" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <PanelCard
              icon={<Server />}
              title="Accedi per continuare"
              actions={
                <>
                  <button type="button" onClick={login} className={primaryBtn}>
                    <LogIn className="size-4" /> Accedi con Discord
                  </button>
                  <SmartLink href="/" className={secondaryBtn}>
                    Torna alla Home
                  </SmartLink>
                </>
              }
            >
              <p>Per usare la dashboard accedi con Discord.</p>
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-caramel/10 px-3 py-2.5 text-left text-crema/75 ring-1 ring-caramel/25">
                <Info className="mt-0.5 size-4 shrink-0 text-caramel" aria-hidden />
                Se non riesci ad entrare, prova ad accedere di nuovo con Discord.
              </p>
            </PanelCard>
          </motion.div>
        )}

        {gate === "locked" && (
          <motion.div key="locked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <PanelCard
              icon={<Lock />}
              title="Non disponibile"
              actions={
                <SmartLink href="/" className={primaryBtn}>
                  Torna alla Home
                </SmartLink>
              }
            >
              Questa sezione non è disponibile con il tuo account.
            </PanelCard>
          </motion.div>
        )}

        {gate === "scope" && (
          <motion.div key="scope" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="rounded-2xl bg-caramel/10 p-5 ring-1 ring-caramel/25 sm:p-6">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-caramel" aria-hidden />
                <div>
                  <p className="font-semibold text-crema">Serve un nuovo login.</p>
                  <p className="mt-1 text-sm text-crema/65">
                    Per mostrare i tuoi server serve un nuovo accesso con Discord.
                  </p>
                  <button type="button" onClick={login} className={cn(primaryBtn, "mt-4")}>
                    <LogIn className="size-4" /> Accedi di nuovo con Discord
                  </button>
                </div>
              </div>
            </div>
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
              <div className="grid gap-2 sm:grid-cols-2" aria-busy="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-[4.75rem] animate-pulse rounded-2xl bg-roast/50 ring-1 ring-sand/10" />
                ))}
              </div>
            ) : guilds.length === 0 ? (
              <Reveal>
                <PanelCard
                  icon={<Server />}
                  title="Nessun server trovato"
                  actions={
                    <>
                      <button type="button" onClick={login} className={primaryBtn}>
                        Collega Discord
                      </button>
                      <SmartLink href={dashHref("/dashboard/profilo/")} className={secondaryBtn}>
                        Apri profilo
                      </SmartLink>
                    </>
                  }
                >
                  Non abbiamo trovato server disponibili, oppure Vinili non è ancora presente.
                </PanelCard>
              </Reveal>
            ) : (
              <div className="space-y-3">
                {resumeGuild ? (
                  <SmartLink
                    href={guildPageHref(resumeGuild.id)}
                    onClick={() => selectGuild(resumeGuild.id)}
                    className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-caramel/10 px-4 py-3 text-sm text-crema/75 ring-1 ring-caramel/30 transition hover:ring-caramel/45 sm:justify-between"
                  >
                    <span>
                      Riprendi da <strong className="text-crema">{resumeGuild.name}</strong>
                    </span>
                    <ArrowRight className="size-4 text-caramel" aria-hidden />
                  </SmartLink>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2" aria-live="polite">
                  {sortedGuilds.map((g) => (
                    <GuildCard key={g.id} guild={g} />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
