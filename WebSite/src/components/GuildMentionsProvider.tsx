"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadGuildMentionsCatalog, type GuildMentionsCatalog } from "@/lib/guild-mentions";
import { roleIdFromLabel } from "@/lib/official-role-ids";
import { subscribeSiteRealtime } from "@/lib/site-realtime";

const EMPTY: GuildMentionsCatalog = { roles: {}, channels: {}, roleMeta: {}, fetchedAt: 0 };

const GuildMentionsContext = createContext<GuildMentionsCatalog>(EMPTY);

/** Carica i nomi live Discord (ruoli + canali) e li aggiorna su rename. */
export function GuildMentionsProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<GuildMentionsCatalog>(EMPTY);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    void loadGuildMentionsCatalog(ac.signal).then((next) => {
      if (!ac.signal.aborted) setCatalog(next);
    });
    return () => ac.abort();
  }, [tick]);

  useEffect(() => {
    return subscribeSiteRealtime((ping) => {
      if (ping.type !== "roles_mentions_changed") return;
      setTick((n) => n + 1);
    });
  }, []);

  const value = useMemo(() => catalog, [catalog]);
  return <GuildMentionsContext.Provider value={value}>{children}</GuildMentionsContext.Provider>;
}

export function useGuildMentions(): GuildMentionsCatalog {
  return useContext(GuildMentionsContext);
}

/** Nome ruolo live da id o da etichetta storica nei testi del sito. */
export function useLiveRoleName(idOrLabel: string, fallback?: string): string {
  const catalog = useGuildMentions();
  const id = roleIdFromLabel(idOrLabel) || (/^\d{16,22}$/.test(idOrLabel.trim()) ? idOrLabel.trim() : null);
  if (id && catalog.roles[id]) return catalog.roles[id];
  return fallback || idOrLabel;
}
