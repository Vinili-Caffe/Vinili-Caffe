/**
 * Discord “font” generators usano Unicode stilizzato (math bold, Canadian Syllabics, fullwidth…).
 * Nei font del sito quei glifi spesso non ci sono → caselle / forme sbagliate.
 * Qui si riportano alle lettere latine leggibili, lasciando emoji e accenti normali.
 */

const PAIR_MAP: Record<string, string> = {
  /* Canadian Aboriginal / “Canada” aesthetic (A/F tipici di Vinili & Caffè) */
  "\u15E9": "A", // ᗩ
  "\u1591": "A", // ᗑ
  "\u15C5": "A", // ᗅ
  "\u15F7": "B", // ᗷ
  "\u1472": "B", // ᑲ
  "\u1455": "C", // ᑕ
  "\u1462": "C", // ᑢ
  "\u15EA": "D", // ᗪ
  "\u156E": "E", // ᕮ
  "\u15F0": "M", // ᗰ
  "\u15B4": "F", // ᖴ
  "\u15BD": "K", // ᖽ
  "\u157C": "H", // ᕼ
  "\u13A5": "I", // Ꭵ
  "\u148D": "J", // ᒍ
  "\u14AA": "L", // ᒪ
  "\u144E": "N", // ᑎ
  "\u176A": "O", // ᝪ
  "\u146D": "P", // ᑭ
  "\u146B": "Q", // ᑫ
  "\u1587": "R", // ᖇ
  "\u144C": "U", // ᑌ
  "\u142F": "V", // ᐯ
  "\u15EF": "W", // ᗯ
  "\u166D": "X", // ᙭
  "\u1614": "Z", // ᘔ
  "\u15BB": "Y", // ᖻ
  "\u24B6": "A",
  "\u24B7": "B",
  "\u24B8": "C",
  "\u24B9": "D",
  "\u24BA": "E",
  "\u24BB": "F",
  "\u24D0": "a",
  "\u24D1": "b",
  "\u24D2": "c",
  "\u24D3": "d",
  "\u24D4": "e",
  "\u24D5": "f",
};

function mapMathAlnum(cp: number): string | null {
  if (cp >= 0x1d400 && cp <= 0x1d419) return String.fromCharCode(65 + (cp - 0x1d400));
  if (cp >= 0x1d41a && cp <= 0x1d433) return String.fromCharCode(97 + (cp - 0x1d41a));
  if (cp >= 0x1d434 && cp <= 0x1d44d) return String.fromCharCode(65 + (cp - 0x1d434));
  if (cp >= 0x1d44e && cp <= 0x1d467) return String.fromCharCode(97 + (cp - 0x1d44e));
  if (cp >= 0x1d468 && cp <= 0x1d481) return String.fromCharCode(65 + (cp - 0x1d468));
  if (cp >= 0x1d482 && cp <= 0x1d49b) return String.fromCharCode(97 + (cp - 0x1d482));
  if (cp >= 0x1d49c && cp <= 0x1d4b5) return String.fromCharCode(65 + (cp - 0x1d49c));
  if (cp >= 0x1d4b6 && cp <= 0x1d4cf) return String.fromCharCode(97 + (cp - 0x1d4b6));
  if (cp >= 0x1d4d0 && cp <= 0x1d4e9) return String.fromCharCode(65 + (cp - 0x1d4d0));
  if (cp >= 0x1d4ea && cp <= 0x1d503) return String.fromCharCode(97 + (cp - 0x1d4ea));
  if (cp >= 0x1d504 && cp <= 0x1d51d) return String.fromCharCode(65 + (cp - 0x1d504));
  if (cp >= 0x1d51e && cp <= 0x1d537) return String.fromCharCode(97 + (cp - 0x1d51e));
  if (cp >= 0x1d538 && cp <= 0x1d551) return String.fromCharCode(65 + (cp - 0x1d538));
  if (cp >= 0x1d552 && cp <= 0x1d56b) return String.fromCharCode(97 + (cp - 0x1d552));
  if (cp >= 0x1d56c && cp <= 0x1d585) return String.fromCharCode(65 + (cp - 0x1d56c));
  if (cp >= 0x1d586 && cp <= 0x1d59f) return String.fromCharCode(97 + (cp - 0x1d586));
  if (cp >= 0x1d5a0 && cp <= 0x1d5b9) return String.fromCharCode(65 + (cp - 0x1d5a0));
  if (cp >= 0x1d5ba && cp <= 0x1d5d3) return String.fromCharCode(97 + (cp - 0x1d5ba));
  if (cp >= 0x1d5d4 && cp <= 0x1d5ed) return String.fromCharCode(65 + (cp - 0x1d5d4));
  if (cp >= 0x1d5ee && cp <= 0x1d607) return String.fromCharCode(97 + (cp - 0x1d5ee));
  if (cp >= 0x1d608 && cp <= 0x1d621) return String.fromCharCode(65 + (cp - 0x1d608));
  if (cp >= 0x1d622 && cp <= 0x1d63b) return String.fromCharCode(97 + (cp - 0x1d622));
  if (cp >= 0x1d63c && cp <= 0x1d655) return String.fromCharCode(65 + (cp - 0x1d63c));
  if (cp >= 0x1d656 && cp <= 0x1d66f) return String.fromCharCode(97 + (cp - 0x1d656));
  if (cp >= 0x1d670 && cp <= 0x1d689) return String.fromCharCode(65 + (cp - 0x1d670));
  if (cp >= 0x1d68a && cp <= 0x1d6a3) return String.fromCharCode(97 + (cp - 0x1d68a));
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return String.fromCharCode(48 + (cp - 0x1d7ce));
  if (cp >= 0x1d7d8 && cp <= 0x1d7e1) return String.fromCharCode(48 + (cp - 0x1d7d8));
  if (cp >= 0x1d7e2 && cp <= 0x1d7eb) return String.fromCharCode(48 + (cp - 0x1d7e2));
  if (cp >= 0x1d7ec && cp <= 0x1d7f5) return String.fromCharCode(48 + (cp - 0x1d7ec));
  if (cp >= 0x1d7f6 && cp <= 0x1d7ff) return String.fromCharCode(48 + (cp - 0x1d7f6));
  return null;
}

function mapFullwidth(cp: number): string | null {
  if (cp >= 0xff21 && cp <= 0xff3a) return String.fromCharCode(65 + (cp - 0xff21));
  if (cp >= 0xff41 && cp <= 0xff5a) return String.fromCharCode(97 + (cp - 0xff41));
  if (cp >= 0xff10 && cp <= 0xff19) return String.fromCharCode(48 + (cp - 0xff10));
  return null;
}

/** Nome server / testo Discord con “font” fancy → latin leggibile sul sito. */
export function readableDiscordText(input: string): string {
  const raw = String(input || "");
  if (!raw) return raw;
  let out = "";
  for (const ch of raw) {
    if (PAIR_MAP[ch]) {
      out += PAIR_MAP[ch];
      continue;
    }
    const cp = ch.codePointAt(0)!;
    const math = mapMathAlnum(cp);
    if (math) {
      out += math;
      continue;
    }
    const fw = mapFullwidth(cp);
    if (fw) {
      out += fw;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Nome guild per UI: fancy → latin, trim, fallback. */
export function readableGuildName(name: unknown, fallback = "Server"): string {
  const n = readableDiscordText(String(name || "").trim());
  return n || fallback;
}
