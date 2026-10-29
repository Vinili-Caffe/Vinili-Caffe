const TENANT_PARTNERSHIP_EMOJI = Object.freeze({
  partner: Object.freeze({ id: "1524730506531311688", name: "981353partner" }),
  bolt: Object.freeze({ id: "1524730543122681988", name: "709897bolt" }),
  planet: Object.freeze({ id: "1524730515436077187", name: "7619planet" }),
  giveaway: Object.freeze({ id: "1524730537770746006", name: "250885giveaway" }),
  bell: Object.freeze({ id: "1524730536369721404", name: "944992bell" }),
  star: Object.freeze({ id: "1524730514156556328", name: "510611star" }),
  staff: Object.freeze({ id: "1524730527943491594", name: "294025staff" }),
  search: Object.freeze({ id: "1524730540983582728", name: "808239search" }),
  staffBadge: Object.freeze({ id: "1524730539129438258", name: "861752staff" }),
  locked: Object.freeze({ id: "1524730533064609812", name: "184723locked" }),
  website: Object.freeze({ id: "1524730518481141901", name: "926683website" }),
  mail: Object.freeze({ id: "1524730508439719956", name: "373988mail" }),
  warning: Object.freeze({ id: "1524730510092533790", name: "11781warning" }),
  close: Object.freeze({ id: "1524730529440596089", name: "75661closelogo" }),
  unlocked: Object.freeze({ id: "1524730512051277905", name: "116444unlocked" }),
});

function formatTenantEmoji(key?) {
  const def = TENANT_PARTNERSHIP_EMOJI[key];
  if (!def?.id) return "";
  return `<:${def.name}:${def.id}>`;
}

function toButtonEmoji(value?) {
  if (!value) return null;
  if (typeof value === "object" && value.id) {
    return { id: String(value.id), name: String(value.name || value.id) };
  }
  const key = String(value);
  const def = TENANT_PARTNERSHIP_EMOJI[key];
  if (def?.id) return { id: def.id, name: def.name };
  const raw = key.trim();
  const match = raw.match(/^<a?:([^:>]+):(\d+)>$/);
  if (match) return { id: match[2], name: match[1] };
  return raw;
}

export = {
  TENANT_PARTNERSHIP_EMOJI,
  formatTenantEmoji,
  toButtonEmoji,
};
