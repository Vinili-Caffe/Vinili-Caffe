"use client";

import { useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DISCORD_INVITE } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { getVinylMusicApi, subscribeVinylMusic } from "@/lib/vinyl-music-bus";
import { cn } from "@/lib/cn";

/**
 * Card hero = grafica 3D del promo (`hero-deck-promo`), con hit-area reali:
 * Discord, play/pause sul piatto, Entra.
 */
export function HeroStage({ className }: { className?: string }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const vinyl = useSyncExternalStore(subscribeVinylMusic, getVinylMusicApi, () => null);
  const playing = Boolean(vinyl?.on);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative mx-auto w-full max-w-[22rem] sm:max-w-[26rem]", className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_50%_45%,rgba(217,154,91,0.55),transparent_65%)] blur-3xl"
      />

      <motion.div
        className="relative"
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="relative overflow-hidden rounded-[1.75rem] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] ring-1 ring-sand/20">
          <picture>
            <source srcSet="/images/hero-deck-promo.webp" type="image/webp" />
            <img
              src="/images/hero-deck-promo.png"
              alt=""
              width={470}
              height={430}
              decoding="async"
              fetchPriority="high"
              className="block h-auto w-full select-none"
              draggable={false}
            />
          </picture>

          {/* Discord (badge in alto a sinistra nella grafica) */}
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener"
            aria-label={t("common.discord")}
            className="absolute left-[7%] top-[9%] z-10 size-[12%] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-caramel/80"
          />

          {/* Piatto: play/pause */}
          <button
            type="button"
            onClick={() => vinyl?.toggle()}
            aria-label={playing ? "Metti in pausa la musica" : "Avvia la musica"}
            aria-pressed={playing}
            className="absolute left-[18%] top-[14%] z-10 aspect-square w-[52%] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-caramel/80"
          />

          {/* Entra (bottone nella grafica) */}
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener"
            className="absolute bottom-[9%] left-[16%] z-10 h-[11%] w-[42%] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-caramel/80"
          >
            <span className="sr-only">Entra — {t("common.discord")}</span>
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}
