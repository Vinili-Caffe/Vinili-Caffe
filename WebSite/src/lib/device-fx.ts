/**
 * Capability FX da metriche runtime (CPU/RAM/rete/GPU/DPR/touch/battery/FPS/longtasks).
 * Ogni effetto chiede la propria soglia: niente profili lite/balanced/full fissi.
 */

/** auto = smart; respect = non sovrascrivere OS; enhance = forza bellezza se regge; off = spegni FX. */
export type FxMotionPolicy = "auto" | "respect" | "enhance" | "off";

/** Flag indipendenti: ogni effetto guarda solo ciò che gli serve. */
export type FxCaps = {
  motion: boolean;
  /** backdrop-filter / blur UI (navbar, menu, toast…). */
  blur: boolean;
  continuous: boolean;
  pointerFx: boolean;
  canvas: boolean;
  confettiRich: boolean;
  scrollChrome: boolean;
  fog: boolean;
  particles: number;
  flyer: boolean;
  boo: boolean;
  dprCap: number;
  /** GIF animate / media pesanti / size CDN alte. */
  mediaHeavy: boolean;
  /** Glow / orb decorative (blur-2xl). */
  orbs: boolean;
  /** animate-ping (live dots). */
  ping: boolean;
  /** Type-sfx / soft clicks. */
  sound: boolean;
  /** Prefetch Link / DNS aggressivo. */
  prefetch: boolean;
  /** Moltiplicatore poll (1 = normale, 2 = metà frequenza…). */
  pollMult: number;
  /** Cap size immagini CDN (px). */
  imageSizeCap: number;
};

export type DeviceFxMetrics = {
  cores: number;
  memoryGb: number | null;
  dpr: number;
  touch: boolean;
  desktopPointer: boolean;
  saveData: boolean;
  net: string | null;
  downlink: number | null;
  rtt: number | null;
  reducedMotionOs: boolean;
  reducedDataOs: boolean;
  webgl: boolean;
  gpu: string | null;
  platform: string | null;
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  longTaskHeavy: boolean;
  score: number;
  fps: number | null;
};

export type DeviceFxProfile = DeviceFxMetrics & {
  v: 3;
  at: number;
  policy: FxMotionPolicy;
  caps: FxCaps;
  allowMotion: boolean;
};

/** @deprecated solo compat — preferisci `caps`. */
export type FxTier = "off" | "lite" | "balanced" | "full";

const LS_PROFILE = "vc_device_fx_v3";
const LS_POLICY = "vc_fx_motion";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_CAPS: FxCaps = {
  motion: true,
  blur: true,
  continuous: true,
  pointerFx: true,
  canvas: true,
  confettiRich: true,
  scrollChrome: true,
  fog: true,
  particles: 8,
  flyer: true,
  boo: true,
  dprCap: 1.5,
  mediaHeavy: true,
  orbs: true,
  ping: true,
  sound: true,
  prefetch: true,
  pollMult: 1,
  imageSizeCap: 256,
};

/** Snapshot live per moduli non-React (presence, type-sfx, CDN). */
let liveCaps: FxCaps = { ...DEFAULT_CAPS };
let liveProfile: DeviceFxProfile | null = null;

export function getLiveCaps(): FxCaps {
  return liveCaps;
}

export function getLiveProfile(): DeviceFxProfile | null {
  return liveProfile;
}

/** Intervallo poll adattivo: baseMs × pollMult (min 5s). */
export function pollInterval(baseMs: number): number {
  const mult = Math.max(1, Number(liveCaps.pollMult) || 1);
  return Math.max(5_000, Math.round(baseMs * mult));
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function getFxMotionPolicy(): FxMotionPolicy {
  const raw = String(lsGet(LS_POLICY) ?? "auto").trim().toLowerCase();
  if (raw === "respect" || raw === "enhance" || raw === "off" || raw === "auto") return raw;
  return "auto";
}

export function setFxMotionPolicy(policy: FxMotionPolicy) {
  lsSet(LS_POLICY, policy);
}

function readGpu(): { webgl: boolean; gpu: string | null } {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return { webgl: false, gpu: null };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    let gpu: string | null = null;
    if (ext) {
      gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "").slice(0, 120) || null;
    }
    return { webgl: true, gpu };
  } catch {
    return { webgl: false, gpu: null };
  }
}

