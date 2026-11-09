"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Ban, Coins, DoorOpen, History, Lock, LogIn, RotateCcw, Search, Server, ShieldBan, UserX, Users, Wrench } from "lucide-react";
import { chooseDialog, confirmDialog } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  addBotban,
  adjustUserCredits,
  devBanGuild,
  devBanOwner,
  devLeaveGuild,
  devResetGuild,
  devRevokePremium,
  loadBotban,
  loadCreditHolders,
  loadDevEvents,
  loadDevGuilds,
  loadDevOverview,
  loadUserCredits,
  removeBotban,
  type BotbanEntry,
  type CreditHolder,
  type DevEvent,
  type DevGuild,
  type DevOverview,
} from "@/lib/dashboard-dev";
import { DashboardShell } from "./DashboardShell";
import {
  DashToast,
  EditorHeader,
  Field,
  FormGroup,
  Notice,
  Panel,
  StateCard,
  StatTile,
  StatusBadge,
  Subnav,
  dangerBtn,
  discordBtn,
  fieldClass,
  miniBtn,
  primaryMini,
} from "./guild/bits";

type Tab = "overview" | "servers" | "credits" | "blacklist";
type OnToast = (msg: string, err?: boolean) => void;

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Panoramica" },
  { id: "servers", label: "Server" },
  { id: "credits", label: "Crediti" },
  { id: "blacklist", label: "Blacklist bot" },
];

const EVENT_TEXT: Record<string, { label: string; tone: "ok" | "warn" | "muted" | "accent" }> = {
  join: { label: "Entrato", tone: "ok" },
  leave: { label: "Uscito", tone: "muted" },
  kick: { label: "Cacciato", tone: "warn" },
  manual_leave: { label: "Fatto uscire", tone: "warn" },
  botban_leave: { label: "Bloccato", tone: "warn" },
  reset: { label: "Azzerato", tone: "accent" },
};

