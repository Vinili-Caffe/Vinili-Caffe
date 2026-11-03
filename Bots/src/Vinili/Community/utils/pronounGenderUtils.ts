const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const PRONOUN_X_SUFFIX_EXCLUDE = new Set([
  "ajax",
  "box",
  "fix",
  "flux",
  "fox",
  "index",
  "linux",
  "max",
  "mix",
  "reflex",
  "tax",
  "unix",
  "vertex",
  "vortex",
]);

function resolveMemberPronounGender(member?) {
  const cache = member?.roles?.cache;
  if (!cache) return "u";
  const roles: any = IDs.roles || {};
  const has = (id?) => {
    const s = String(id || "").trim();
    if (!s) return false;
    try {
      if (typeof cache.has === "function" && cache.has(s)) return true;
    } catch (_) {}
    try {
      if (typeof cache.get === "function" && cache.get(s)) return true;
    } catch (_) {}
    return false;
  };
  if (roles.sheHer && has(roles.sheHer)) return "f";
  if (roles.heHim && has(roles.heHim)) return "m";
  if (roles.theyThem && has(roles.theyThem)) return "x";
  if (roles.askMe && has(roles.askMe)) return "u";
  return "u";
}

function preserveStemCase(stem?, word?) {
  const base = String(word || "");
  if (!base) return base;
  const s = String(stem || "");
  if (s && s.charAt(0) === s.charAt(0).toUpperCase()) {
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return base;
}

function pickGenderEnding(stem?, gender?) {
  const s = String(stem || "");
  if (gender === "f") return preserveStemCase(s, `${s}a`);
  if (gender === "m") return preserveStemCase(s, `${s}o`);
  if (gender === "x") return preserveStemCase(s, `${s}ə`);
  return preserveStemCase(s, `${s}o/a`);
}

function textMayContainGenderMarkers(text?) {
  const s = String(text || "");
  if (!s) return false;
  if (s.includes("/") || s.includes("(") || s.includes("@")) return true;
  return /\p{L}x\b/iu.test(s);
}

function applyPronounGenderToText(text?, gender?) {
  const raw = String(text ?? "");
  if (!raw || gender == null) return raw;
  if (!textMayContainGenderMarkers(raw)) return raw;

  let out = raw;
  out = out.replace(/\b([\p{L}']+)o\/a\b/giu, (_m?, stem?) => pickGenderEnding(stem, gender));
  out = out.replace(/\b([\p{L}']+)a\/o\b/giu, (_m?, stem?) => pickGenderEnding(stem, gender));
  out = out.replace(/\b([\p{L}']+)\(o\/a\)\b/giu, (_m?, stem?) => pickGenderEnding(stem, gender));
  out = out.replace(/\b([\p{L}']+)\(a\/o\)\b/giu, (_m?, stem?) => pickGenderEnding(stem, gender));
  out = out.replace(/\b([\p{L}']+)\(([oa])\)\b/giu, (_m?, stem?) => pickGenderEnding(stem, gender));
  out = out.replace(/\b([\p{L}']+)@(o|a|x)\b/giu, (_m?, stem?) => pickGenderEnding(stem, gender));
  out = out.replace(/\b([\p{L}]{3,})x\b/giu, (match?, stem?) => {
    if (PRONOUN_X_SUFFIX_EXCLUDE.has(String(stem || "").toLowerCase())) return match;
    if (gender === "u") return match;
    if (gender === "f") return preserveStemCase(stem, `${stem}a`);
    if (gender === "m") return preserveStemCase(stem, `${stem}o`);
    if (gender === "x") return preserveStemCase(stem, `${stem}ə`);
    return match;
  });
  return out;
}

function applyPronounGenderToTextForMember(text?, member?) {
  return applyPronounGenderToText(text, resolveMemberPronounGender(member));
}

function applyPronounGenderToEmbedForMember(embed?, member?) {
  return applyPronounGenderToEmbed(embed, resolveMemberPronounGender(member));
}

function applyPronounGenderToEmbed(embed?, gender?) {
  if (!embed || gender == null) return embed;
  const data = embed.data ?? embed;
  const hasBuilder = typeof embed.setTitle === "function";

  const nextTitle = data.title != null ? applyPronounGenderToText(String(data.title), gender) : null;
  const nextDescription =
    data.description != null ? applyPronounGenderToText(String(data.description), gender) : null;
  const nextFooterText =
    data.footer?.text != null ? applyPronounGenderToText(String(data.footer.text), gender) : null;
  const nextAuthorName =
    data.author?.name != null ? applyPronounGenderToText(String(data.author.name), gender) : null;
  const nextFields = Array.isArray(data.fields)
    ? data.fields.map((field?) => ({
        ...field,
        name: field?.name != null ? applyPronounGenderToText(String(field.name), gender) : field?.name,
        value: field?.value != null ? applyPronounGenderToText(String(field.value), gender) : field?.value,
      }))
    : null;

  if (hasBuilder) {
    if (nextTitle != null && nextTitle !== data.title) embed.setTitle(nextTitle);
    if (nextDescription != null && nextDescription !== data.description) embed.setDescription(nextDescription);
    if (nextFooterText != null && nextFooterText !== data.footer?.text) {
      embed.setFooter({ ...(data.footer || {}), text: nextFooterText });
    }
    if (nextAuthorName != null && nextAuthorName !== data.author?.name) {
      embed.setAuthor({ ...(data.author || {}), name: nextAuthorName });
    }
    if (nextFields) embed.setFields(nextFields);
    return embed;
  }

  const out = { ...data };
  if (nextTitle != null) out.title = nextTitle;
  if (nextDescription != null) out.description = nextDescription;
  if (nextFooterText != null) out.footer = { ...(data.footer || {}), text: nextFooterText };
  if (nextAuthorName != null) out.author = { ...(data.author || {}), name: nextAuthorName };
  if (nextFields) out.fields = nextFields;
  return out;
}

function resolvePayloadTargetMember(payload?, fallbackMember?) {
  const targetId = String(payload?.pronounGenderTargetId || "").trim();
  if (!targetId || !fallbackMember?.guild?.members?.cache) return fallbackMember;
  return fallbackMember.guild.members.cache.get(targetId) || fallbackMember;
}

function applyPronounGenderToPayload(payload?, member?) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (payload.skipPronounGender) {
    const next = { ...payload };
    delete next.skipPronounGender;
    delete next.pronounGenderTargetId;
    return next;
  }

  const targetMember = resolvePayloadTargetMember(payload, member);
  const gender = resolveMemberPronounGender(targetMember);
  const next = { ...payload };
  delete next.pronounGenderTargetId;

  if (typeof next.content === "string") {
    next.content = applyPronounGenderToText(next.content, gender);
  }
  if (Array.isArray(next.embeds) && next.embeds.length) {
    next.embeds = next.embeds.map((embed?) => applyPronounGenderToEmbed(embed, gender));
  }
  return next;
}

function registerPronounGenderReplyHook() {
  try {
    const replyRuntime = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
    if (typeof replyRuntime.setPronounGenderApplier !== "function") return;
    replyRuntime.setPronounGenderApplier(applyPronounGenderToPayload);
  } catch (err) {
    global.logger?.warn?.("[PRONOUN-GENDER] reply hook registration failed:", err?.message || err);
  }
}

export = {
  resolveMemberPronounGender,
  applyPronounGenderToTextForMember,
  applyPronounGenderToEmbedForMember,
  applyPronounGenderToPayload,
  registerPronounGenderReplyHook,
};