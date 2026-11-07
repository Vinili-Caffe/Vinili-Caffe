"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import { useChromeOpenListener } from "@/lib/chrome-open";
import { Range } from "@/components/ui";

const BOTTOM = "bottom-[max(0.65rem,env(safe-area-inset-bottom))]";

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

type Props = {
  label?: string;
  on: boolean;
  onToggle: () => void;
  volume: number;
  onVolume: (v: number) => void;
  seek?: number;
  onSeek?: (v: number) => void;
  seekEnabled?: boolean;
  duration?: number;
  hint?: string | null;
  failed?: string | null;
};

/** Mini-player compatto: titolo, play/pause, seek, volume. */
export function MusicDock({
  label = "Musica",
  on,
  onToggle,
  volume,
  onVolume,
  seek = 0,
  onSeek,
  seekEnabled = false,
  duration = 0,
  hint,
  failed,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [chromeOpen, setChromeOpen] = useState(false);
  const [mutedUi, setMutedUi] = useState(false);
  const volBeforeMute = useRef(volume > 0 ? volume : 0.5);

  useEffect(() => useChromeOpenListener(setChromeOpen), []);

  useEffect(() => {
    if (volume > 0.001) {
      volBeforeMute.current = volume;
      setMutedUi(false);
    } else {
      setMutedUi(true);
    }
  }, [volume]);

  if (chromeOpen) return null;

  const volPct = Math.round(Math.min(1, Math.max(0, volume)) * 100);
  const seekPct = Math.round(Math.min(1, Math.max(0, seek)) * 1000);
  const curSec = duration > 0 ? seek * duration : 0;
  const showSeek = Boolean(seekEnabled && onSeek);
  const status = failed || hint || null;

  return (
    <div
      ref={wrap}
      className={cn(
        "pointer-events-auto fixed left-3 z-[60] w-[min(13.25rem,calc(100vw-1.5rem))] sm:left-4",
        BOTTOM,
      )}
      role="region"
      aria-label="Lettore musica"
    >
      <div className="overflow-hidden rounded-lg bg-espresso/95 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.85)] ring-1 ring-sand/20">
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={on}
            aria-label={on ? "Pausa" : "Play"}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-caramel text-ink transition hover:brightness-105 active:scale-[0.97]"
          >
            {on ? <Pause className="size-3 fill-current" /> : <Play className="size-3 fill-current pl-px" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.7rem] font-medium leading-tight text-crema" title={label}>
              {label}
            </p>
            {status ? (
              <p className={cn("truncate text-[0.58rem] leading-tight", failed ? "text-ember/90" : "text-crema/50")}>
                {status}
              </p>
            ) : (
              <p className="text-[0.55rem] uppercase tracking-[0.12em] text-crema/40">
                {on ? "In play" : "In pausa"}
              </p>
            )}
          </div>
        </div>

        {showSeek ? (
          <div className="px-2 pb-0.5">
            <Range
              min={0}
              max={1000}
              step={1}
              value={seekPct}
              aria-label="Posizione brano"
              onChange={(n) => onSeek?.(n / 1000)}
              className="h-1.5 w-full"
            />
            <div className="-mt-0.5 flex justify-between font-mono text-[0.52rem] tabular-nums text-crema/40">
              <span>{fmtTime(curSec)}</span>
              <span>{duration > 0 ? fmtTime(duration) : "—:—"}</span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-1 border-t border-sand/10 px-2 py-1">
          <button
            type="button"
            aria-label={mutedUi || volume < 0.001 ? "Riattiva audio" : "Disattiva audio"}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-crema/65 transition hover:bg-crema/8 hover:text-crema"
            onClick={() => {
              if (mutedUi || volume < 0.001) {
                onVolume(volBeforeMute.current || 0.5);
              } else {
                volBeforeMute.current = volume;
                onVolume(0);
              }
            }}
          >
            {mutedUi || volume < 0.001 ? (
              <VolumeX className="size-2.5" />
            ) : volume < 0.45 ? (
              <Volume1 className="size-2.5" />
            ) : (
              <Volume2 className="size-2.5" />
            )}
          </button>
          <Range
            min={0}
            max={100}
            step={1}
            value={volPct}
            aria-label="Volume"
            onChange={(n) => onVolume(n / 100)}
            className="h-1.5 min-w-0 flex-1"
          />
          <span className="w-5 shrink-0 text-right font-mono text-[0.52rem] tabular-nums text-crema/40">
            {volPct}
          </span>
        </div>
      </div>
    </div>
  );
}
