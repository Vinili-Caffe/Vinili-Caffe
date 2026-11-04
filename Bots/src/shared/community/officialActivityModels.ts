/**
 * Modelli activity ufficiali usati anche da Caffè (stanze vocali) senza importare il barrel Vinili.
 */
const {
  ActivityUserProfile,
  CustomRole,
} = require("../../Vinili/Community/schemas/activityCommunitySchemas") as typeof import("../../Vinili/Community/schemas/activityCommunitySchemas");

export = { ActivityUserProfile, CustomRole };
