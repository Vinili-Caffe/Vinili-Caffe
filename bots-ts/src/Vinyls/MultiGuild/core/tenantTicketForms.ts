const crypto = require("node:crypto") as typeof import("node:crypto");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const { normalizeGuildId } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");

const BOT_STATE_KEY = "multiGuildTicketForms.v1";
const MAX_FORMS = 40;
const MAX_FIELDS = 5;
const MAX_OPTIONS = 25;
const MAX_OPTIONS_RADIO = 10;
const MAX_OPTIONS_CHECKBOX = 10;
const MAX_TITLE = 100;
const MAX_LABEL = 45;
const MAX_DESCRIPTION = 100;
const MAX_PLACEHOLDER = 100;
const MAX_OPTION_LABEL = 100;
const MAX_OPTION_VALUE = 100;
const MAX_SELECT_VALUES = 25;

const FIELD_TYPES = Object.freeze([
  "text_input",
  "string_select",
  "user_select",
  "role_select",
  "mentionable_select",
  "channel_select",
  "radio_group",
  "checkbox_group",
]);

const TEXT_STYLES = Object.freeze(["short", "paragraph"]);

let formsCache = Object.freeze({});

function asBool(value?, fallback?) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function asInt(value?, fallback?, min?, max?) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function normalizeFormId(value?) {
  const id = String(value || "").trim();
  return id && /^[a-zA-Z0-9_-]{8,64}$/.test(id) ? id : null;
}

function normalizeFieldType(value?) {
  const t = String(value || "").trim().toLowerCase();
  return FIELD_TYPES.includes(t) ? t : "text_input";
}

function normalizeTextStyle(value?) {
  const s = String(value || "").trim().toLowerCase();
  if (s === "paragraph" || s === "multi" || s === "multi-line" || s === "multiline") return "paragraph";
  return "short";
}

function normalizeOption(raw?) {
  if (!raw || typeof raw !== "object") return null;
  const label = String(raw.label || "").trim().slice(0, MAX_OPTION_LABEL);
  const value = String(raw.value || raw.id || label || "")
    .trim()
    .slice(0, MAX_OPTION_VALUE);
  if (!label || !value) return null;
  const description = String(raw.description || "").trim().slice(0, 100) || null;
  return { label, value, description };
}

function normalizeField(raw?, fallback: Record<string, any> = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const type = normalizeFieldType(src.type ?? base.type);
  const label = String(src.label ?? base.label ?? "").trim().slice(0, MAX_LABEL);
  if (!label) return null;

  const optionsSrc = Array.isArray(src.options)
    ? src.options
    : Array.isArray(base.options)
      ? base.options
      : [];
  const options = [];
  const seen = new Set();
  for (const row of optionsSrc) {
    const opt = normalizeOption(row);
    if (!opt || seen.has(opt.value)) continue;
    seen.add(opt.value);
    options.push(opt);
    if (options.length >= MAX_OPTIONS) break;
  }

  const needsOptions =
    type === "string_select" || type === "radio_group" || type === "checkbox_group";
  const maxOptionsForType =
    type === "radio_group"
      ? MAX_OPTIONS_RADIO
      : type === "checkbox_group"
        ? MAX_OPTIONS_CHECKBOX
        : MAX_OPTIONS;
  const trimmedOptions = needsOptions ? options.slice(0, maxOptionsForType) : [];

  let minLength = asInt(src.minLength ?? src.min ?? base.minLength, 0, 0, 4000);
  let maxLength = asInt(src.maxLength ?? src.max ?? base.maxLength, 255, 1, 4000);
  if (maxLength < minLength) maxLength = minLength;

  const supportsMinMax =
    type === "string_select" ||
    type === "user_select" ||
    type === "role_select" ||
    type === "mentionable_select" ||
    type === "channel_select" ||
    type === "checkbox_group";
  let minValues = asInt(
    src.minValues ?? src.minSelections ?? base.minValues,
    type === "string_select" ? 1 : 0,
    0,
    MAX_SELECT_VALUES,
  );
  let maxValues = asInt(
    src.maxValues ?? src.maxSelections ?? base.maxValues,
    type === "string_select" || type === "radio_group" ? 1 : MAX_SELECT_VALUES,
    1,
    MAX_SELECT_VALUES,
  );
  if (maxValues < minValues) maxValues = Math.max(1, minValues);
  if (type === "radio_group") {
    minValues = 1;
    maxValues = 1;
  }

  return {
    id: normalizeFormId(src.id ?? base.id) || newId(),
    type,
    label,
    description: String(src.description ?? base.description ?? "").trim().slice(0, MAX_DESCRIPTION) || null,
    placeholder:
      type === "text_input"
        ? String(src.placeholder ?? base.placeholder ?? "").trim().slice(0, MAX_PLACEHOLDER) || null
        : null,
    required: asBool(src.required ?? base.required, true),
    style: type === "text_input" ? normalizeTextStyle(src.style ?? base.style) : null,
    minLength: type === "text_input" ? minLength : null,
    maxLength: type === "text_input" ? maxLength : null,
    minValues: supportsMinMax ? minValues : type === "radio_group" ? 1 : null,
    maxValues: supportsMinMax ? maxValues : type === "radio_group" ? 1 : null,
    options: trimmedOptions,
  };
}

function normalizeForm(raw?, fallback: Record<string, any> = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const title = String(src.title ?? base.title ?? "").trim().slice(0, MAX_TITLE);
  if (!title) return null;
  const fieldsSrc = Array.isArray(src.fields) ? src.fields : Array.isArray(base.fields) ? base.fields : [];
  const fields = [];
  for (const row of fieldsSrc) {
    const field = normalizeField(row);
    if (!field) continue;
    fields.push(field);
    if (fields.length >= MAX_FIELDS) break;
  }
  return {
    id: normalizeFormId(src.id ?? base.id) || newId(),
    title,
    fields,
    createdAt: src.createdAt || base.createdAt || new Date().toISOString(),
    updatedAt: src.updatedAt || base.updatedAt || new Date().toISOString(),
  };
}

