/**
 * Filtri della descrizione partnership: stessa logica del bot
 * (Bots/src/Vinili/Partner/runtime/partnershipMessageUtils.ts › applyPartnershipContentFilters).
 * Se cambi una regola là, cambiala anche qui, così l'anteprima della dashboard resta fedele.
 */
export type PartnershipFilterFlags = {
  stripMentions: boolean;
  stripMassMentions: boolean;
  stripNonInviteLinks: boolean;
  stripCustomEmojis: boolean;
  stripInvisibleChars: boolean;
  stripSpoilers: boolean;
  stripExtraInvites: boolean;
};

const INVITE_RE = () => /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite|discord\.com\/invite)\/[A-Za-z0-9-]+(?:\?[^\s<>()[\]"']*)?/gi;

const tidy = (t: string) =>
  t
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();

function stripOuterCodeBlock(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```$/);
  if (m?.[1]) return m[1].trim();
  return trimmed.replace(/^```/, "").replace(/```$/, "").trim();
}

function stripLinks(text: string) {
  const out = text
    .replace(/\bhttps?:\/\/(?!discord\.gg\/|discord(?:app)?\.com\/invite\/|discord\.com\/invite\/)\S+/gi, " ")
    .replace(/\bwww\.[^\s<>()]+\.[a-z]{2,}(?:\/\S*)?/gi, " ")
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?/gi, (m) =>
      /^(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|discord\.com\/invite\/)/i.test(m.trim()) ? m : " ",
    );
  return tidy(out);
}

function stripExtraInvites(text: string) {
  let seen = false;
  return text.replace(INVITE_RE(), (m) => {
    if (!seen) {
      seen = true;
      return m;
    }
    return " ";
  });
}

export function applyPartnershipFilters(raw: string, f: PartnershipFilterFlags): string {
  let text = String(raw || "").trim();
  const any = Object.values(f).some(Boolean);
  if (!any) return text;
  text = stripOuterCodeBlock(text);
  if (f.stripInvisibleChars) text = text.replace(/[​-‍⁠﻿­]/g, "");
  if (f.stripSpoilers) text = text.replace(/\|\|([\s\S]*?)\|\|/g, "$1");
  if (f.stripCustomEmojis) text = text.replace(/<a?:\w+:\d+>/g, "");
  if (f.stripMentions) text = text.replace(/<@!?\d+>/g, "").replace(/<@&\d+>/g, "").replace(/<#\d+>/g, "");
  if (f.stripMassMentions) text = text.replace(/@everyone/g, "").replace(/@here/g, "");
  if (f.stripNonInviteLinks) text = stripLinks(text);
  if (f.stripExtraInvites) text = stripExtraInvites(text);
  return tidy(text);
}
