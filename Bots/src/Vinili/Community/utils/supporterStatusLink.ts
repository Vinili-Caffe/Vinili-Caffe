const VANITY_INVITE_RE = /(?:discord\.gg|dsc\.gg|\.gg|discord\.com\/invite|discord\.me)\s*(?:\/|\\)?\s*viniliecaff[eèé]/i;
const SITE_LINK_RE = /(?:^|[^a-z0-9-])(?:https?:\/\/)?(?:www\.)?viniliecaff[eèé]\.it(?![a-z0-9-])(?:\/[^\s]*)?/i;
const SUPPORTER_STATUS_LINK_HINT_IT = "`.gg/viniliecaffe`, `discord.gg/viniliecaffe` o `viniliecaffe.it`";
function normalizeSupporterStatusText(text?) {
  return String(text || "")
    .replace(/\u2044|\u2215|\uFF0F/g, "/")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/* testi scelti dalla dashboard (Annunci → Status): se ci sono, valgono loro al posto dei link classici */
let customTriggers: string[] = [];
let triggersLoadedAt = 0;
let triggersLoading = false;
const TRIGGERS_TTL_MS = 2 * 60 * 1000;

function refreshCustomTriggers() {
  if (triggersLoading || Date.now() - triggersLoadedAt < TRIGGERS_TTL_MS) return;
  triggersLoading = true;
  (async () => {
    try {
      const IDs = require("../../Config/ids") as any;
      const mainId = String(IDs?.guilds?.main || "");
      if (!mainId) return;
      const A = require("../../../MultiGuild/services/announcementsRuntime") as typeof import("../../../MultiGuild/services/announcementsRuntime");
      const cfg = await A.getConfig(mainId, true);
      const list = Array.isArray((cfg as any)?.named?.fan?.statusTriggers) ? (cfg as any).named.fan.statusTriggers : [];
      customTriggers = list.map((t: string) => normalizeSupporterStatusText(t).trim()).filter(Boolean);
    } catch (_) {
      /* resta la lista di prima */
    } finally {
      triggersLoadedAt = Date.now();
      triggersLoading = false;
    }
  })();
}

function textHasSupporterStatusLink(text?) {
  refreshCustomTriggers();
  const blob = normalizeSupporterStatusText(text);
  if (!blob) return false;
  if (customTriggers.length) {
    const squashed = blob.replace(/\s+/g, "");
    return customTriggers.some((t) => blob.includes(t) || squashed.includes(t.replace(/\s+/g, "")));
  }
  return VANITY_INVITE_RE.test(blob) || SITE_LINK_RE.test(blob);
}

export = { SUPPORTER_STATUS_LINK_HINT_IT, normalizeSupporterStatusText, textHasSupporterStatusLink };