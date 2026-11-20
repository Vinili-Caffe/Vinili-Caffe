"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Bot, Check, ChevronDown, Inbox, LogIn, Pause, Server, Shield, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { kindLabel, labelOf, loadBoardsConfig, modDecide, modListPending, type BoardListing, type BoardsConfig } from "@/lib/boards";
import { timeAgo } from "@/lib/time";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { promptDialog, showToast } from "@/components/ui";
import { SmartLink } from "../SmartLink";
import { DiscordContent } from "../discord/DiscordContent";

const TABS = [
  { id: "pending", label: "In revisione" },
  { id: "rejected", label: "Rifiutate" },
  { id: "suspended", label: "Sospese" },
  { id: "approved", label: "Pubblicate" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Coda di moderazione della vetrina (solo staff). */
export function ModQueue() {
  const { ready, token, login } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [list, setList] = useState<BoardListing[] | null>(null);
  const [cfg, setCfg] = useState<BoardsConfig | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(() => {
    if (!ready || !token) return;
    setErr("");
    setList(null);
    void modListPending(token, tab).then((r) => {
      if (!r.ok) {
        setErr(r.message);
        setList([]);
        return;
      }
      setList(r.data.listings || []);
    });
  }, [ready, token, tab]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (ready) void loadBoardsConfig("", token).then((c) => c && setCfg(c));
  }, [ready, token]);

  if (ready && !token) {
    return (
      <section className="mx-auto max-w-md px-6 pb-28 text-center">
        <Shield className="mx-auto size-12 text-caramel" />
        <p className="mt-4 font-display text-4xl">Area staff</p>
        <p className="mt-2 text-crema/60">La coda di moderazione è riservata allo staff. Accedi con Discord.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi
        </button>
      </section>
    );
  }

  async function decide(item: BoardListing, decision: "approve" | "reject" | "suspend", notes = "") {
    if (!token) return;
    let reason = "";
    if (decision !== "approve") {
      reason =
        (await promptDialog({
          title: decision === "reject" ? `Rifiuta “${item.name}”` : `Sospendi “${item.name}”`,
          inputLabel: "Motivo (lo vede il proprietario)",
          placeholder: decision === "reject" ? "Cosa deve correggere per essere approvata?" : "Perché la sospendi?",
          multiline: true,
        })) || "";
      if (reason.trim().length < 3) return;
    }
    setBusy(item.id + decision);
    const r = await modDecide(token, item.id, decision, reason.trim(), notes.trim());
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || (decision === "approve" ? `“${item.name}” è in vetrina` : decision === "reject" ? "Scheda rifiutata" : "Scheda sospesa"));
    setList((prev) => (prev ? prev.filter((x) => x.id !== item.id) : prev));
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pb-28 sm:px-6">
      <div className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              tab === t.id ? "bg-crema text-ink" : "bg-roast text-crema/55 ring-1 ring-sand/12 hover:text-crema",
            )}
          >
            {t.label}
            {tab === t.id && list ? <span className="ml-1.5 rounded-full bg-ink/15 px-1.5 text-xs tabular-nums">{list.length}</span> : null}
          </button>
        ))}
      </div>

      {err && <p className="mb-4 rounded-xl bg-ember/10 p-3 text-sm text-ember ring-1 ring-ember/25">{err}</p>}

      {!list ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-3xl bg-roast/60" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-sand/20 p-12 text-center">
          <Inbox className="mx-auto size-10 text-sand/40" />
          <p className="mt-3 font-display text-3xl text-crema/85">{tab === "pending" ? "Coda vuota" : "Niente qui"}</p>
          <p className="mt-1 text-crema/50">{tab === "pending" ? "Nessuna scheda da controllare. Ottimo lavoro." : "Nessuna scheda in questo stato."}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {list.map((item) => (
              <ModCard key={item.id} item={item} cfg={cfg} tab={tab} busy={busy} onDecide={decide} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function ModCard({
  item,
  cfg,
  tab,
  busy,
  onDecide,
}: {
  item: BoardListing;
  cfg: BoardsConfig | null;
  tab: Tab;
  busy: string;
  onDecide: (item: BoardListing, d: "approve" | "reject" | "suspend", notes?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mod = item.moderation;
  /* nota interna: la vede solo lo staff, parte con la decisione */
  const [notes, setNotes] = useState(mod?.notes || "");
  const accent = /^#[0-9a-f]{6}$/i.test(item.accent || "") ? item.accent : "#d99a5b";
  const invite = item.kind === "bot" ? item.botInviteUrl : item.inviteUrl;
  const KindIcon = item.kind === "bot" ? Bot : Server;
  const reason = item.moderation?.rejectReason;
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className="overflow-hidden rounded-3xl bg-roast ring-1 ring-sand/12">
      <div className="h-2" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-sand/20" style={{ background: `${accent}44` }}>
            {item.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.iconUrl} alt="" className="size-full object-cover" />
            ) : (
              <KindIcon className="size-7 text-crema/60" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">
              <KindIcon className="size-3.5" /> {kindLabel(item.kind)}
              {item.nsfw && <span className="rounded bg-[#a83a2c] px-1.5 tracking-wider text-crema">18+</span>}
              {item.updatedAt ? <span className="normal-case tracking-normal text-crema/35">· aggiornata {timeAgo(item.updatedAt)}</span> : null}
            </p>
            <p className="mt-0.5 font-display text-3xl font-semibold leading-tight">{item.name || "Senza nome"}</p>
            {item.tagline && <p className="mt-1 text-crema/65">{item.tagline}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {item.categories.map((c) => (
                <span key={c} className="rounded-full bg-crema/8 px-2 py-0.5 ring-1 ring-sand/12">
                  {labelOf(cfg?.categoryLabels, c)}
                </span>
              ))}
              {item.locales.map((l) => (
                <span key={l} className="rounded-full bg-crema/5 px-2 py-0.5 text-crema/55 ring-1 ring-sand/10">
                  {labelOf(cfg?.localeLabels, l)}
                </span>
              ))}
              {item.tags.slice(0, 8).map((t) => (
                <span key={t} className="text-crema/45">
                  #{t}
                </span>
              ))}
            </div>
          </div>
          {(item.authorName || item.authorAvatarUrl) && (
            <div className="flex items-center gap-2 text-sm">
              {item.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.authorAvatarUrl} alt="" className="size-8 rounded-full object-cover" />
              ) : null}
              <span className="text-crema/60">{item.authorName}</span>
            </div>
          )}
        </div>

        {reason && tab !== "pending" && <p className="mt-4 rounded-xl bg-ember/10 p-3 text-sm text-ember ring-1 ring-ember/20">Motivo: {reason}</p>}

        {mod?.reviewedAt ? (
          <p className="mt-3 text-xs text-crema/45">
            Ultima revisione {timeAgo(mod.reviewedAt)}
            {mod.reviewedBy ? <span className="font-mono text-crema/35"> · staff {mod.reviewedBy}</span> : null}
          </p>
        ) : null}

        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-crema/55 hover:text-crema">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /> {open ? "Nascondi descrizione" : "Leggi la descrizione"}
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 max-h-96 overflow-y-auto rounded-2xl bg-espresso/60 p-4 text-sm leading-relaxed text-crema/80 ring-1 ring-sand/10">
                {item.description ? <DiscordContent text={item.description} /> : <span className="text-crema/40">Nessuna descrizione.</span>}
                {item.visitorNotes ? <p className="mt-3 border-t border-sand/10 pt-3 text-crema/60">Note: {item.visitorNotes}</p> : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-crema/45">Nota interna · solo staff</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder="Appunti per gli altri dello staff (il proprietario non la vede)"
            className="mt-1.5 w-full resize-y rounded-xl bg-espresso/60 px-3 py-2 text-sm text-crema/85 ring-1 ring-sand/15 outline-none placeholder:text-crema/30 focus:ring-caramel/50"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand/10 pt-4">
          {tab !== "approved" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onDecide(item, "approve", notes)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#5f9a6a]/25 px-4 py-2 text-sm font-bold text-[#a7d8b0] ring-1 ring-[#5f9a6a]/45 transition hover:bg-[#5f9a6a]/35 disabled:opacity-50"
            >
              <Check className="size-4" /> Approva
            </button>
          )}
          {tab === "pending" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onDecide(item, "reject", notes)}
              className="inline-flex items-center gap-1.5 rounded-full bg-ember/15 px-4 py-2 text-sm font-bold text-ember ring-1 ring-ember/30 transition hover:bg-ember/25 disabled:opacity-50"
            >
              <X className="size-4" /> Rifiuta
            </button>
          )}
          {tab !== "suspended" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onDecide(item, "suspend", notes)}
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema/70 ring-1 ring-sand/20 transition hover:text-crema disabled:opacity-50"
            >
              <Pause className="size-4" /> Sospendi
            </button>
          )}
          <span className="ml-auto flex flex-wrap gap-3 text-sm">
            {invite ? (
              <a href={invite} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-crema/55 hover:text-ember">
                Invito <ArrowUpRight className="size-3.5" />
              </a>
            ) : (
              <span className="text-crema/35">Nessun invito</span>
            )}
            {item.slug && (
              <SmartLink href={page(`/vetrina/scheda/?slug=${encodeURIComponent(item.slug)}`)} className="inline-flex items-center gap-1 text-crema/55 hover:text-ember">
                Apri scheda <ArrowUpRight className="size-3.5" />
              </SmartLink>
            )}
          </span>
        </div>
      </div>
    </motion.li>
  );
}
