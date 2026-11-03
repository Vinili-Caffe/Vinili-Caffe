"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { BellRing, Check, Crown, Gem, Handshake, ImagePlus, LifeBuoy, Loader2, Send, X } from "lucide-react";
import { useFormDraft } from "@/components/ui/form-drafts";
import { imageToDataUrl } from "@/lib/feedback";
import { MAX_CONTENT, MAX_IMAGE_BYTES, MAX_IMAGES, createTicket, enablePush, pushIsOn, type Category, type Ticket } from "@/lib/tickets";
import { cn } from "@/lib/cn";
import { EmojiText } from "@/components/discord/EmojiText";

type NewTicketDraft = { cat: string | null; text: string };

const ICONS: Record<string, React.ReactNode> = {
  supporto: <LifeBuoy className="size-5" />,
  partnership: <Handshake className="size-5" />,
  high: <Crown className="size-5" />,
  perks: <Gem className="size-5" />,
};

const readRaw = (f: File) =>
  new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = ko;
    r.readAsDataURL(f);
  });

/** Apertura di un ticket: categoria, notifiche (richieste dal bot per gli utenti), primo messaggio. */
export function NewTicket({ token, categories, isStaff, onCreated, onCancel }: { token: string; categories: Category[]; isStaff: boolean; onCreated: (t: Ticket) => void; onCancel?: () => void }) {
  const [form, setForm] = useState<NewTicketDraft>({ cat: null, text: "" });
  const cat = form.cat;
  const text = form.text;
  const setCat = (id: string | null) => setForm((f) => ({ ...f, cat: id }));
  const setText = (v: string) => setForm((f) => ({ ...f, text: v }));
  const [images, setImages] = useState<string[]>([]);
  const [push, setPush] = useState<boolean | null>(isStaff ? true : null);
  const [pushBusy, setPushBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const draft = useFormDraft("web_ticket_new", form, setForm, {
    watch: true,
    notify: false,
    debounceMs: 280,
    isEmpty: (d) => !d.cat && !d.text.trim(),
  });

  useEffect(() => {
    if (!isStaff) pushIsOn().then(setPush).catch(() => setPush(false));
  }, [isStaff]);

  const turnOnPush = async () => {
    setPushBusy(true);
    setErr("");
    const r = await enablePush(token);
    setPushBusy(false);
    if (r.ok) setPush(true);
    else setErr(r.message || "Non sono riuscito ad attivare le notifiche.");
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, MAX_IMAGES - images.length)) {
      if (!/^image\//.test(f.type)) continue;
      try {
        out.push(f.type === "image/gif" && f.size <= MAX_IMAGE_BYTES ? await readRaw(f) : await imageToDataUrl(f));
      } catch {}
    }
    setImages((x) => [...x, ...out].slice(0, MAX_IMAGES));
  };

  const submit = async () => {
    if (!cat) return setErr("Scegli una categoria.");
    if (!text.trim() && !images.length) return setErr("Scrivi il motivo del ticket.");
    setBusy(true);
    setErr("");
    const r = await createTicket(token, cat, text.trim(), images);
    setBusy(false);
    if (!r.ok) {
      if (r.error === "push_required") setPush(false);
      return setErr(r.message);
    }
    draft.clear();
    onCreated(r.data.ticket);
  };

  return (
    <div className="mx-auto w-full max-w-2xl p-5 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Nuovo ticket</p>
          <h2 className="mt-1 font-display text-3xl font-semibold">Di cosa hai bisogno?</h2>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label="Annulla" className="rounded-full p-2 text-crema/55 hover:bg-crema/8 hover:text-crema">
            <X className="size-5" />
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Categoria" className="mt-6 grid gap-3 sm:grid-cols-2">
        {categories.map((c) => {
          const on = cat === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setCat(c.id)}
              className={cn("flex gap-3 rounded-2xl p-4 text-left ring-1 transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out", on ? "bg-gradient-to-b from-caramel/15 to-roast ring-caramel/60" : "bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast ring-sand/15 hover:ring-sand/30")}
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1", on ? "bg-caramel text-ink ring-caramel" : "bg-crema/6 text-sand ring-sand/20")}>{ICONS[c.id] ?? <LifeBuoy className="size-5" />}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-semibold">
                  <EmojiText text={c.label} /> {on && <Check className="size-4 text-ember" />}
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-crema/55"><EmojiText text={c.description} /></span>
              </span>
            </button>
          );
        })}
      </div>

      {push === false && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-caramel/10 p-5 ring-1 ring-caramel/30">
          <BellRing className="size-6 shrink-0 text-ember" />
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-crema/80">
            <strong className="text-crema">Attiva le notifiche</strong> per essere avvisato su ogni aggiornamento del ticket: servono per aprirne uno.
          </p>
          <button type="button" onClick={turnOnPush} disabled={pushBusy} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
            {pushBusy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />} Attiva
          </button>
        </motion.div>
      )}

      <label htmlFor="message" className="mt-6 block">
        <span className="text-sm font-semibold text-crema/70">Il tuo messaggio</span>
        <textarea id="message" name="message"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CONTENT))}
          rows={5}
          placeholder="Spiega in breve il motivo del ticket…"
          className="mt-2 w-full resize-y rounded-2xl bg-espresso/70 p-4 leading-relaxed outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-2 focus:ring-caramel/70"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {images.map((src, i) => (
          <span key={i} className="relative">
            <img src={src} alt="" className="size-16 rounded-lg object-cover ring-1 ring-sand/20" />
            <button type="button" aria-label={`Rimuovi immagine ${i + 1}`} onClick={() => setImages((x) => x.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 rounded-full bg-crema p-1 text-espresso shadow">
              <X className="size-3" />
            </button>
          </span>
        ))}
        {images.length < MAX_IMAGES && (
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-full bg-crema/6 px-3.5 py-2 text-sm font-semibold text-crema/70 ring-1 ring-sand/15 hover:text-crema">
            <ImagePlus className="size-4" /> Allega immagini
          </button>
        )}
        <input name="attachments" ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
        <span className="ml-auto text-xs text-crema/40 lining-nums">
          {text.length} / {MAX_CONTENT}
        </span>
      </div>

      {err && <p className="mt-4 rounded-xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c]">{err}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || push === false}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3.5 font-semibold text-ink shadow-[0_12px_30px_-10px_rgba(232,160,90,0.7)] transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Apri il ticket
      </button>
    </div>
  );
}
