"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, LogIn, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { createNumberQuiz } from "@/lib/numberQuiz";

type Row = { id: number; name: string; value: string; sub: string };
const MIN = 6;
let nextId = 1;
const emptyRow = (): Row => ({ id: nextId++, name: "", value: "", sub: "" });

const PRESETS = [
  { id: "more", label: "Di più / Di meno", more: "Di più", less: "Di meno", plain: false },
  { id: "time", label: "Dopo / Prima (anni)", more: "Dopo", less: "Prima", plain: true },
  { id: "high", label: "Più alto / Più basso", more: "Più alto", less: "Più basso", plain: false },
  { id: "long", label: "Più lungo / Più corto", more: "Più lungo", less: "Più corto", plain: false },
];

const parseNum = (s: string) => Number(String(s).replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));

export function NumberQuizCreate() {
  const { token, login } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🔢");
  const [unit, setUnit] = useState("");
  const [preset, setPreset] = useState("more");
  const [anonymous, setAnonymous] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: MIN }, emptyRow));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const valid = rows.filter((r) => r.name.trim() && Number.isFinite(parseNum(r.value)) && r.value.trim());
  const p = PRESETS.find((x) => x.id === preset) || PRESETS[0]!;

  function edit(id: number, patch: Partial<Row>) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!token) return login();
    setError("");
    if (title.trim().length < 3) return setError("Dai un nome alla categoria.");
    if (valid.length < MIN) return setError(`Servono almeno ${MIN} voci, ognuna con il suo numero.`);
    setBusy(true);
    const r = await createNumberQuiz(token, {
      title,
      description,
      emoji,
      unit,
      more: p.more,
      less: p.less,
      plain: p.plain,
      anonymous,
      items: valid.map((x) => ({ name: x.name, value: parseNum(x.value), sub: x.sub })),
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.push(page(`/quiz/numeri/gioca/?slug=${encodeURIComponent(r.data.pack.slug)}`));
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-crema/70">Per creare una categoria accedi con Discord.</p>
        <button
          type="button"
          onClick={login}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#5865F2] px-6 py-3 text-sm font-bold text-white transition hover:brightness-110"
        >
          <LogIn className="size-4" /> Accedi con Discord
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-32">
      <section className="space-y-4 rounded-3xl bg-roast/75 p-5 ring-1 ring-sand/12">
        <div className="flex gap-3">
          <Field label="Emoji" className="w-20">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 8))} className={cn(input, "text-center text-2xl")} />
          </Field>
          <Field label="Nome della categoria" className="flex-1">
            <input value={title} maxLength={70} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Gol in Serie A" className={input} />
          </Field>
        </div>
        <Field label="Descrizione (facoltativa)">
          <input value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} placeholder="Una riga che spiega il gioco" className={input} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unità dopo il numero (facoltativa)">
            <input value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} placeholder="Es. gol, km, euro" className={input} />
          </Field>
          <Field label="Pulsanti">
            <select value={preset} onChange={(e) => setPreset(e.target.value)} className={input}>
              {PRESETS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-crema/70">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4 accent-caramel" />
          Non mostrare il mio nome
        </label>
      </section>

      <section className="rounded-3xl bg-roast/75 p-5 ring-1 ring-sand/12">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg text-crema">Voci</h2>
          <span className={cn("text-xs font-semibold", valid.length >= MIN ? "text-caramel" : "text-crema/45")}>
            {valid.length} pronte · minimo {MIN}
          </span>
        </div>
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-[1fr_7rem_auto] gap-2 sm:grid-cols-[1fr_10rem_8rem_auto]"
              >
                <input value={r.name} maxLength={60} onChange={(e) => edit(r.id, { name: e.target.value })} placeholder={`Voce ${i + 1}`} className={input} />
                <input value={r.value} inputMode="decimal" onChange={(e) => edit(r.id, { value: e.target.value })} placeholder="Numero" className={cn(input, "font-mono")} />
                <input value={r.sub} maxLength={60} onChange={(e) => edit(r.id, { sub: e.target.value })} placeholder="Dettaglio" className={cn(input, "hidden sm:block")} />
                <button
                  type="button"
                  onClick={() => setRows((list) => (list.length > 1 ? list.filter((x) => x.id !== r.id) : list))}
                  className="grid size-11 place-items-center rounded-xl text-crema/40 transition hover:bg-ember/20 hover:text-ember"
                  aria-label="Togli la voce"
                >
                  <Trash2 className="size-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <button
          type="button"
          onClick={() => setRows((list) => [...list, emptyRow()])}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-crema/[0.07] px-4 py-2 text-xs font-bold uppercase tracking-wide text-crema ring-1 ring-sand/15 transition hover:bg-crema/[0.12]"
        >
          <Plus className="size-4" /> Aggiungi voce
        </button>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sand/10 bg-espresso/85 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-ember">{error}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-caramel to-ember px-6 text-sm font-bold uppercase tracking-wide text-ink transition hover:brightness-105 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Pubblica
          </button>
        </div>
      </div>
    </div>
  );
}

const input =
  "h-11 w-full rounded-xl border-0 bg-espresso/80 px-3 text-sm text-crema outline-none ring-1 ring-sand/15 transition placeholder:text-crema/35 focus:ring-2 focus:ring-caramel/60";

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-crema/50">{label}</span>
      {children}
    </label>
  );
}
