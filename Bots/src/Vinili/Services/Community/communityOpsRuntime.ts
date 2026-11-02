/** Community ops: map condivise per numbering categorie (timer, inflight, rename bot). */
const guildTimers = new Map();
const guildRenumberInflight = new Map();
const guildRenumberPending = new Set();
const categoryNumberingBotRenames = new Map();
const categoryRenameBackoffUntil = new Map();

export = {
  guildTimers,
  guildRenumberInflight,
  guildRenumberPending,
  categoryNumberingBotRenames,
  categoryRenameBackoffUntil,
};
