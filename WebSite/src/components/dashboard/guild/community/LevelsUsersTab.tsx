"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Target,
  TrendingUp,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { cn } from "@/lib/cn";
import {
  communityApi,
  type LevelsConfig,
  type LevelsUser,
  type LevelsUserAction,
  type PickerRole,
} from "@/lib/dashboard-community";
import { searchTicketMembers, type MemberHit } from "@/lib/dashboard-guild-ops";
import { RowsSkeleton, dangerBtn, dashPrimaryBtn, fieldClass, miniBtn } from "../bits";

function Card({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/10 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#826bc2]/15 text-[#b9a6f0] ring-1 ring-[#826bc2]/30">
          <Icon className="size-[1.1rem]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-crema">{title}</h3>
          {text ? <p className="mt-0.5 text-xs leading-relaxed text-crema/55">{text}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const roleColor = (roles: PickerRole[], id: string) => {
  const c = roles.find((r) => r.id === id)?.color;
  return c && c !== "#000000" ? c : "#99aab5";
};

function MemberSearch({ guildId, token, onPick }: { guildId: string; token: string; onPick: (m: MemberHit) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; hits: MemberHit[]; err?: string }>({ q: "", hits: [] });
  const [open, setOpen] = useState(false);
  const searchReqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) {
      searchReqId.current += 1;
      setResult({ q: "", hits: [] });
      return;
    }
    const reqId = ++searchReqId.current;
    setResult({ q: "", hits: [] });
    const timer = window.setTimeout(async () => {
      const res = await searchTicketMembers(token, guildId, q);
      if (reqId !== searchReqId.current) return;
      setResult(res.ok ? { q, hits: res.data } : { q, hits: [], err: res.message });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, token, guildId]);

  const q = query.trim();
  const valid = q.length >= 2 || /^\d{16,22}$/.test(q);
  const searching = valid && result.q !== q;
  const shown = valid && result.q === q ? result.hits : [];
  const err = valid && result.q === q ? result.err : undefined;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-crema/45" aria-hidden />
      <input
        name="levelsusertab-search"
        id="levelsusertab-search"
        value={query}
        placeholder="Cerca un membro per nome o ID"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={cn(fieldClass, "!mt-0 h-11 py-0 pl-10")}
        aria-label="Cerca un membro"
      />
      {searching ? <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-crema/45" aria-hidden /> : null}
      {open && valid && !searching && err ? (
        <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl bg-mocha px-3 py-2.5 text-sm text-[#e2836f] shadow-xl ring-1 ring-sand/15">{err}</p>
      ) : null}
      {open && valid && !searching && !err && !shown.length ? (
        <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl bg-mocha px-3 py-2.5 text-sm text-crema/55 shadow-xl ring-1 ring-sand/15">Nessun membro trovato per “{q}”.</p>
      ) : null}
      {open && shown.length ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl bg-mocha p-1 shadow-xl ring-1 ring-sand/15">
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-crema hover:bg-crema/10"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(m);
                  setQuery("");
                  setResult({ q: "", hits: [] });
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
  );
}

const OPS = [
  { id: "add", label: "Aggiungi", hint: "in più a quelli che ha", icon: Plus },
  { id: "remove", label: "Togli", hint: "in meno da quelli che ha", icon: Minus },
  { id: "set", label: "Imposta", hint: "un valore preciso", icon: Target },
] as const;

export function LevelsUsersTab({
  guildId,
  token,
  cfg,
  pickerRoles,
  onToast,
}: {
  guildId: string;
  token: string;
  cfg: LevelsConfig;
  pickerRoles: PickerRole[];
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [member, setMember] = useState<MemberHit | null>(null);
  const [user, setUser] = useState<LevelsUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [op, setOp] = useState<"add" | "remove" | "set">("add");
  const [mode, setMode] = useState<"level" | "exp">("level");
  const [value, setValue] = useState(1);
  const [confirmReset, setConfirmReset] = useState(false);

  const pick = async (m: MemberHit) => {
    setMember(m);
    setUser(null);
    setConfirmReset(false);
    setLoading(true);
    const r = await communityApi.getLevelsUser(token, guildId, m.id);
    setLoading(false);
    if (!r.ok) return onToast(r.message, true);
    setUser(r.data.user);
  };

  const clear = () => {
    setMember(null);
    setUser(null);
    setConfirmReset(false);
  };

  const act = async (action: LevelsUserAction["action"]) => {
    if (!member) return;
    setBusy(true);
    const r = await communityApi.mutateLevelsUser(token, guildId, { userId: member.id, action, mode, value });
    setBusy(false);
    setConfirmReset(false);
    if (!r.ok) return onToast(r.message, true);
    setUser(r.data.user);
    if (action === "syncroles") {
      return onToast(r.data.rolesSynced ? "Ruoli premio risincronizzati." : "Il bot non ha il server in memoria: i ruoli si aggiornano al prossimo messaggio.", !r.data.rolesSynced);
    }
    const b = r.data.before;
    const u = r.data.user;
    const roles = r.data.rolesSynced ? "" : " I ruoli si aggiornano al prossimo messaggio.";
    onToast(`${member.label}: livello ${b.level} → ${u.level}, ${b.totalExp.toLocaleString("it-IT")} → ${u.totalExp.toLocaleString("it-IT")} EXP.${roles}`);
  };

  const preview = (() => {
    if (!user) return { label: "", from: "", to: "", changed: false };
    const cur = mode === "level" ? user.level : user.totalExp;
    const next = op === "set" ? value : op === "add" ? cur + value : Math.max(0, cur - value);
    const fmt = (n: number) => n.toLocaleString("it-IT");
    return { label: mode === "level" ? "Livello" : "EXP", from: fmt(cur), to: fmt(next), changed: next !== cur };
  })();

  const sortedRewards = [...cfg.roleRewards].sort((a, b) => a.level - b.level);
  const earned = user ? sortedRewards.filter((r) => r.level <= user.level) : [];
  const nextReward = user ? sortedRewards.find((r) => r.level > user.level) : undefined;
  const roleName = (id: string) => pickerRoles.find((r) => r.id === id)?.name || "ruolo eliminato";
  const span = user ? Math.max(1, user.nextLevelExp - user.levelStartExp) : 1;
  const pct = user ? Math.min(100, Math.max(0, ((user.totalExp - user.levelStartExp) / span) * 100)) : 0;

  return (
    <div className="space-y-4">
      <Card icon={UserRound} title="Utenti" text="Cerca un membro per vedere il suo livello e cambiarlo a mano. Ogni modifica finisce nello storico livelli.">
        {member ? (
          <div className="flex items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#826bc2]/20 font-display text-lg font-semibold text-[#cdbdf7]" aria-hidden>
              {(member.label || member.username || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-crema" translate="no">
                {member.label}
              </p>
              <p className="truncate text-xs text-crema/50" translate="no">
                @{member.username} · {member.id}
              </p>
            </div>
            <button type="button" className={cn(miniBtn, "!px-2")} onClick={clear} aria-label="Cambia membro">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <MemberSearch guildId={guildId} token={token} onPick={(m) => void pick(m)} />
        )}
      </Card>

      {member && loading ? <RowsSkeleton rows={3} /> : null}

      {member && user ? (
        <>
          <section className="rounded-3xl bg-gradient-to-br from-[#826bc2]/20 via-roast/80 to-roast/70 p-5 ring-1 ring-[#826bc2]/25">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-xs font-semibold text-crema/50">Livello</p>
                <p className="font-display text-5xl font-semibold leading-none text-crema lining-nums">{user.level}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-crema/50">EXP totali</p>
                <p className="text-xl font-semibold text-crema lining-nums">{user.totalExp.toLocaleString("it-IT")}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-crema/50">Questa settimana</p>
                <p className="text-xl font-semibold text-crema lining-nums">{user.weeklyExp.toLocaleString("it-IT")}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-espresso/70">
                <div className="h-full rounded-full bg-[#9c86db]" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-crema/55 lining-nums">
                {Math.max(0, user.nextLevelExp - user.totalExp).toLocaleString("it-IT")} EXP al livello {user.level + 1}
                {nextReward ? ` · prossimo ruolo premio al livello ${nextReward.level} (${roleName(nextReward.roleId)})` : ""}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {earned.length ? (
                earned.map((r) => (
                  <span key={`${r.level}-${r.roleId}`} className="inline-flex items-center gap-1.5 rounded-full bg-espresso/60 px-2.5 py-1 text-xs font-semibold text-crema/85 ring-1 ring-sand/10">
                    <span className="size-2 rounded-full" style={{ background: roleColor(pickerRoles, r.roleId) }} aria-hidden />
                    {roleName(r.roleId)}
                    <span className="text-crema/40">Lv {r.level}</span>
                  </span>
                ))
              ) : (
                <span className="text-xs text-crema/50">Nessun ruolo premio ancora.</span>
              )}
            </div>
          </section>

          <Card icon={TrendingUp} title="Modifica" text="Scegli cosa fare, quanto, e controlla l'anteprima prima di applicare.">
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cosa fare">
              {OPS.map((o) => {
                const on = op === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setOp(o.id)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-2xl p-3 text-left ring-1 transition",
                      on ? "bg-[#826bc2]/15 ring-[#826bc2]/45" : "bg-espresso/45 ring-sand/10 hover:bg-crema/[0.05]",
                    )}
                  >
                    <o.icon className={cn("size-4", on ? "text-[#cdbdf7]" : "text-crema/45")} aria-hidden />
                    <span className={cn("text-sm font-semibold", on ? "text-crema" : "text-crema/75")}>{o.label}</span>
                    <span className="hidden text-xs text-crema/45 sm:block">{o.hint}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
              <div className="w-36">
                <NumberField
                  className="!mt-0"
                  value={value}
                  min={0}
                  max={mode === "level" ? 10000 : 2000000000}
                  step={mode === "level" ? 1 : 100}
                  onChange={(v) => setValue(Math.max(0, Math.floor(Number(v) || 0)))}
                  aria-label="Quanto"
                />
              </div>
              <div className="flex h-10 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Unità">
                {(
                  [
                    ["level", "livelli"],
                    ["exp", "EXP"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={mode === id}
                    onClick={() => setMode(id)}
                    className={cn("rounded-md px-3 text-sm font-semibold transition", mode === id ? "bg-crema/10 text-crema" : "text-crema/50 hover:text-crema/80")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm lining-nums">
                <span className="text-crema/55">{preview.label}</span>
                <span className="font-semibold text-crema/70">{preview.from}</span>
                <ArrowRight className="size-3.5 shrink-0 text-crema/40" aria-hidden />
                <span className={cn("font-display text-lg font-semibold", preview.changed ? "text-[#cdbdf7]" : "text-crema/60")}>{preview.to}</span>
              </div>

              <button type="button" className={cn(dashPrimaryBtn, "h-10")} disabled={busy || !preview.changed || ((op === "add" || op === "remove") && value <= 0)} onClick={() => void act(op)}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Applica
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs">
              <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-crema/55 transition hover:text-crema disabled:opacity-45" disabled={busy} onClick={() => void act("syncroles")}>
                <RefreshCw className="size-3.5" aria-hidden /> Risincronizza ruoli premio
              </button>
              {confirmReset ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-crema/55">Azzerare tutti gli EXP di {member.label}?</span>
                  <button type="button" className={dangerBtn} disabled={busy} onClick={() => void act("reset")}>
                    Sì, azzera
                  </button>
                  <button type="button" className="font-semibold text-crema/55 hover:text-crema" onClick={() => setConfirmReset(false)}>
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#e2836f]/80 transition hover:text-[#f0a493] disabled:opacity-45"
                  disabled={busy || user.totalExp === 0}
                  onClick={() => setConfirmReset(true)}
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Azzera EXP
                </button>
              )}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
