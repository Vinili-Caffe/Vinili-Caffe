"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Cake,
  Disc3,
  IdCard,
  Loader2,
  Lock,
  LogIn,
  MessageSquare,
  Mic,
  Palette,
  Smile,
  Star,
  Tags,
} from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SmartLink } from "@/components/SmartLink";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
import {
  EXTRAS_TABS,
  PERS_TABS,
  loadCustomProfile,
  loadProfileExtras,
  loadRankCard,
  parsePersTab,
  type CustomProfileState,
  type PersTab,
  type ProfileExtras,
  type RankCardState,
} from "@/lib/personalizza";
import { CustomChannel } from "./CustomChannel";
import { ExtrasPanel } from "./ExtrasPanel";
import { RankDeck } from "./RankDeck";

const TAB_ICON: Record<PersTab, React.ReactNode> = {
  rank: <IdCard className="size-3.5" />,
  primary: <Star className="size-3.5" />,
  secondary: <Star className="size-3.5 opacity-60" />,
  voice: <Mic className="size-3.5" />,
  roles: <Tags className="size-3.5" />,
  birthday: <Cake className="size-3.5" />,
  privacy: <Lock className="size-3.5" />,
  reactions: <Smile className="size-3.5" />,
  response: <MessageSquare className="size-3.5" />,
};

