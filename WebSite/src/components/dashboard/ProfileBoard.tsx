"use client";

import { Select } from "@/components/ui/Select";
import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { Award, Coins, Database, Diamond, Download, Eye, Handshake, LogIn, LogOut, Settings2, ShieldAlert, Target, Trash2, UserRound } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { confirmDialog } from "@/components/ui";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { getCreditsBalance, subscribeCredits } from "@/lib/dashboard-premium";
import { loadPmProfile, loadTenantProfile, patchPmProfile, patchTenantProfile, type ProfileEmoji, type TenantProfile } from "@/lib/dashboard-profile";
import { eraseGdprData, exportGdprData, labelFor, summarizeCounts, type EraseResult } from "@/lib/gdpr";
import { page } from "@/lib/site";
import { DashboardShell } from "./DashboardShell";
import { DashToast, Panel, SettingRow, StateCard, StatTile, Toggle, dangerBtn, dashSecondaryBtn, discordBtn, fieldClass, miniBtn } from "./guild/bits";

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

/** Profilo partnership (solo alto staff): preferenze del bot, badge in vetrina, obiettivi. */
/**
 * Profilo partnership: statistiche, preferenze, badge in vetrina, obiettivi.
 * Di base è quello della dashboard (server principale); con guildId è quello di un altro server (profilo del sito).
 */
export function PartnerProfile({
  token,
  onToast,
  guildId = null,
  prefsNote = "Valgono quando usi Vinili sul server principale.",
}: {
  token: string;
  onToast: (m: string, err?: boolean) => void;
  guildId?: string | null;
  prefsNote?: string;
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

  if (hidden) return null;
  if (!profile) return <div className="h-48 animate-pulse rounded-2xl bg-crema/[0.04]" aria-busy />;

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

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={<Handshake />} tone="accent" label="Partnership totali" value={profile.scores.total.toLocaleString("it-IT")} />
        <StatTile icon={<Handshake />} label="Questa settimana" value={profile.scores.weekly.toLocaleString("it-IT")} />
        <StatTile icon={<Handshake />} label="Oggi" value={profile.scores.daily.toLocaleString("it-IT")} />
      </div>

      <Panel icon={<Settings2 />} title="Preferenze del bot" description={prefsNote}>
        <div className="divide-y divide-sand/[0.07] sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0 lg:grid-cols-3">
          <SettingRow title="Niente ping nelle mie partnership" description="Quando sei tu il manager, il messaggio di partnership non ti menziona.">
            <Toggle
              size="sm"
              checked={profile.prefs.suppressManagerPing}
              disabled={busy}
              label="Niente ping nelle mie partnership"
              onChange={(v) => void patch({ suppressManagerPing: v }, "Preferenza salvata.")}
            />
          </SettingRow>
          <SettingRow title="Risposte dei comandi solo per me" description="Le risposte dei comandi partnership le vedi solo tu.">
            <Toggle
              size="sm"
              checked={profile.prefs.ephemeralCommands}
              disabled={busy}
              label="Risposte dei comandi solo per me"
              onChange={(v) => void patch({ ephemeralCommands: v }, "Preferenza salvata.")}
            />
          </SettingRow>
          {profile.languages.length ? (
            <SettingRow title="Lingua del bot" description="Lingua dei messaggi che il bot ti manda.">
              <Select
                aria-label="Lingua del bot"
                size="sm"
                value={profile.prefs.language}
                disabled={busy}
                onChange={(v) => void patch({ language: v }, "Lingua salvata.")}
                options={profile.languages.map((l) => ({ value: l.code, label: `${l.flag} ${l.label}`.trim() }))}
                className="min-w-36"
              />
            </SettingRow>
          ) : null}
        </div>
      </Panel>

      <Panel
        icon={<Award />}
        title="Badge in vetrina"
        description={`Scegline fino a ${profile.maxSelectedBadges}: compaiono accanto al tuo nome nelle partnership.`}
        aside={<span className="text-xs tabular-nums text-crema/60">{selectedCount}/{profile.maxSelectedBadges}</span>}
      >
        {unlocked.length === 0 ? (
          <p className="text-sm text-crema/60">Nessun badge sbloccato: completa gli obiettivi per averne.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {profile.badges.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={!b.unlocked || busy}
                  aria-pressed={b.selected}
                  onClick={() => void patch({ toggleBadgeId: b.id }, b.selected ? "Badge tolto dalla vetrina." : "Badge in vetrina.")}
                  title={b.desc || b.title}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left ring-1 transition",
                    b.selected ? "bg-caramel/12 ring-caramel/45" : "bg-espresso/45 ring-sand/10 hover:ring-sand/25",
                    !b.unlocked && "opacity-45",
                  )}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-crema/[0.06]", !b.unlocked && "grayscale")}>
                    <Emoji e={b.emoji} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-crema">{b.unlocked ? b.title : "Bloccato"}</span>
                    <span className="block truncate text-xs text-crema/60">{b.unlocked ? b.desc || "Sbloccato" : "Completa un obiettivo"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {profile.qualifiesForMissions && profile.objectives.length ? (
        <Panel
          icon={<Target />}
          title="Obiettivi"
          description="Completandoli sblocchi i badge."
          aside={<span className="text-xs tabular-nums text-crema/60">{Math.round(profile.awardsPercent)}% fatto</span>}
        >
          <ul className="grid gap-2 md:grid-cols-2">
            {profile.objectives.map((o) => {
              const pct = Math.min(100, Math.round((o.current / o.target) * 100));
              return (
                <li key={o.id} className="flex items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-crema/[0.06]">
                    <Emoji e={o.emoji} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center justify-between gap-2 text-sm font-semibold text-crema">
                      <span className="truncate">{o.title}</span>
                      <span className={cn("shrink-0 text-xs tabular-nums", o.done ? "text-[#9fd0a8] light:text-[#2f6b3f]" : "text-crema/60")}>
                        {o.done ? "Fatto" : `${Math.min(o.current, o.target)}/${o.target}`}
                      </span>
                    </p>
                    {o.desc ? <p className="truncate text-xs text-crema/60">{o.desc}</p> : null}
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-crema/[0.08]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={o.title}>
                      <div className={cn("h-full rounded-full", o.done ? "bg-[#7fc48c]" : "bg-caramel")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
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
    <DashboardShell title="Profilo" lead="Il tuo account, le preferenze del bot e i tuoi dati.">
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
          <PartnerProfile token={token} onToast={onToast} />
          <PrivacyPanel token={token} onToast={onToast} />
        </motion.div>
      )}
      <DashToast toast={toast} />
    </DashboardShell>
  );
}
