"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Plus, Trash2, Users } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { BUILTIN_NUMBER_QUIZ, deleteNumberQuiz, listNumberQuiz, type NumberQuizPack } from "@/lib/numberQuiz";

export function NumberQuizHub() {
  const { token } = useAuth();
  const [community, setCommunity] = useState<NumberQuizPack[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listNumberQuiz(token).then((r) => {
      if (alive) setCommunity(r.ok ? r.data.packs : []);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  async function remove(p: NumberQuizPack) {
    if (!token || !window.confirm(`Eliminare «${p.title}»? Non si può annullare.`)) return;
    const r = await deleteNumberQuiz(token, p.slug);
    if (r.ok) setCommunity((list) => (list || []).filter((x) => x.slug !== p.slug));
    else window.alert(r.message);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <SmartLink
        href={page("/quiz/numeri/crea/")}
        className="mb-8 flex items-center gap-4 rounded-3xl border border-dashed border-caramel/40 p-4 transition hover:border-caramel/70 hover:bg-caramel/[0.05] sm:p-5"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-caramel text-ink">
          <Plus className="size-6" />
        </span>
        <span>
          <span className="block font-display text-lg text-crema">Crea la tua categoria</span>
          <span className="text-sm text-crema/55">Scegli un argomento, scrivi le voci con i loro numeri e falla giocare a tutti.</span>
        </span>
      </SmartLink>

      <h2 className="mb-3 font-display text-xl text-crema">Categorie</h2>
      <Grid packs={BUILTIN_NUMBER_QUIZ} />

      <h2 className="mb-3 mt-10 flex items-center gap-2 font-display text-xl text-crema">
        <Users className="size-5 text-caramel" /> Create dalla community
      </h2>
      {community == null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-3xl bg-crema/[0.04]" />
          ))}
        </div>
      ) : community.length ? (
        <Grid packs={community} onRemove={remove} />
      ) : (
        <p className="rounded-3xl bg-roast/60 px-5 py-6 text-center text-sm text-crema/55 ring-1 ring-sand/10">
          Ancora nessuna. Crea la prima tu!
        </p>
      )}
    </div>
  );
}

function Grid({ packs, onRemove }: { packs: NumberQuizPack[]; onRemove?: (p: NumberQuizPack) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {packs.map((p, i) => {
        const count = p.items?.length ?? p.itemCount ?? 0;
        return (
          <motion.div
            key={p.slug}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.04 }}
            className="group relative"
          >
            <SmartLink
              href={page(`/quiz/numeri/gioca/?slug=${encodeURIComponent(p.slug)}`)}
              className="flex h-full items-start gap-4 rounded-3xl bg-roast/75 p-4 ring-1 ring-sand/12 transition hover:-translate-y-0.5 hover:ring-caramel/40"
            >
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-espresso/80 text-3xl ring-1 ring-sand/10" aria-hidden>
                {p.emoji || "🔢"}
              </span>
              <span className="min-w-0 pr-6">
                <span className="block font-display text-lg leading-snug text-crema">{p.title}</span>
                {p.description ? <span className="mt-0.5 line-clamp-2 block text-sm text-crema/55">{p.description}</span> : null}
                <span className="mt-1.5 block text-xs text-crema/40">
                  {[count ? `${count} voci` : "", p.authorName ? `di ${p.authorName}` : "", p.plays ? `${p.plays} partite` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </SmartLink>
            {onRemove && p.mine ? (
              <button
                type="button"
                onClick={() => onRemove(p)}
                className="absolute right-3 top-3 rounded-full p-2 text-crema/35 transition hover:bg-ember/20 hover:text-ember"
                aria-label={`Elimina ${p.title}`}
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}