function when(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Avatar({ url, name, round }: { url: string | null; name: string; round?: boolean }) {
  const cls = cn("size-9 shrink-0 object-cover ring-1 ring-sand/15", round ? "rounded-full" : "rounded-lg");
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" width={36} height={36} className={cls} />;
  return (
    <span className={cn(cls, "flex items-center justify-center bg-crema/[0.08] text-sm font-bold text-crema/80")} aria-hidden>
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

function EventList({ events }: { events: DevEvent[] }) {
  if (!events.length) return <p className="py-6 text-center text-sm text-crema/60">Nessun evento.</p>;
  return (
    <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
      {events.map((e) => {
        const t = EVENT_TEXT[e.type] || { label: e.type, tone: "muted" as const };
        return (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <StatusBadge tone={t.tone}>{t.label}</StatusBadge>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-crema">{e.guildName || e.guildId}</span>
              <span className="block truncate text-xs text-crema/60">
                {e.memberCount ? `${e.memberCount.toLocaleString("it-IT")} membri · ` : ""}
                {e.note || e.guildId}
              </span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-crema/60">{when(e.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function OverviewTab({ token, overview }: { token: string; overview: DevOverview }) {
  const [type, setType] = useState("all");
  const [events, setEvents] = useState<DevEvent[] | null>(null);
  useEffect(() => {
    let off = false;
    void loadDevEvents(token, type).then((r) => !off && setEvents(r.ok ? r.events : []));
    return () => {
      off = true;
    };
  }, [token, type]);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={<Server />} tone="accent" label="Server col bot" value={overview.guildCount.toLocaleString("it-IT")} />
        <StatTile icon={<Users />} label="Registrati" value={overview.registryCount.toLocaleString("it-IT")} hint="Server mai configurati" />
        <StatTile icon={<ShieldBan />} label="Server bloccati" value={overview.blacklistGuilds} />
        <StatTile icon={<UserX />} label="Utenti bloccati" value={overview.blacklistUsers} />
      </div>
      <Panel
        icon={<History />}
        title="Eventi dei server"
        description="Entrate, uscite e azioni fatte da qui (ultimi 100)."
        aside={
          <select name="dev-event-type" aria-label="Tipo di evento" value={type} onChange={(e) => setType(e.target.value)} className={cn(fieldClass, "mt-0 w-auto py-1.5 text-xs")}>
            <option value="all">Tutti</option>
            {Object.entries(EVENT_TEXT).map(([id, t]) => (
              <option key={id} value={id}>
                {t.label}
              </option>
            ))}
          </select>
        }
      >
        {events ? <EventList events={events} /> : <div className="h-40 animate-pulse rounded-xl bg-crema/[0.04]" />}
      </Panel>
    </div>
  );
}

function ServersTab({ token, onToast }: { token: string; onToast: OnToast }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ loading: boolean; error: string; guilds: DevGuild[]; total: number }>({ loading: true, error: "", guilds: [], total: 0 });
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 400);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let off = false;
    void loadDevGuilds(token, query).then((r) => {
      if (off) return;
      setState(r.ok ? { loading: false, error: "", guilds: r.guilds, total: r.total } : { loading: false, error: r.message, guilds: [], total: 0 });
    });
    return () => {
      off = true;
    };
  }, [token, query, reload]);

  const guild = state.guilds.find((g) => g.id === selected) || null;

  const run = async (fn: () => Promise<{ ok: true; message: string } | { ok: false; message: string }>, refresh = true) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    onToast(r.message);
    if (refresh) setReload((n) => n + 1);
  };

  const actions = guild
    ? [
        {
          id: "revoke",
          icon: <RotateCcw className="size-4" />,
          title: "Togli Premium",
          body: "Revoca il Premium del server, con o senza rimborso dei crediti a chi l'aveva pagato.",
          show: guild.premiumActive,
          go: async () => {
            const pick = await chooseDialog({
              title: `Togliere Premium a ${guild.name}?`,
              message: "Scegli se ridare i crediti a chi l'aveva attivato.",
              choices: [
                { id: "refund", label: "Togli e rimborsa i crediti" },
                { id: "norefund", label: "Togli senza rimborso", danger: true },
              ],
            });
            if (pick) await run(() => devRevokePremium(token, guild.id, pick === "refund", ""));
          },
        },
        {
          id: "leave",
          icon: <DoorOpen className="size-4" />,
          title: "Fai uscire il bot",
          body: "Il bot lascia il server. Possono riaggiungerlo quando vogliono.",
          show: true,
          go: async () => {
            if (await confirmDialog({ title: `Far uscire il bot da ${guild.name}?`, message: "Possono riaggiungerlo in qualsiasi momento.", confirmLabel: "Fai uscire", danger: true })) {
              await run(() => devLeaveGuild(token, guild.id, ""));
              setSelected("");
            }
          },
        },
        {
          id: "reset",
          icon: <Wrench className="size-4" />,
          title: "Azzera il server",
          body: "Cancella tutta la configurazione di Vinili per questo server (ticket, pannelli, impostazioni).",
          show: true,
          go: async () => {
            const pick = await chooseDialog({
              title: `Azzerare ${guild.name}?`,
              message: "Cancella la configurazione di Vinili per questo server. Non si torna indietro.",
              danger: true,
              choices: [
                { id: "stay", label: "Azzera, il bot resta", danger: true },
                { id: "leave", label: "Azzera e fai uscire il bot", danger: true },
              ],
            });
            if (pick) await run(() => devResetGuild(token, guild.id, pick === "leave", ""));
          },
        },
        {
          id: "ban-guild",
          icon: <Ban className="size-4" />,
          title: "Blocca il server",
          body: "Il server non può più usare il bot e il bot esce subito.",
          show: !guild.protected,
          go: async () => {
            if (await confirmDialog({ title: `Bloccare ${guild.name}?`, message: "Il bot esce e non potrà più essere aggiunto lì.", confirmLabel: "Blocca server", danger: true })) {
              await run(() => devBanGuild(token, guild.id, ""));
              setSelected("");
            }
          },
        },
        {
          id: "ban-owner",
          icon: <UserX className="size-4" />,
          title: "Blocca il proprietario",
          body: "Il proprietario non può più usare il bot in nessun server.",
          show: !guild.protected,
          go: async () => {
            if (await confirmDialog({ title: "Bloccare il proprietario?", message: `Il proprietario di ${guild.name} non potrà più usare Vinili da nessuna parte.`, confirmLabel: "Blocca proprietario", danger: true })) {
              await run(() => devBanOwner(token, guild.id, ""), false);
            }
          },
        },
      ].filter((a) => a.show)
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <aside className={cn("space-y-3", guild && "hidden lg:block")}>
        <label className="relative block">
          <span className="sr-only">Cerca server</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/50" aria-hidden />
          <input name="dev-guild-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, ID server o proprietario…" className={cn(fieldClass, "mt-0 pl-9")} />
        </label>
        <p className="text-xs text-crema/60">{state.loading ? "Carico…" : `${state.total.toLocaleString("it-IT")} server`}</p>
        {state.error ? (
          <Notice>{state.error}</Notice>
        ) : (
          <ul className="max-h-[65vh] space-y-1 overflow-y-auto pr-1" role="listbox" aria-label="Server">
            {state.guilds.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={g.id === selected}
                  onClick={() => setSelected(g.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition",
                    g.id === selected ? "bg-caramel/12 ring-1 ring-caramel/25" : "hover:bg-crema/[0.04]",
                  )}
                >
                  <Avatar url={g.iconUrl} name={g.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-crema">{g.name}</span>
                    <span className="block truncate text-xs text-crema/60">{g.memberCount.toLocaleString("it-IT")} membri</span>
                  </span>
                  {g.premiumActive ? <StatusBadge tone="accent">Premium</StatusBadge> : null}
                  {g.protected ? <Lock className="size-3.5 shrink-0 text-crema/60" aria-label="Protetto" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="min-w-0">
        {guild ? (
          <div className="space-y-4">
            <EditorHeader inColumn backLabel="Server" onBack={() => setSelected("")} title={guild.name} subtitle={`${guild.memberCount.toLocaleString("it-IT")} membri · entrato ${when(guild.joinedAt)}`} />
            <dl className="grid gap-2 rounded-xl bg-espresso/45 p-4 text-sm ring-1 ring-sand/10 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-crema/60">ID server</dt>
                <dd className="font-mono text-crema">{guild.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-crema/60">Proprietario</dt>
                <dd className="font-mono text-crema">{guild.ownerId || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-crema/60">Premium</dt>
                <dd className="text-crema">{guild.premiumActive ? "Attivo" : "No"}</dd>
              </div>
              <div>
                <dt className="text-xs text-crema/60">Protetto Vinili</dt>
                <dd className="text-crema">{guild.protected ? "Sì: non si blocca" : "No"}</dd>
              </div>
            </dl>
            <ul className="grid gap-2 md:grid-cols-2">
              {actions.map((a) => (
                <li key={a.id} className="flex flex-col rounded-xl bg-roast/80 p-4 ring-1 ring-sand/10">
                  <p className="flex items-center gap-2 text-sm font-semibold text-crema">
                    <span className="text-ember">{a.icon}</span>
                    {a.title}
                  </p>
                  <p className="mt-1 flex-1 text-xs leading-relaxed text-crema/65">{a.body}</p>
                  <button type="button" disabled={busy} onClick={() => void a.go()} className={cn(a.id === "revoke" ? miniBtn : dangerBtn, "mt-3 self-start")}>
                    {a.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-crema">Scegli un server a sinistra</p>
            <p className="mt-1 text-xs text-crema/60">Da qui togli il Premium, fai uscire il bot, azzeri o blocchi un server.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CreditsTab({ token, onToast }: { token: string; onToast: OnToast }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ loading: boolean; error: string; users: CreditHolder[]; total: number; pages: number }>({ loading: true, error: "", users: [], total: 0, pages: 1 });
  const [userId, setUserId] = useState("");
  const [current, setCurrent] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let off = false;
    void loadCreditHolders(token, query, page).then((r) => {
      if (off) return;
      setState(r.ok ? { loading: false, error: "", users: r.users, total: r.total, pages: r.pages } : { loading: false, error: r.message, users: [], total: 0, pages: 1 });
    });
    return () => {
      off = true;
    };
  }, [token, query, page, reload]);

  const validId = /^\d{16,22}$/.test(userId.trim());
  useEffect(() => {
    if (!validId) return;
    let off = false;
    void loadUserCredits(token, userId.trim()).then((r) => !off && setCurrent(r.ok ? r.credits : null));
    return () => {
      off = true;
    };
  }, [token, userId, validId]);

  const delta = Math.trunc(Number(amount));
  const submit = async (sign: 1 | -1) => {
    if (!validId) return onToast("Scrivi un ID Discord valido.", true);
    if (!Number.isFinite(delta) || delta <= 0) return onToast("Scrivi quanti crediti.", true);
    const d = delta * sign;
    const ok = await confirmDialog({
      title: sign > 0 ? `Dare ${delta} crediti?` : `Togliere ${delta} crediti?`,
      message: `Utente ${userId.trim()}${current != null ? `: da ${current} a ${Math.max(0, current + d)} crediti` : ""}. Finisce nel suo storico movimenti.`,
      confirmLabel: sign > 0 ? "Dai crediti" : "Togli crediti",
      danger: sign < 0,
    });
    if (!ok) return;
    setBusy(true);
    const r = await adjustUserCredits(token, userId.trim(), d, note.trim());
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    setCurrent(r.credits);
    setAmount("");
    setNote("");
    setReload((n) => n + 1);
    onToast(`Fatto: ora ha ${r.credits} crediti.`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <FormGroup title="Dai o togli crediti" description="Per chi li chiede con un ticket. L'utente li vede subito nel suo saldo.">
        <div className="space-y-3">
          <Field label="ID Discord dell'utente" hint={validId && current != null ? `Ha ${current} crediti` : "Copialo dal profilo Discord"}>
            <input name="credits-user" inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value.replace(/\D/g, ""))} className={fieldClass} placeholder="123456789012345678" />
          </Field>
          <Field label="Crediti">
            <input name="credits-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} className={fieldClass} placeholder="35" />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {[15, 35, 65, 115].map((n) => (
              <button key={n} type="button" className={miniBtn} onClick={() => setAmount(String(n))}>
                {n}
              </button>
            ))}
          </div>
          <Field label="Nota" hint="Facoltativa, la vede solo lo staff">
            <input name="credits-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={fieldClass} placeholder="Ticket #123" />
          </Field>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void submit(1)} className={cn(primaryMini, "flex-1 py-2")}>
              <Coins className="size-3.5" aria-hidden /> Dai
            </button>
            <button type="button" disabled={busy} onClick={() => void submit(-1)} className={cn(dangerBtn, "flex-1 py-2")}>
              Togli
            </button>
          </div>
        </div>
      </FormGroup>

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-crema">Chi ha crediti</h3>
          <span className="text-xs tabular-nums text-crema/60">{state.total} utenti</span>
        </div>
        <label className="relative block">
          <span className="sr-only">Cerca per ID</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/50" aria-hidden />
          <input name="credits-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per ID…" className={cn(fieldClass, "mt-0 pl-9")} />
        </label>
        {state.error ? (
          <Notice>{state.error}</Notice>
        ) : state.loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-crema/[0.04]" />
        ) : state.users.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand/20 px-4 py-8 text-center text-sm text-crema/60">Nessuno ha crediti.</p>
        ) : (
          <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
            {state.users.map((u) => (
              <li key={u.userId}>
                <button type="button" onClick={() => setUserId(u.userId)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-crema/[0.03]">
                  <Avatar url={u.avatarUrl} name={u.displayName || u.userId} round />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-crema">{u.displayName || u.userId}</span>
                    <span className="block truncate font-mono text-xs text-crema/60">{u.userId}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-crema">{u.credits}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {state.pages > 1 ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-crema/60">
              Pagina {page} di {state.pages}
            </span>
            <div className="flex gap-1.5">
              <button type="button" className={miniBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Indietro
              </button>
              <button type="button" className={miniBtn} disabled={page >= state.pages} onClick={() => setPage((p) => p + 1)}>
                Avanti
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function BlacklistTab({ token, onToast }: { token: string; onToast: OnToast }) {
  const [entries, setEntries] = useState<BotbanEntry[] | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"user" | "guild">("user");
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let off = false;
    void loadBotban(token).then((r) => {
      if (off) return;
      if (r.ok) setEntries(r.entries);
      else setError(r.message);
    });
    return () => {
      off = true;
    };
  }, [token, reload]);

  const add = async () => {
    if (!/^\d{16,22}$/.test(id.trim())) return onToast("Scrivi un ID valido.", true);
    const ok = await confirmDialog({
      title: kind === "user" ? "Bloccare questo utente?" : "Bloccare questo server?",
      message: kind === "user" ? "Non potrà più usare Vinili in nessun server." : "Il bot esce dal server e non potrà più essere aggiunto.",
      confirmLabel: "Blocca",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await addBotban(token, kind, id.trim(), note.trim());
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    setId("");
    setNote("");
    setReload((n) => n + 1);
    onToast(r.message);
  };

  const sorted = useMemo(() => (entries || []).slice().sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || ""))), [entries]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <FormGroup title="Blocca" description="Chi è qui non può usare Vinili. Un server bloccato fa uscire subito il bot.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Cosa bloccare">
            {(["user", "guild"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn("rounded-md px-3 py-1.5 text-sm font-semibold transition-colors", kind === k ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema")}
              >
                {k === "user" ? "Utente" : "Server"}
              </button>
            ))}
          </div>
          <Field label={kind === "user" ? "ID utente" : "ID server"}>
            <input name="botban-id" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} className={fieldClass} />
          </Field>
          <Field label="Motivo" hint="Facoltativo, lo vede solo lo staff">
            <input name="botban-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
          </Field>
          <button type="button" disabled={busy} onClick={() => void add()} className={cn(dangerBtn, "w-full py-2")}>
            <Ban className="size-3.5" aria-hidden /> Blocca
          </button>
        </div>
      </FormGroup>

      <section className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-crema">Bloccati</h3>
          <span className="text-xs tabular-nums text-crema/60">{entries?.length ?? 0}</span>
        </div>
        {error ? (
          <Notice>{error}</Notice>
        ) : !entries ? (
          <div className="h-40 animate-pulse rounded-xl bg-crema/[0.04]" />
        ) : sorted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand/20 px-4 py-8 text-center text-sm text-crema/60">Nessuno è bloccato.</p>
        ) : (
          <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
            {sorted.map((e) => (
              <li key={`${e.type}:${e.id}`} className="flex items-center gap-3 px-4 py-3">
                <Avatar url={e.iconUrl} name={e.name || e.id} round={e.type === "user"} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-crema">
                    <span className="truncate">{e.name || e.id}</span>
                    <StatusBadge tone={e.type === "guild" ? "accent" : "muted"}>{e.type === "guild" ? "server" : "utente"}</StatusBadge>
                  </p>
                  <p className="truncate text-xs text-crema/60">
                    {e.note || "Nessun motivo"} · {when(e.addedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className={miniBtn}
                  disabled={busy}
                  onClick={async () => {
                    if (!(await confirmDialog({ title: "Sbloccare?", message: `${e.name || e.id} potrà di nuovo usare Vinili.`, confirmLabel: "Sblocca" }))) return;
                    setBusy(true);
                    const r = await removeBotban(token, e.type, e.id);
                    setBusy(false);
                    if (!r.ok) return onToast(r.message, true);
                    setReload((n) => n + 1);
                    onToast("Sbloccato.");
                  }}
                >
                  Sblocca
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function DevBoard() {
  const { ready, token, login } = useAuth();
  const [gate, setGate] = useState<"loading" | "denied" | "ready">("loading");
  const [overview, setOverview] = useState<DevOverview | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const onToast: OnToast = (msg, err = false) => setToast({ msg, err });

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.err ? 5200 : 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!ready || !token) return;
    let off = false;
    void loadDevOverview(token).then((r) => {
      if (off) return;
      if (r.ok) {
        setOverview(r.overview);
        setGate("ready");
      } else setGate("denied");
    });
    return () => {
      off = true;
    };
  }, [ready, token]);

  return (
    <DashboardShell title="Sviluppatore" lead="Tutti i server col bot, eventi, crediti e blocchi. Solo per gli sviluppatori di Vinili.">
      {ready && !token ? (
        <StateCard
          icon={<LogIn />}
          title="Accedi con Discord"
          actions={
            <button type="button" onClick={login} className={discordBtn}>
              <LogIn className="size-4" aria-hidden /> Accedi
            </button>
          }
        />
      ) : gate === "denied" ? (
        <StateCard icon={<Lock />} title="Solo sviluppatori">
          Questa sezione è riservata agli sviluppatori del bot.
        </StateCard>
      ) : gate === "loading" || !overview || !token ? (
        <div className="h-40 animate-pulse rounded-2xl bg-crema/[0.04]" aria-busy />
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">
          <Subnav tabs={TABS} value={tab} onChange={setTab} label="Sezioni sviluppatore" />
          {tab === "overview" ? <OverviewTab token={token} overview={overview} /> : null}
          {tab === "servers" ? (
            <Panel>
              <ServersTab token={token} onToast={onToast} />
            </Panel>
          ) : null}
          {tab === "credits" ? (
            <Panel>
              <CreditsTab token={token} onToast={onToast} />
            </Panel>
          ) : null}
          {tab === "blacklist" ? (
            <Panel>
              <BlacklistTab token={token} onToast={onToast} />
            </Panel>
          ) : null}
        </motion.div>
      )}
      <DashToast toast={toast} />
    </DashboardShell>
  );
}
