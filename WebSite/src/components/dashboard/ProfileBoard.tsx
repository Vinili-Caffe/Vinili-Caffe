"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { Award, CalendarDays, Coins, Database, Diamond, Download, Eye, Handshake, LogIn, LogOut, ShieldAlert, Target, Trash2, UserRound, Zap } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { confirmDialog } from "@/components/ui";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { getCreditsBalance, subscribeCredits } from "@/lib/dashboard-premium";
import { loadPmProfile, loadTenantProfile, patchPmProfile, patchTenantProfile, type ProfileEmoji, type TenantProfile } from "@/lib/dashboard-profile";
import { eraseGdprData, exportGdprData, labelFor, summarizeCounts, type EraseResult } from "@/lib/gdpr";
import { page } from "@/lib/site";
import { DashboardShell } from "./DashboardShell";
import { DashToast, Panel, StateCard, dangerBtn, dashSecondaryBtn, discordBtn, fieldClass, miniBtn } from "./guild/bits";

type Toast = { msg: string; err: boolean } | null;

function Emoji({ e }: { e: ProfileEmoji }) {
  if (e.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={e.url} alt="" width={20} height={20} className="size-5 object-contain" />;
  }
  return <span className="text-base leading-none">{e.text}</span>;
}

function AccountCard() {
  const { user, logout } = useAuth();
  const credits = useSyncExternalStore(subscribeCredits, getCreditsBalance, () => null);
  if (!user) return null;
  return (
    <Panel icon={<UserRound />} title="Account" description="Entri con Discord: i server che vedi sono quelli dove puoi gestire Vinili.">
      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl(user, 128)} alt="" width={56} height={56} className="size-14 rounded-full ring-2 ring-sand/15" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-semibold text-crema">{displayName(user)}</p>
          <p className="truncate text-sm text-crema/60">@{user.username}</p>
          <p className="mt-0.5 font-mono text-xs text-crema/60">ID {user.id}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (await confirmDialog({ title: "Uscire dalla dashboard?", message: "Per rientrare ti serve di nuovo il login con Discord.", confirmLabel: "Esci" })) {
              logout({ toLogin: false });
            }
          }}
          className={dashSecondaryBtn}
        >
          <LogOut className="size-4" aria-hidden /> Esci
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <SmartLink href={page("/dashboard/premium/crediti/")} className="flex items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10 transition hover:ring-sand/25">
          <Coins className="size-4 text-ember" aria-hidden />
          <span className="min-w-0 flex-1 text-sm text-crema">Crediti</span>
          <span className="font-semibold tabular-nums text-crema">{credits == null ? "—" : credits.toLocaleString("it-IT")}</span>
        </SmartLink>
        <SmartLink href={page("/dashboard/profilo/abbonamento/")} className="flex items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10 transition hover:ring-sand/25">
          <Diamond className="size-4 text-ember" aria-hidden />
          <span className="min-w-0 flex-1 text-sm text-crema">Server con Premium</span>
          <span className="text-xs text-crema/60">Apri</span>
        </SmartLink>
      </div>
    </Panel>
  );
}

/* stessa veste delle sezioni del profilo staff (sfumatura caramello, titolo in display) */
const PROFILE_SECTION = "rounded-3xl bg-gradient-to-b from-caramel/[0.06] via-roast/80 to-roast p-5 ring-1 ring-sand/12 sm:p-6";

/* stesso riquadro delle statistiche staff */
function ProfileStat({ value, label, icon }: { value: number | string; label: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-4 ring-1 ring-sand/12">
      <span className="flex size-9 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25 [&>svg]:size-4">{icon}</span>
      <span className="mt-3 font-display text-3xl font-semibold leading-none lining-nums">{typeof value === "number" ? value.toLocaleString("it-IT") : value}</span>
      <span className="mt-1 text-xs text-crema/55">{label}</span>
    </div>
  );
}

function SectionHead({ icon, title, aside }: { icon: React.ReactNode; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ember [&>svg]:size-4" aria-hidden>
        {icon}
      </span>
      <h3 className="font-display text-xl font-semibold text-crema">{title}</h3>
      {aside ? <span className="ml-auto text-xs text-crema/50 lining-nums">{aside}</span> : null}
    </div>
  );
}

/**
 * Profilo partnership del proprio utente in un server (tab Staff del profilo del sito):
 * preferenze del bot, badge in vetrina e obiettivi, con la stessa veste delle sezioni staff.
 */
