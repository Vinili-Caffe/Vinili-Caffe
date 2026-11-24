"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { loadSimilarQuizzes, type MusicQuizPackCard } from "@/lib/musicQuiz";
import { QuizCarousel } from "./QuizCarousel";
import { ArtistTile, CoverTile } from "./QuizTiles";

/** «Quiz simili»: prima i quiz della community della stessa categoria, poi gli artisti simili. */
export function MusicQuizSimilar({ slug }: { slug: string }) {
  const { token } = useAuth();
  const [items, setItems] = useState<MusicQuizPackCard[] | null>(null);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setItems(null);
    void loadSimilarQuizzes(token || "", slug).then((r) => {
      if (alive) setItems(r.ok ? r.data.items || [] : []);
    });
    return () => {
      alive = false;
    };
  }, [token, slug]);

  if (items && !items.length) return null;

  return (
    <section>
      <h2 className="mb-4 font-display text-3xl font-semibold text-crema">Quiz simili</h2>
      <QuizCarousel round>
        {items == null
          ? Array.from({ length: 7 }, (_, i) => <div key={i} className="size-32 shrink-0 animate-pulse rounded-full bg-crema/[0.05] sm:size-36" />)
          : items.map((p, i) => (
              <motion.div
                key={p.slug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.03 }}
                className="shrink-0 snap-start"
              >
                {p.kind === "artist" ? (
                  <ArtistTile p={p} />
                ) : (
                  <CoverTile p={p} showPlays onDeleted={(gone) => setItems((l) => (l || []).filter((x) => x.slug !== gone))} />
                )}
              </motion.div>
            ))}
      </QuizCarousel>
    </section>
  );
}
