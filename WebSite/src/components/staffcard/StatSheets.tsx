"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, CalendarDays, Check, ExternalLink, Gift, Loader2, Minus, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { confirmDialog, promptDialog, promptPairDialog, showToast } from "@/components/ui";
import {
  PT_STATUS,
  decidePause,
  loadPauseReview,
  loadPuntiTolti,
  loadShop,
  manage,
  pmPoints,
  redeemShop,
  reportPuntiTolti,
  reviewPuntiTolti,
  valTrade,
  type PauseItem,
  type PtItem,
  type ShopRedeem,
  type StaffCard,
} from "@/lib/staffCard";
import { cn } from "@/lib/cn";
import { ReasonRow } from "./Sheet";

type Ctx = {
  token: string;
  userId: string;
  card: StaffCard;
  isHighStaff: boolean;
  canReportPuntiTolti: boolean;
  actions: Set<string>;
  onChanged: () => void;
};

/** Esegue un'azione, mostra l'esito e ricarica la scheda. */
function useRun(onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (p: () => Promise<{ ok: boolean; message?: string; data?: { message?: string } }>, okMsg: string) => {
      setBusy(true);
      const r = await p();
      setBusy(false);
      if (!r.ok) return showToast((r as { message: string }).message || "Operazione non riuscita.", true), false;
      showToast(r.data?.message || okMsg);
      onChanged();
      return true;
    },
    [onChanged],
  );
  return { busy, run };
}

const askReason = (title: string) => promptDialog({ title, inputLabel: "Motivo", placeholder: "Min. 3 caratteri…", multiline: true, maxLength: 500 }).then((v) => (v && v.trim().length >= 3 ? v.trim() : v === null ? null : (showToast("Serve un motivo di almeno 3 caratteri.", true), null)));

const btn = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50";

/* ── valutazioni positive / negative ── */

