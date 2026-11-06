"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { EventoBtn } from "@/components/evento/EventoUi";
import { EventoCreditsIcon } from "@/components/evento/EventoCreditsIcon";
import { EventoUtilityIcon } from "@/components/evento/EventoUtilityIcon";
import { EventoTroopIcon } from "@/components/evento/EventoTroopIcon";
import { isUtilityItemId } from "@/lib/evento-utility-art";
import { isTroopUnitId } from "@/lib/evento-troop-art";
import { cdnUrl } from "@/lib/site";

export type CrateTint = { face: string; lid: string; glow: string; accent: string };

const CRATE_IMG_V = "20261105cr17";

const CRATE_TINT: Record<string, CrateTint> = {
  omega: { face: "#c9a227", lid: "#f0d78c", glow: "rgba(201,162,39,0.75)", accent: "#ffe9a0" },
  alpha: { face: "#1d7fd4", lid: "#7dd3fc", glow: "rgba(46,168,255,0.7)", accent: "#bae6fd" },
  beta: { face: "#6d28d9", lid: "#c4b5fd", glow: "rgba(124,58,237,0.65)", accent: "#ddd6fe" },
  avvento: { face: "#15803d", lid: "#86efac", glow: "rgba(34,197,94,0.65)", accent: "#bbf7d0" },
  militare: { face: "#475569", lid: "#94a3b8", glow: "rgba(148,163,184,0.55)", accent: "#e2e8f0" },
  militare_plus: { face: "#64748b", lid: "#cbd5e1", glow: "rgba(203,213,225,0.6)", accent: "#f8fafc" },
  militare_op: { face: "#be123c", lid: "#fb7185", glow: "rgba(225,29,72,0.7)", accent: "#fecdd3" },
  stellare: { face: "#c2410c", lid: "#fdba74", glow: "rgba(249,115,22,0.65)", accent: "#fed7aa" },
  cosmica: { face: "#9a3412", lid: "#f87171", glow: "rgba(220,38,38,0.7)", accent: "#fecaca" },
  lunare: { face: "#64748b", lid: "#bfdbfe", glow: "rgba(147,197,253,0.65)", accent: "#e0f2fe" },
  solare: { face: "#ea580c", lid: "#fbbf24", glow: "rgba(251,191,36,0.75)", accent: "#fde68a" },
  planetario: { face: "#0f766e", lid: "#2dd4bf", glow: "rgba(45,212,191,0.65)", accent: "#99f6e4" },
  nebulare: { face: "#9d174d", lid: "#e879f9", glow: "rgba(232,121,249,0.7)", accent: "#f5d0fe" },
  galattico: { face: "#312e81", lid: "#a78bfa", glow: "rgba(167,139,250,0.75)", accent: "#ddd6fe" },
};

const CRATE_IDS_WITH_ART = new Set(Object.keys(CRATE_TINT));

export function crateTint(id: string): CrateTint {
  return CRATE_TINT[id] || CRATE_TINT.stellare!;
}

export function crateArtUrl(crateId: string, open = false): string {
  const id = String(crateId || "").trim();
  if (!id || !CRATE_IDS_WITH_ART.has(id)) return "";
  return cdnUrl(`/images/starwars/casse/${id}-${open ? "open" : "closed"}.png?v=${CRATE_IMG_V}`);
}

