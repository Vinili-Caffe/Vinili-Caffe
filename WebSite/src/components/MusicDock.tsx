"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import { useChromeOpenListener } from "@/lib/chrome-open";
import { Range } from "@/components/ui";

const BOTTOM = "bottom-[max(0.75rem,env(safe-area-inset-bottom))]";

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

/** Desktop: pannello fisso in basso a destra. Mobile: FAB compatto che apre il pannello. */
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
  const [panel, setPanel] = useState(false);
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
  const curSec = duration > 0 ? seek * duration : 0;
  const showSeek = Boolean(seekEnabled && onSeek);
  const status = failed || hint || null;

  const panelBody = (
    <div className="overflow-hidden rounded-xl bg-espresso/95 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.85)] ring-1 ring-sand/20">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={on}
          aria-label={on ? "Pausa" : "Play"}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-caramel text-ink transition hover:brightness-105 active:scale-[0.97]"
        >
          {on ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current pl-px" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8rem] font-medium leading-tight text-crema" title={label}>
            {label}
          </p>
          {status ? (
            <p className={cn("truncate text-[0.65rem] leading-tight", failed ? "text-ember/90" : "text-crema/50")}>
              {status}
            </p>
          ) : (
            <p className="text-[0.6rem] uppercase tracking-[0.14em] text-crema/40">
              {on ? "In play" : "In pausa"}
            </p>
          )}
        </div>
      </div>

      {showSeek ? (
        <div className="px-2.5 pb-1">
          <Range
            min={0}
            max={1000}
            step={1}
            value={seekPct}
            aria-label="Posizione brano"
            onChange={(n) => onSeek?.(n / 1000)}
            className="w-full"
          />
          <div className="-mt-0.5 flex justify-between font-mono text-[0.58rem] tabular-nums text-crema/40">
            <span>{fmtTime(curSec)}</span>
            <span>{duration > 0 ? fmtTime(duration) : "—:—"}</span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-1.5 border-t border-sand/10 px-2.5 py-1.5">
        <button
          type="button"
          aria-label={mutedUi || volume < 0.001 ? "Riattiva audio" : "Disattiva audio"}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-crema/65 transition hover:bg-crema/8 hover:text-crema"
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
            <VolumeX className="size-3" />
          ) : volume < 0.45 ? (
            <Volume1 className="size-3" />
          ) : (
            <Volume2 className="size-3" />
          )}
        </button>
        <Range
          min={0}
          max={100}
          step={1}
          value={volPct}
          aria-label="Volume"
          onChange={(n) => onVolume(n / 100)}
          className="min-w-0 flex-1"
        />
        <span className="w-6 shrink-0 text-right font-mono text-[0.58rem] tabular-nums text-crema/40">
          {volPct}
        </span>
      </div>
    </div>
  );

  return (
    <div
      ref={wrap}
      className={cn(
        "pointer-events-auto fixed right-3 z-[60] sm:right-4",
        BOTTOM,
        /* Desktop: pannello; mobile: colonna allineata a destra (FAB) */
        "flex w-[min(15rem,calc(100vw-1.5rem))] flex-col items-stretch md:block",
        "max-md:w-auto max-md:items-end max-md:gap-2",
      )}
      role="region"
      aria-label="Lettore musica"
    >
      {/* Desktop: sempre aperto */}
      <div className="hidden md:block">{panelBody}</div>

      {/* Mobile: pannello solo se aperto */}
      {panel ? <div className="w-[min(15rem,calc(100vw-1.5rem))] md:hidden">{panelBody}</div> : null}

      {/* Mobile FAB */}
      <button
        type="button"
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-full bg-espresso/95 text-crema shadow-lg ring-1 ring-sand/25 transition hover:bg-caramel/25 md:hidden",
          on && "text-caramel",
        )}
        aria-pressed={on}
        aria-expanded={panel}
        aria-label={label}
        title={label}
        onClick={() => {
          setPanel(true);
          onToggle();
        }}
      >
        {on ? <Music className="size-[1.15rem]" /> : <VolumeX className="size-[1.15rem]" />}
      </button>
    </div>
  );
}