export function ValSheet({ ctx, kind }: { ctx: Ctx; kind: "pos" | "neg" }) {
  const { card, token, userId, isHighStaff, actions } = ctx;
  const { busy, run } = useRun(ctx.onChanged);
  const entries = kind === "pos" ? card.valutazioni.positiveEntries : card.valutazioni.negativeEntries;
  const label = kind === "pos" ? "valutazione positiva" : "valutazione negativa";
  const canAdd = actions.has(kind === "pos" ? "val_pos" : "val_neg") && !card.isSelf;
  const canRm = actions.has(kind === "pos" ? "val_pos_rm" : "val_neg_rm") && !card.isSelf;
  const positives = card.valutazioni.positive;

  const add = async () => {
    const reason = await askReason(`Aggiungi ${label}`);
    if (reason) run(() => manage(token, { action: kind === "pos" ? "val_pos" : "val_neg", userId, reason }), "Valutazione aggiunta.");
  };
  const rm = async (id: number) => {
    if (!(await confirmDialog({ title: `Rimuovere la ${label} #${id}?`, danger: true, confirmLabel: "Rimuovi" }))) return;
    run(() => manage(token, { action: kind === "pos" ? "val_pos_rm" : "val_neg_rm", userId, removeId: id }), "Valutazione rimossa.");
  };
  // val − tolta scambiando 3 val + (anche lo staffer sul proprio profilo)
  const compensate = async (id: number) => {
    if (positives < 3) return showToast(`Servono almeno 3 val + per compensare (ora: ${positives}).`, true);
    if (!(await confirmDialog({ title: `Scambiare 3 val + per rimuovere la val − #${id}?`, confirmLabel: "Compensa" }))) return;
    run(() => valTrade(token, { action: "neg_trade", userId, negativeId: id }), "Valutazione compensata.");
  };
  // HS: val + → giorni di pausa
  const toPause = async () => {
    const n = await promptDialog({ title: "Valutazioni positive → pausa", inputLabel: "Quante val + scambiare", placeholder: "es. 3", maxLength: 3 });
    const posCount = Number.parseInt(String(n || ""), 10);
    if (!n) return;
    const d = await promptDialog({ title: "Valutazioni positive → pausa", inputLabel: "Giorni di pausa da aggiungere", placeholder: "es. 2", maxLength: 3 });
    const pauseDays = Number.parseInt(String(d || ""), 10);
    if (!Number.isInteger(posCount) || posCount < 1 || !Number.isInteger(pauseDays) || pauseDays < 1)
      return showToast("Inserisci un numero valido di valutazioni positive e giorni (≥ 1).", true);
    if (posCount > positives) return showToast(`Ne ha solo ${positives}.`, true);
    run(() => valTrade(token, { action: "pos_pause_trade", userId, positiveCount: posCount, pauseDays }), "Scambio fatto.");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {canAdd && (
          <button type="button" disabled={busy} onClick={add} className={cn(btn, kind === "pos" ? "bg-[#3f7d4e] text-crema" : "bg-[#a83a2c] text-crema")}>
            <Plus className="size-4" /> Aggiungi {label}
          </button>
        )}
        {kind === "pos" && isHighStaff && !card.isSelf && positives > 0 && (
          <button type="button" disabled={busy} onClick={toPause} className={cn(btn, "bg-crema/8 ring-1 ring-sand/25 hover:bg-crema/12")}>
            <ArrowLeftRight className="size-4" /> Scambia in giorni di pausa
          </button>
        )}
      </div>
      <ul className="mt-5 space-y-2">
        {entries.length === 0 && <li className="text-sm text-crema/50">Nessuna {label}.</li>}
        {entries.map((e) => (
          <ReasonRow key={e.id} id={e.id} text={e.text}>
            {kind === "neg" && (card.isSelf || isHighStaff) && (
              <button type="button" disabled={busy} onClick={() => compensate(e.id)} title="Scambia 3 val + per rimuovere questa val −" className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-caramel hover:bg-caramel/15">
                Compensa
              </button>
            )}
            {canRm && (
              <button type="button" disabled={busy} onClick={() => rm(e.id)} aria-label={`Rimuovi #${e.id}`} className="shrink-0 rounded-full p-1.5 text-crema/45 hover:bg-[#a83a2c]/20 hover:text-[#f0a493]">
                <Trash2 className="size-4" />
              </button>
            )}
          </ReasonRow>
        ))}
      </ul>
    </div>
  );
}

/* ── warn staff ── */

export function WarnSheet({ ctx }: { ctx: Ctx }) {
  const { card, token, userId, actions } = ctx;
  const { busy, run } = useRun(ctx.onChanged);
  const canAdd = actions.has("warn_add") && !card.isSelf;
  const canRm = actions.has("warn_rm") && !card.isSelf;

  const add = async () => {
    const reason = await askReason("Assegna warn staff");
    if (reason) run(() => manage(token, { action: "warn_add", userId, reason }), "Warn assegnato.");
  };
  const rm = async (id: number) => {
    if (!(await confirmDialog({ title: `Rimuovere il warn staff #${id}?`, danger: true, confirmLabel: "Rimuovi" }))) return;
    // scambio facoltativo di val + insieme alla rimozione (come sul sito vecchio)
    let positiveTradeCount = 0;
    if (card.valutazioni.positive > 0) {
      const n = await promptDialog({
        title: "Scambio opzionale",
        message: `Quante val + usare per togliere il warn #${id}? Lascia vuoto per nessuna (ne ha ${card.valutazioni.positive}).`,
        inputLabel: "Val + da scambiare",
        placeholder: "0",
        maxLength: 3,
      });
      if (n === null) return;
      positiveTradeCount = n.trim() ? Number.parseInt(n, 10) : 0;
      if (!Number.isInteger(positiveTradeCount) || positiveTradeCount < 0) return showToast("Inserisci un intero ≥ 0, oppure lascia vuoto.", true);
      if (positiveTradeCount > card.valutazioni.positive) return showToast(`Non ci sono abbastanza val + (ne ha ${card.valutazioni.positive}).`, true);
    }
    run(() => manage(token, { action: "warn_rm", userId, removeId: id, ...(positiveTradeCount ? { positiveTradeCount } : {}) }), "Warn rimosso.");
  };

  return (
    <div>
      {canAdd && (
        <button type="button" disabled={busy} onClick={add} className={cn(btn, "bg-[#a83a2c] text-crema")}>
          <Plus className="size-4" /> Assegna warn staff
        </button>
      )}
      {card.isSelf && card.warn.count > 0 && <p className="mt-3 text-sm text-crema/55">Non puoi toglierti i warn da solo: serve High Staff.</p>}
      <ul className="mt-5 space-y-2">
        {card.warn.entries.length === 0 && <li className="text-sm text-crema/50">Nessun warn staff.</li>}
        {card.warn.entries.map((e) => (
          <ReasonRow key={e.id} id={e.id} text={e.text}>
            {canRm && (
              <button type="button" disabled={busy} onClick={() => rm(e.id)} aria-label={`Rimuovi warn #${e.id}`} className="shrink-0 rounded-full p-1.5 text-crema/45 hover:bg-[#a83a2c]/20 hover:text-[#f0a493]">
                <Trash2 className="size-4" />
              </button>
            )}
          </ReasonRow>
        ))}
      </ul>
    </div>
  );
}

