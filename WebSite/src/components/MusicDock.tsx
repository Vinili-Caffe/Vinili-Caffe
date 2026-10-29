"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Volume1, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import { useChromeOpenListener } from "@/lib/chrome-open";
import { Range } from "@/components/ui";
import { ElasticSlider } from "./ui/elastic-slider";

const BOTTOM_BASE = "bottom-[max(1.25rem,env(safe-area-inset-bottom))]";
const BOTTOM_RAISED = "bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+3.25rem)]";

function readBackTopOn() {
  try {
    return document.documentElement.hasAttribute("data-vc-back-top-on");
  } catch {
    return false;
  }
}

/** Ascolta la freccia “torna su”: alza il dock solo se è visibile. */
function useBackTopRaised() {
  const [raised, setRaised] = useState(false);
  useEffect(() => {
    const sync = () => setRaised(readBackTopOn());
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-vc-back-top-on"] });
    return () => mo.disconnect();
  }, []);
  return raised;
}

type Props = {
  label?: string;
  on: boolean;
  onToggle: () => void;
  volume: number;
  onVolume: (v: number) => void;
  /** 0–1; solo serata film */
  seek?: number;
  onSeek?: (v: number) => void;
  seekEnabled?: boolean;
  hint?: string | null;
  failed?: string | null;
};

/**
 * FAB musica (confessionale / serata): in basso a destra;
 * sale solo se c’è la freccia torna-su. Volume sempre; seek opzionale.
 */
export function MusicDock({
  label = "Musica",
  on,
  onToggle,
  volume,
  onVolume,
  seek = 0,
  onSeek,
  seekEnabled = false,
  hint,
  failed,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [chromeOpen, setChromeOpen] = useState(false);
  const [panel, setPanel] = useState(false);
  const raised = useBackTopRaised();

  useEffect(() => useChromeOpenListener(setChromeOpen), []);

  useEffect(() => {
    if (!panel) return;
    const close = (e: PointerEvent) => {
      if (wrap.current?.contains(e.target as Node)) return;
      setPanel(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [panel]);

  if (chromeOpen) return null;

  const volPct = Math.round(Math.min(1, Math.max(0, volume)) * 100);
  const seekPct = Math.round(Math.min(1, Math.max(0, seek)) * 1000);

  return (
    <div
      ref={wrap}
      className={cn(
        "fixed right-3 z-[60] flex flex-col items-end gap-2 transition-[bottom] duration-200 sm:right-5",
        raised ? BOTTOM_RAISED : BOTTOM_BASE,
      )}
      onMouseEnter={() => setPanel(true)}
      onMouseLeave={() => setPanel(false)}
    >
      {hint ? (
        <p className="rounded-full bg-espresso/95 px-3 py-1.5 text-xs text-crema/80 ring-1 ring-sand/20 shadow-lg">{hint}</p>
      ) : null}
      {failed ? (
        <p className="max-w-[12rem] rounded-2xl bg-espresso/95 px-3 py-1.5 text-xs text-crema/70 ring-1 ring-sand/20">{failed}</p>
      ) : null}

      {panel ? (
        <div className="w-[min(16.5rem,calc(100vw-1.5rem))] space-y-2.5 rounded-2xl bg-espresso/95 p-3 shadow-lg ring-1 ring-sand/25">
          {seekEnabled && onSeek ? (
            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45">Brano</span>
              <Range
                min={0}
                max={1000}
                step={1}
                value={seekPct}
                aria-label="Posizione brano"
                onChange={(n) => onSeek(n / 1000)}
                className="w-full"
              />
            </label>
          ) : null}
          {/* volume elastico (Elastic Slider di React Bits) */}
          <ElasticSlider
            value={volPct / 100}
            onChange={onVolume}
            label="Volume musica"
            left={<Volume1 className="size-3.5 shrink-0 text-crema/50" aria-hidden />}
            right={<Volume2 className="size-3.5 shrink-0 text-crema/50" aria-hidden />}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setPanel(true);
          onToggle();
        }}
        aria-pressed={on}
        aria-expanded={panel}
        aria-label={label}
        title={label}
        className="inline-flex size-11 items-center justify-center rounded-full bg-espresso/95 text-crema ring-1 ring-sand/25 shadow-lg transition hover:bg-caramel/25"
      >
        {on ? <Music className="size-[1.15rem] text-caramel" /> : <VolumeX className="size-[1.15rem]" />}
      </button>
    </div>
  );
}
