"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { CalendarClock, Check, Coins, Diamond, Lock, LogIn, Server, Sparkles } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { confirmDialog } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { checkDashboardAccess, listManageableGuilds, readGuildsCache, type DashboardGuild } from "@/lib/dashboard";
import {
  PREMIUM_PLANS,
  formatUntil,
  loadCredits,
  loadPremiumGuilds,
  monthsLabel,
  planPerMonth,
  planSaving,
  spendCredits,
  type PremiumGuild,
} from "@/lib/dashboard-premium";
import { DISCORD_INVITE, page } from "@/lib/site";
import { DashboardShell } from "./DashboardShell";
import { DashToast, Panel, StateCard, StatTile, StatusBadge, dashPrimaryBtn, dashSecondaryBtn, discordBtn } from "./guild/bits";

type Gate = "loading" | "login" | "locked" | "ready";
type View = "premium" | "crediti" | "abbonamento";

const VIEW_TEXT: Record<View, { title: string; lead: string; crumb?: string }> = {
  premium: { title: "Premium", lead: "Usa i tuoi crediti per attivare Vinili Premium sui server che gestisci." },
  crediti: { title: "Crediti", crumb: "Crediti", lead: "Quanti crediti hai, quanto valgono e come averne altri." },
  abbonamento: { title: "Abbonamento", crumb: "Abbonamento", lead: "I server con Premium attivo e quando scade." },
};