function weakGpu(gpu: string | null): boolean {
  if (!gpu) return false;
  const g = gpu.toLowerCase();
  return /swiftshader|llvmpipe|softpipe|microsoft basic render|gdi generic|software/.test(g);
}

function scoreHardware(p: {
  cores: number;
  memoryGb: number | null;
  dpr: number;
  touch: boolean;
  saveData: boolean;
  net: string | null;
  downlink: number | null;
  rtt: number | null;
  webgl: boolean;
  gpu: string | null;
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  longTaskHeavy: boolean;
  reducedDataOs: boolean;
}): number {
  let s = 40;
  if (p.cores >= 8) s += 28;
  else if (p.cores >= 6) s += 22;
  else if (p.cores >= 4) s += 14;
  else if (p.cores <= 2) s -= 18;

  if (p.memoryGb != null) {
    if (p.memoryGb >= 8) s += 22;
    else if (p.memoryGb >= 4) s += 10;
    else s -= 18;
  }

  if (p.saveData || p.reducedDataOs) s -= 35;
  const net = (p.net || "").toLowerCase();
  if (net === "slow-2g" || net === "2g") s -= 30;
  else if (net === "3g") s -= 14;

  if (p.downlink != null) {
    if (p.downlink < 0.5) s -= 22;
    else if (p.downlink < 1.5) s -= 12;
    else if (p.downlink >= 10) s += 6;
  }
  if (p.rtt != null) {
    if (p.rtt > 800) s -= 16;
    else if (p.rtt > 400) s -= 8;
  }

  if (!p.webgl) s -= 22;
  if (weakGpu(p.gpu)) s -= 28;

  if (p.touch) {
    s -= 6;
    if (p.dpr >= 3) s -= 8;
  }

  if (p.batteryLevel != null && p.batteryCharging === false && p.batteryLevel < 0.2) s -= 18;
  else if (p.batteryLevel != null && p.batteryCharging === false && p.batteryLevel < 0.35) s -= 8;

  if (p.longTaskHeavy) s -= 20;

  return Math.max(0, Math.min(100, Math.round(s)));
}

export function resolveAllowMotion(
  score: number,
  reducedMotionOs: boolean,
  policy: FxMotionPolicy,
): boolean {
  if (policy === "off") return false;
  if (!reducedMotionOs) return true;
  if (policy === "respect") return false;
  if (policy === "enhance") return score >= 35;
  return score >= 60;
}

function offCaps(): FxCaps {
  return {
    motion: false,
    blur: false,
    continuous: false,
    pointerFx: false,
    canvas: false,
    confettiRich: false,
    scrollChrome: false,
    fog: false,
    particles: 0,
    flyer: false,
    boo: false,
    dprCap: 1,
    mediaHeavy: false,
    orbs: false,
    ping: false,
    sound: false,
    prefetch: false,
    pollMult: 3,
    imageSizeCap: 64,
  };
}

