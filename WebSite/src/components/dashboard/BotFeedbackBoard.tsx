"use client";

import { FeedbackBoard } from "@/components/feedback/FeedbackBoard";
import { BOT_FEEDBACK_API, FeedbackApiProvider } from "@/lib/feedback-api";

/** Feedback sul bot: la stessa lavagna di /feedback, sull'archivio dei feedback del bot. */
export function BotFeedbackBoard() {
  return (
    <FeedbackApiProvider api={BOT_FEEDBACK_API}>
      <FeedbackBoard className="pb-10 [&>section]:mt-8" title="Idee per Vinili" />
    </FeedbackApiProvider>
  );
}
