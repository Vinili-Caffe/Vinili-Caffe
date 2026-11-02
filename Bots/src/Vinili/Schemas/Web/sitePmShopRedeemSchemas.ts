const mongoose = require("mongoose") as typeof import("mongoose");
const { Schema, model, models } = mongoose;

const PM_SHOP_REDEEM_SOURCES = Object.freeze([
  "site_hs_manual",
  "site_self",
  "discord_hs",
  "ticket_ack",
]);

const sitePmShopRedeemSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    pmUserId: { type: String, required: true, index: true },
    actorUserId: { type: String, default: null, index: true },
    tier: { type: Number, required: true, min: 1 },
    pointCost: { type: Number, required: true, min: 0 },
    rewardLabel: { type: String, default: "", trim: true, maxlength: 200 },
    reason: { type: String, default: "", trim: true, maxlength: 400 },
    pointsBefore: { type: Number, default: null },
    pointsAfter: { type: Number, default: null },
    source: {
      type: String,
      required: true,
      enum: PM_SHOP_REDEEM_SOURCES,
      default: "site_hs_manual",
      index: true,
    },
  },
  { timestamps: true },
);

sitePmShopRedeemSchema.index({ guildId: 1, pmUserId: 1, createdAt: -1, _id: -1 });
sitePmShopRedeemSchema.index({ guildId: 1, createdAt: -1, _id: -1 });

const SitePmShopRedeemEntry: any =
  models.SitePmShopRedeemEntry ||
  model("SitePmShopRedeemEntry", sitePmShopRedeemSchema, "sitepmshopredeems");

export = {
  SitePmShopRedeemEntry,
};