export function buildCapsFromMetrics(
  m: Pick<
    DeviceFxMetrics,
    | "cores"
    | "memoryGb"
    | "dpr"
    | "touch"
    | "desktopPointer"
    | "saveData"
    | "net"
    | "downlink"
    | "rtt"
    | "webgl"
    | "gpu"
    | "score"
    | "fps"
    | "batteryLevel"
    | "batteryCharging"
    | "longTaskHeavy"
    | "reducedDataOs"
  >,
  allowMotion: boolean,
): FxCaps {
  const net = (m.net || "").toLowerCase();
  const slowNet = net === "slow-2g" || net === "2g" || net === "3g";
  const soft = weakGpu(m.gpu);
  const ramOk = m.memoryGb == null || m.memoryGb >= 4;
  const cpuOk = m.cores >= 4;
  const score = m.score;
  const dataSaver = m.saveData || m.reducedDataOs;
  const lowBatt = m.batteryLevel != null && m.batteryCharging === false && m.batteryLevel < 0.2;
  const slowLink = (m.downlink != null && m.downlink < 1.2) || (m.rtt != null && m.rtt > 500);

  if (!allowMotion) {
    const o = offCaps();
    // anche senza motion: poll più lento se rete/batteria male
    if (dataSaver || slowLink || lowBatt) o.pollMult = 3;
    else if (m.longTaskHeavy) o.pollMult = 2;
    return o;
  }

  const blur =
    !dataSaver &&
    !soft &&
    !lowBatt &&
    score >= 42 &&
    (cpuOk || ramOk) &&
    !(m.touch && m.dpr >= 3 && score < 55);

  const continuous = !dataSaver && !(net === "slow-2g" || net === "2g") && score >= 32 && !lowBatt;

  const pointerFx =
    m.desktopPointer && !m.touch && m.webgl && !soft && score >= 48 && !lowBatt && !m.longTaskHeavy;

  const canvas = m.webgl && !soft && !dataSaver && !slowNet && score >= 40 && !lowBatt;

  const confettiRich = !dataSaver && score >= 50 && continuous;
  const scrollChrome = continuous && score >= 55 && blur;
  const fog = canvas && blur && score >= 48;

  let particles = 0;
  if (canvas) {
    particles = Math.max(4, Math.min(m.touch ? 8 : 14, Math.round((score - 32) / 5)));
  }
  const flyer = canvas && ((!m.touch && score >= 55) || score >= 70);
  const boo = canvas && score >= 45;
  const dprCap = score >= 70 ? 2 : score >= 50 ? 1.5 : 1;

  const mediaHeavy =
    !dataSaver &&
    !slowLink &&
    !(m.downlink != null && m.downlink < 2) &&
    score >= 40 &&
    !lowBatt;

  const orbs = blur && score >= 45 && !m.longTaskHeavy;
  const ping = continuous && score >= 28 && !dataSaver;
  const sound = !dataSaver && !lowBatt && score >= 25;
  const prefetch = !dataSaver && !slowNet && !slowLink && score >= 35 && (m.downlink == null || m.downlink >= 1.5);

  let pollMult = 1;
  if (dataSaver || net === "slow-2g" || net === "2g") pollMult = 3;
  else if (slowNet || slowLink || lowBatt || m.longTaskHeavy) pollMult = 2;
  else if (score < 35) pollMult = 1.5;

  let imageSizeCap = 256;
  if (!mediaHeavy) imageSizeCap = 96;
  else if (m.downlink != null && m.downlink < 3) imageSizeCap = 128;
  else if (score >= 70) imageSizeCap = 512;

  let caps: FxCaps = {
    motion: true,
    blur,
    continuous,
    pointerFx,
    canvas,
    confettiRich,
    scrollChrome,
    fog,
    particles,
    flyer,
    boo,
    dprCap,
    mediaHeavy,
    orbs,
    ping,
    sound,
    prefetch,
    pollMult,
    imageSizeCap,
  };

  if (m.fps != null) caps = applyFpsDowngrade(caps, m.fps);
  return caps;
}

export function applyFpsDowngrade(caps: FxCaps, fps: number): FxCaps {
  if (!caps.motion || fps >= 50) return caps;
  const next = { ...caps };

  if (fps < 50) {
    next.blur = false;
    next.fog = false;
    next.orbs = false;
    next.pointerFx = false;
    next.scrollChrome = false;
    next.confettiRich = false;
    next.mediaHeavy = false;
    next.particles = Math.min(next.particles, 6);
    next.dprCap = Math.min(next.dprCap, 1.25);
    next.imageSizeCap = Math.min(next.imageSizeCap, 128);
    next.pollMult = Math.max(next.pollMult, 1.5);
  }
  if (fps < 40) {
    next.flyer = false;
    next.boo = false;
    next.ping = false;
    next.particles = Math.min(next.particles, 4);
    next.pollMult = Math.max(next.pollMult, 2);
  }
  if (fps < 32) {
    next.continuous = false;
    next.canvas = false;
    next.particles = 0;
    next.flyer = false;
    next.boo = false;
    next.sound = false;
    next.prefetch = false;
  }
  if (fps < 24) {
    next.blur = false;
    next.fog = false;
    next.orbs = false;
  }
  return next;
}

