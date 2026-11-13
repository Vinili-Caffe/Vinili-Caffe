"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Check, Coins, Diamond, History, Lock, LogIn, Server, Sparkles, Ticket } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { Checkbox, confirmDialog } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { checkDashboardAccess, listManageableGuilds, readGuildsCache, type DashboardGuild } from "@/lib/dashboard";
import {
  PREMIUM_PLANS,
  describeMove,
  ensureCreditsBalance,
  formatUntil,
  getCreditsBalance,
  loadCreditsHistory,
  monthsLabel,
  planPerMonth,
  planSaving,
  setCreditsBalance,
  spendCredits,
  subscribeCredits,
  type CreditsMove,
} from "@/lib/dashboard-premium";
import { page } from "@/lib/site";
import { DashboardShell } from "./DashboardShell";
import { DashToast, Panel, StateCard, StatTile, StatusBadge, dashPrimaryBtn, dashSecondaryBtn, discordBtn } from "./guild/bits";

type Gate = "loading" | "login" | "locked" | "ready";
type View = "premium" | "crediti" | "abbonamento";

const VIEW_TEXT: Record<View, { title: string; lead: string; crumb?: string }> = {
  premium: { title: "Premium", lead: "Usa i tuoi crediti per attivare Vinili Premium sui server che gestisci." },
  crediti: { title: "Crediti", crumb: "Crediti", lead: "Il tuo saldo, dove l'hai usato e come averne altri." },
  abbonamento: { title: "Abbonamento", crumb: "Abbonamento", lead: "I server con Premium attivo e quando scade." },
};

/** Saldo crediti condiviso (lo legge anche la topbar). */
export function useCreditsBalance(): number | null {
  return useSyncExternalStore(subscribeCredits, getCreditsBalance, () => null);
}

