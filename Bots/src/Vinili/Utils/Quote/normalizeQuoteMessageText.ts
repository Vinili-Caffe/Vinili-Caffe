function normalizeQuoteMessageText(targetMessage?) {
  const raw = String(targetMessage?.content || "");
  const users = targetMessage?.mentions?.users;
  const roles = targetMessage?.mentions?.roles;
  const channels = targetMessage?.mentions?.channels;

  return raw
    .replace(/<@!?(\d+)>/g, (_?, id?) => {
      const u = users?.get(id);
      const name = u?.username;
      return name ? `@${name}` : "@utente";
    })
    .replace(/<@&(\d+)>/g, (_?, id?) => {
      const role = roles?.get(id);
      return role?.name ? `@${role.name}` : "@ruolo";
    })
    .replace(/<#(\d+)>/g, (_?, id?) => {
      const ch = channels?.get(id);
      return ch?.name ? `#${ch.name}` : "#canale";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

export = { normalizeQuoteMessageText };