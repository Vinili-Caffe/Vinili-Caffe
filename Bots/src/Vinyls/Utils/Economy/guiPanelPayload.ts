const { normalizeTextForCanvas } = require("../Render/canvasUtils") as typeof import("../Render/canvasUtils");

function canvasStatusLine(notice?, maxLen = 90) {
  let text = String(notice || "")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/`+/g, "")
    .replace(/<a?:[^>]+>/g, "")
    .replace(/<:[^>]+>/g, "")
    .replace(/<@!?\d+>/g, "")
    .replace(/<@&\d+>/g, "")
    .replace(/<#\d+>/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\n+/g, " · ")
    .replace(/\s*·\s*/g, " · ")
    .replace(/(?:·\s*){2,}/g, " · ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*·/g, " ·")
    .replace(/·\s*,/g, "·")
    .replace(/^[·,\s.;:!?]+|[·,\s.;:!?]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  text = normalizeTextForCanvas(text);
  const limit = Math.max(24, Math.min(140, Math.floor(Number(maxLen) || 90)));
  if (text.length > limit) {
    const cut = text.slice(0, Math.max(1, limit - 1));
    const sp = cut.lastIndexOf(" ");
    text = `${(sp > Math.floor(limit * 0.45) ? cut.slice(0, sp) : cut).trim()}…`;
  }
  return text;
}

function buildImageButtonPayload({ files, components }) {
  const fileList = Array.isArray(files) ? files : [];
  return {
    content: null,
    embeds: [],
    components: Array.isArray(components) ? components : [],
    files: fileList,
                ...(fileList.length ? { attachments: [] } : {}),
    allowedMentions: { repliedUser: false },
  };
}

export = {
  buildImageButtonPayload,
  canvasStatusLine,
};
