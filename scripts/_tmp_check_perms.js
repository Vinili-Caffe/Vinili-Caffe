const { PermissionsBitField } = require("/opt/bot/node_modules/discord.js");
const f = PermissionsBitField.Flags;
const keys = Object.keys(f).filter((k) => /Embed|Activit|External|App|Soundboard/i.test(k));
console.log(keys.map((k) => `${k}=${String(f[k])}`).join("\n"));
console.log("has UseEmbeddedActivities", Boolean(f.UseEmbeddedActivities));
console.log("has UseExternalApps", Boolean(f.UseExternalApps));
