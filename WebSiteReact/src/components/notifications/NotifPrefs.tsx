"use client";

import { useEffect, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  DISCORD_DM_KEYS,
  DM_LABEL_OVERRIDE,
  STAFF_ONLY_SITE_KEYS,
  VOTE_DM_KEYS,
  loadNotifPrefs,
  mutateNotifPrefs,
  type NotifPrefs as Prefs,
  type PrefToggle,
} from "@/lib/notifications";
import { cn } from "@/lib/cn";

type AccId = "vote" | "discord" | "site";

function Switch({ on, label, disabled, onToggle }: { on: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-crema/80">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "flex h-6 w-11 shrink-0 items-center overflow-hidden rounded-full border-0 p-0.5 transition-colors disabled:opacity-50",
          on ? "bg-caramel" : "bg-crema/15 ring-1 ring-sand/25",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "block size-5 shrink-0 rounded-full bg-crema shadow transition-transform duration-200 ease-out will-change-transform",
            on ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

function Accordion({
  id,
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  id: AccId;
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl ring-1 ring-sand/12", open && "bg-crema/[0.03]")}>
      <button
        type="button"
        data-acc={id}
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-crema">{title}</span>
          {hint ? <span className="block text-xs text-crema/45">{hint}</span> : null}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-crema/50 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="space-y-0.5 border-t border-sand/10 px-3.5 pb-3 pt-1">{children}</div> : null}
    </div>
  );
}

/** Pannello filtri notifiche (DM + sito), come sul sito vecchio. */
export function NotifPrefs({
  token,
  isStaff,
  open,
  onOpenChange,
}: {
  token: string;
  isStaff: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState(false);
  const [acc, setAcc] = useState<Record<AccId, boolean>>({ vote: true, discord: false, site: true });

  useEffect(() => {
    if (!open || !token) return;
    let alive = true;
    loadNotifPrefs(token).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setStatus(r.message || "Impossibile caricare i filtri.");
        setErr(true);
        setPrefs({ dm: null, siteNotif: null });
        return;
      }
      setPrefs(r.data);
      setStatus("");
      setErr(false);
    });
    return () => {
      alive = false;
    };
  }, [open, token]);

  const flash = (msg: string, isError = false) => {
    setStatus(msg);
    setErr(isError);
    if (!isError) window.setTimeout(() => setStatus(""), 2200);
  };

  const apply = (partial: Prefs) => {
    setPrefs((prev) => ({
      dm: partial.dm ?? prev?.dm ?? null,
      siteNotif: partial.siteNotif ?? prev?.siteNotif ?? null,
    }));
  };

  const toggle = async (section: "dm" | "site_notif", key: string, digest = false) => {
    setBusy(true);
    flash("Salvataggio…");
    const r = await mutateNotifPrefs(token, {
      section,
      action: digest ? "toggle_digest" : "toggle",
      key,
    });
    setBusy(false);
    if (!r.ok) return flash(r.message, true);
    apply(r.data);
    flash(r.data.message || "Preferenze aggiornate.");
  };

  const all = async (action: "all_on" | "all_off") => {
    setBusy(true);
    flash("Salvataggio…");
    const dm = await mutateNotifPrefs(token, { section: "dm", action });
    const site = await mutateNotifPrefs(token, { section: "site_notif", action });
    setBusy(false);
    if (!dm.ok && !site.ok) return flash(dm.message || site.message, true);
    apply({
      dm: dm.ok ? dm.data.dm : prefs?.dm ?? null,
      siteNotif: site.ok ? site.data.siteNotif : prefs?.siteNotif ?? null,
    });
    flash("Preferenze aggiornate.");
  };

  const dmCats = prefs?.dm?.categories ?? [];
  const siteGroups = prefs?.siteNotif?.groups ?? [];
  const digests = prefs?.siteNotif?.digests ?? [];
  const voteRows = dmCats.filter((c) => VOTE_DM_KEYS.has(c.key));
  const discordRows = dmCats.filter((c) => DISCORD_DM_KEYS.has(c.key));
  const siteRows = siteGroups.filter((g) => (STAFF_ONLY_SITE_KEYS.has(g.key) ? isStaff : true));

  const rowLabel = (c: PrefToggle) => DM_LABEL_OVERRIDE[c.key] || c.label || c.key;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="vc-notif-prefs-panel"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
          open ? "bg-caramel text-ink" : "bg-crema/6 text-crema/65 ring-1 ring-sand/15 hover:text-crema",
        )}
      >
        <SlidersHorizontal className="size-3.5" />
        Filtri
      </button>

      {open ? (
        <div
          id="vc-notif-prefs-panel"
          role="dialog"
          aria-label="Filtri notifiche"
          className="absolute right-0 z-30 mt-2 w-[min(100vw-2rem,22rem)] rounded-3xl bg-roast/95 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-sand/20 backdrop-blur-md"
        >
          {status ? (
            <p className={cn("mb-2 rounded-xl px-3 py-2 text-xs", err ? "bg-red-500/15 text-red-200" : "bg-caramel/10 text-crema/75")}>
              {status}
            </p>
          ) : null}

          {!prefs ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-2xl bg-crema/5" />
              ))}
            </div>
          ) : !dmCats.length && !siteGroups.length ? (
            <p className="px-2 py-4 text-center text-sm text-crema/50">Nessuna preferenza disponibile.</p>
          ) : (
            <div className="space-y-2">
              <Accordion id="vote" title="Promemoria voto" hint="DM + sito" open={acc.vote} onToggle={() => setAcc((a) => ({ ...a, vote: !a.vote }))}>
                {voteRows.length ? (
                  voteRows.map((c) => (
                    <Switch key={c.key} on={c.enabled} label={rowLabel(c)} disabled={busy} onToggle={() => toggle("dm", c.key)} />
                  ))
                ) : (
                  <p className="py-2 text-sm text-crema/40">—</p>
                )}
              </Accordion>
              <Accordion id="discord" title="Discord DM" open={acc.discord} onToggle={() => setAcc((a) => ({ ...a, discord: !a.discord }))}>
                {discordRows.length ? (
                  discordRows.map((c) => (
                    <Switch key={c.key} on={c.enabled} label={rowLabel(c)} disabled={busy} onToggle={() => toggle("dm", c.key)} />
                  ))
                ) : (
                  <p className="py-2 text-sm text-crema/40">—</p>
                )}
              </Accordion>
              <Accordion id="site" title="Sito" open={acc.site} onToggle={() => setAcc((a) => ({ ...a, site: !a.site }))}>
                {siteRows.length ? (
                  siteRows.map((g) => (
                    <Switch key={g.key} on={g.enabled} label={g.label || g.key} disabled={busy} onToggle={() => toggle("site_notif", g.key)} />
                  ))
                ) : (
                  <p className="py-2 text-sm text-crema/40">—</p>
                )}
                {isStaff &&
                  digests.map((g) => (
                    <Switch
                      key={`d-${g.key}`}
                      on={g.enabled}
                      label={g.label || g.key}
                      disabled={busy}
                      onToggle={() => toggle("site_notif", g.key, true)}
                    />
                  ))}
              </Accordion>
            </div>
          )}

          <div className="mt-3 flex gap-2 border-t border-sand/10 pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => all("all_on")}
              className="flex-1 rounded-full bg-crema/8 px-3 py-2 text-xs font-semibold text-crema/80 ring-1 ring-sand/20 hover:bg-crema/12 disabled:opacity-50"
            >
              Attiva tutto
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => all("all_off")}
              className="flex-1 rounded-full bg-crema/8 px-3 py-2 text-xs font-semibold text-crema/80 ring-1 ring-sand/20 hover:bg-crema/12 disabled:opacity-50"
            >
              Disattiva tutto
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
