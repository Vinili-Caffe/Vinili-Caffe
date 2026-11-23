/**
 * Il sito come «Attività» di Discord: dentro Discord il login passa dall'SDK, che dà un codice;
 * qui lo si scambia con il token (serve il secret dell'app, che resta sul server).
 * Il token poi si usa come al solito (Authorization: Bearer) per il Music Quiz.
 */
const { discordTokenRequest } = require("./siteAuthSession") as typeof import("./siteAuthSession");

async function handleSiteActivityTokenPost(req?: any, res?: any) {
  try {
    const code = String(req.body?.code || "").trim();
    if (!/^[A-Za-z0-9]{10,64}$/.test(code)) return res.status(400).json({ ok: false, error: "bad_code" });
    /* le Attività non usano redirect_uri: basta il codice */
    const out = await discordTokenRequest({ grant_type: "authorization_code", code });
    const token = String(out.json?.access_token || "");
    if (!out.ok || !token) {
      global.logger?.warn?.(`[activity] scambio codice fallito: ${out.status} ${String(out.json?.error || "")}`);
      return res.status(401).json({ ok: false, error: "exchange_failed" });
    }
    return res.json({ ok: true, access_token: token, expires_in: Number(out.json?.expires_in || 0) || undefined });
  } catch (err: any) {
    global.logger?.warn?.("[activity] token:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

export = { handleSiteActivityTokenPost };
