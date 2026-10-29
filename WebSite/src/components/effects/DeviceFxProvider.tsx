"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  applyDeviceFxDom,
  buildDeviceFxProfile,
  DEFAULT_CAPS,
  deriveDebugTier,
  getFxMotionPolicy,
  loadCachedDeviceFx,
  rebuildProfile,
  sampleFps,
  saveDeviceFx,
  setFxMotionPolicy,
  watchBattery,
  watchLongTasks,
  type DeviceFxProfile,
  type FxCaps,
  type FxMotionPolicy,
  type FxTier,
} from "@/lib/device-fx";

type DeviceFxApi = {
  ready: boolean;
  profile: DeviceFxProfile | null;
  caps: FxCaps;
  allowMotion: boolean;
  /** @deprecated debug only — usa `caps`. */
  tier: FxTier;
  refresh: () => void;
  setPolicy: (p: FxMotionPolicy) => void;
};

const Ctx = createContext<DeviceFxApi | null>(null);

const FALLBACK: DeviceFxProfile = {
  v: 3,
  at: 0,
  cores: 4,
  memoryGb: null,
  dpr: 1,
  touch: false,
  desktopPointer: true,
  saveData: false,
  net: null,
  downlink: null,
  rtt: null,
  reducedMotionOs: false,
  reducedDataOs: false,
  webgl: true,
  gpu: null,
  platform: null,
  batteryLevel: null,
  batteryCharging: null,
  longTaskHeavy: false,
  score: 50,
  fps: null,
  policy: "auto",
  caps: { ...DEFAULT_CAPS },
  allowMotion: true,
};

function publish(profile: DeviceFxProfile) {
  saveDeviceFx(profile);
  applyDeviceFxDom(profile);
  return profile;
}

/**
 * Metriche hardware/rete/battery → caps indipendenti.
 * FPS + long tasks downgradeano solo le caps care.
 */
export function DeviceFxProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<DeviceFxProfile | null>(null);
  const batteryRef = useRef<{ level: number | null; charging: boolean | null }>({
    level: null,
    charging: null,
  });
  const longTaskRef = useRef(false);

  const refresh = useCallback(() => {
    setProfile((prev) =>
      publish(
        buildDeviceFxProfile(getFxMotionPolicy(), {
          battery: batteryRef.current,
          longTaskHeavy: longTaskRef.current,
          fps: prev?.fps ?? null,
        }),
      ),
    );
    setReady(true);
  }, []);

  const setPolicy = useCallback(
    (p: FxMotionPolicy) => {
      setFxMotionPolicy(p);
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    const cached = loadCachedDeviceFx();
    const next = publish(
      buildDeviceFxProfile(getFxMotionPolicy(), {
        battery: batteryRef.current,
        longTaskHeavy: longTaskRef.current,
        fps: cached?.fps ?? null,
      }),
    );
    setProfile(next);
    setReady(true);

    let cancelled = false;
    let mqMotion: MediaQueryList | null = null;
    let mqData: MediaQueryList | null = null;
    const onMedia = () => {
      if (!cancelled) refresh();
    };
    try {
      mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      mqMotion.addEventListener?.("change", onMedia);
    } catch {
      /* ignore */
    }
    try {
      mqData = window.matchMedia("(prefers-reduced-data: reduce)");
      mqData.addEventListener?.("change", onMedia);
    } catch {
      /* ignore */
    }

    const conn = (navigator as Navigator & { connection?: EventTarget & { addEventListener?: Function } }).connection;
    const onNet = () => {
      if (!cancelled) refresh();
    };
    try {
      conn?.addEventListener?.("change", onNet);
    } catch {
      /* ignore */
    }

    let stopBattery = () => {};
    void watchBattery((snap) => {
      batteryRef.current = snap;
      if (cancelled) return;
      setProfile((prev) => {
        const base =
          prev ??
          buildDeviceFxProfile(getFxMotionPolicy(), {
            battery: snap,
            longTaskHeavy: longTaskRef.current,
          });
        return publish(
          rebuildProfile(base, {
            batteryLevel: snap.level,
            batteryCharging: snap.charging,
          }),
        );
      });
    }).then((h) => {
      stopBattery = h.stop;
      batteryRef.current = h.snap;
      if (h.snap.level != null || h.snap.charging != null) {
        setProfile((prev) => {
          if (!prev) return prev;
          return publish(
            rebuildProfile(prev, {
              batteryLevel: h.snap.level,
              batteryCharging: h.snap.charging,
            }),
          );
        });
      }
    });

    const stopLong = watchLongTasks((heavy) => {
      longTaskRef.current = heavy;
      if (cancelled) return;
      setProfile((prev) => {
        if (!prev) return prev;
        return publish(rebuildProfile(prev, { longTaskHeavy: heavy }));
      });
    });

    const runFps = () => {
      void sampleFps(900).then((fps) => {
        if (cancelled) return;
        setProfile((prev) => {
          const base =
            prev ??
            buildDeviceFxProfile(getFxMotionPolicy(), {
              battery: batteryRef.current,
              longTaskHeavy: longTaskRef.current,
            });
          return publish(rebuildProfile(base, { fps }));
        });
      });
    };

    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback;
      if (typeof ric === "function") idleId = ric(runFps, { timeout: 2200 });
      else timeoutId = setTimeout(runFps, 1200);
    } catch {
      timeoutId = setTimeout(runFps, 1200);
    }

    const onVis = () => {
      if (document.visibilityState === "visible") runFps();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      try {
        mqMotion?.removeEventListener?.("change", onMedia);
      } catch {
        /* ignore */
      }
      try {
        mqData?.removeEventListener?.("change", onMedia);
      } catch {
        /* ignore */
      }
      try {
        conn?.removeEventListener?.("change", onNet);
      } catch {
        /* ignore */
      }
      document.removeEventListener("visibilitychange", onVis);
      stopBattery();
      stopLong();
      if (timeoutId) clearTimeout(timeoutId);
      try {
        const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (idleId != null && typeof cic === "function") cic(idleId);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  const value = useMemo<DeviceFxApi>(() => {
    const p = profile;
    const caps = p?.caps ?? DEFAULT_CAPS;
    return {
      ready,
      profile: p,
      caps,
      allowMotion: p?.allowMotion ?? true,
      tier: deriveDebugTier(caps),
      refresh,
      setPolicy,
    };
  }, [ready, profile, refresh, setPolicy]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeviceFx(): DeviceFxApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      ready: false,
      profile: FALLBACK,
      caps: DEFAULT_CAPS,
      allowMotion: true,
      tier: "balanced",
      refresh: () => {},
      setPolicy: () => {},
    };
  }
  return ctx;
}

export function useRichFx(): boolean {
  const { caps } = useDeviceFx();
  return caps.continuous;
}

export function useFxCap<K extends keyof FxCaps>(key: K): FxCaps[K] {
  const { caps } = useDeviceFx();
  return caps[key];
}
