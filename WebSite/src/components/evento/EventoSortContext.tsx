"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchEventoStatus } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";

type Ctx = {
  ready: boolean;
  needsSort: boolean;
  refresh: () => void;
};

const EventoSortCtx = createContext<Ctx>({ ready: false, needsSort: true, refresh: () => {} });

export function EventoSortProvider({ children }: { children: ReactNode }) {
  const { ready, token } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [needsSort, setNeedsSort] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      if (!token) {
        if (alive) {
          setNeedsSort(true);
          setLoaded(true);
        }
        return;
      }
      const st = await fetchEventoStatus(token);
      if (!alive) return;
      setNeedsSort(Boolean(st.ok && st.needsSort));
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [ready, token, tick]);

  const value = useMemo(
    () => ({ ready: ready && loaded, needsSort, refresh }),
    [ready, loaded, needsSort, refresh],
  );

  return <EventoSortCtx.Provider value={value}>{children}</EventoSortCtx.Provider>;
}

export function useEventoSortGate() {
  return useContext(EventoSortCtx);
}