/** Stato condiviso dalle tre pagine: accesso, saldo, server e scadenze. */
function usePremiumData() {
  const { ready, token, login } = useAuth();
  const [gate, setGate] = useState<Gate>("loading");
  const [credits, setCredits] = useState<number | null>(null);
  /* la cache si legge solo nel browser; durante il caricamento la lista non si mostra */
  const [guilds, setGuilds] = useState<DashboardGuild[]>(() => readGuildsCache() || []);
  const [details, setDetails] = useState<PremiumGuild[] | null>(null);
  const [error, setError] = useState("");

  const refreshDetails = useCallback(async (tk: string) => {
    const res = await loadPremiumGuilds(tk);
    setDetails(res.ok ? res.guilds : null);
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    (async () => {
      setGate("loading");
      setError("");
      const access = await checkDashboardAccess(token);
      if (cancelled) return;
      if (!access.ok && access.status === 401) return setGate("login");
      if (access.ok && (access.access.blacklisted || !access.access.allowed)) return setGate("locked");

      const [bal, list] = await Promise.all([loadCredits(token), listManageableGuilds(token)]);
      if (cancelled) return;
      if (bal.ok) setCredits(bal.credits);
      else setError(bal.message);
      if (list.ok) setGuilds(list.guilds);
      else if (!bal.ok || list.status === 401) setError((e) => e || list.message);
      setGate("ready");
      void refreshDetails(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token, refreshDetails]);

  return { token, login, gate: ready && !token ? ("login" as Gate) : gate, credits, setCredits, guilds, setGuilds, details, refreshDetails, error };
}

function GuildIcon({ name, iconUrl, size = "md" }: { name: string; iconUrl: string | null; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "size-8 rounded-lg text-xs" : "size-10 rounded-xl text-sm";
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" width={40} height={40} className={cn(cls, "shrink-0 object-cover ring-1 ring-sand/15")} />;
  }
  return (
    <span className={cn(cls, "flex shrink-0 items-center justify-center bg-crema/[0.08] font-bold text-crema/80 ring-1 ring-sand/15")} aria-hidden>
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

function Gates({ gate, login }: { gate: Gate; login: () => void }) {
  if (gate === "login") {
    return (
      <StateCard
        icon={<LogIn />}
        title="Accedi con Discord"
        actions={
          <button type="button" onClick={login} className={discordBtn}>
            <LogIn className="size-4" aria-hidden /> Accedi
          </button>
        }
      >
        Serve il login per vedere i tuoi crediti e i server con Premium.
      </StateCard>
    );
  }
  if (gate === "locked") {
    return (
      <StateCard icon={<Lock />} title="Sezione non disponibile">
        Il tuo account non può usare la dashboard del bot.
      </StateCard>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[4.25rem] animate-pulse rounded-xl bg-crema/[0.04]" />
      ))}
    </div>
  );
}

/** Riga riassunto in alto: saldo, server con Premium, prossima scadenza. */
function Summary({ credits, premiumCount, nextExpiry }: { credits: number | null; premiumCount: number; nextExpiry: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile icon={<Coins />} tone="accent" label="Crediti" value={credits == null ? "—" : credits.toLocaleString("it-IT")} hint="Restano sul tuo account" />
      <StatTile icon={<Diamond />} tone={premiumCount ? "ok" : "default"} label="Server Premium" value={premiumCount} hint={premiumCount ? "Attivi adesso" : "Nessuno ancora"} />
      <StatTile icon={<CalendarClock />} label="Prossima scadenza" value={nextExpiry} />
    </div>
  );
}

function premiumRows(guilds: DashboardGuild[], details: PremiumGuild[] | null): PremiumGuild[] {
  if (details) return details;
  return guilds
    .filter((g) => g.premiumActive)
    .map((g) => ({ id: g.id, name: g.name, iconUrl: g.iconUrl, botPresent: g.botPresent, until: null, lifetime: false, ownedByYou: false }));
}

function nextExpiryLabel(rows: PremiumGuild[], hasDetails: boolean): string {
  if (!rows.length) return "—";
  if (!hasDetails) return "Vedi server";
  const dated = rows.filter((r) => !r.lifetime && r.until).sort((a, b) => (a.until || 0) - (b.until || 0));
  if (!dated.length) return "Per sempre";
  return new Date(dated[0].until as number).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function PremiumList({ rows, hasDetails }: { rows: PremiumGuild[]; hasDetails: boolean }) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed border-sand/20 px-4 py-8 text-center text-sm text-crema/60">
        Nessun server ha Premium attivo. Scegline uno qui sotto e attivalo con i crediti.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
      {rows.map((g) => (
        <li key={g.id} className="flex items-center gap-3 px-4 py-3">
          <GuildIcon name={g.name} iconUrl={g.iconUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-crema">{g.name}</p>
            <p className="truncate text-xs text-crema/60">
              {hasDetails ? (g.lifetime ? "Premium per sempre" : `Scade il ${formatUntil(g.until, g.lifetime)}`) : "Premium attivo"}
              {g.ownedByYou ? " · attivato da te" : ""}
            </p>
          </div>
          {g.botPresent ? <StatusBadge tone="ok">attivo</StatusBadge> : <StatusBadge tone="warn">bot assente</StatusBadge>}
        </li>
      ))}
    </ul>
  );
}

/** Pagina Premium: scegli server + piano, conferma, spendi i crediti. */
function ActivatePremium({
  token,
  credits,
  guilds,
  details,
  onDone,
  onToast,
}: {
  token: string;
  credits: number | null;
  guilds: DashboardGuild[];
  details: PremiumGuild[] | null;
  onDone: (credits: number, guildId: string) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const candidates = useMemo(() => guilds.filter((g) => g.botPresent), [guilds]);
  const [picked, setGuildId] = useState("");
  const [months, setMonths] = useState<number>(3);
  const [busy, setBusy] = useState(false);
  /* con un solo server disponibile è già scelto */
  const guildId = picked || (candidates.length === 1 ? candidates[0].id : "");

  const guild = candidates.find((g) => g.id === guildId) || null;
  const plan = PREMIUM_PLANS.find((p) => p.months === months) || PREMIUM_PLANS[1];
  const balance = credits ?? 0;
  const enough = balance >= plan.credits;
  const detail = details?.find((d) => d.id === guildId) || null;

  const activate = async () => {
    if (!guild) return onToast("Scegli prima un server.", true);
    if (!enough) return onToast(`Ti mancano ${plan.credits - balance} crediti per questo piano.`, true);
    const extend = guild.premiumActive;
    if (detail?.lifetime) return onToast("Questo server ha già Premium per sempre.", true);
    const ok = await confirmDialog({
      title: extend ? "Allungare Premium?" : "Attivare Premium?",
      message: (
        <>
          {extend ? "Aggiungi" : "Attivi"} <strong>{monthsLabel(plan.months)}</strong> di Premium su <strong>{guild.name}</strong>
          {extend ? ", in coda alla scadenza attuale" : ""}. Spendi <strong>{plan.credits} crediti</strong>, te ne restano {balance - plan.credits}. I crediti spesi non tornano indietro.
        </>
      ),
      confirmLabel: `Spendi ${plan.credits} crediti`,
    });
    if (!ok) return;
    setBusy(true);
    const res = await spendCredits(token, guild.id, plan.months);
    setBusy(false);
    if (!res.ok) {
      if (typeof res.credits === "number") onDone(res.credits, "");
      return onToast(res.message, true);
    }
    onDone(res.credits, guild.id);
    onToast(
      res.lifetime ? `Premium attivo su ${guild.name}.` : `Premium attivo su ${guild.name} fino al ${formatUntil(res.until, false)}.`,
    );
  };

  return (
    <Panel icon={<Sparkles />} title="Attiva o allunga Premium" description="Due scelte: il server e per quanto tempo. Se il server ha già Premium, il tempo si aggiunge alla scadenza.">
      <div className="space-y-6">
        <fieldset>
          <legend className="text-[0.8rem] font-semibold text-crema/80">1 · Server</legend>
          {candidates.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-sand/20 px-4 py-6 text-center text-sm text-crema/60">
              Il bot non è in nessuno dei server che gestisci. <SmartLink href={page("/dashboard/")} className="font-semibold text-ember underline-offset-2 hover:underline">Aggiungilo</SmartLink> e torna qui.
            </p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Server">
              {candidates.map((g) => {
                const on = g.id === guildId;
                const d = details?.find((x) => x.id === g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setGuildId(g.id)}
                    className={cn(
                      "flex min-w-0 items-center gap-3 rounded-xl p-2.5 text-left ring-1 transition",
                      on ? "bg-caramel/12 ring-caramel/45" : "bg-espresso/45 ring-sand/10 hover:ring-sand/25",
                    )}
                  >
                    <GuildIcon name={g.name} iconUrl={g.iconUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-crema">{g.name}</span>
                      <span className="block truncate text-xs text-crema/60">
                        {g.premiumActive ? (d ? (d.lifetime ? "Premium per sempre" : `Premium fino al ${formatUntil(d.until, false)}`) : "Premium attivo") : "Senza Premium"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full ring-1 transition",
                        on ? "bg-caramel text-espresso ring-caramel" : "ring-sand/30",
                      )}
                      aria-hidden
                    >
                      {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-[0.8rem] font-semibold text-crema/80">2 · Durata</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Durata">
            {PREMIUM_PLANS.map((p) => {
              const on = p.months === months;
              const saving = planSaving(p);
              const short = balance < p.credits;
              return (
                <button
                  key={p.months}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMonths(p.months)}
                  className={cn(
                    "relative rounded-xl p-3.5 text-left ring-1 transition",
                    on ? "bg-caramel/12 ring-caramel/45" : "bg-espresso/45 ring-sand/10 hover:ring-sand/25",
                  )}
                >
                  {saving > 0 ? (
                    <span className="absolute right-2.5 top-2.5 rounded-md bg-[#5f9a6a]/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-[#9fd0a8] ring-1 ring-[#5f9a6a]/30 light:text-[#2f6b3f]">
                      −{saving}%
                    </span>
                  ) : null}
                  <span className="block text-sm font-semibold text-crema">{monthsLabel(p.months)}</span>
                  <span className="mt-1 flex items-baseline gap-1">
                    <span className="font-display text-2xl font-semibold tabular-nums text-crema">{p.credits}</span>
                    <span className="text-xs text-crema/60">crediti</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-crema/60">{planPerMonth(p)} al mese</span>
                  {short ? <span className="mt-1.5 block text-xs font-medium text-[#f0a493] light:text-[#a83a2c]">Mancano {p.credits - balance}</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-3 rounded-xl bg-espresso/55 p-4 ring-1 ring-sand/10 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm text-crema/80">
            {guild ? (
              <>
                <span className="font-semibold text-crema">{monthsLabel(plan.months)}</span> su <span className="font-semibold text-crema">{guild.name}</span> ·{" "}
                <span className="tabular-nums">{plan.credits}</span> crediti
                {enough ? <span className="text-crema/60"> · ne restano {balance - plan.credits}</span> : <span className="text-[#f0a493] light:text-[#a83a2c]"> · non bastano</span>}
              </>
            ) : (
              <span className="text-crema/60">Scegli un server per continuare.</span>
            )}
          </p>
          <button type="button" disabled={busy || !guild || !enough || credits == null} onClick={() => void activate()} className={cn(dashPrimaryBtn, "justify-center")}>
            <Diamond className="size-4" aria-hidden />
            {busy ? "Attivazione…" : guild?.premiumActive ? "Allunga Premium" : "Attiva Premium"}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function HowToGetCredits() {
  return (
    <Panel icon={<Coins />} title="Come avere crediti" description="I crediti si legano al tuo account Discord, non a un server.">
      <ul className="space-y-2.5 text-sm text-crema/75">
        <li className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-caramel" aria-hidden />
          Li assegna lo staff di Vinili & Caffè: chiedi nel server di supporto aprendo un ticket.
        </li>
        <li className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-caramel" aria-hidden />
          Li spendi quando vuoi, su uno o più server che gestisci. Non scadono.
        </li>
        <li className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-caramel" aria-hidden />
          Se lo staff revoca un Premium, di solito i crediti tornano sul tuo saldo.
        </li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" className={discordBtn}>
          Server di supporto
        </a>
      </div>
    </Panel>
  );
}

function PlansTable() {
  return (
    <Panel icon={<Diamond />} title="Quanto costa Premium" description="Più lungo è il piano, meno costa al mese.">
      <div className="overflow-hidden rounded-xl ring-1 ring-sand/10">
        <table className="w-full text-sm">
          <thead className="bg-espresso/60 text-left text-[0.65rem] uppercase tracking-[0.14em] text-crema/60">
            <tr>
              <th className="px-4 py-2 font-semibold">Durata</th>
              <th className="px-4 py-2 font-semibold">Crediti</th>
              <th className="px-4 py-2 font-semibold">Al mese</th>
              <th className="px-4 py-2 text-right font-semibold">Risparmio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand/[0.07] bg-espresso/30">
            {PREMIUM_PLANS.map((p) => (
              <tr key={p.months}>
                <td className="px-4 py-2.5 font-semibold text-crema">{monthsLabel(p.months)}</td>
                <td className="px-4 py-2.5 tabular-nums text-crema/85">{p.credits}</td>
                <td className="px-4 py-2.5 tabular-nums text-crema/70">{planPerMonth(p)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-crema/70">{planSaving(p) > 0 ? `−${planSaving(p)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function PremiumBoard({ view = "premium" }: { view?: View }) {
  const data = usePremiumData();
  const { token, login, gate, credits, setCredits, guilds, setGuilds, details, refreshDetails, error } = data;
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const text = VIEW_TEXT[view];

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.err ? 5200 : 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const rows = premiumRows(guilds, details);
  const onToast = (msg: string, err = false) => setToast({ msg, err });

  return (
    <DashboardShell title={text.title} crumb={text.crumb} lead={text.lead}>
      {gate !== "ready" || !token ? (
        <Gates gate={gate} login={login} />
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">
          {error ? <p className="rounded-xl bg-[#a83a2c]/12 px-4 py-3 text-sm text-[#f0a493] ring-1 ring-[#a83a2c]/30 light:text-[#a83a2c]">{error}</p> : null}
          <Summary credits={credits} premiumCount={rows.length} nextExpiry={nextExpiryLabel(rows, Boolean(details))} />

          {view === "premium" ? (
            <>
              <ActivatePremium
                token={token}
                credits={credits}
                guilds={guilds}
                details={details}
                onToast={onToast}
                onDone={(left, gid) => {
                  setCredits(left);
                  if (gid) {
                    setGuilds((cur) => cur.map((g) => (g.id === gid ? { ...g, premiumActive: true } : g)));
                    void refreshDetails(token);
                  }
                }}
              />
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel icon={<Server />} title="Server con Premium">
                  <PremiumList rows={rows} hasDetails={Boolean(details)} />
                </Panel>
                <HowToGetCredits />
              </div>
            </>
          ) : null}

          {view === "crediti" ? (
            <>
              <div className="grid gap-5 lg:grid-cols-2">
                <PlansTable />
                <HowToGetCredits />
              </div>
              <SmartLink href={page("/dashboard/premium/")} className={dashPrimaryBtn}>
                <Diamond className="size-4" aria-hidden /> Usa i crediti
              </SmartLink>
            </>
          ) : null}

          {view === "abbonamento" ? (
            <>
              <Panel icon={<Server />} title="Server con Premium" description={details ? undefined : "Le date di scadenza si vedono quando le rende disponibili il bot."}>
                <PremiumList rows={rows} hasDetails={Boolean(details)} />
              </Panel>
              <div className="flex flex-wrap gap-2">
                <SmartLink href={page("/dashboard/premium/")} className={dashPrimaryBtn}>
                  <Diamond className="size-4" aria-hidden /> Attiva o allunga
                </SmartLink>
                <SmartLink href={page("/dashboard/premium/crediti/")} className={dashSecondaryBtn}>
                  <Coins className="size-4" aria-hidden /> I miei crediti
                </SmartLink>
              </div>
            </>
          ) : null}
        </motion.div>
      )}
      <DashToast toast={toast} />
    </DashboardShell>
  );
}
