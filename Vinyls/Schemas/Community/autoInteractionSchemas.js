const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;
const { ActivityUserProfile } = require("./communitySchemas");

const autoResponderSchema=new Schema({guildId:{type:String,required:true,index:true},trigger:{type:String,required:true},triggerLower:{type:String,required:true},response:{type:String,default:""},reactions:{type:[String],default:[]},enabled:{type:Boolean,default:true},createdBy:{type:String,default:null},updatedBy:{type:String,default:null},},{timestamps:true},);
autoResponderSchema.index({ guildId: 1, triggerLower: 1 }, { unique: true });

const mentionReactionSchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},reactions:{type:[String],default:[]},},{timestamps:true},);
mentionReactionSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const AutoResponder=models.AutoResponder||model("AutoResponder",autoResponderSchema);
const MentionReaction = {
  async findOne(filter) {
    const doc = await ActivityUserProfile.findOne(filter)
      .select("guildId userId profile.mentionReaction.reactions")
      .lean()
      .catch(() => null);
    if (!doc) return null;
    return {
      guildId: doc.guildId,
      userId: doc.userId,
      reactions: Array.isArray(doc?.profile?.mentionReaction?.reactions) ? doc.profile.mentionReaction.reactions : [],
    };
  },
  async find(filter = {}) {
    const docs = await ActivityUserProfile.find(filter)
      .select("guildId userId profile.mentionReaction.reactions")
      .lean()
      .catch(() => []);
    return docs.map((doc) => ({
      guildId: doc.guildId,
      userId: doc.userId,
      reactions: Array.isArray(doc?.profile?.mentionReaction?.reactions) ? doc.profile.mentionReaction.reactions : [],
    }));
  },
  async findOneAndUpdate(filter, update = {}, options = {}) {
    const setPayload = update?.$set || {};
    const doc = await ActivityUserProfile.findOneAndUpdate(
      filter,
      {
        $setOnInsert: { guildId: String(filter?.guildId || ""), userId: String(filter?.userId || "") },
        $set: { "profile.mentionReaction.reactions": Array.isArray(setPayload?.reactions) ? setPayload.reactions : [] },
      },
      { upsert: Boolean(options?.upsert), new: options?.new !== false, setDefaultsOnInsert: true },
    ).lean().catch(() => null);
    if (!doc) return null;
    return {
      guildId: doc.guildId,
      userId: doc.userId,
      reactions: Array.isArray(doc?.profile?.mentionReaction?.reactions) ? doc.profile.mentionReaction.reactions : [],
    };
  },
  async deleteOne(filter) {
    return ActivityUserProfile.updateOne(filter, { $set: { "profile.mentionReaction.reactions": [] } }).catch(() => ({ modifiedCount: 0 }));
  },
};

module.exports = {
  AutoResponder,
  MentionReaction,
};