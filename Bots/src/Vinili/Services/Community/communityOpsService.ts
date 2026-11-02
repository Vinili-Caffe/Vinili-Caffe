/** Community ops: facade tenure, voto Discadia e numbering categorie (API invariata). */
const { upsertVoteRole } = require("./communityOpsVoteRole") as typeof import("./communityOpsVoteRole");
const { upsertVerifiedMember, applyTenureForMember, startVerificationTenureLoop, backfillVerificationTenure } = require("./communityOpsTenure") as typeof import("./communityOpsTenure");
const { queueCategoryRenumber, runAllGuilds } = require("./communityOpsCategoryRenumber") as typeof import("./communityOpsCategoryRenumber");
const { isCategoryNumberingBotRename } = require("./communityOpsCategoryRename") as typeof import("./communityOpsCategoryRename");

export = {
  upsertVoteRole,
  upsertVerifiedMember,
  applyTenureForMember,
  startVerificationTenureLoop,
  backfillVerificationTenure,
  queueCategoryRenumber,
  runAllGuilds,
  isCategoryNumberingBotRename,
};
