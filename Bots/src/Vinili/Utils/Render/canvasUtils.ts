const CANVAS_COMPAT_REPLACEMENTS = new Map([
  ["\u0F04", "\u2736"],
  ["\uFE32", "\u2502"],
  ["\u1CBC", "\u00B7"],
]);

function replaceCanvasCompatChars(value?) {
  let out = String(value || "");
  for (const [from, to] of CANVAS_COMPAT_REPLACEMENTS.entries()) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function stripCanvasNoiseChars(value?) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u00AD\u034F\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/\uFFFD/g, "")
        .replace(/[\u1B80-\u1BBF\u1CC0-\u1CC7]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

function normalizeTextForCanvas(str?) {
  if (str == null || typeof str !== "string") return "";
  const s = replaceCanvasCompatChars(String(str)).normalize("NFC");
  const out = [];
  const A = 0x41;
  const a = 0x61;
  const zero = 0x30;
  const letterRanges = [
    [0x1d400, 0x1d419, A],
    [0x1d41a, 0x1d433, a],
    [0x1d434, 0x1d44d, A],
    [0x1d44e, 0x1d467, a],
    [0x1d468, 0x1d481, A],
    [0x1d482, 0x1d49b, a],
    [0x1d49c, 0x1d4b5, A],
    [0x1d4b6, 0x1d4cf, a],
    [0x1d4d0, 0x1d4e9, A],
    [0x1d4ea, 0x1d503, a],
    [0x1d504, 0x1d51d, A],
    [0x1d51e, 0x1d537, a],
    [0x1d538, 0x1d551, A],
    [0x1d552, 0x1d56b, a],
    [0x1d56c, 0x1d585, A],
    [0x1d586, 0x1d59f, a],
    [0x1d5a0, 0x1d5b9, A],
    [0x1d5ba, 0x1d5d3, a],
    [0x1d5d4, 0x1d5ed, A],
    [0x1d5ee, 0x1d607, a],
    [0x1d608, 0x1d621, A],
    [0x1d622, 0x1d63b, a],
    [0x1d63c, 0x1d655, A],
    [0x1d656, 0x1d66f, a],
    [0x1d670, 0x1d689, A],
    [0x1d68a, 0x1d6a3, a],
  ];
  const digitRanges = [
    [0x1d7ce, 0x1d7d7, zero],
    [0x1d7e2, 0x1d7eb, zero],
    [0x1d7ec, 0x1d7f5, zero],
  ];
  for (const ch of Array.from(s)) {
    const cp = ch.codePointAt(0);
    if (!Number.isFinite(cp)) {
      out.push(ch);
      continue;
    }
        if ((cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0xffffd) || (cp >= 0x100000 && cp <= 0x10fffd)) {
      continue;
    }
    if (cp >= 0xff01 && cp <= 0xff5e) {
      out.push(String.fromCodePoint(cp - 0xff01 + 0x21));
      continue;
    }
    let mapped = null;
    for (const [start, end, base] of letterRanges) {
      if (cp >= start && cp <= end) {
        mapped = String.fromCodePoint(base + (cp - start));
        break;
      }
    }
    if (mapped) {
      out.push(mapped);
      continue;
    }
    for (const [start, end, base] of digitRanges) {
      if (cp >= start && cp <= end) {
        mapped = String.fromCodePoint(base + (cp - start));
        break;
      }
    }
    if (mapped) {
      out.push(mapped);
      continue;
    }
    out.push(ch);
  }
  return stripCanvasNoiseChars(out.join(""));
}

function sanitizeCanvasDisplayName(input?, maxChars = 0, fallback = "Giocatore") {
  let value = normalizeTextForCanvas(String(input || ""));
  if (!value) return fallback;
  if (maxChars > 0) {
    const chars = Array.from(value);
    if (chars.length > maxChars) {
      value = `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
    }
  }
  return value;
}

/**
 * rankNickTight1: togli spazi adiacenti alle emoji (thin/nbsp → " " in normalize,
 * o padding visivo). Non tocca spazi tra parole normali.
 */
function tightEmojiAdjacentSpaces(input?) {
  let s = String(input || "");
  if (!s) return s;
  try {
    s = s.replace(
      /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s+/gu,
      "$1",
    );
    s = s.replace(/\s+(\p{Extended_Pictographic})/gu, "$1");
  } catch {
    s = s.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}](?:\uFE0F|\u200D[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])*)\s+/gu, "$1");
    s = s.replace(/\s+([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu, "$1");
  }
  return s;
}

export = {
  normalizeTextForCanvas,
  sanitizeCanvasDisplayName,
  tightEmojiAdjacentSpaces,
  replaceCanvasCompatChars,
  stripCanvasNoiseChars,
};
