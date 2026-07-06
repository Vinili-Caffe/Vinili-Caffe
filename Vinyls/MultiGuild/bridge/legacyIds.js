function cloneSection(section) {
  if (!section || typeof section !== "object") return {};
  return { ...section };
}

function applyMapOverlay(target, overlay) {
  if (!overlay || typeof overlay !== "object") return target;
  for (const [key, value] of Object.entries(overlay)) {
    const id = String(value || "").trim();
    if (id && /^\d{16,20}$/.test(id)) target[key] = id;
  }
  return target;
}

function buildIdsOverlay(entry, baseIds = null) {
  const base = baseIds || require("../../Utils/Config/ids");
  const roles = applyMapOverlay(cloneSection(base.roles), entry?.roleMap);
  const channels = applyMapOverlay(cloneSection(base.channels), entry?.channelMap);
  return {
    guilds: cloneSection(base.guilds),
    categories: cloneSection(base.categories),
    channels,
    roles,
    bots: cloneSection(base.bots),
  };
}

module.exports = { buildIdsOverlay, applyMapOverlay };