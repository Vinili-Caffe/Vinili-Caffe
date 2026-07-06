function canvasStatusLine(notice) {
  return String(notice || "")
    .replace(/\*\*/g, "")
    .replace(/<a?:[^>]+>/g, "")
    .replace(/<:[^>]+>/g, "")
    .replace(/\n+/g, " · ")
    .trim()
    .slice(0, 96);
}

function buildImageButtonPayload({ files, components }) {
  return {
    content: null,
    embeds: [],
    components: Array.isArray(components) ? components : [],
    files: Array.isArray(files) ? files : [],
    allowedMentions: { repliedUser: false },
  };
}

module.exports = {
  buildImageButtonPayload,
  canvasStatusLine,
};