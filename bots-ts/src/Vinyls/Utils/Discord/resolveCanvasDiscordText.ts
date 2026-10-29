const { accountUsername } = require("./guildDiscordIdentity") as typeof import("./guildDiscordIdentity");

async function resolveCanvasDiscordMarkup(guild?, client?, text?) {
  let s = String(text || "");
  if (!guild || !client) {
    return s;
  }

  const userRe = /<@!?(\d{17,22})>/g;
  const userIds = new Set();
  let m;
  while ((m = userRe.exec(s)) !== null) {
    userIds.add(m[1]);
  }

  const userLabelById = new Map();
  await Promise.all(
    [...userIds].map(async (id?: any) => {
      let member = guild.members.cache.get(id);
      if (!member) {
        member = await guild.members.fetch(id).catch(() => null);
      }
      if (member) {
        userLabelById.set(id, `@${accountUsername(member)}`);
        return;
      }
      const u = await client.users.fetch(id).catch(() => null);
      if (u) {
        userLabelById.set(id, `@${accountUsername(u)}`);
        return;
      }
      userLabelById.set(id, `@${id.slice(-6)}`);
    }),
  );

  s = s.replace(userRe, (_?, id?) => userLabelById.get(id) || `@${id}`);

  s = s.replace(/<#(\d{17,22})>/g, (_?, id?) => {
    const ch = guild.channels.cache.get(id);
    return ch && ch.name ? `#${ch.name}` : `#${id}`;
  });

  s = s.replace(/<@&(\d{17,22})>/g, (_?, id?) => {
    const role = guild.roles.cache.get(id);
    return role && role.name ? `@${role.name}` : `@role`;
  });

  return s;
}

export = { resolveCanvasDiscordMarkup };