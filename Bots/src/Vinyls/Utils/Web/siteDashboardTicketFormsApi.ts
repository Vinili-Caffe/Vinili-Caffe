const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const {
  MAX_FORMS,
  MAX_FIELDS,
  FIELD_TYPES,
  TEXT_STYLES,
  getGuildForms,
  createGuildForm,
  updateGuildForm,
  deleteGuildForm,
  refreshTicketFormsCache,
} = require("../../MultiGuild/core/tenantTicketForms") as typeof import("../../MultiGuild/core/tenantTicketForms");

const REASON_MESSAGES = {
  invalid_guild: "Server non valido.",
  mongo_not_ready: "Database non disponibile. Riprova tra poco.",
  persist_failed: "Salvataggio non riuscito. Riprova.",
  invalid_form: "Titolo form non valido.",
  not_found: "Form non trovato.",
  quota: `Quota form raggiunta (max ${MAX_FORMS}).`,
};

function reasonToMessage(reason?) {
  return REASON_MESSAGES[String(reason || "")] || "Operazione non riuscita.";
}

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function serializeForm(form?) {
  return {
    id: form.id,
    title: form.title,
    fields: Array.isArray(form.fields) ? form.fields : [],
    createdAt: form.createdAt || null,
    updatedAt: form.updatedAt || null,
  };
}

async function listDashboardTicketForms(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  await refreshTicketFormsCache().catch(() => null);
  const bucket = await getGuildForms(gid);
  const forms = (bucket.forms || []).map(serializeForm);
  return {
    ok: true,
    status: 200,
    guildId: gid,
    forms,
    fieldTypes: FIELD_TYPES,
    textStyles: TEXT_STYLES,
    quotas: { forms: forms.length, maxForms: MAX_FORMS, maxFields: MAX_FIELDS },
  };
}

async function createDashboardTicketForm(client?, accessToken?, guildId?, body: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const result: any = await createGuildForm(gid, { title: body.title });
  if (!result.ok) {
    return fail(
      result.reason === "quota" ? 400 : 400,
      result.reason || "persist_failed",
      reasonToMessage(result.reason),
    );
  }
  const listed: any = await listDashboardTicketForms(client, accessToken, gid);
  if (!listed.ok) return listed;
  return {
    ok: true,
    status: 200,
    guildId: gid,
    form: serializeForm(result.form),
    forms: listed.forms,
    message: "Form creato.",
  };
}

async function updateDashboardTicketForm(client?, accessToken?, guildId?, formId?, body: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const patch: Record<string, any> = {};
  if (body.title != null) patch.title = body.title;
  if (Array.isArray(body.fields)) patch.fields = body.fields;
  const result: any = await updateGuildForm(gid, formId, patch);
  if (!result.ok) {
    return fail(
      result.reason === "not_found" ? 404 : 400,
      result.reason || "persist_failed",
      reasonToMessage(result.reason),
    );
  }
  const listed: any = await listDashboardTicketForms(client, accessToken, gid);
  if (!listed.ok) return listed;
  return {
    ok: true,
    status: 200,
    guildId: gid,
    form: serializeForm(result.form),
    forms: listed.forms,
    message: "Form aggiornato.",
  };
}

async function deleteDashboardTicketForm(client?, accessToken?, guildId?, formId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const result: any = await deleteGuildForm(gid, formId);
  if (!result.ok) {
    return fail(
      result.reason === "not_found" ? 404 : 500,
      result.reason || "persist_failed",
      reasonToMessage(result.reason),
    );
  }
  const listed: any = await listDashboardTicketForms(client, accessToken, gid);
  if (!listed.ok) return listed;
  return {
    ok: true,
    status: 200,
    guildId: gid,
    deletedId: result.deletedId,
    forms: listed.forms,
    message: "Form eliminato.",
  };
}

export = {
  listDashboardTicketForms,
  createDashboardTicketForm,
  updateDashboardTicketForm,
  deleteDashboardTicketForm,
};