export type BatterySnap = { level: number | null; charging: boolean | null };

function collectMetrics(extra?: {
  battery?: BatterySnap;
  longTaskHeavy?: boolean;
  fps?: number | null;
}): DeviceFxMetrics {
  const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
  const cores = Math.max(1, Number(nav.hardwareConcurrency) || 2);
  const memoryGb =
    typeof (nav as Navigator & { deviceMemory?: number }).deviceMemory === "number"
      ? Number((nav as Navigator & { deviceMemory?: number }).deviceMemory)
      : null;
  const dpr = typeof window !== "undefined" ? Math.min(4, window.devicePixelRatio || 1) : 1;

  let touch = false;
  let desktopPointer = true;
  try {
    touch = window.matchMedia("(pointer: coarse)").matches || (nav.maxTouchPoints || 0) > 0;
    desktopPointer = window.matchMedia("(pointer: fine)").matches && window.matchMedia("(hover: hover)").matches;
  } catch {
    touch = (nav.maxTouchPoints || 0) > 0;
  }

  const conn = (
    nav as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string; downlink?: number; rtt?: number };
    }
  ).connection;
  const saveData = Boolean(conn?.saveData);
  const net = conn?.effectiveType ? String(conn.effectiveType) : null;
  const downlink = typeof conn?.downlink === "number" && Number.isFinite(conn.downlink) ? conn.downlink : null;
  const rtt = typeof conn?.rtt === "number" && Number.isFinite(conn.rtt) ? conn.rtt : null;

  let reducedMotionOs = false;
  let reducedDataOs = false;
  try {
    reducedMotionOs = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    /* ignore */
  }
  try {
    reducedDataOs = window.matchMedia("(prefers-reduced-data: reduce)").matches;
  } catch {
    /* ignore */
  }

  const { webgl, gpu } = typeof document !== "undefined" ? readGpu() : { webgl: true, gpu: null };
  const platform =
    (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    nav.platform ||
    null;

  const batteryLevel = extra?.battery?.level ?? null;
  const batteryCharging = extra?.battery?.charging ?? null;
  const longTaskHeavy = Boolean(extra?.longTaskHeavy);

  const score = scoreHardware({
    cores,
    memoryGb,
    dpr,
    touch,
    saveData,
    net,
    downlink,
    rtt,
    webgl,
    gpu,
    batteryLevel,
    batteryCharging,
    longTaskHeavy,
    reducedDataOs,
  });

  return {
    cores,
    memoryGb,
    dpr,
    touch,
    desktopPointer,
    saveData,
    net,
    downlink,
    rtt,
    reducedMotionOs,
    reducedDataOs,
    webgl,
    gpu,
    platform: platform ? String(platform).slice(0, 64) : null,
    batteryLevel,
    batteryCharging,
    longTaskHeavy,
    score,
    fps: extra?.fps ?? null,
  };
}

export function buildDeviceFxProfile(
  policy = getFxMotionPolicy(),
  extra?: { battery?: BatterySnap; longTaskHeavy?: boolean; fps?: number | null },
): DeviceFxProfile {
  const metrics = collectMetrics(extra);
  const allowMotion = resolveAllowMotion(metrics.score, metrics.reducedMotionOs, policy);
  const caps = buildCapsFromMetrics(metrics, allowMotion);
  return {
    v: 3,
    at: Date.now(),
    policy,
    ...metrics,
    caps,
    allowMotion,
  };
}

