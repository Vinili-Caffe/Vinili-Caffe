/* siteApiW8: notif/access/summary/organico/pause/dashboard/tickets tengono ETag (304); resto staff no-store */
function applyStaffApiNoStore(req?, res?, next?) {
  const p = String(req.path || req.url || "");
  const url = String(req.url || "");
  const isNotif = p.startsWith("/webhooks/site-notifications");
  const isStaff = p.startsWith("/webhooks/site-staff");
  if (!isNotif && !isStaff) {
    return next();
  }
  const allowEtag =
    isNotif ||
    p === "/webhooks/site-staff-access" ||
    p.startsWith("/webhooks/site-staff-access/") ||
    p === "/webhooks/site-staff-organico" ||
    p.startsWith("/webhooks/site-staff-organico/") ||
    p === "/webhooks/site-staff-pause" ||
    p.startsWith("/webhooks/site-staff-pause/") ||
    p === "/webhooks/site-staff-dashboard" ||
    p.startsWith("/webhooks/site-staff-dashboard/") ||
    p === "/webhooks/site-staff-tickets" ||
    p.startsWith("/webhooks/site-staff-tickets/") ||
    (p.startsWith("/webhooks/site-staff-workflows") && /(?:\?|&)queue=summary(?:&|$)/.test(url));

  if (allowEtag) {
    /* no-cache + keep ETag; handlers may upgrade Cache-Control / answer 304 */
    res.set("Cache-Control", "private, no-cache");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    return next();
  }

  res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  try {
    res.removeHeader("ETag");
  } catch (e0) {}
  const prevWriteHead = res.writeHead;
  res.writeHead = function staffNoStoreWriteHead() {
    try {
      res.removeHeader("ETag");
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } catch (eWh) {}
    return prevWriteHead.apply(this, arguments);
  };
  const prevJson = res.json.bind(res);
  res.json = function staffNoStoreJson(body?) {
    try {
      res.removeHeader("ETag");
      res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    } catch (e1) {}
    return prevJson(body);
  };
  return next();
}

function mountStaffApiNoStore(app?) {
  app.use(applyStaffApiNoStore);
}

export = { mountStaffApiNoStore, applyStaffApiNoStore };
