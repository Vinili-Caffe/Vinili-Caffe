/** Community ops: ruolo voto Discadia su ActivityUserProfile. */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

const DISCADIA_VOTE_ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";
const VOTE_ROLE_EXPIRES_AT_PATH = `${DISCADIA_VOTE_ROOT}.voteRole.expiresAt`;
const VOTE_ROLE_GRANTED_AT_PATH = `${DISCADIA_VOTE_ROOT}.voteRole.grantedAt`;

async function upsertVoteRole(guildId?, userId?, expiresAt?) {
  if (!guildId || !userId || !expiresAt) return null;
  return ActivityUserProfile.findOneAndUpdate(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId },
      $set: { [VOTE_ROLE_EXPIRES_AT_PATH]: expiresAt, [VOTE_ROLE_GRANTED_AT_PATH]: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export = {
  upsertVoteRole,
};
