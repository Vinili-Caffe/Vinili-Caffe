"use client";

import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { motion } from "motion/react";
import { CloudUpload, Globe, Lock, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type QuizSettings = {
  /** data URL già ridimensionato, pronto da mandare */
  coverImage: string;
  description: string;
  language: string;
  languages: string[];
  category: string;
  tags: string[];
  visibility: "public" | "unlisted";
  anonymous: boolean;
};

export const DEFAULT_SETTINGS: QuizSettings = {
  coverImage: "",
  description: "",
  language: "it",
  languages: [],
  category: "general",
  tags: [],
  visibility: "public",
  anonymous: false,
};

export const QUIZ_CATEGORIES: Array<{ id: string; label: string; emoji: string }> = [
  { id: "general", label: "Generale", emoji: "🎵" },
  { id: "pop", label: "Pop", emoji: "🎤" },
  { id: "rap", label: "Rap e hip-hop", emoji: "🎧" },
  { id: "rock", label: "Rock", emoji: "🎸" },
  { id: "metal", label: "Metal", emoji: "🤘" },
  { id: "electronic", label: "Elettronica", emoji: "🎹" },
  { id: "jazz", label: "Jazz e blues", emoji: "🎺" },
  { id: "retro", label: "Retrò", emoji: "📼" },
  { id: "soundtrack", label: "Colonne sonore", emoji: "🎬" },
  { id: "anime", label: "Anime", emoji: "🎌" },
  { id: "kpop", label: "K-Pop", emoji: "💜" },
  { id: "world", label: "Mondo", emoji: "🌍" },
];

export const QUIZ_LANGUAGES: Array<{ id: string; label: string }> = [
  { id: "it", label: "Italiano" },
  { id: "en", label: "Inglese" },
  { id: "es", label: "Spagnolo" },
  { id: "fr", label: "Francese" },
  { id: "de", label: "Tedesco" },
  { id: "pt", label: "Portoghese" },
  { id: "ja", label: "Giapponese" },
  { id: "ko", label: "Coreano" },
  { id: "other", label: "Altra lingua" },
];

const MAX_FILE = 5 * 1024 * 1024;
const MAX_TAGS = 8;

/** La copertina viene rimpicciolita nel browser (lato lungo 1000 px): si carica in un attimo e non pesa sul server. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = () => ko(new Error("immagine non valida"));
      el.src = url;
    });
    const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL("image/webp", 0.86);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MusicQuizSettings({
  value,
  onChange,
  creator,
}: {
  value: QuizSettings;
  /* sempre a partire dallo stato più recente: due modifiche ravvicinate (o una copertina che finisce di caricare) non si cancellano a vicenda */
  onChange: Dispatch<SetStateAction<QuizSettings>>;
  creator: { name: string; avatar: string };
}) {
  const set = <K extends keyof QuizSettings>(k: K, v: QuizSettings[K] | ((prev: QuizSettings[K]) => QuizSettings[K])) =>
    onChange((prev) => ({ ...prev, [k]: typeof v === "function" ? (v as (p: QuizSettings[K]) => QuizSettings[K])(prev[k]) : v }));
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [coverErr, setCoverErr] = useState("");
  const [tag, setTag] = useState("");
  const [moreLangs, setMoreLangs] = useState(value.languages.length > 0);

  async function takeFile(file?: File | null) {
    setCoverErr("");
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) return setCoverErr("Usa un'immagine JPG, PNG, GIF o WEBP.");
    if (file.size > MAX_FILE) return setCoverErr("L'immagine pesa più di 5 MB.");
    try {
      set("coverImage", await shrinkImage(file));
    } catch {
      setCoverErr("Non riesco a leggere questa immagine.");
    }
  }

  function addTag() {
    const t = tag.replace(/^#+/, "").trim().toLowerCase().slice(0, 24);
    setTag("");
    if (t.length < 2) return;
    set("tags", (prev) => (prev.includes(t) || prev.length >= MAX_TAGS ? prev : [...prev, t]));
  }

  return (
    <section className="space-y-7 rounded-[2rem] bg-roast/70 p-5 ring-1 ring-sand/10 sm:p-7">
      <h2 className="font-display text-2xl font-semibold text-crema">Dettagli del quiz</h2>

      {/* copertina */}
      <Field label="Immagine di copertina" hint="Se non la metti, usiamo la copertina del primo brano.">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => void takeFile(e.target.files?.[0])} />
        {value.coverImage ? (
          <div className="relative w-full max-w-xs overflow-hidden rounded-2xl ring-1 ring-sand/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.coverImage} alt="Copertina scelta" className="aspect-square w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-ink/90 to-transparent p-3">
              <button type="button" onClick={() => fileRef.current?.click()} className="rounded-full bg-crema/15 px-3 py-1.5 text-xs font-semibold text-crema backdrop-blur hover:bg-crema/25">
                Cambia
              </button>
              <button type="button" onClick={() => set("coverImage", "")} className="rounded-full bg-crema/15 px-3 py-1.5 text-xs font-semibold text-crema backdrop-blur hover:bg-ember/60">
                Togli
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void takeFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition",
              drag ? "border-caramel bg-caramel/10" : "border-sand/20 bg-espresso/60 hover:border-sand/35",
            )}
          >
            <CloudUpload className="size-9 text-crema/45" aria-hidden />
            <span className="text-sm text-crema/70">
              <b className="text-crema">Clicca per caricare</b> o trascina qui l&apos;immagine
            </span>
            <span className="text-xs text-crema/45">JPG, PNG, GIF o WEBP, al massimo 5 MB</span>
          </button>
        )}
        {coverErr ? <p className="mt-2 text-sm text-ember">{coverErr}</p> : null}
      </Field>

      {/* descrizione */}
      <Field label="Descrizione">
        <textarea
          value={value.description}
          maxLength={300}
          rows={3}
          onChange={(e) => set("description", e.target.value)}
          placeholder="In due righe: di che brani parla il quiz?"
          className="w-full resize-none rounded-2xl border-0 bg-espresso/80 px-4 py-3 text-sm text-crema outline-none ring-1 ring-sand/20 placeholder:text-crema/35 focus:ring-2 focus:ring-caramel/60"
        />
        <p className="mt-1 text-right text-[0.7rem] tabular-nums text-crema/40">{value.description.length}/300</p>
      </Field>

      {/* lingue */}
      <Field label="Lingua principale" hint="La lingua in cui sono cantati quasi tutti i brani.">
        <select
          value={value.language}
          onChange={(e) => {
            const lang = e.target.value;
            onChange((prev) => ({ ...prev, language: lang, languages: prev.languages.filter((l) => l !== lang) }));
          }}
          className="w-full rounded-2xl border-0 bg-espresso/80 px-4 py-3 text-sm text-crema outline-none ring-1 ring-sand/20 focus:ring-2 focus:ring-caramel/60"
        >
          {QUIZ_LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {moreLangs ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {QUIZ_LANGUAGES.filter((l) => l.id !== value.language).map((l) => {
              const on = value.languages.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() =>
                    set("languages", (prev) => (prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id].slice(0, 4)))
                  }
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                    on ? "bg-caramel/20 text-caramel ring-caramel/50" : "text-crema/65 ring-sand/20 hover:text-crema",
                  )}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        ) : (
          <button type="button" onClick={() => setMoreLangs(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-crema/[0.06] px-3.5 py-1.5 text-xs font-semibold text-crema/70 hover:text-crema">
            <Plus className="size-3.5" aria-hidden /> Altre lingue
          </button>
        )}
      </Field>

      {/* categoria */}
      <Field label="Categoria">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUIZ_CATEGORIES.map((c) => {
            const on = value.category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => set("category", c.id)}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left text-sm font-semibold ring-1 transition",
                  on ? "text-caramel ring-caramel/60" : "bg-espresso/60 text-crema/80 ring-sand/12 hover:ring-sand/30",
                )}
              >
                {on ? <motion.span layoutId="quiz-category" className="absolute inset-0 rounded-2xl bg-caramel/15" /> : null}
                <span className="relative text-lg leading-none" aria-hidden>
                  {c.emoji}
                </span>
                <span className="relative">{c.label}</span>
              </button>
            );
          })}
        </div>
      </Field>

      {/* tag */}
      <Field label={`Tag (${value.tags.length}/${MAX_TAGS})`} hint="Parole che aiutano a trovare il quiz: un genere, un anno, un'atmosfera.">
        <div className="flex gap-2">
          <input
            value={tag}
            maxLength={24}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Scrivi un tag e premi Invio"
            disabled={value.tags.length >= MAX_TAGS}
            className="min-w-0 flex-1 rounded-2xl border-0 bg-espresso/80 px-4 py-3 text-sm text-crema outline-none ring-1 ring-sand/20 placeholder:text-crema/35 focus:ring-2 focus:ring-caramel/60 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={addTag}
            disabled={tag.trim().length < 2 || value.tags.length >= MAX_TAGS}
            className="rounded-2xl bg-crema/[0.08] px-4 text-sm font-semibold text-crema transition hover:bg-crema/[0.14] disabled:opacity-40"
          >
            Aggiungi
          </button>
        </div>
        {value.tags.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {value.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-caramel/15 py-1 pl-3 pr-1.5 text-xs font-semibold text-caramel ring-1 ring-caramel/35">
                #{t}
                <button type="button" onClick={() => set("tags", (prev) => prev.filter((x) => x !== t))} aria-label={`Togli ${t}`} className="rounded-full p-0.5 hover:bg-caramel/25">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </Field>

      {/* visibilità */}
      <Field label="Visibilità">
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            on={value.visibility === "public"}
            onClick={() => set("visibility", "public")}
            icon={<Globe className="size-5" aria-hidden />}
            title="Pubblico"
            text="Compare nella pagina del Music Quiz e nella ricerca"
          />
          <Choice
            on={value.visibility === "unlisted"}
            onClick={() => set("visibility", "unlisted")}
            icon={<Lock className="size-5" aria-hidden />}
            title="Non in elenco"
            text="Lo trova solo chi ha il link"
          />
        </div>
      </Field>

      {/* autore */}
      <Field label="Creatore">
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            on={!value.anonymous}
            onClick={() => set("anonymous", false)}
            icon={
              creator.avatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={creator.avatar} alt="" className="size-full rounded-full object-cover" />
              ) : (
                <span className="text-sm font-bold">{creator.name.slice(0, 1).toUpperCase()}</span>
              )
            }
            title={creator.name || "Tu"}
            text="Il quiz mostra il tuo nome"
            round
          />
          <Choice
            on={value.anonymous}
            onClick={() => set("anonymous", true)}
            icon={<span className="text-sm font-bold">A</span>}
            title="Anonimo"
            text="Il tuo nome non compare mai"
            round
          />
        </div>
      </Field>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-crema/55">{label}</p>
      {hint ? <p className="mt-1 text-xs text-crema/40">{hint}</p> : null}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Choice({
  on,
  onClick,
  icon,
  title,
  text,
  round,
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  text: string;
  round?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-3 rounded-2xl p-3.5 text-left ring-1 transition",
        on ? "bg-caramel/12 ring-caramel/60" : "bg-espresso/60 ring-sand/12 hover:ring-sand/30",
      )}
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center overflow-hidden",
          round ? "rounded-full" : "rounded-xl",
          on ? "bg-caramel/20 text-caramel" : "bg-crema/[0.06] text-crema/60",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className={cn("block font-semibold", on ? "text-caramel" : "text-crema")}>{title}</span>
        <span className="block text-xs text-crema/55">{text}</span>
      </span>
    </button>
  );
}