/** Ricalcola caps tenendo battery/longtask/fps aggiornati. */
export function rebuildProfile(
  prev: DeviceFxProfile,
  patch: Partial<Pick<DeviceFxMetrics, "fps" | "batteryLevel" | "batteryCharging" | "longTaskHeavy">>,
): DeviceFxProfile {
  const next: DeviceFxProfile = {
    ...prev,
    ...patch,
    at: Date.now(),
  };
  // ricalcola score da metriche aggiornate
  next.score = scoreHardware({
    cores: next.cores,
    memoryGb: next.memoryGb,
    dpr: next.dpr,
    touch: next.touch,
    saveData: next.saveData,
    net: next.net,
    downlink: next.downlink,
    rtt: next.rtt,
    webgl: next.webgl,
    gpu: next.gpu,
    batteryLevel: next.batteryLevel,
    batteryCharging: next.batteryCharging,
    longTaskHeavy: next.longTaskHeavy,
    reducedDataOs: next.reducedDataOs,
  });
  next.allowMotion = resolveAllowMotion(next.score, next.reducedMotionOs, next.policy);
  next.caps = buildCapsFromMetrics(next, next.allowMotion);
  return next;
}

export function withFps(profile: DeviceFxProfile, fps: number): DeviceFxProfile {
  return rebuildProfile(profile, { fps });
}

export function loadCachedDeviceFx(): DeviceFxProfile | null {
  try {
    const raw = lsGet(LS_PROFILE);
    if (!raw) return null;
    const j = JSON.parse(raw) as DeviceFxProfile;
    if (!j || j.v !== 3 || typeof j.at !== "number" || !j.caps) return null;
    if (Date.now() - j.at > MAX_AGE_MS) return null;
    return j;
  } catch {
    return null;
  }
}

export function saveDeviceFx(profile: DeviceFxProfile) {
  lsSet(LS_PROFILE, JSON.stringify(profile));
}

export function applyDeviceFxDom(profile: DeviceFxProfile) {
  try {
    liveCaps = profile.caps;
    liveProfile = profile;
    const root = document.documentElement;
    const c = profile.caps;
    root.dataset.vcFxScore = String(profile.score);
    root.dataset.vcFxMotion = profile.allowMotion ? "1" : "0";
    root.dataset.vcFxPolicy = profile.policy;
    if (profile.fps != null) root.dataset.vcFxFps = String(Math.round(profile.fps));
    else delete root.dataset.vcFxFps;
    if (profile.downlink != null) root.dataset.vcFxDownlink = String(profile.downlink);
    else delete root.dataset.vcFxDownlink;
    if (profile.rtt != null) root.dataset.vcFxRtt = String(profile.rtt);
    else delete root.dataset.vcFxRtt;

    root.dataset.vcCapBlur = c.blur ? "1" : "0";
    root.dataset.vcCapContinuous = c.continuous ? "1" : "0";
    root.dataset.vcCapPointer = c.pointerFx ? "1" : "0";
    root.dataset.vcCapCanvas = c.canvas ? "1" : "0";
    root.dataset.vcCapFog = c.fog ? "1" : "0";
    root.dataset.vcCapScroll = c.scrollChrome ? "1" : "0";
    root.dataset.vcCapMedia = c.mediaHeavy ? "1" : "0";
    root.dataset.vcCapOrbs = c.orbs ? "1" : "0";
    root.dataset.vcCapPing = c.ping ? "1" : "0";
    root.dataset.vcCapSound = c.sound ? "1" : "0";
    root.dataset.vcCapPrefetch = c.prefetch ? "1" : "0";
    root.dataset.vcCapParticles = String(c.particles);
    root.dataset.vcCapPoll = String(c.pollMult);
    root.dataset.vcCapImg = String(c.imageSizeCap);

    root.classList.remove("vc-fx-lite", "vc-fx-balanced", "vc-fx-full", "vc-fx-off");
    root.removeAttribute("data-vc-fx");

    try {
      window.dispatchEvent(new CustomEvent("vc:device-fx", { detail: { caps: c, score: profile.score } }));
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

export function sampleFps(durationMs = 1000): Promise<number> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") {
      resolve(60);
      return;
    }
    let frames = 0;
    const t0 = performance.now();
    let last = t0;
    const tick = (now: number) => {
      frames += 1;
      last = now;
      if (now - t0 < durationMs) {
        requestAnimationFrame(tick);
        return;
      }
      const elapsed = Math.max(1, last - t0);
      resolve(Math.round((frames * 1000) / elapsed));
    };
    requestAnimationFrame(tick);
  });
}

