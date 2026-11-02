/** Client REST del sito: server (ruoli, emoji, sticker, membri). */
const { enrichGuildRoles, enrichGuildEmojis, enrichGuildStickers } = require("./restGuildEnrich") as typeof import("./restGuildEnrich");
const { wrapGuild } = require("./restGuildWrap") as typeof import("./restGuildWrap");

export = { enrichGuildRoles, enrichGuildEmojis, enrichGuildStickers, wrapGuild };
