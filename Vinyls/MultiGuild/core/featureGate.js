function createFeatureGate(features = {}) {
  const map = features && typeof features === "object" ? features : {};
  return {
    isEnabled(featureKey) {
      const key = String(featureKey || "").trim().toLowerCase();
      if (!key) return false;
      if (map.all === true) return true;
      return map[key] === true;
    },
    listEnabled() {
      return Object.entries(map)
        .filter(([, enabled]) => enabled === true)
        .map(([key]) => key);
    },
    snapshot() {
      return { ...map };
    },
  };
}

module.exports = { createFeatureGate };