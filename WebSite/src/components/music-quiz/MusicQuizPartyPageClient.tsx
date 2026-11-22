"use client";

import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { MusicQuizPartyRoom } from "./MusicQuizPartyRoom";

export function MusicQuizPartyPageClient() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const roomId = String(sp.get("room") || "").trim();
  if (!roomId) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm text-crema/50">{t("musicQuiz.missingRoom")}</p>
        <SmartLink href={page("/music-quiz/")} className="mt-4 inline-block text-caramel">
          {t("musicQuiz.backHub")}
        </SmartLink>
      </div>
    );
  }
  return <MusicQuizPartyRoom roomId={roomId} />;
}