/** Cabina DJ: mixer a canali (tab) per personalizzare profilo e rank card. */
export function PersonalizzaBoard() {
  const { ready, token, user, login } = useAuth();
  const search = useSearchParams();
  const [tab, setTab] = useState<PersTab>("rank");
  const [rank, setRank] = useState<RankCardState | null>(null);
  const [custom, setCustom] = useState<CustomProfileState | null>(null);
  const [extras, setExtras] = useState<ProfileExtras | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  const onToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const longer = /\+rank/i.test(toast.msg);
    const t = window.setTimeout(() => setToast(null), longer ? 5200 : 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setTab(parsePersTab(search.get("target") || search.get("tab") || search.get("slot")));
  }, [search]);

  // come nel vecchio: ?id= di un altro utente → profilo pubblico
  useEffect(() => {
    if (!user?.id) return;
    const raw = String(search.get("id") || search.get("userId") || "").trim();
    if (/^\d{17,20}$/.test(raw) && raw !== user.id) {
      window.location.replace(page(`/user/?id=${encodeURIComponent(raw)}`));
    }
  }, [search, user?.id]);

  function syncUrl(next: PersTab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("target", next);
      if (user?.id) url.searchParams.set("id", user.id);
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash || ""}`);
    } catch {}
  }

  useEffect(() => {
    if (!token) {
      setRank(null);
      setCustom(null);
      setExtras(null);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      const [rRank, rCustom, rExtras] = await Promise.all([
        loadRankCard(token),
        loadCustomProfile(token),
        loadProfileExtras(token),
      ]);
      if (cancelled) return;
      if (rRank.ok) setRank(rRank.data);
      else setError(rRank.message);
      if (rCustom.ok) setCustom(rCustom.data);
      else if (!rRank.ok) setError(rCustom.message);
      if (rExtras.ok) setExtras(rExtras.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const backHref = user?.id ? page(`/user/?id=${encodeURIComponent(user.id)}`) : page("/user/");
  /* fuori dal server principale: solo il compleanno, che vale in tutti i server */
  const outsider = extras?.inGuild === false;
  const shownTab: PersTab = outsider ? "birthday" : tab;
  const tabs = outsider ? PERS_TABS.filter((t) => t.id === "birthday") : PERS_TABS;

  if (!ready) {
    return (
      <div className="mx-auto max-w-5xl px-6 pb-20">
        <div className="h-40 animate-pulse rounded-3xl bg-roast/50 ring-1 ring-sand/10" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-24">
        <Reveal>
          <div className="rounded-3xl bg-gradient-to-b from-caramel/15 to-roast p-8 text-center ring-1 ring-caramel/40 shadow-[0_30px_80px_-30px_rgba(212,145,80,0.4)]">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
              <Disc3 className="size-6" />
            </span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Personalizzazione</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">Accedi per continuare</h2>
            <p className="mt-3 text-sm leading-relaxed text-crema/60">
              Collega Discord per regolare colori, wallpaper della rank card, ruoli custom e reazioni.
            </p>
            <ul className="mx-auto mt-5 flex max-w-xs flex-wrap justify-center gap-2 text-xs text-crema/55">
              <li className="rounded-full bg-crema/6 px-3 py-1 ring-1 ring-sand/15">Rank card</li>
              <li className="rounded-full bg-crema/6 px-3 py-1 ring-1 ring-sand/15">Ruoli</li>
              <li className="rounded-full bg-crema/6 px-3 py-1 ring-1 ring-sand/15">Vocale</li>
            </ul>
            <button
              type="button"
              onClick={login}
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-semibold text-ink transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
            >
              <LogIn className="size-4" /> Accedi con Discord
            </button>
          </div>
        </Reveal>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 pb-24">
      <Reveal>
        <div className="overflow-hidden rounded-[1.75rem] bg-roast/80 ring-1 ring-sand/15">
          <div className="flex items-center gap-3 border-b border-sand/10 bg-gradient-to-r from-mocha/80 to-roast px-4 py-3 sm:px-5">
            <SmartLink
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/6 px-3 py-1.5 text-xs font-semibold text-crema/75 ring-1 ring-sand/15 hover:bg-crema/10"
            >
              <ArrowLeft className="size-3.5" /> Profilo
            </SmartLink>
            <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
              <span className="size-2 rounded-full bg-ember/80" />
              <span className="size-2 rounded-full bg-caramel/60" />
              <span className="size-2 rounded-full bg-sand/40" />
            </div>
            <p className="ml-auto flex items-center gap-2 text-xs text-crema/45">
              <Palette className="size-3.5 text-caramel" />
              <span className="hidden sm:inline">Pannello profilo</span>
              <span className="font-mono lining-nums text-crema/60">{user?.username}</span>
            </p>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-2 py-2 sm:flex-wrap sm:overflow-visible sm:px-3" aria-label="Sezioni personalizzazione">
            {tabs.map((t) => {
              const on = shownTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => syncUrl(t.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:text-sm",
                    on
                      ? "bg-caramel text-ink shadow-[0_8px_24px_-12px_rgba(217,154,91,0.8)]"
                      : "bg-crema/[0.04] text-crema/65 ring-1 ring-sand/10 hover:text-crema hover:ring-sand/25",
                  )}
                >
                  {TAB_ICON[t.id]}
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </Reveal>

      {outsider ? (
        <div className="rounded-2xl bg-caramel/10 px-4 py-3 text-sm text-crema/80 ring-1 ring-caramel/25">
          Non sei nel server principale: qui puoi impostare il compleanno, che vale in tutti i server dove c&apos;è il bot. Rank card, ruoli e reazioni sono del server principale.
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-caramel/10 px-4 py-3 text-sm text-crema/80 ring-1 ring-caramel/25">{error}</div>
      ) : null}

      {loading && !rank && !custom && !extras ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl bg-roast/50 py-20 text-sm text-crema/50 ring-1 ring-sand/10">
          <Loader2 className="size-5 animate-spin text-caramel" /> Accordo i livelli…
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={shownTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            {shownTab === "rank" && rank && (
              <RankDeck initial={rank} token={token} onToast={onToast} onThemeSynced={setRank} />
            )}
            {(shownTab === "primary" || shownTab === "secondary" || shownTab === "voice") && custom && (
              <CustomChannel target={shownTab} state={custom} token={token} onState={setCustom} onToast={onToast} />
            )}
            {EXTRAS_TABS.has(shownTab) && extras && (
              <ExtrasPanel
                tab={shownTab as Exclude<PersTab, "rank" | "primary" | "secondary" | "voice">}
                extras={extras}
                token={token}
                onExtras={setExtras}
                onToast={onToast}
              />
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={cn(
              "fixed bottom-6 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ring-1",
              toast.err ? "bg-roast text-crema ring-caramel/40" : "bg-gradient-to-r from-caramel to-ember text-ink ring-caramel/30",
            )}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
