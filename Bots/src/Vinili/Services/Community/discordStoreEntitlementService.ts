
async function handleEntitlementCreate() {
  return { ok: true, skipped: "discord_store_disabled" };
}

async function handleEntitlementDelete() {
  return { ok: true, skipped: "discord_store_disabled" };
}

async function handleEntitlementUpdate() {
  return { ok: true, skipped: "discord_store_disabled" };
}

export = {
  handleEntitlementCreate,
  handleEntitlementDelete,
  handleEntitlementUpdate,
};
