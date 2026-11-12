// Autodichiarazione età: GET/POST /webhooks/site-age-attest (solo spunta, post-login)

export const AGE_GATE_LS_KEY = "vc_age_gate_v1";
export const AGE_MIN = 13;

export type AgeAttestStatus = "ok" | "blocked" | "missing";

export type AgeAttestState = {
  ok: boolean;
  status: AgeAttestStatus;
  birthIso?: string | null;
  minAge?: number;
  attestedAt?: string | null;
  message?: string;
  error?: string;
  reason?: string;
};

type LocalStored = { userId: string; birthIso?: string | null; okAt: number };

export function readLocalAgeOk(userId: string): LocalStored | null {
  try {
    const raw = localStorage.getItem(AGE_GATE_LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as LocalStored;
    if (!j || j.userId !== userId || !j.okAt) return null;
    return j;
  } catch {
    return null;
  }
}

export function writeLocalAgeOk(userId: string, birthIso?: string | null) {
  try {
    localStorage.setItem(
      AGE_GATE_LS_KEY,
      JSON.stringify({
        userId,
        birthIso: birthIso || null,
        okAt: Date.now(),
      } satisfies LocalStored),
    );
  } catch {
    /* ignore */
  }
}

export function clearLocalAge() {
  try {
    localStorage.removeItem(AGE_GATE_LS_KEY);
  } catch {
    /* ignore */
  }
}

export function ageFromIso(iso: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(birth.getTime())) return null;
  if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday =
    now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

async function parseJson(res: Response): Promise<AgeAttestState> {
  const body = (await res.json().catch(() => ({}))) as Partial<AgeAttestState>;
  const statusRaw = String(body.status || "").trim();
  const status: AgeAttestStatus =
    statusRaw === "ok" || statusRaw === "blocked" ? statusRaw : "missing";
  return {
    ok: Boolean(body.ok) && status === "ok",
    status,
    birthIso: body.birthIso ?? null,
    minAge: Number(body.minAge) || AGE_MIN,
    attestedAt: body.attestedAt ?? null,
    message: typeof body.message === "string" ? body.message : undefined,
    error: typeof body.error === "string" ? body.error : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
  };
}

export async function fetchAgeAttest(token: string): Promise<AgeAttestState> {
  const res = await fetch("/webhooks/site-age-attest", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  return parseJson(res);
}

/** Solo autodichiarazione a spunta (niente data di nascita). */
export async function submitAgeAttest(token: string): Promise<AgeAttestState> {
  const res = await fetch("/webhooks/site-age-attest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ attested: true }),
  });
  return parseJson(res);
}