/* ── pause ── */

const PAUSE_TONE: Record<string, string> = {
  pending: "bg-ember/15 text-ember ring-ember/30",
  accepted: "bg-[#3f7d4e]/20 text-[#9fd3ac] light:text-[#2f6b3f] ring-[#3f7d4e]/40",
  rejected: "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c] ring-[#a83a2c]/30",
  cancelled: "bg-crema/8 text-crema/55 ring-sand/20",
};

export function PauseSheet({ ctx }: { ctx: Ctx }) {
  const { card, token, userId, isHighStaff } = ctx;
  const { busy, run } = useRun(ctx.onChanged);
  const [items, setItems] = useState<PauseItem[] | null>(null);
  const q = card.pause.quota;

  const load = useCallback(() => {
    if (!isHighStaff) return setItems(card.pause.history as PauseItem[]);
    loadPauseReview(token, userId).then((r) => setItems(r.ok ? r.data.items : (card.pause.history as PauseItem[])));
  }, [isHighStaff, token, userId, card.pause.history]);
  useEffect(load, [load]);

  const decide = async (it: PauseItem, action: "accept" | "reject" | "cancel") => {
    const id = String(it.pauseId || it.id || "");
    const title = action === "accept" ? "Accettare questa richiesta di pausa?" : action === "reject" ? "Rifiutare questa richiesta di pausa?" : "Annullare questa pausa?";
    if (!(await confirmDialog({ title, danger: action !== "accept", confirmLabel: action === "accept" ? "Accetta" : action === "reject" ? "Rifiuta" : "Annulla pausa" }))) return;
    if (card.isSelf && action === "cancel") {
      return run(() => manage(token, { action: "pause_cancel", userId, pauseId: id, confirmCancel: true }), "Pausa annullata.");
    }
    run(() => decidePause(token, userId, id, action), action === "accept" ? "Pausa accettata." : action === "reject" ? "Pausa rifiutata." : "Pausa annullata.").then((ok) => { if (ok) void load(); });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { v: q.remaining, l: "rimanenti" },
          { v: q.used, l: "usati" },
          { v: q.max, l: "totali" },
        ].map((x) => (
          <div key={x.l} className="rounded-2xl bg-crema/[0.04] p-3 ring-1 ring-sand/10">
            <p className="font-display text-3xl font-semibold lining-nums">{x.v}</p>
            <p className="text-xs text-crema/50">giorni {x.l}</p>
          </div>
        ))}
      </div>
      {(q.bonus > 0 || (q.tradedBonus ?? 0) > 0) && (
        <p className="text-sm text-crema/55 lining-nums">
          Base {q.base} giorni{q.bonus ? ` · +${q.bonus} bonus` : ""}
          {q.tradedBonus ? ` · +${q.tradedBonus} da val +` : ""}
        </p>
      )}
      <a href="/staff/pause/" className="inline-flex items-center gap-2 text-sm font-semibold text-caramel hover:text-ember">
        <CalendarDays className="size-4" /> Calendario pause dello staff
      </a>

      <ul className="space-y-3">
        {items === null && <li className="h-20 animate-pulse rounded-2xl bg-crema/[0.04]" />}
        {items?.length === 0 && <li className="text-sm text-crema/50">Nessuna pausa.</li>}
        {items?.map((it) => {
          const status = String(it.status || "");
          const canAct = isHighStaff && it.canAct;
          const canCancel = (card.isSelf || isHighStaff) && (status === "pending" || (status === "accepted" && it.phase !== "ended"));
          return (
            <li key={String(it.pauseId || it.id)} data-deeplink={`pauseId:${String(it.pauseId || it.id)}`} className="rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-sand/10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold lining-nums">
                  {it.start} → {it.end}
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", PAUSE_TONE[status] || PAUSE_TONE.cancelled)}>{it.statusLabel}</span>
                {it.ruoloLabel && <span className="text-xs text-crema/45">{it.ruoloLabel.replace(/༄\s*/g, "")}</span>}
              </div>
              {it.motivazione && <p className="mt-1.5 text-sm text-crema/70">{it.motivazione}</p>}
              {(canAct || canCancel) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {canAct && status === "pending" && (
                    <>
                      <button type="button" disabled={busy} onClick={() => decide(it, "accept")} className={cn(btn, "bg-[#3f7d4e] text-crema")}>
                        <Check className="size-4" /> Accetta
                      </button>
                      <button type="button" disabled={busy} onClick={() => decide(it, "reject")} className={cn(btn, "bg-[#a83a2c] text-crema")}>
                        <X className="size-4" /> Rifiuta
                      </button>
                    </>
                  )}
                  {canCancel && (
                    <button type="button" disabled={busy} onClick={() => decide(it, "cancel")} className={cn(btn, "bg-crema/8 ring-1 ring-sand/25")}>
                      Annulla pausa
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── punti PM + shop ── */

export function PmSheet({ ctx }: { ctx: Ctx }) {
  const { card, token, userId, isHighStaff } = ctx;
  const { busy, run } = useRun(ctx.onChanged);
  const [history, setHistory] = useState<ShopRedeem[] | null>(null);
  const p = card.partner!;
  const tiers = p.shop?.tiers ?? [];

  useEffect(() => {
    loadShop(token, userId).then((r) => setHistory(r.ok ? r.data.items : []));
  }, [token, userId, card]);

  const points = async (add: boolean) => {
    const n = await promptDialog({ title: add ? "Aggiungi punti PM" : "Togli punti PM", inputLabel: "Quantità (1–500)", placeholder: "es. 10", maxLength: 3 });
    if (!n) return;
    const amount = Number.parseInt(n, 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 500) return showToast("Quantità punti tra 1 e 500.", true);
    if (add) {
      const reason = await askReason("Motivo dell'aggiunta");
      if (!reason) return;
      run(() => pmPoints(token, userId, true, amount, reason), "Punti aggiornati.");
      return;
    }
    const pair = await promptPairDialog({
      title: "Togli punti PM",
      inputLabel: "Motivo",
      placeholder: "Min. 3 caratteri…",
      multiline: true,
      maxLength: 500,
      secondInputLabel: "Link messaggio",
      secondPlaceholder: "https://discord.com/channels/… (opzionale → elimina anche partnership)",
      secondMaxLength: 200,
      secondRequired: false,
    });
    if (!pair) return;
    const reason = pair.value.trim();
    if (reason.length < 3) return showToast("Serve un motivo di almeno 3 caratteri.", true);
    const messageLink = pair.second.trim();
    run(() => pmPoints(token, userId, false, amount, reason, messageLink || undefined), "Punti aggiornati.");
  };
  const redeem = async (tier: number, reward: string, cost: number) => {
    if (!(await confirmDialog({ title: `Riscattare "${reward}"?`, message: `Costa ${cost} punti PM. Riscatto manuale High Staff (sito).`, confirmLabel: "Riscatta" }))) return;
    run(() => redeemShop(token, userId, tier), "Premio riscattato.");
  };

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { v: p.points, l: "Punti PM" },
          { v: p.partnerCount, l: "Partner" },
          { v: p.redeemSpend, l: "Spesi in shop" },
        ].map((x) => (
          <div key={x.l} className="rounded-2xl bg-crema/[0.04] p-3 ring-1 ring-sand/10">
            <p className="font-display text-3xl font-semibold lining-nums">{x.v}</p>
            <p className="text-xs text-crema/50">{x.l}</p>
          </div>
        ))}
      </div>

      {isHighStaff && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => points(true)} className={cn(btn, "bg-[#3f7d4e] text-crema")}>
            <Plus className="size-4" /> Aggiungi punti
          </button>
          <button type="button" disabled={busy} onClick={() => points(false)} className={cn(btn, "bg-[#a83a2c] text-crema")}>
            <Minus className="size-4" /> Togli punti
          </button>
        </div>
      )}

      <section>
        <h3 className="font-display text-xl font-semibold">Shop PM</h3>
        {p.shop?.discountBanner && <p className="mt-1 text-sm text-ember">{p.shop.discountBanner}</p>}
        <ul className="mt-3 space-y-2">
          {tiers.map((t) => (
            <li key={t.tier} className="flex items-center gap-3 rounded-xl bg-crema/[0.04] px-3 py-2.5 ring-1 ring-sand/10">
              <Gift className="size-4 shrink-0 text-caramel" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{t.reward}</span>
                {t.blocked && t.blockedReason && <span className="block text-xs text-crema/45">{t.blockedReason}</span>}
              </span>
              <span className="shrink-0 font-semibold lining-nums">
                {t.discountActive && t.baseCost && t.baseCost !== t.cost && <s className="mr-1 text-xs text-crema/40">{t.baseCost}</s>}
                {t.cost} pt
              </span>
              {isHighStaff && (
                <button type="button" disabled={busy || t.blocked || p.points < t.cost} onClick={() => redeem(t.tier, t.reward, t.cost)} className={cn(btn, "bg-caramel/15 px-3 py-1 text-xs text-ember ring-1 ring-caramel/30 disabled:opacity-35")}>
                  Riscatta
                </button>
              )}
            </li>
          ))}
        </ul>
        {!isHighStaff && card.isSelf && <p className="mt-2 text-xs text-crema/45">Per riscattare un premio apri un ticket allo staff.</p>}
      </section>

      <section>
        <h3 className="font-display text-xl font-semibold">Storico riscatti shop</h3>
        <ul className="mt-3 space-y-2">
          {history === null && <li className="h-14 animate-pulse rounded-xl bg-crema/[0.04]" />}
          {history?.length === 0 && <li className="text-sm text-crema/50">Nessun riscatto.</li>}
          {history?.map((h) => (
            <li key={h.id} className="rounded-xl bg-crema/[0.04] px-3 py-2.5 text-sm ring-1 ring-sand/10">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{h.rewardLabel}</span>
                <span className="shrink-0 lining-nums text-crema/60">−{h.pointCost} pt</span>
              </div>
              <p className="mt-0.5 text-xs text-crema/45 lining-nums">
                {new Date(h.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
                {h.pointsBefore != null && h.pointsAfter != null ? ` · ${h.pointsBefore} → ${h.pointsAfter}` : ""}
                {h.reason ? ` · ${h.reason}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ── punti tolti ── */

const PT_TONE: Record<string, string> = {
  pending: "bg-ember/15 text-ember",
  confirmed: "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c]",
  denied: "bg-[#3f7d4e]/20 text-[#9fd3ac] light:text-[#2f6b3f]",
  logged: "bg-crema/8 text-crema/55",
};

export function PtSheet({ ctx }: { ctx: Ctx }) {
  const { token, userId, canReportPuntiTolti } = ctx;
  const { busy, run } = useRun(ctx.onChanged);
  const [items, setItems] = useState<PtItem[] | null>(null);
  const load = useCallback(() => loadPuntiTolti(token, userId).then((r) => setItems(r.ok ? r.data.items : [])), [token, userId]);
  useEffect(() => void load(), [load]);

  const createReport = async () => {
    const pair = await promptPairDialog({
      title: "Regola violata",
      inputLabel: "Motivo",
      placeholder: "Min. 3 caratteri…",
      multiline: true,
      maxLength: 500,
      secondInputLabel: "Link messaggio",
      secondPlaceholder: "https://discord.com/channels/…",
      secondMaxLength: 200,
      secondRequired: true,
    });
    if (!pair) return;
    const rule = pair.value.trim();
    if (rule.length < 3) return showToast("Serve un motivo di almeno 3 caratteri.", true);
    const messageLink = pair.second.trim();
    if (!messageLink) return showToast("Serve il link del messaggio partner.", true);
    run(() => reportPuntiTolti(token, userId, rule, messageLink), "Segnalazione inviata.").then((ok) => {
      if (ok) void load();
    });
  };

  return (
    <div className="space-y-4">
      {canReportPuntiTolti && (
        <button type="button" disabled={busy} onClick={() => void createReport()} className={cn(btn, "bg-ember/20 text-ember ring-1 ring-ember/30")}>
          <ShieldAlert className="size-4" /> Nuova segnalazione
        </button>
      )}
      <ul className="space-y-3">
        {items === null && <li className="h-20 animate-pulse rounded-2xl bg-crema/[0.04]" />}
        {items?.length === 0 && <li className="text-sm text-crema/50">Nessun punto tolto.</li>}
        {items?.map((it) => (
          <li key={it.messageId} className="rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-sand/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{it.rule}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", PT_TONE[it.status] || PT_TONE.logged)}>{PT_STATUS[it.status] || "Registrata"}</span>
              <span className="ml-auto text-xs text-crema/45 lining-nums">{new Date(it.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</span>
            </div>
            {it.reporter && (
              <p className="mt-2 flex items-center gap-2 text-xs text-crema/55">
                <Avatar src={it.reporter.avatarUrl} name={it.reporter.displayName} className="size-5 text-[0.55rem]" /> Segnalato da {it.reporter.displayName}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {it.messageLink && (
                <a href={it.messageLink} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-caramel hover:text-ember">
                  <ExternalLink className="size-3.5" /> Messaggio
                </a>
              )}
              {it.invite && (
                <a href={it.invite} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-caramel hover:text-ember">
                  <ExternalLink className="size-3.5" /> Invito
                </a>
              )}
            </div>
            {it.canReview && it.status === "pending" && (
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} onClick={() => run(() => reviewPuntiTolti(token, it.messageId, true), "Punto tolto confermato.").then((ok) => { if (ok) void load(); })} className={cn(btn, "bg-[#a83a2c] text-crema")}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Conferma
                </button>
                <button type="button" disabled={busy} onClick={() => run(() => reviewPuntiTolti(token, it.messageId, false), "Punto tolto negato.").then((ok) => { if (ok) void load(); })} className={cn(btn, "bg-crema/8 ring-1 ring-sand/25")}>
                  Nega
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { Ctx as StatCtx };