/** Accesso + lista server (con scadenze Premium) per le tre pagine. */
function usePremiumData() {
  const { ready, token, login } = useAuth();
  const [gate, setGate] = useState<Gate>("loading");
  /* la cache si legge solo nel browser; durante il caricamento la lista non si mostra */
  const [guilds, setGuilds] = useState<DashboardGuild[]>(() => readGuildsCache() || []);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    (async () => {
      setGate("loading");
      setError("");
      const restPromise = Promise.all([ensureCreditsBalance(token, true), listManageableGuilds(token)]);
      restPromise.catch(() => null);
      const access = await checkDashboardAccess(token);
      if (cancelled) return;
      if (!access.ok && access.status === 401) return setGate("login");
      if (access.ok && (access.access.blacklisted || !access.access.allowed)) return setGate("locked");

      const [, list] = await restPromise;
      if (cancelled) return;
      if (list.ok) setGuilds(list.guilds);
      else if (list.status === 401) return setGate("login");
      else setError(list.message);
      setGate("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  return { token, login, gate: ready && !token ? ("login" as Gate) : gate, guilds, setGuilds, error };
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

/** Stato Premium di un server in parole: "fino al 3 marzo 2027", "per sempre", "attivo". */
function premiumText(g: DashboardGuild): string {
  if (!g.premiumActive) return "Senza Premium";
  if (g.premiumLifetime) return "Premium per sempre";
  if (g.premiumUntil) return `Premium fino al ${formatUntil(g.premiumUntil, false)}`;
  return "Premium attivo";
}

function daysLeft(until: number): number {
  return Math.max(0, Math.ceil((until - Date.now()) / 86_400_000));
}

function nextExpiryLabel(rows: DashboardGuild[]): string {
  if (!rows.length) return "—";
  const dated = rows.filter((r) => !r.premiumLifetime && r.premiumUntil).sort((a, b) => (a.premiumUntil || 0) - (b.premiumUntil || 0));
  if (dated.length) return new Date(dated[0].premiumUntil as number).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return rows.some((r) => r.premiumLifetime) ? "Per sempre" : "—";
}

function Summary({ credits, rows }: { credits: number | null; rows: DashboardGuild[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile icon={<Coins />} tone="accent" label="Crediti" value={credits == null ? "—" : credits.toLocaleString("it-IT")} hint="Restano sul tuo account" />
      <StatTile icon={<Diamond />} tone={rows.length ? "ok" : "default"} label="Server Premium" value={rows.length} hint={rows.length ? "Attivi adesso" : "Nessuno ancora"} />
      <StatTile icon={<CalendarClock />} label="Prossima scadenza" value={nextExpiryLabel(rows)} />
    </div>
  );
}

function PremiumList({ rows }: { rows: DashboardGuild[] }) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed border-sand/20 px-4 py-8 text-center text-sm text-crema/60">
        Nessun server ha Premium attivo. Scegline uno e attivalo con i crediti.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
      {rows.map((g) => {
        const left = !g.premiumLifetime && g.premiumUntil ? daysLeft(g.premiumUntil) : null;
        return (
          <li key={g.id} className="flex items-center gap-3 px-4 py-3">
            <GuildIcon name={g.name} iconUrl={g.iconUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-crema">{g.name}</p>
              <p className="truncate text-xs text-crema/60">{premiumText(g)}</p>
            </div>
            {!g.botPresent ? (
              <StatusBadge tone="warn">bot assente</StatusBadge>
            ) : left != null && left <= 7 ? (
              <StatusBadge tone="warn">{left === 0 ? "scade oggi" : `${left} giorni`}</StatusBadge>
            ) : left != null ? (
              <StatusBadge tone="ok">{left} giorni</StatusBadge>
            ) : (
              <StatusBadge tone="ok">attivo</StatusBadge>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Pagina Premium: scegli server + piano, conferma, spendi i crediti. */
function ActivatePremium({
  token,
  credits,
  guilds,
  onDone,
  onToast,
}: {
  token: string;
  credits: number | null;
  guilds: DashboardGuild[];
  onDone: (guildId: string, until: number | null, lifetime: boolean) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const candidates = useMemo(() => guilds.filter((g) => g.botPresent), [guilds]);
  const [picked, setGuildId] = useState("");
  const [months, setMonths] = useState<number>(3);
  const [busy, setBusy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  /* con un solo server disponibile è già scelto */
  const guildId = picked || (candidates.length === 1 ? candidates[0].id : "");

  const guild = candidates.find((g) => g.id === guildId) || null;
  const plan = PREMIUM_PLANS.find((p) => p.months === months) || PREMIUM_PLANS[1];
  const balance = credits ?? 0;
  const enough = balance >= plan.credits;

  const activate = async () => {
    if (!guild) return onToast("Scegli prima un server.", true);
    if (guild.premiumLifetime) return onToast("Questo server ha già Premium per sempre.", true);
    if (!enough) return onToast(`Ti mancano ${plan.credits - balance} crediti per questo piano.`, true);
    if (!acceptTerms) return onToast("Devi accettare i Termini di Servizio per continuare.", true);
    const extend = guild.premiumActive;
    const ok = await confirmDialog({
      title: extend ? "Allungare Premium?" : "Attivare Premium?",
      message: (
        <>
          {extend ? "Aggiungi" : "Attivi"} <strong>{monthsLabel(plan.months)}</strong> di Premium su <strong>{guild.name}</strong>
          {extend ? ", in coda alla scadenza attuale" : ""}. Spendi <strong>{plan.credits} crediti</strong> (
          {planPerMonth(plan)} crediti/mese), te ne restano {balance - plan.credits}. Non c&apos;è rinnovo automatico a
          pagamento: alla scadenza Premium termina; per continuare spendi di nuovo crediti. I crediti spesi non tornano
          indietro.
        </>
      ),
      confirmLabel: `Spendi ${plan.credits} crediti`,
    });
    if (!ok) return;
    setBusy(true);
    const res = await spendCredits(token, guild.id, plan.months);
    setBusy(false);
    if (!res.ok) {
      if (typeof res.credits === "number") setCreditsBalance(res.credits);
      return onToast(res.message, true);
    }
    onDone(guild.id, res.until, res.lifetime);
    onToast(res.lifetime ? `Premium attivo su ${guild.name}.` : `Premium attivo su ${guild.name} fino al ${formatUntil(res.until, false)}.`);
  };

  return (
    <Panel
      icon={<Sparkles />}
      title="Attiva o allunga Premium"
      description="Due scelte: il server e per quanto tempo. Se il server ha già Premium, il tempo si aggiunge alla scadenza."
      aside={
        <SmartLink href={page("/dashboard/premium/vantaggi/")} className="text-xs font-semibold text-ember underline-offset-2 hover:underline">
          Cosa include?
        </SmartLink>
      }
    >
      <div className="space-y-6">
        <fieldset>
          <legend className="text-[0.8rem] font-semibold text-crema/80">1 · Server</legend>
          {candidates.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-sand/20 px-4 py-6 text-center text-sm text-crema/60">
              Il bot non è in nessuno dei server che gestisci.{" "}
              <SmartLink href={page("/dashboard/server/")} className="font-semibold text-ember underline-offset-2 hover:underline">
                Aggiungilo
              </SmartLink>{" "}
              e torna qui.
            </p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Server">
              {candidates.map((g) => {
                const on = g.id === guildId;
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
                      <span className={cn("block truncate text-xs", g.premiumActive ? "text-ember" : "text-crema/60")}>{premiumText(g)}</span>
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

        <div className="overflow-hidden rounded-2xl ring-1 ring-sand/12">
          {guild ? (
            <div className="grid gap-px bg-sand/10 sm:grid-cols-3">
              <div className="bg-espresso/70 px-4 py-3.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-crema/45">Prezzo</p>
                <p className="mt-1 text-sm text-crema">
                  <span className="font-display text-xl font-semibold tabular-nums">{plan.credits}</span>
                  <span className="text-crema/55"> crediti</span>
                </p>
                <p className="mt-0.5 text-xs text-crema/55">
                  {monthsLabel(plan.months)} · {planPerMonth(plan)}/mese
                  {enough ? ` · restano ${balance - plan.credits}` : ""}
                </p>
                {!enough ? <p className="mt-1 text-xs font-medium text-[#f0a493] light:text-[#a83a2c]">Crediti insufficienti</p> : null}
              </div>
              <div className="bg-espresso/70 px-4 py-3.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-crema/45">Rinnovo</p>
                <p className="mt-1 text-sm font-semibold text-crema">Nessun rinnovo automatico</p>
                <p className="mt-0.5 text-xs leading-snug text-crema/55">Scade a fine periodo; per continuare spendi di nuovo crediti.</p>
              </div>
              <div className="bg-espresso/70 px-4 py-3.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-crema/45">Disdetta</p>
                <p className="mt-1 text-sm font-semibold text-crema">Scade da sola</p>
                <p className="mt-0.5 text-xs leading-snug text-crema/55">
                  Rimozione anticipata via{" "}
                  <SmartLink href={page("/tickets/")} className="font-semibold text-ember underline-offset-2 hover:underline">
                    ticket
                  </SmartLink>
                  . I crediti spesi non sono rimborsabili tranne in casi eccezionali.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-espresso/55 px-4 py-5 text-center text-sm text-crema/55">Scegli un server per continuare.</div>
          )}

          <div className="flex flex-col gap-3 bg-roast/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={!guild}
              onClick={() => guild && setAcceptTerms(!acceptTerms)}
              className={cn(
                "flex min-w-0 flex-1 items-start gap-3 rounded-xl px-1 py-0.5 text-left text-sm leading-snug transition",
                guild ? "text-crema/80 hover:text-crema" : "cursor-not-allowed text-crema/40",
              )}
            >
              <Checkbox
                checked={acceptTerms}
                disabled={!guild}
                onChange={setAcceptTerms}
                aria-label="Accetto i Termini di Servizio"
                className="mt-0.5 size-[1.15rem]"
              />
              <span>
                Accetto i{" "}
                <SmartLink
                  href={page("/terms/")}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-ember underline-offset-2 hover:underline"
                >
                  Termini di Servizio
                </SmartLink>{" "}
                e confermo prezzo, durata e disdetta.
              </span>
            </button>
            <button
              type="button"
              disabled={busy || !guild || !enough || credits == null || !acceptTerms}
              onClick={() => void activate()}
              className={cn(dashPrimaryBtn, "w-full shrink-0 justify-center sm:w-auto")}
            >
              <Diamond className="size-4" aria-hidden />
              {busy ? "Attivazione…" : guild?.premiumActive ? "Allunga Premium" : "Attiva Premium"}
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function HowToGetCredits() {
  return (
    <Panel icon={<Coins />} title="Come avere crediti" description="I crediti si legano al tuo account Discord, non a un server.">
      <ul className="space-y-2.5 text-sm text-crema/75">
        <li className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-caramel" aria-hidden />
          Li assegna lo staff di Vinili & Caffè: chiedili aprendo un ticket qui sul sito.
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
        <SmartLink href={page("/tickets/")} className={dashPrimaryBtn}>
          <Ticket className="size-4" aria-hidden /> Apri un ticket
        </SmartLink>
      </div>
    </Panel>
  );
}

function dayLabel(at: number | null): string {
  if (!at) return "Data sconosciuta";
  return new Date(at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** Storico movimenti: raggruppato per giorno, entrate in verde e uscite in neutro. */
function CreditsHistory({ token, guilds }: { token: string; guilds: DashboardGuild[] }) {
  const [state, setState] = useState<{ loading: boolean; error: string; moves: CreditsMove[] }>({ loading: true, error: "", moves: [] });

  useEffect(() => {
    let cancelled = false;
    void loadCreditsHistory(token).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { loading: false, error: "", moves: res.history } : { loading: false, error: res.message, moves: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const names = useMemo(() => new Map(guilds.map((g) => [g.id, g.name])), [guilds]);
  const groups = useMemo(() => {
    const out: { day: string; moves: CreditsMove[] }[] = [];
    for (const m of state.moves) {
      const day = dayLabel(m.at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.moves.push(m);
      else out.push({ day, moves: [m] });
    }
    return out;
  }, [state.moves]);

  return (
    <Panel icon={<History />} title="Movimenti" description="Gli ultimi 50: crediti ricevuti, spesi e rimborsati.">
      {state.loading ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-crema/[0.04]" />
          ))}
        </div>
      ) : state.error ? (
        <p className="text-sm text-crema/60">{state.error}</p>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sand/20 px-4 py-8 text-center text-sm text-crema/60">
          Ancora nessun movimento. Quando lo staff ti assegna crediti o li spendi, compaiono qui.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.day}>
              <h3 className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/60">{g.day}</h3>
              <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
                {g.moves.map((m, i) => {
                  const plus = m.delta > 0;
                  return (
                    <li key={`${m.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          plus ? "bg-[#5f9a6a]/15 text-[#9fd0a8] light:text-[#2f6b3f]" : "bg-crema/[0.07] text-crema/70",
                        )}
                        aria-hidden
                      >
                        {plus ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-crema">{describeMove(m, m.guildId ? names.get(m.guildId) || null : null)}</span>
                        {m.at ? (
                          <span className="block text-xs text-crema/60">{new Date(m.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                        ) : null}
                      </span>
                      <span className={cn("shrink-0 font-semibold tabular-nums", plus ? "text-[#9fd0a8] light:text-[#2f6b3f]" : "text-crema/80")}>
                        {plus ? "+" : "−"}
                        {Math.abs(m.delta)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function PremiumBoard({ view = "premium" }: { view?: View }) {
  const { token, login, gate, guilds, setGuilds, error } = usePremiumData();
  const credits = useCreditsBalance();
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const text = VIEW_TEXT[view];

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.err ? 5200 : 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const rows = guilds.filter((g) => g.premiumActive);
  const onToast = (msg: string, err = false) => setToast({ msg, err });

  return (
    <DashboardShell title={text.title} crumb={text.crumb} lead={text.lead}>
      {gate !== "ready" || !token ? (
        <Gates gate={gate} login={login} />
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">
          {error ? <p className="rounded-xl bg-[#a83a2c]/12 px-4 py-3 text-sm text-[#f0a493] ring-1 ring-[#a83a2c]/30 light:text-[#a83a2c]">{error}</p> : null}
          <Summary credits={credits} rows={rows} />

          {view === "premium" ? (
            <>
              <ActivatePremium
                token={token}
                credits={credits}
                guilds={guilds}
                onToast={onToast}
                onDone={(gid, until, lifetime) =>
                  setGuilds((cur) => cur.map((g) => (g.id === gid ? { ...g, premiumActive: true, premiumUntil: until, premiumLifetime: lifetime } : g)))
                }
              />
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel icon={<Server />} title="Server con Premium">
                  <PremiumList rows={rows} />
                </Panel>
                <HowToGetCredits />
              </div>
            </>
          ) : null}

          {view === "crediti" ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <CreditsHistory token={token} guilds={guilds} />
              <div className="space-y-5">
                <HowToGetCredits />
                <div className="flex flex-wrap gap-2">
                  <SmartLink href={page("/dashboard/premium/")} className={dashPrimaryBtn}>
                    <Diamond className="size-4" aria-hidden /> Usa i crediti
                  </SmartLink>
                  <SmartLink href={page("/dashboard/premium/vantaggi/")} className={dashSecondaryBtn}>
                    <Sparkles className="size-4" aria-hidden /> Piani e vantaggi
                  </SmartLink>
                </div>
              </div>
            </div>
          ) : null}

          {view === "abbonamento" ? (
            <>
              <Panel icon={<Server />} title="Server con Premium" description="Il bot ti avvisa in DM 7, 3 e 1 giorno prima della scadenza.">
                <PremiumList rows={rows} />
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
