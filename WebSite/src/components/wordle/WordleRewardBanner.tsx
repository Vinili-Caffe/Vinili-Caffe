"use client";

import { Disc3, LogIn, Sparkles } from "lucide-react";
import { DISCORD_INVITE } from "@/lib/site";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";
import type { WordleRewardInfo } from "@/lib/wordle";

type Props = {
  reward: WordleRewardInfo | null | undefined;
  mode?: "classic" | "quad";
  won?: boolean;
  attempts?: number;
  expGained?: number | null;
  onLogin?: () => void;
  className?: string;
};

/** Una riga sola: EXP / login / entra nel server. */
export function WordleRewardBanner({
  reward,
  won,
  expGained,
  onLogin,
  className,
}: Props) {
  const { t } = useI18n();
  if (!reward) return null;

  if (expGained != null && expGained > 0) {
    return (
      <p className={cn("flex items-center justify-center gap-1.5 text-sm text-crema/70", className)}>
        <Sparkles className="size-3.5 text-ember" />
        <span className="font-semibold text-ember">+{expGained} EXP</span>
      </p>
    );
  }

  if (reward.claimed && reward.expAwarded) {
    return (
      <p className={cn("text-center text-sm text-crema/55", className)}>
        {t("wordle.rewardToday", { n: reward.expAwarded })}
      </p>
    );
  }

  if (reward.needsJoin) {
    return (
      <div className={cn("flex flex-wrap items-center justify-center gap-2 text-sm", className)}>
        <span className="text-crema/65">{t("wordle.rewardJoin")}</span>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-caramel to-ember px-3 py-1 text-xs font-bold text-ink"
        >
          <Disc3 className="size-3.5" /> Discord
        </a>
      </div>
    );
  }

  if (reward.needsLogin) {
    return (
      <div className={cn("flex flex-wrap items-center justify-center gap-2 text-sm", className)}>
        <span className="text-crema/65">
          {won ? t("wordle.rewardLoginWin") : t("wordle.rewardLoginHint")}
        </span>
        <button
          type="button"
          onClick={onLogin}
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-caramel to-ember px-3 py-1 text-xs font-bold text-ink"
        >
          <LogIn className="size-3.5" /> {t("wordle.rewardLogin")}
        </button>
      </div>
    );
  }

  /* «Vinci e guadagni EXP» c'è già sotto il titolo della pagina: qui non si ripete */
  return null;
}