export async function readBattery(): Promise<BatterySnap> {
  try {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: Function }>;
    };
    if (typeof nav.getBattery !== "function") return { level: null, charging: null };
    const b = await nav.getBattery();
    return {
      level: typeof b.level === "number" ? b.level : null,
      charging: typeof b.charging === "boolean" ? b.charging : null,
    };
  } catch {
    return { level: null, charging: null };
  }
}

export type BatteryHandle = {
  snap: BatterySnap;
  stop: () => void;
};

/** Attacca listener batteria; onChange ad ogni level/chargingchange. */
export async function watchBattery(onChange: (snap: BatterySnap) => void): Promise<BatteryHandle> {
  const empty: BatteryHandle = { snap: { level: null, charging: null }, stop: () => {} };
  try {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (t: string, fn: () => void) => void;
        removeEventListener: (t: string, fn: () => void) => void;
      }>;
    };
    if (typeof nav.getBattery !== "function") return empty;
    const b = await nav.getBattery();
    const snap = (): BatterySnap => ({
      level: typeof b.level === "number" ? b.level : null,
      charging: typeof b.charging === "boolean" ? b.charging : null,
    });
    const emit = () => onChange(snap());
    b.addEventListener("levelchange", emit);
    b.addEventListener("chargingchange", emit);
    return {
      snap: snap(),
      stop: () => {
        try {
          b.removeEventListener("levelchange", emit);
          b.removeEventListener("chargingchange", emit);
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return empty;
  }
}

/** Osserva long tasks: se ≥3 in 5s → pressure. */
export function watchLongTasks(onHeavy: (heavy: boolean) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};
  let times: number[] = [];
  let heavy = false;
  try {
    const obs = new PerformanceObserver((list) => {
      const now = performance.now();
      for (const e of list.getEntries()) {
        if (e.duration >= 50) times.push(now);
      }
      times = times.filter((t) => now - t < 5000);
      const next = times.length >= 3;
      if (next !== heavy) {
        heavy = next;
        onHeavy(heavy);
      }
    });
    obs.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
    return () => {
      try {
        obs.disconnect();
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => {};
  }
}

export function halloweenBudgetFromCaps(caps: FxCaps): {
  particles: number;
  flyer: boolean;
  boo: boolean;
  dprCap: number;
  canvas: boolean;
  cssOnly: boolean;
  fog: boolean;
} {
  if (!caps.motion) {
    return { particles: 0, flyer: false, boo: false, dprCap: 1, canvas: false, cssOnly: false, fog: false };
  }
  if (!caps.canvas || caps.particles <= 0) {
    return { particles: 0, flyer: false, boo: false, dprCap: 1, canvas: false, cssOnly: true, fog: false };
  }
  return {
    particles: caps.particles,
    flyer: caps.flyer,
    boo: caps.boo,
    dprCap: caps.dprCap,
    canvas: true,
    cssOnly: false,
    fog: caps.fog,
  };
}

/** @deprecated */
export function halloweenBudget(tier: FxTier, touch: boolean): ReturnType<typeof halloweenBudgetFromCaps> {
  if (tier === "off") return { particles: 0, flyer: false, boo: false, dprCap: 1, canvas: false, cssOnly: false, fog: false };
  if (tier === "lite") return { particles: 0, flyer: false, boo: false, dprCap: 1, canvas: false, cssOnly: true, fog: false };
  if (tier === "balanced") {
    return { particles: touch ? 5 : 8, flyer: !touch, boo: true, dprCap: 1.5, canvas: true, cssOnly: false, fog: true };
  }
  return { particles: touch ? 8 : 12, flyer: true, boo: true, dprCap: 2, canvas: true, cssOnly: false, fog: true };
}

export function deriveDebugTier(caps: FxCaps): FxTier {
  if (!caps.motion) return "off";
  if (!caps.continuous && !caps.canvas) return "lite";
  if (caps.pointerFx && caps.blur && caps.particles >= 10) return "full";
  return "balanced";
}

export { DEFAULT_CAPS };
