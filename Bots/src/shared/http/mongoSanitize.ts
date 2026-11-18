/** Rimuove operatori Mongo ($…) e chiavi pericolose da body/query/params. */

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(v?) {
  if (v == null || typeof v !== "object") return false;
  if (Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function sanitizeValue(value?, depth = 0) {
  if (depth > 12) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = sanitizeValue(value[i], depth + 1);
    }
    return value;
  }
  if (!isPlainObject(value)) return value;
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key) || key.startsWith("$")) {
      delete value[key];
      continue;
    }
    value[key] = sanitizeValue(value[key], depth + 1);
  }
  return value;
}

function sanitizeMongoOperators(input?) {
  if (input == null) return input;
  return sanitizeValue(input, 0);
}

function mountMongoSanitize(app?) {
  if (!app || typeof app.use !== "function") return;
  app.use((req?, _res?, next?) => {
    try {
      if (req.body && typeof req.body === "object") sanitizeMongoOperators(req.body);
      if (req.query && typeof req.query === "object") sanitizeMongoOperators(req.query);
      if (req.params && typeof req.params === "object") sanitizeMongoOperators(req.params);
    } catch (_) {}
    return next();
  });
}

export = {
  sanitizeMongoOperators,
  mountMongoSanitize,
};
