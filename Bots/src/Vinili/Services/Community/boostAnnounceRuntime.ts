/** Cache conteggio boost guild + lock followup/send (condivisi tra moduli boost announce). */
const boostCountCache = new Map();
const boostFollowupLocks = new Map();
const boostAnnounceSendLocks = new Set();

export = { boostCountCache, boostFollowupLocks, boostAnnounceSendLocks };