function emptyBucket() {
  return { forms: [] };
}

function normalizeBucket(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const forms = [];
  const seen = new Set();
  for (const row of Array.isArray(src.forms) ? src.forms : []) {
    const form = normalizeForm(row);
    if (!form || seen.has(form.id)) continue;
    seen.add(form.id);
    forms.push(form);
    if (forms.length >= MAX_FORMS) break;
  }
  return { forms };
}

function readRootFromCache() {
  return formsCache && typeof formsCache === "object" ? formsCache : {};
}

async function loadFormsRoot() {
  if (!isMongoReady()) return readRootFromCache();
  const raw = await getBotState(BOT_STATE_KEY, {});
  const root = raw && typeof raw === "object" ? raw : {};
  const next: Record<string, any> = {};
  for (const [gid, bucket] of Object.entries(root)) {
    const id = normalizeGuildId(gid) || String(gid || "").trim();
    if (!id) continue;
    next[id] = normalizeBucket(bucket);
  }
  formsCache = Object.freeze(next);
  return formsCache;
}

async function saveFormsRoot(root?) {
  const src = root && typeof root === "object" ? root : {};
  const next: Record<string, any> = {};
  for (const [gid, bucket] of Object.entries(src)) {
    const id = normalizeGuildId(gid) || String(gid || "").trim();
    if (!id) continue;
    next[id] = normalizeBucket(bucket);
  }
  const ok = await setBotState(BOT_STATE_KEY, next);
  if (ok) formsCache = Object.freeze(next);
  return ok;
}

function getGuildFormsSync(guildId?) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return emptyBucket();
  const hit = readRootFromCache()[gid];
  return hit ? normalizeBucket(hit) : emptyBucket();
}

async function getGuildForms(guildId?) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return emptyBucket();
  const root = await loadFormsRoot();
  return root[gid] ? normalizeBucket(root[gid]) : emptyBucket();
}

async function mutateGuildForms(guildId?, mutator?) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return { ok: false, reason: "invalid_guild" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };
  const root = { ...(await loadFormsRoot()) };
  const prev = normalizeBucket(root[gid] || emptyBucket());
  const nextBucket = normalizeBucket(mutator(prev) || prev);
  root[gid] = nextBucket;
  const ok = await saveFormsRoot(root);
  if (!ok) return { ok: false, reason: "persist_failed" };
  return { ok: true, bucket: nextBucket };
}

function findGuildFormById(guildId?, formId?) {
  const id = normalizeFormId(formId);
  if (!id) return null;
  return getGuildFormsSync(guildId).forms.find((f?) => String(f.id) === id) || null;
}

async function refreshTicketFormsCache() {
  await loadFormsRoot();
  return getGuildFormsSync;
}

async function createGuildForm(guildId?, { title } = {}) {
  const form = normalizeForm({ title, fields: [] });
  if (!form) return { ok: false, reason: "invalid_form" };
  const result = await mutateGuildForms(guildId, (prev?) => {
    if ((prev.forms || []).length >= MAX_FORMS) return prev;
    return { forms: [...(prev.forms || []), form] };
  });
  if (!result.ok) return result;
  if (!(result.bucket.forms || []).some((f?) => f.id === form.id)) {
    return { ok: false, reason: "quota" };
  }
  return { ok: true, form, bucket: result.bucket };
}

async function updateGuildForm(guildId?, formId?, patch: Record<string, any> = {}) {
  const id = normalizeFormId(formId);
  if (!id) return { ok: false, reason: "not_found" };
  let updated = null;
  const result = await mutateGuildForms(guildId, (prev?) => {
    const forms = [...(prev.forms || [])];
    const idx = forms.findIndex((f?) => String(f.id) === id);
    if (idx < 0) return prev;
    const next = normalizeForm(
      {
        ...forms[idx],
        ...patch,
        id,
        updatedAt: new Date().toISOString(),
      },
      forms[idx],
    );
    if (!next) return prev;
    forms[idx] = next;
    updated = next;
    return { forms };
  });
  if (!result.ok) return result;
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, form: updated, bucket: result.bucket };
}

async function deleteGuildForm(guildId?, formId?) {
  const id = normalizeFormId(formId);
  if (!id) return { ok: false, reason: "not_found" };
  let deleted = false;
  const result = await mutateGuildForms(guildId, (prev?) => {
    const before = prev.forms || [];
    const forms = before.filter((f?) => String(f.id) !== id);
    deleted = forms.length !== before.length;
    return { forms };
  });
  if (!result.ok) return result;
  if (!deleted) return { ok: false, reason: "not_found" };
  return { ok: true, deletedId: id, bucket: result.bucket };
}

export = {
  BOT_STATE_KEY,
  FIELD_TYPES,
  TEXT_STYLES,
  MAX_FORMS,
  MAX_FIELDS,
  MAX_OPTIONS,
  MAX_OPTIONS_RADIO,
  MAX_OPTIONS_CHECKBOX,
  MAX_SELECT_VALUES,
  MAX_TITLE,
  MAX_LABEL,
  normalizeForm,
  normalizeField,
  getGuildForms,
  getGuildFormsSync,
  mutateGuildForms,
  findGuildFormById,
  refreshTicketFormsCache,
  createGuildForm,
  updateGuildForm,
  deleteGuildForm,
};