export function PartnerProfile({
  token,
  onToast,
  guildId = null,
  showStats = true,
  onBadges,
}: {
  token: string;
  onToast: (m: string, err?: boolean) => void;
  guildId?: string | null;
  /** riquadri delle partnership (sul server principale no) */
  showStats?: boolean;
  /** badge in vetrina scelti: sul principale li mostra la testata del profilo */
  onBadges?: (badges: { id: string; title: string; emoji: ProfileEmoji }[]) => void;
}) {
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (guildId ? loadPmProfile(token, guildId) : loadTenantProfile(token)).then((res) => {
      if (cancelled) return;
      if (res.ok) setProfile(res.profile);
      else setHidden(true);
    });
    return () => {
      cancelled = true;
    };
  }, [token, guildId]);

  const selectedBadges = profile ? profile.badges.filter((b) => b.selected).map((b) => ({ id: b.id, title: b.title, emoji: b.emoji })) : null;
  const badgesKey = selectedBadges ? selectedBadges.map((b) => b.id).join(",") : "";
  useEffect(() => {
    if (selectedBadges && onBadges) onBadges(selectedBadges);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cambia solo quando cambiano i badge scelti
  }, [badgesKey, Boolean(selectedBadges)]);

  if (hidden) return null;
  if (!profile) return <div className="h-48 animate-pulse rounded-3xl bg-crema/[0.04]" aria-busy />;

  const patch = async (body: Parameters<typeof patchTenantProfile>[1], okMsg: string) => {
    setBusy(true);
    const res = guildId ? await patchPmProfile(token, guildId, body) : await patchTenantProfile(token, body);
    setBusy(false);
    if (!res.ok) return onToast(res.message, true);
    setProfile(res.profile);
    onToast(okMsg);
  };

  const unlocked = profile.badges.filter((b) => b.unlocked);
  const selectedCount = profile.badges.filter((b) => b.selected).length;
  const objectives = [...profile.objectives.filter((o) => !o.done), ...profile.objectives.filter((o) => o.done)];
  const doneCount = profile.objectives.filter((o) => o.done).length;

  return (
    <div className="space-y-6">
      {showStats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ProfileStat value={profile.scores.total} label="Partnership totali" icon={<Handshake />} />
          <ProfileStat value={profile.scores.daily} label="Oggi" icon={<Zap />} />
          <ProfileStat value={profile.scores.weekly} label="Questa settimana" icon={<CalendarDays />} />
          <ProfileStat value={`${Math.round(profile.awardsPercent)}%`} label="Premi ottenuti" icon={<Award />} />
        </div>
      ) : null}
      <section className={PROFILE_SECTION}>
        <SectionHead icon={<Award />} title="Badge in vetrina" aside={`${selectedCount}/${profile.maxSelectedBadges} scelti`} />
        <p className="mt-1 text-xs text-crema/55">Tocca un badge per metterlo o toglierlo: quelli scelti compaiono accanto al tuo nome nelle partnership.</p>
        {unlocked.length === 0 ? (
          <p className="mt-4 text-sm text-crema/60">Nessun badge sbloccato: completa gli obiettivi qui sotto per averne.</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {unlocked.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={b.selected}
                  onClick={() => void patch({ toggleBadgeId: b.id }, b.selected ? "Badge tolto dalla vetrina." : "Badge in vetrina.")}
                  title={b.desc || b.title}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition disabled:opacity-60",
                    b.selected ? "bg-caramel/15 text-ember ring-caramel/40" : "bg-crema/[0.05] text-crema/75 ring-sand/15 hover:text-crema hover:ring-sand/30",
                  )}
                >
                  <Emoji e={b.emoji} /> {b.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {profile.qualifiesForMissions && objectives.length ? (
        <section className={PROFILE_SECTION}>
          <SectionHead icon={<Target />} title="Obiettivi" aside={`${doneCount}/${objectives.length} completati`} />
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {objectives.map((o) => {
              const pct = Math.min(100, Math.round((Math.min(o.current, o.target) / Math.max(1, o.target)) * 100));
              return (
                <li key={o.id} className={cn("rounded-2xl bg-espresso/50 p-3.5 ring-1", o.done ? "ring-caramel/30" : "ring-sand/10")}>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 leading-none">
                      <Emoji e={o.emoji} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold", o.done ? "text-ember" : "text-crema")}>{o.title}</p>
                      {o.desc ? <p className="mt-0.5 text-xs leading-relaxed text-crema/55">{o.desc}</p> : null}
                    </div>
                    {o.done ? <span className="shrink-0 rounded-full bg-caramel/15 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-ember">fatto</span> : null}
                  </div>
                  {!o.done && o.target > 1 ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-crema/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={o.title}>
                        <div className="h-full rounded-full bg-gradient-to-r from-caramel to-ember" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[0.7rem] text-crema/50 lining-nums">
                        {o.current}/{o.target}
                      </span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CountList({ title, items, tone }: { title: string; items: ReturnType<typeof summarizeCounts>; tone: "danger" | "muted" }) {
  return (
    <div>
      <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/60">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-crema/60">Niente.</p>
      ) : (
        <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
          {items.map((it) => (
            <li key={it.key} className="flex items-start gap-3 px-3.5 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-crema">{labelFor(it.key)}</span>
                {it.detail ? <span className="block text-xs text-crema/60">{it.detail}</span> : null}
              </span>
              <span className={cn("shrink-0 font-semibold tabular-nums", tone === "danger" ? "text-[#f0a493] light:text-[#a83a2c]" : "text-crema/70")}>{it.n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Privacy: scarica i dati, anteprima e cancellazione (come /dati, dentro la dashboard). */
function PrivacyPanel({ token, onToast }: { token: string; onToast: (m: string, err?: boolean) => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<"" | "export" | "preview" | "erase">("");
  const [preview, setPreview] = useState<EraseResult | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const doExport = async () => {
    setBusy("export");
    const r = await exportGdprData(token);
    setBusy("");
    if (!r.ok) return onToast(r.message, true);
    if ("tooLarge" in r) return onToast(r.message, true);
    onToast("Export scaricato.");
  };

  const doPreview = async () => {
    setBusy("preview");
    const r = await eraseGdprData(token, { confirm: false });
    setBusy("");
    if (!r.ok) return onToast(r.message, true);
    setPreview(r.data);
  };

  const matches = Boolean(user) && [user?.username, user?.id].some((v) => v && v.toLowerCase() === confirmText.trim().toLowerCase());

  const doErase = async () => {
    if (!matches) return onToast("Scrivi il tuo username o ID Discord per confermare.", true);
    const ok = await confirmDialog({
      title: "Cancellare i tuoi dati?",
      message: "Cancelli per sempre i dati elencati. Non si torna indietro.",
      confirmLabel: "Cancella per sempre",
      danger: true,
    });
    if (!ok) return;
    setBusy("erase");
    const r = await eraseGdprData(token, { confirm: true, confirmToken: confirmText.trim() });
    setBusy("");
    if (!r.ok) return onToast(r.message, true);
    setPreview(r.data);
    setConfirmText("");
    onToast(r.data.message || "Dati cancellati.");
  };

  const deleted = preview ? summarizeCounts(preview.deleted) : [];
  const retained = preview ? summarizeCounts(preview.retained) : [];

  return (
    <Panel
      icon={<Database />}
      title="I tuoi dati"
      description={
        <>
          Copia o cancellazione dei dati che sito e bot hanno sul tuo account.{" "}
          <SmartLink href="/privacy/" className="text-ember underline-offset-2 hover:underline">
            Privacy Policy
          </SmartLink>
        </>
      }
      bodyClassName="space-y-4"
    >
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={Boolean(busy)} onClick={() => void doExport()} className={dashSecondaryBtn}>
          <Download className="size-4" aria-hidden /> {busy === "export" ? "Preparo il file…" : "Scarica i miei dati"}
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void doPreview()} className={dashSecondaryBtn}>
          <Eye className="size-4" aria-hidden /> {busy === "preview" ? "Calcolo…" : "Cosa verrebbe cancellato?"}
        </button>
      </div>

      {preview ? (
        <div className="space-y-4 rounded-xl bg-[#a83a2c]/[0.06] p-4 ring-1 ring-[#a83a2c]/25">
          {preview.preview ? (
            <p className="flex items-start gap-2 text-sm text-crema/80">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#f0a493] light:text-[#a83a2c]" aria-hidden />
              Anteprima: non è stato cancellato niente.
            </p>
          ) : (
            <p className="text-sm font-semibold text-crema">Cancellazione fatta.</p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <CountList title={preview.preview ? "Verrebbe cancellato" : "Cancellato"} items={deleted} tone="danger" />
            <CountList title="Resta (moderazione, pagamenti, obblighi di legge)" items={retained} tone="muted" />
          </div>
          {preview.preview ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-crema/80">Per confermare scrivi il tuo username o ID Discord</span>
                <input
                  name="gdpr-confirm"
                  value={confirmText}
                  autoComplete="off"
                  placeholder={user?.username || "username"}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <button type="button" disabled={Boolean(busy) || !matches} onClick={() => void doErase()} className={cn(dangerBtn, "py-2.5")}>
                <Trash2 className="size-4" aria-hidden /> {busy === "erase" ? "Cancello…" : "Cancella i miei dati"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setPreview(null)} className={miniBtn}>
              Chiudi
            </button>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

export function ProfileBoard() {
  const { ready, token, login } = useAuth();
  const [toast, setToast] = useState<Toast>(null);
  const onToast = (msg: string, err = false) => setToast({ msg, err });

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.err ? 5200 : 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <DashboardShell title="Profilo" lead="Il tuo account e i tuoi dati.">
      {!ready ? (
        <div className="h-40 animate-pulse rounded-2xl bg-crema/[0.04]" aria-busy />
      ) : !token ? (
        <StateCard
          icon={<LogIn />}
          title="Accedi con Discord"
          actions={
            <button type="button" onClick={login} className={discordBtn}>
              <LogIn className="size-4" aria-hidden /> Accedi
            </button>
          }
        >
          Serve il login per vedere il tuo profilo.
        </StateCard>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">
          <AccountCard />
          <PrivacyPanel token={token} onToast={onToast} />
        </motion.div>
      )}
      <DashToast toast={toast} />
    </DashboardShell>
  );
}
