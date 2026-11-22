"use client";

import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { MusicQuizPackSetup } from "./MusicQuizPackSetup";

export function MusicQuizPackPageClient() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const slug = String(sp.get("slug") || "").trim();
  if (!slug) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm text-crema/50">{t("musicQuiz.missingPack")}</p>
        <SmartLink href={page("/music-quiz/")} className="mt-4 inline-block text-caramel">
          {t("musicQuiz.backHub")}
        </SmartLink>
      </div>
    );
  }
  return <MusicQuizPackSetup slug={slug} />;
}
