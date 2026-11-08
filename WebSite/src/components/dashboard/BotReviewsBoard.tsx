"use client";

import { ReviewsBrowser } from "@/components/reviews/ReviewsBrowser";
import { BOT_KINDS } from "@/lib/reviews";

/** Recensioni del bot: la stessa pagina di /recensioni, solo con il tipo "bot". */
export function BotReviewsBoard() {
  return <ReviewsBrowser initial={null} kinds={BOT_KINDS} className="pb-10" />;
}
