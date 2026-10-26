// "Vedi come" — solo fondatore. Header reale: X-VC-View-As.
// Preset accettati dal bot (siteViewAsPreview.js): logout | member | helper | mod | senior | director | highstaff | pm.
// Gate: GET /webhooks/site-staff-access → viewAsAllowed || isFounder (canUseViewAs = ruolo Founder).
// Ospite = logout, Utente = member, Staff = i ruoli staff del preset.

const MODE_KEY = "vc_view_as";
const ALLOWED_KEY = "vc_view_as_allowed";
const BAR_KEY = "vc_view_as_bar_open";
const TOKEN_KEY = "vc_discord_access_token";
const EXPIRES_KEY = "vc_discord_expires_at";

export const VIEW_AS_HEADER = "X-VC-View-As";

export type ViewAsGroup = "real" | "guest" | "user" | "staff";

export type ViewAsPreset = {
  /** Valore inviato in X-VC-View-As. "" = reale, niente header. */
  id: string;
  label: string;
  group: ViewAsGroup;
};

export const VIEW_AS_PRESETS: ViewAsPreset[] = [
  { id: "", label: "Reale", group: "real" },
  { id: "logout", label: "Ospite", group: "guest" },
  { id: "member", label: "Utente", group: "user" },
  { id: "helper", label: "Helper", group: "staff" },
  { id: "mod", label: "Mod", group: "staff" },
  { id: "senior", label: "Senior Moderator", group: "staff" },
  { id: "director", label: "Director", group: "staff" },
  { id: "highstaff", label: "High Staff", group: "staff" },
  { id: "pm", label: "Partner Manager", group: "staff" },
];

const ALLOWED = new Set(VIEW_AS_PRESETS.map((p) => p.id).filter(Boolean));

const listeners = new Set<() => void>();
let chromeAllowed = false;
const chromeListeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeChromeAllowed(cb: () => void) {
  chromeListeners.add(cb);
  return () => chromeListeners.delete(cb);
}

export function chromeAllowedNow() {
  return chromeAllowed;
}

export function setChromeAllowed(on: boolean) {
  if (chromeAllowed === on) return;
  chromeAllowed = on;
  chromeListeners.forEach((fn) => fn());
}

export function subscribeViewAs(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function normalizeViewAs(raw: unknown) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!v || v === "real" || v === "none" || v === "off") return "";
  if (v === "seniormoderator" || v === "seniormod") return "senior";
  if (v === "hs" || v === "high") return "highstaff";
  if (v === "partnermanager" || v === "partner") return "pm";
  if (v === "guest" || v === "ospite") return "logout";
  if (v === "user" || v === "utente" || v === "membro") return "member";
  if (v === "staff") return "helper";
  return ALLOWED.has(v) ? v : "";
}

export function readViewAs() {
  if (typeof window === "undefined") return "";
  try {
    return normalizeViewAs(sessionStorage.getItem(MODE_KEY));
  } catch {
    return "";
  }
}

export function isGuestPreview() {
  return readViewAs() === "logout";
}

export function viewAsLabel(mode = readViewAs()) {
  return VIEW_AS_PRESETS.find((p) => p.id === mode)?.label || "Reale";
}

export function readRealToken() {
  if (typeof window === "undefined") return "";
  try {
    const t = String(localStorage.getItem(TOKEN_KEY) || "").trim();
    const exp = Number(localStorage.getItem(EXPIRES_KEY) || 0);
    if (!t || (exp && exp < Date.now() + 60_000)) return "";
    return t;
  } catch {
    return "";
  }
}

export function isViewAsBarOpen() {
  if (readViewAs()) return true;
  try {
    return localStorage.getItem(BAR_KEY) === "1";
  } catch {
    return false;
  }
}

export function setViewAsBarOpen(on: boolean) {
  try {
    if (on) localStorage.setItem(BAR_KEY, "1");
    else localStorage.removeItem(BAR_KEY);
  } catch {
    /* storage pieno */
  }
  notify();
}

export function viewAsAllowedSticky() {
  try {
    return sessionStorage.getItem(ALLOWED_KEY) === "1";
  } catch {
    return false;
  }
}

const PROBE_KEY = "vc_view_as_probe";

export function readViewAsProbe(): "allow" | "deny" | "" {
  try {
    const v = sessionStorage.getItem(PROBE_KEY);
    return v === "allow" || v === "deny" ? v : "";
  } catch {
    return "";
  }
}

export function writeViewAsProbe(v: "allow" | "deny" | "") {
  try {
    if (!v) sessionStorage.removeItem(PROBE_KEY);
    else sessionStorage.setItem(PROBE_KEY, v);
  } catch {
    /* ignore */
  }
}

/** Sceglie un preset e ricarica, così staff-access e le pagine rileggono il header. */
export function applyViewAs(next: string) {
  const mode = normalizeViewAs(next);
  try {
    if (!mode) sessionStorage.removeItem(MODE_KEY);
    else sessionStorage.setItem(MODE_KEY, mode);
    if (mode) localStorage.setItem(BAR_KEY, "1");
    sessionStorage.setItem(ALLOWED_KEY, "1");
  } catch {
    /* ignore */
  }
  if (typeof location !== "undefined") location.reload();
}

export function closeViewAsBar() {
  if (readViewAs()) {
    try {
      sessionStorage.removeItem(MODE_KEY);
      localStorage.removeItem(BAR_KEY);
    } catch {
      /* ignore */
    }
    if (typeof location !== "undefined") location.reload();
    return;
  }
  setViewAsBarOpen(false);
}

/** allow = fondatore (anche in preview). deny = risposta esplicita senza il flag. error = rete. */
export async function probeViewAsGate(): Promise<"allow" | "deny" | "error"> {
  const t = readRealToken();
  if (!t) return "deny";
  try {
    const r = await fetch("/webhooks/site-staff-access", {
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
    });
    if (r.status === 502 || r.status === 503 || r.status === 504) return "error";
    const data = (await r.json().catch(() => null)) as { viewAsAllowed?: boolean; isFounder?: boolean } | null;
    if (data && (data.viewAsAllowed === true || data.isFounder === true)) return "allow";
    if (!r.ok && r.status >= 500) return "error";
    return "deny";
  } catch {
    return "error";
  }
}

export function clearViewAsIfDenied() {
  try {
    sessionStorage.removeItem(MODE_KEY);
    sessionStorage.removeItem(ALLOWED_KEY);
    localStorage.removeItem(BAR_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

function installFetchPatch() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __vcViewAsFetchPatched?: boolean };
  if (w.__vcViewAsFetchPatched) return;
  w.__vcViewAsFetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input instanceof Request
              ? input.url
              : String(input);
      const mode = readViewAs();
      if (mode && /\/webhooks\//i.test(url)) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set(VIEW_AS_HEADER, mode);
        const auth = headers.get("Authorization") || "";
        if (!auth || /^Bearer\s*$/i.test(auth)) {
          const real = readRealToken();
          if (real) headers.set("Authorization", `Bearer ${real}`);
        }
        init = { ...init, headers };
      }
    } catch {
      /* non bloccare la fetch */
    }
    return orig(input, init);
  };
}

installFetchPatch();