/** Cassa: asset CDN (closed/open) con fallback CSS 3D. */
export function EventoCrateArt({
  crateId,
  open = false,
  shake = false,
  size = "md",
  qty,
  className = "",
}: {
  crateId: string;
  open?: boolean;
  shake?: boolean;
  size?: "sm" | "md" | "lg";
  qty?: number;
  className?: string;
}) {
  const t = crateTint(crateId);
  const box =
    size === "lg" ? "h-40 w-40 sm:h-48 sm:w-48" : size === "sm" ? "h-20 w-20" : "h-28 w-28 sm:h-32 sm:w-32";
  const src = crateArtUrl(crateId, open);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [crateId, open, src]);
  const useImg = Boolean(src) && !imgFailed;

  return (
    <motion.div
      className={`relative mx-auto overflow-visible ${box} ${className}`}
      style={{ perspective: 700 }}
      animate={shake ? { x: [0, -6, 7, -5, 4, 0], rotate: [0, -3, 3, -2, 1, 0] } : { x: 0, rotate: 0 }}
      transition={shake ? { duration: 0.55, repeat: Infinity, repeatDelay: 0.15 } : undefined}
    >
      <div
        className="pointer-events-none absolute -inset-4 rounded-full opacity-70 blur-2xl"
        style={{ background: t.glow }}
        aria-hidden
      />
      {useImg ? (
        <AnimatePresence mode="wait">
          <motion.img
            key={`${crateId}-${open ? "o" : "c"}`}
            src={src}
            alt=""
            data-vc-lightbox-ignore
            className="relative z-[1] h-full w-full object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)]"
            initial={{ opacity: 0, scale: 0.94, rotate: open ? -4 : 0 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            onError={() => setImgFailed(true)}
            draggable={false}
          />
        </AnimatePresence>
      ) : (
        <>
          <div
            className="absolute inset-x-[8%] bottom-0 top-[34%] rounded-lg shadow-2xl ring-1 ring-white/25"
            style={{
              background: `linear-gradient(155deg, ${t.lid} 0%, ${t.face} 42%, #05070f 130%)`,
              boxShadow: `0 12px 36px -8px ${t.glow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
            }}
          >
            <div className="absolute inset-x-[12%] top-[14%] h-px bg-white/30" />
            <div className="absolute inset-x-[12%] bottom-[16%] h-px bg-black/35" />
            <div
              className="absolute left-1/2 top-1/2 flex size-[28%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2"
              style={{ borderColor: t.accent, background: "rgba(5,7,15,0.55)", boxShadow: `0 0 12px ${t.glow}` }}
            >
              <div className="h-[38%] w-[18%] rounded-sm" style={{ background: t.accent }} />
            </div>
          </div>
          <motion.div
            className="absolute inset-x-[4%] top-[4%] h-[38%] origin-bottom rounded-t-lg ring-1 ring-white/30"
            style={{
              background: `linear-gradient(180deg, ${t.accent} 0%, ${t.lid} 45%, ${t.face} 100%)`,
              transformStyle: "preserve-3d",
              boxShadow: `0 0 24px -4px ${t.glow}`,
            }}
            initial={false}
            animate={{ rotateX: open ? -125 : 0 }}
            transition={{ type: "spring", stiffness: 110, damping: 13 }}
          >
            <div className="absolute inset-x-[18%] bottom-[18%] h-1.5 rounded-full bg-black/30" />
            <div
              className="absolute left-1/2 top-[42%] size-2 -translate-x-1/2 rounded-full"
              style={{ background: t.accent, boxShadow: `0 0 8px ${t.glow}` }}
            />
          </motion.div>
          <AnimatePresence>
            {open ? (
              <motion.div
                className="pointer-events-none absolute left-1/2 top-[18%] h-[70%] w-[70%] -translate-x-1/2 rounded-full"
                style={{
                  background: `radial-gradient(circle, ${t.accent} 0%, transparent 68%)`,
                  mixBlendMode: "screen",
                }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0.35, 0.9, 0.5], scale: [0.7, 1.25, 1] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9 }}
                aria-hidden
              />
            ) : null}
          </AnimatePresence>
        </>
      )}
      {qty != null && qty > 0 ? (
        <span
          className="absolute -right-1 -top-1 z-10 flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums text-[#05070f] shadow-md ring-2 ring-[#05070f]/40"
          style={{ background: t.accent }}
        >
          {qty}
        </span>
      ) : null}
    </motion.div>
  );
}

export type CrateLootPayload = {
  crateId: string;
  label: string;
  credits: number;
  exp: number;
  items?: Record<string, number> | null;
  itemLabels?: Record<string, string>;
  troops?: Record<string, number> | null;
  troopLabels?: Record<string, string> | null;
  note?: string | null;
};

type LootCard = {
  id: string;
  title: string;
  value: string;
  tone: "gold" | "blue" | "sand";
  kind?: "credits" | "exp" | "item" | "troop" | "note";
  itemId?: string;
  unitId?: string;
};

/** Nota Discord (emoji custom / markdown) → testo sito leggibile. */
function cleanLootNote(raw?: string | null): string {
  return String(raw || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*/g, " · ")
    .trim();
}

function lootCardStyle(tone: LootCard["tone"], glow?: boolean) {
  const bg =
    tone === "gold"
      ? "linear-gradient(160deg,#3a2a0c,#12100a 70%)"
      : tone === "blue"
        ? "linear-gradient(160deg,#0c243a,#0a1018 70%)"
        : "linear-gradient(160deg,#1a1620,#0a0c12 70%)";
  const border =
    tone === "gold"
      ? "rgba(228,199,107,0.45)"
      : tone === "blue"
        ? "rgba(125,211,252,0.4)"
        : "rgba(244,233,216,0.2)";
  const color = tone === "gold" ? "#f0d78c" : tone === "blue" ? "#7dd3fc" : "#f4e9d8";
  const boxShadow = glow
    ? `0 0 32px -4px ${
        tone === "gold"
          ? "rgba(201,162,39,0.7)"
          : tone === "blue"
            ? "rgba(46,168,255,0.55)"
            : "rgba(244,233,216,0.25)"
      }`
    : "0 20px 50px -20px rgba(0,0,0,0.8)";
  return { background: bg, borderColor: border, color, boxShadow };
}

function LootRewardCard({
  card,
  glow,
  large,
}: {
  card: LootCard;
  glow?: boolean;
  large?: boolean;
}) {
  const s = lootCardStyle(card.tone, glow);
  return (
    <div
      className={`rounded-2xl text-center ring-1 ${large ? "w-[10.5rem] p-5" : "w-[9.5rem] p-4"}`}
      style={{ background: s.background, borderColor: s.borderColor, boxShadow: s.boxShadow }}
    >
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.22em] text-crema/50">{card.title}</p>
      {card.kind === "credits" ? (
        <div className="mt-2 flex flex-col items-center gap-1.5">
          <EventoCreditsIcon size={large ? "lg" : "md"} />
          <p
            className={`font-sans font-semibold tracking-tight leading-tight tabular-nums ${large ? "text-2xl" : "text-xl"}`}
            style={{ color: s.color }}
          >
            {card.value}
          </p>
        </div>
      ) : card.kind === "troop" && card.unitId && isTroopUnitId(card.unitId) ? (
        <div className="mt-2 flex flex-col items-center gap-1.5">
          <EventoTroopIcon unitId={card.unitId} size={large ? "lg" : "md"} alt={card.value} />
          <p
            className={`font-sans font-semibold tracking-tight leading-tight ${large ? "text-lg" : "text-base"}`}
            style={{ color: s.color }}
          >
            {card.value}
          </p>
        </div>
      ) : card.kind === "item" && card.itemId && isUtilityItemId(card.itemId) ? (
        <div className="mt-2 flex flex-col items-center gap-1.5">
          <EventoUtilityIcon itemId={card.itemId} size={large ? "lg" : "md"} alt={card.value} />
          <p
            className={`font-sans font-semibold tracking-tight leading-tight ${large ? "text-lg" : "text-base"}`}
            style={{ color: s.color }}
          >
            {card.value}
          </p>
        </div>
      ) : (
        <p
          className={`mt-2 font-sans font-semibold tracking-tight leading-tight ${large ? "text-2xl" : "text-xl"}`}
          style={{ color: s.color }}
        >
          {card.value}
        </p>
      )}
    </div>
  );
}

/**
 * Overlay stile gioco:
 * 1) tap cassa → si apre
 * 2) premi spuntano SOPRA (tap uno a uno)
 * 3) fine: niente cassa, solo riepilogo ricompense
 */
export function EventoCrateOpenOverlay({
  loot,
  onClose,
}: {
  loot: CrateLootPayload;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const [phase, setPhase] = useState<"closed" | "opened" | "revealing" | "done">("closed");
  const [revealed, setRevealed] = useState(0);

  const cards = useMemo(() => {
    const out: LootCard[] = [];
    if (loot.credits > 0) {
      out.push({
        id: "cr",
        title: "Crediti",
        value: `+${loot.credits.toLocaleString("it-IT")}`,
        tone: "gold",
        kind: "credits",
      });
    }
    if (loot.exp > 0) {
      out.push({
        id: "xp",
        title: "Esperienza",
        value: `+${loot.exp.toLocaleString("it-IT")} EXP`,
        tone: "blue",
        kind: "exp",
      });
    }
    if (loot.items && typeof loot.items === "object") {
      for (const [itemId, qty] of Object.entries(loot.items)) {
        const n = Math.max(0, Math.floor(Number(qty) || 0));
        if (!n) continue;
        const name = loot.itemLabels?.[itemId] || itemId;
        out.push({
          id: `item-${itemId}`,
          title: "Oggetto",
          value: n > 1 ? `${name} ×${n}` : name,
          tone: "sand",
          kind: "item",
          itemId,
        });
      }
    }
    let hasTroops = false;
    if (loot.troops && typeof loot.troops === "object") {
      for (const [unitId, qty] of Object.entries(loot.troops)) {
        const n = Math.max(0, Math.floor(Number(qty) || 0));
        if (!n) continue;
        hasTroops = true;
        const name = loot.troopLabels?.[unitId] || unitId.replace(/_/g, " ");
        out.push({
          id: `troop-${unitId}`,
          title: "Truppa",
          value: n > 1 ? `${name} ×${n}` : name,
          tone: "sand",
          kind: "troop",
          unitId,
        });
      }
    }
    /* Nota testuale solo se non è già coperto dalle card truppe (evita emoji Discord grezze). */
    const noteClean = cleanLootNote(loot.note);
    if (noteClean && !hasTroops) {
      out.push({ id: "note", title: "Bonus", value: noteClean, tone: "sand", kind: "note" });
    }
    if (!out.length) {
      out.push({ id: "empty", title: "Vuoto", value: "Niente questa volta", tone: "sand" });
    }
    return out;
  }, [loot]);

  const remaining = Math.max(0, cards.length - revealed);
  const t = crateTint(loot.crateId);
  const showChest = phase !== "done";

  function advance() {
    if (phase === "closed") {
      setPhase("opened");
      window.setTimeout(() => setPhase("revealing"), 450);
      return;
    }
    if (phase === "opened") {
      setPhase("revealing");
      return;
    }
    if (phase === "revealing") {
      if (revealed >= cards.length) {
        setPhase("done");
        return;
      }
      const next = revealed + 1;
      setRevealed(next);
      if (next >= cards.length) {
        window.setTimeout(() => setPhase("done"), 380);
      }
      return;
    }
    if (phase === "done") onClose();
  }

  const hint =
    phase === "closed"
      ? "Tocca la cassa per aprirla"
      : phase === "opened"
        ? "Si apre…"
        : phase === "revealing"
          ? remaining > 0
            ? `${cards.length} ${cards.length === 1 ? "ricompensa" : "ricompense"} · tocca per scoprire (${revealed + 1}/${cards.length})`
            : ""
          : "";

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-[#03050c]/94" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-60"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 100%, ${t.glow}, transparent 70%)`,
        }}
        aria-hidden
      />

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        <p className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.32em]" style={{ color: t.accent }}>
          {phase === "done" ? "Ricompense ottenute" : loot.label}
        </p>

        {/* Premi SOPRA la cassa (o solo riepilogo a fine) */}
        <div className="relative mb-4 flex min-h-[8.5rem] w-full flex-wrap items-end justify-center gap-3">
          <AnimatePresence mode="popLayout">
            {phase === "done"
              ? cards.map((c) => (
                  <motion.div
                    key={`sum-${c.id}`}
                    layout
                    initial={{ opacity: 0, y: 16, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 240, damping: 16 }}
                  >
                    <LootRewardCard card={c} large glow />
                  </motion.div>
                ))
              : null}

            {phase === "revealing" || phase === "opened"
              ? cards.map((c, i) => {
                  const isShown = i < revealed;
                  if (isShown) {
                    return (
                      <motion.div
                        key={c.id}
                        layout
                        initial={{ opacity: 0, y: 28, scale: 0.7, rotateY: 90 }}
                        animate={{ opacity: 1, y: 0, scale: 1, rotateY: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 16 }}
                      >
                        <LootRewardCard card={c} glow={i === revealed - 1} />
                      </motion.div>
                    );
                  }
                  if (i === revealed && phase === "revealing") {
                    return (
                      <motion.button
                        key={`sealed-${c.id}`}
                        type="button"
                        layout
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ type: "spring", stiffness: 280, damping: 18 }}
                        onClick={advance}
                        className="flex h-[7.5rem] w-[9.5rem] flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#1a2238] to-[#0a0e18] ring-1 ring-[#c9a227]/35"
                        style={{ boxShadow: `0 0 28px -6px ${t.glow}` }}
                      >
                        <span className="text-3xl text-[#e4c76b]/80" aria-hidden>
                          ?
                        </span>
                        <span className="mt-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-crema/45">
                          Tocca
                        </span>
                      </motion.button>
                    );
                  }
                  // slot ancora chiusi (conteggio visibile)
                  if (i > revealed && phase === "revealing") {
                    return (
                      <motion.div
                        key={`pending-${c.id}`}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.45 }}
                        className="flex h-[7.5rem] w-[9.5rem] flex-col items-center justify-center rounded-2xl bg-black/40 ring-1 ring-sand/15"
                        aria-hidden
                      >
                        <span className="text-xl text-crema/30">?</span>
                      </motion.div>
                    );
                  }
                  return null;
                })
              : null}
          </AnimatePresence>
        </div>

        {showChest ? (
          <button
            type="button"
            className="relative touch-manipulation rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]/50"
            onClick={advance}
            aria-label={hint || "Apri"}
            disabled={phase === "opened"}
          >
            <EventoCrateArt
              crateId={loot.crateId}
              size="lg"
              open={phase !== "closed"}
              shake={phase === "closed"}
            />
          </button>
        ) : null}

        {phase === "done" ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
            <EventoBtn onClick={onClose}>Continua</EventoBtn>
          </motion.div>
        ) : (
          <p className="mt-6 text-center text-xs text-crema/45">{hint}</p>
        )}
      </div>
    </motion.div>
  );
}
