#!/usr/bin/env node
/**
 * Applica Cache Rules + Rate Limiting + Bot Fight su zone Cloudflare Vinili.
 *
 * Env richiesti:
 *   CF_API_TOKEN   — token con Zone Cache / Firewall / Bot Management / Rate Limiting
 *   CF_ZONE_ID     — zone id di viniliecaffe.it (opzionale se CF_ZONE_NAME)
 *   CF_ZONE_NAME   — default viniliecaffe.it
 *
 * Uso:
 *   CF_API_TOKEN=... node Scripts/cloudflare/apply-edge-hardening.mjs
 */
const ZONE_NAME = String(process.env.CF_ZONE_NAME || "viniliecaffe.it").trim();
const TOKEN = String(process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || "").trim();
const ZONE_ID_ENV = String(process.env.CF_ZONE_ID || process.env.CLOUDFLARE_ZONE_ID || "").trim();

if (!TOKEN) {
  console.error("Manca CF_API_TOKEN (API Token Cloudflare con permessi Zone).");
  process.exit(1);
}

async function cf(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const err = data?.errors?.[0]?.message || res.statusText || "cf_error";
    throw new Error(`${method} ${path}: ${err}`);
  }
  return data;
}

async function resolveZoneId() {
  if (ZONE_ID_ENV) return ZONE_ID_ENV;
  const data = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
  const id = data?.result?.[0]?.id;
  if (!id) throw new Error(`Zona non trovata: ${ZONE_NAME}`);
  return id;
}

async function upsertCacheRules(zoneId) {
  const phase = "http_request_cache_settings";
  const list = await cf(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`).catch(() => null);
  const rulesetId = list?.result?.id;
  const existing = Array.isArray(list?.result?.rules) ? list.result.rules : [];

  const wanted = [
    {
      ref: "vc_cache_next_static",
      description: "Vinili: cache lunga /_next/static",
      expression: '(http.request.uri.path matches "^/_next/static/")',
      action: "set_cache_settings",
      action_parameters: {
        cache: true,
        edge_ttl: { mode: "override_origin", default: 31536000 },
        browser_ttl: { mode: "override_origin", default: 31536000 },
      },
    },
    {
      ref: "vc_cache_cdn_media",
      description: "Vinili: cache media CDN/R2",
      expression:
        '(http.host eq "cdn.viniliecaffe.it") or (http.request.uri.path matches "^/images/") or (http.request.uri.path matches "\\.(png|jpe?g|webp|gif|svg|ico|woff2?)$")',
      action: "set_cache_settings",
      action_parameters: {
        cache: true,
        edge_ttl: { mode: "override_origin", default: 604800 },
        browser_ttl: { mode: "respect_origin" },
      },
    },
    {
      ref: "vc_bypass_api_auth",
      description: "Vinili: no-cache API autenticata / webhook mutanti",
      expression:
        '(http.host eq "api.viniliecaffe.it" and http.request.method ne "GET") or (http.request.uri.path contains "/webhooks/site-staff-")',
      action: "set_cache_settings",
      action_parameters: { cache: false },
    },
  ];

  const byRef = new Map(existing.map((r) => [r.ref || r.id, r]));
  const nextRules = [];
  for (const w of wanted) {
    const prev = byRef.get(w.ref);
    nextRules.push(prev ? { ...prev, ...w, id: prev.id } : w);
  }
  for (const r of existing) {
    if (r.ref && wanted.some((w) => w.ref === r.ref)) continue;
    nextRules.push(r);
  }

  if (rulesetId) {
    await cf(`/zones/${zoneId}/rulesets/${rulesetId}`, {
      method: "PUT",
      body: {
        description: list?.result?.description || "Vinili cache rules",
        rules: nextRules,
      },
    });
  } else {
    await cf(`/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: {
        name: "default",
        kind: "zone",
        phase,
        description: "Vinili cache rules",
        rules: wanted,
      },
    });
  }
  console.log(`Cache Rules ok (${wanted.length} regole Vinili).`);
}

async function upsertRateLimitRules(zoneId) {
  /* Ruleset rate limiting (nuovo modello) — fallback soft se il piano non lo supporta */
  try {
    const phase = "http_ratelimit";
    const list = await cf(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`).catch(() => null);
    const rule = {
      ref: "vc_rl_api_webhooks",
      description: "Vinili: rate limit webhook site-api",
      expression: '(http.host eq "api.viniliecaffe.it" and http.request.uri.path contains "/webhooks/")',
      action: "block",
      ratelimit: {
        characteristics: ["cf.colo.id", "ip.src"],
        period: 60,
        requests_per_period: 120,
        mitigation_timeout: 60,
      },
    };
    if (list?.result?.id) {
      const existing = Array.isArray(list.result.rules) ? list.result.rules : [];
      const without = existing.filter((r) => r.ref !== rule.ref);
      await cf(`/zones/${zoneId}/rulesets/${list.result.id}`, {
        method: "PUT",
        body: {
          description: list.result.description || "Vinili rate limit",
          rules: [...without, rule],
        },
      });
    } else {
      await cf(`/zones/${zoneId}/rulesets`, {
        method: "POST",
        body: {
          name: "default",
          kind: "zone",
          phase,
          description: "Vinili rate limit",
          rules: [rule],
        },
      });
    }
    console.log("Rate Limiting ruleset ok.");
  } catch (err) {
    console.warn("Rate Limiting ruleset non applicato (piano/permessi):", err.message || err);
  }
}

async function enableBotFight(zoneId) {
  try {
    await cf(`/zones/${zoneId}/bot_management`, {
      method: "PUT",
      body: {
        fight_mode: true,
        enable_js: true,
        suppress_session_score: false,
      },
    });
    console.log("Bot Fight Mode abilitato.");
  } catch (err) {
    /* Free: endpoint alternativo settings */
    try {
      await cf(`/zones/${zoneId}/settings/bot_fight_mode`, {
        method: "PATCH",
        body: { value: "on" },
      });
      console.log("Bot Fight Mode (settings) on.");
    } catch (err2) {
      console.warn("Bot Fight Mode non applicato:", err2.message || err2);
    }
  }
}

async function main() {
  const zoneId = await resolveZoneId();
  console.log(`Zona ${ZONE_NAME} → ${zoneId}`);
  await upsertCacheRules(zoneId);
  await upsertRateLimitRules(zoneId);
  await enableBotFight(zoneId);
  console.log("Edge hardening applicato.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
