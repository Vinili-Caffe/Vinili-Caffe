"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Feather, Loader2, LogIn, Trash2 } from "lucide-react";
import { clearDraft, useFormDraft } from "@/components/ui/form-drafts";
import { deleteReview, submitReview, MAX_LEN, MIN_LEN, type Review, type ReviewKind, type Staffer, type Viewer } from "@/lib/reviews";
import { cn } from "@/lib/cn";
import { Avatar } from "../Avatar";
import { StarPicker } from "./Stars";

type ReviewDraft = { rating: number; content: string; staffId: string };

/** "Lascia la tua firma nel guestbook": scrivi o modifica la tua recensione. */
export function Composer({
  kind,
  token,
  viewer,
  staffers,
  onLogin,
  onSaved,
}: {
  kind: ReviewKind;
  token: string | null;
  viewer: Viewer;
  staffers: Staffer[];
  onLogin: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ReviewDraft>({ rating: 0, content: "", staffId: "" });
  const staffId = form.staffId;
  const rating = form.rating;
  const text = form.content;
  const setStaffId = (id: string) => setForm((f) => ({ ...f, staffId: id }));
  const setRating = (n: number) => setForm((f) => ({ ...f, rating: n }));
  const setText = (c: string) => setForm((f) => ({ ...f, content: c }));
  const existing: Review | null = useMemo(() => {
    if (!viewer) return null;
    if (kind === "server") return viewer.serverReview;
    return viewer.staffReviews.find((r) => r.staffUserId === staffId) ?? null;
  }, [viewer, kind, staffId]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const draft = useFormDraft(`reviews:${kind}`, form, setForm, {
    watch: true,
    enabled: !existing,
    debounceMs: 280,
    isEmpty: (d) => !d.content.trim() && !d.rating && !d.staffId,
  });

  // la tua recensione esistente si carica nel modulo, pronta da modificare
  useEffect(() => {
    if (existing) {
      setForm((f) => ({ ...f, rating: existing.rating, content: existing.content }));
      clearDraft(`reviews:${kind}`);
    }
    setConfirmDel(false);
  }, [existing?.id, existing?.rating, existing?.content, kind]);

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-roast/70 p-8 text-center ring-1 ring-sand/12">
        <Feather className="size-7 text-caramel" />
        <p className="font-display text-2xl">Vuoi lasciare la tua firma?</p>
        <p className="max-w-sm text-sm text-crema/60">Accedi con Discord per scrivere una recensione e mettere mi piace a quelle degli altri.</p>
        <button type="button" onClick={onLogin} className="inline-flex items-center gap-2 rounded-full bg-[#5865f2] px-5 py-2.5 text-sm font-semibold text-white">
          <LogIn className="size-4" /> Accedi con Discord
        </button>
      </div>
    );
  }

  if (kind === "staff" && viewer && !viewer.canWriteStaffReview) {
    return (
      <div className="rounded-3xl bg-roast/70 p-6 text-center text-sm text-crema/60 ring-1 ring-sand/12">
        Fai parte dello staff: le recensioni allo staff le lasciano i membri. 🙂
      </div>
    );
  }

  const len = text.trim().length;
  const valid = rating > 0 && len >= MIN_LEN && (kind !== "staff" || !!staffId);

  const save = async () => {
    if (!valid || !token) return;
    setBusy(true);
    setMsg(null);
    const res = await submitReview(token, { kind, rating, content: text.trim(), ...(kind === "staff" ? { staffUserId: staffId } : {}) });
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: res.message || (existing ? "Recensione aggiornata!" : "Grazie, recensione pubblicata!") } : { ok: false, text: res.message });
    if (res.ok) {
      draft.clear();
      onSaved();
    }
  };

  const remove = async () => {
    if (!existing || !token) return;
    setBusy(true);
    const res = await deleteReview(token, existing.id);
    setBusy(false);
    setConfirmDel(false);
    setMsg(res.ok ? { ok: true, text: "Recensione eliminata." } : { ok: false, text: res.message });
    if (res.ok) onSaved();
  };

  return (
    <div className="rounded-3xl bg-gradient-to-br from-mocha/80 to-roast p-6 ring-1 ring-sand/15 sm:p-7">
      <p className="flex items-center gap-2 font-display text-2xl font-semibold">
        <Feather className="size-5 text-caramel" /> {existing ? "La tua recensione" : "Lascia la tua firma"}
      </p>

      {kind === "staff" && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">Chi vuoi recensire?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {staffers.map((s) => {
              const done = viewer?.staffReviews.some((r) => r.staffUserId === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStaffId(s.id)}
                  aria-pressed={staffId === s.id}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm ring-1 transition-colors",
                    staffId === s.id ? "bg-caramel/20 text-crema ring-caramel/50" : "bg-crema/5 text-crema/70 ring-sand/15 hover:text-crema",
                  )}
                >
                  <Avatar userId={s.id} src={s.avatarUrl} name={s.name} className="size-7 text-xs" />
                  <span className="max-w-32 truncate">{s.name}</span>
                  {done && <Check className="size-3.5 text-emerald-300" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5">
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
        rows={4}
        placeholder={kind === "server" ? "Racconta com'è stare nel server…" : "Com'è stato il tuo incontro con questo staffer?"}
        className="mt-4 w-full resize-y rounded-2xl bg-espresso px-4 py-3 text-crema ring-1 ring-sand/15 placeholder:text-crema/35 focus:outline-none focus:ring-2 focus:ring-caramel/50"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className={cn("text-xs tabular-nums", len > 0 && len < MIN_LEN ? "text-amber-300" : "text-crema/40")}>
          {len < MIN_LEN ? `ancora ${MIN_LEN - len} caratteri` : `${len}/${MAX_LEN}`}
        </span>
        {existing &&
          (confirmDel ? (
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="text-crema/60">Eliminarla davvero?</span>
              <button type="button" onClick={remove} className="font-semibold text-red-300 hover:underline">
                Sì, elimina
              </button>
              <button type="button" onClick={() => setConfirmDel(false)} className="text-crema/60 hover:text-crema">
                No
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-sm text-crema/50 hover:text-red-300">
              <Trash2 className="size-4" /> Elimina
            </button>
          ))}
        <button
          type="button"
          onClick={save}
          disabled={!valid || busy}
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-caramel to-[#b9773f] px-5 py-2.5 text-sm font-semibold text-ink shadow-[0_10px_24px_-12px_rgba(217,154,91,0.9)] disabled:opacity-40"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {existing ? "Aggiorna" : "Pubblica"}
        </button>
      </div>
      <AnimatePresence>
        {msg && (
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("mt-3 text-sm", msg.ok ? "text-emerald-300" : "text-red-300")}>
            {msg.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
