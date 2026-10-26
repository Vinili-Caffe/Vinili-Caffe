"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Hand, Play, Quote, Star } from "lucide-react";
import { useRichFx } from "./effects/DeviceFxProvider";
import { Avatar } from "./Avatar";
import { Reveal } from "./Reveal";
import { SmartLink } from "./SmartLink";
import { CircularText } from "./ui/circular-text";
import { Marquee } from "./ui/marquee";
import { Spotlight } from "./ui/spotlight-card";
import { EmojiText } from "./discord/EmojiText";
import { loadReviews, type Review } from "@/lib/reviews";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { useI18n } from "@/lib/i18n";
import { page } from "@/lib/site";

function ReviewCard({ r }: { r: Review }) {
  return (
    <figure className="group/spot relative flex w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-3xl bg-roast p-5 ring-1 ring-sand/12 sm:w-[340px]">
      <Spotlight size={240} />
      <Quote className="absolute right-4 top-4 size-8 text-caramel/15" aria-hidden />
      <div className="relative flex gap-0.5 text-ember" aria-label={`${r.rating} su 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="size-4" fill={i < r.rating ? "currentColor" : "none"} strokeWidth={i < r.rating ? 0 : 1.5} />
        ))}
      </div>
      <blockquote className="relative mt-3 line-clamp-4 flex-1 text-[0.95rem] leading-relaxed text-crema/80">
        <EmojiText text={r.content} />
      </blockquote>
      <figcaption className="relative mt-4 flex items-center gap-3">
        <Avatar userId={r.userId} src={r.authorAvatarUrl} name={r.authorName} className="size-9 text-xs" noPresence />
        <span className="min-w-0 truncate text-sm font-semibold">{r.authorName}</span>
      </figcaption>
    </figure>
  );
}

/** Home: le recensioni vere del server che scorrono, con il timbro del voto medio. */
export function ReviewsMarquee() {
  const { t } = useI18n();
  const [all, setAll] = useState<Review[] | null>(null);
  const rich = useRichFx();
  // "scorri a mano": la striscia si ferma e si sfoglia con le frecce (la scelta resta per le prossime visite)
  const [manual, setManual] = useState(false);
  const strips = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    try {
      setManual(localStorage.getItem("vc_reviews_manual") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleManual = () =>
    setManual((m) => {
      try {
        localStorage.setItem("vc_reviews_manual", m ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !m;
    });
  const page_ = (dir: 1 | -1) => {
    for (const el of strips.current) if (el) el.scrollBy({ left: dir * Math.max(300, el.clientWidth * 0.8), behavior: "smooth" });
  };
  const still = manual || !rich;

  const pull = useCallback(() => {
    return loadReviews("server").then((d) => {
      setAll(d?.reviews ?? []);
    });
  }, []);

  useEffect(() => {
    void pull();
  }, [pull]);

  useLiveRefresh(pull, { intervalMs: 120_000, boot: false, topics: ["reviews"] });

  if (!all) return null;
  const good = all.filter((r) => r.rating >= 4 && r.content.trim().length >= 25).slice(0, 18);
  if (good.length < 4) return null;
  const avg = all.reduce((s, r) => s + r.rating, 0) / all.length;
  const half = Math.ceil(good.length / 2);
  const rows = [good.slice(0, half), good.slice(half)];

  return (
    <section id="recensioni" className="scroll-mt-28 py-16 sm:py-20">
      <div className="mx-auto mb-10 flex max-w-6xl flex-col items-center gap-6 px-6 sm:flex-row sm:justify-between">
        <Reveal className="text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">{t("reviews.kicker")}</p>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            {t("reviews.title")} <span className="italic text-sand">{t("reviews.titleEm")}</span>
          </h2>
          <SmartLink
            href={page("/recensioni/")}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-caramel hover:text-ember"
          >
            {t("reviews.all")} <ArrowUpRight className="size-4" />
          </SmartLink>
        </Reveal>
        <Reveal delay={0.1}>
          {/* timbro: la scritta gira attorno al voto medio come l'etichetta di un disco */}
          <CircularText text={`${t("reviews.count", { n: all.length }).toUpperCase()} • ${t("reviews.stamp")}`} className="size-36 text-sand/70 sm:size-40">
            <div className="flex size-20 flex-col items-center justify-center rounded-full bg-gradient-to-br from-caramel to-ember text-ink shadow-[0_12px_30px_-10px_rgba(240,180,110,0.7)]">
              <span className="font-display text-3xl font-bold leading-none lining-nums">{avg.toFixed(1).replace(".", ",")}</span>
              <span className="mt-0.5 flex gap-px">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className="size-2.5" fill="currentColor" strokeWidth={0} />
                ))}
              </span>
            </div>
          </CircularText>
        </Reveal>
      </div>

      <div className="mx-auto mb-4 flex max-w-6xl items-center justify-end gap-2 px-6">
        {rich ? (
          <button
            type="button"
            onClick={toggleManual}
            aria-pressed={manual}
            className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-3.5 py-2 text-xs font-semibold text-crema/75 ring-1 ring-sand/15 transition-colors hover:bg-crema/15 hover:text-crema"
          >
            {manual ? <Play className="size-3.5" /> : <Hand className="size-3.5" />}
            {manual ? t("reviews.auto") : t("reviews.manual")}
          </button>
        ) : null}
        {still ? (
          <>
            <button
              type="button"
              onClick={() => page_(-1)}
              aria-label={t("reviews.prev")}
              className="hidden size-9 items-center justify-center rounded-full bg-crema/8 text-crema/80 ring-1 ring-sand/15 transition-colors hover:bg-crema/15 hover:text-crema sm:inline-flex"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => page_(1)}
              aria-label={t("reviews.next")}
              className="hidden size-9 items-center justify-center rounded-full bg-crema/8 text-crema/80 ring-1 ring-sand/15 transition-colors hover:bg-crema/15 hover:text-crema sm:inline-flex"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        ) : null}
      </div>

      <div className="space-y-4">
        {rows.map((row, i) =>
          row.length ? (
            <Marquee
              key={i}
              reverse={i === 1}
              duration={row.length * 9}
              manual={manual}
              stripRef={(el) => {
                strips.current[i] = el;
              }}
            >
              {row.map((r) => (
                <ReviewCard key={r.id} r={r} />
              ))}
            </Marquee>
          ) : null,
        )}
      </div>
    </section>
  );
}
