/** Blocca URL verso rete privata / metadata (anti-SSRF per probe HTTP outbound). */
const dns = require("node:dns") as typeof import("node:dns");
const net = require("node:net") as typeof import("node:net");
const { URL } = require("node:url") as typeof import("node:url");

const dnsLookup = dns.promises.lookup;

function normalizeIp(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/^::ffff:/, "");
}

function isPrivateOrLocalIp(ip?) {
  const n = normalizeIp(ip);
  if (!n) return true;
  if (n === "127.0.0.1" || n === "::1" || n === "0.0.0.0" || n === "::") return true;
  if (n === "169.254.169.254") return true;
  if (n.startsWith("10.")) return true;
  if (n.startsWith("127.")) return true;
  if (n.startsWith("192.168.")) return true;
  if (n.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(n)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(n)) return true; /* CGNAT */
  if (n.startsWith("fc") || n.startsWith("fd")) return true; /* ULA */
  if (n.startsWith("fe80")) return true; /* link-local */
  if (n === "0:0:0:0:0:0:0:1") return true;
  return false;
}

function isBlockedHostname(host?) {
  const h = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (h === "metadata.google.internal" || h === "metadata" || h.endsWith(".metadata.google.internal")) {
    return true;
  }
  if (net.isIP(h)) return isPrivateOrLocalIp(h);
  return false;
}

async function resolvePublicHostname(hostname?) {
  const host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false as const, reason: "invalid_host" };
  if (isBlockedHostname(host)) return { ok: false as const, reason: "private_host" };
  if (net.isIP(host)) {
    if (isPrivateOrLocalIp(host)) return { ok: false as const, reason: "private_ip" };
    return { ok: true as const, addresses: [host] };
  }
  try {
    const v4 = await dnsLookup(host, { all: true, family: 4 }).catch(() => [] as any[]);
    const v6 = await dnsLookup(host, { all: true, family: 6 }).catch(() => [] as any[]);
    const addresses = [...(Array.isArray(v4) ? v4 : []), ...(Array.isArray(v6) ? v6 : [])]
      .map((row?) => normalizeIp(row?.address))
      .filter(Boolean);
    if (!addresses.length) return { ok: false as const, reason: "dns_failed" };
    if (addresses.some((ip?) => isPrivateOrLocalIp(ip))) {
      return { ok: false as const, reason: "private_ip" };
    }
    return { ok: true as const, addresses };
  } catch (_) {
    return { ok: false as const, reason: "dns_failed" };
  }
}

/* un tipo solo (non un'unione): con strictNullChecks spento TypeScript non distingue i due casi da `!ok` */
type PublicUrlCheck = { ok: boolean; reason?: string; url?: string; hostname?: string; addresses?: string[] };

async function assertPublicHttpUrl(raw?): Promise<PublicUrlCheck> {
  const input = String(raw || "").trim();
  if (!/^https?:\/\//i.test(input)) {
    return { ok: false as const, reason: "invalid_url" };
  }
  let u: URL;
  try {
    u = new URL(input);
  } catch (_) {
    return { ok: false as const, reason: "invalid_url" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false as const, reason: "invalid_protocol" };
  }
  if (u.username || u.password) {
    return { ok: false as const, reason: "userinfo_forbidden" };
  }
  const resolved = await resolvePublicHostname(u.hostname);
  if (resolved.ok === false) return { ok: false as const, reason: resolved.reason };
  return { ok: true as const, url: u.toString(), hostname: u.hostname, addresses: resolved.addresses };
}

export = {
  isPrivateOrLocalIp,
  isBlockedHostname,
  resolvePublicHostname,
  assertPublicHttpUrl,
};
