const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const MOD_CASE_COLLECTION = process.env.MOD_CASE_COLLECTION ? String(process.env.MOD_CASE_COLLECTION).trim() : "";
const MOD_CASE_USER_COLLECTION = process.env.MOD_CASE_USER_COLLECTION ? String(process.env.MOD_CASE_USER_COLLECTION).trim() : "";

/** La collection errata `mod_case_user` (singolare) non va usata: solo `mod_case_users`. */
function normalizeModCaseUserCollection(envValue) {
  const fallback = "mod_case_users";
  if (!envValue || typeof envValue !== "string") return fallback;
  const t = envValue.trim();
  if (!t || t === "mod_case_user") return fallback;
  return t;
}

const RESOLVED_MOD_CASE_COLLECTION = MOD_CASE_COLLECTION || "mod_case_users";
const RESOLVED_MOD_CASE_USER_COLLECTION = normalizeModCaseUserCollection(MOD_CASE_USER_COLLECTION);

const modConfigSchema=new Schema({guildId:{type:String,required:true,unique:true},logChannelId:{type:String,default:null},dmOnAction:{type:Boolean,default:true},caseCounter:{type:Number,default:0},exemptRoles:{type:[String],default:[]},exemptChannels:{type:[String],default:[]},},{timestamps:true,autoCreate:false},);

const modCaseSchema=new Schema({guildId:{type:String,required:true},caseId:{type:Number,required:true,index:true},action:{type:String,required:true},userId:{type:String,required:true,index:true},modId:{type:String,required:true},reason:{type:String,default:"Nessun motivo fornito"},durationMs:{type:Number,default:null},expiresAt:{type:Date,default:null},active:{type:Boolean,default:true},context:{channelId:{type:String,default:null},messageId:{type:String,default:null},},edits:{type:[{field:{type:String,required:true},previous:{type:String,default:""},next:{type:String,default:""},editedBy:{type:String,default:null},editedAt:{type:Date,default:Date.now},},],default:[],},closedAt:{type:Date,default:null},closeReason:{type:String,default:null},},{timestamps:true,autoCreate:false},);
modCaseSchema.index({ guildId: 1, caseId: 1 }, { unique: true });
modCaseSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
modCaseSchema.index({ guildId: 1, modId: 1, createdAt: -1 });
modCaseSchema.index({ guildId: 1, action: 1, active: 1, expiresAt: 1 });

const modCaseEditEntrySchema = new Schema(
  {
    field: { type: String, required: true },
    previous: { type: String, default: "" },
    next: { type: String, default: "" },
    editedBy: { type: String, default: null },
    editedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const modCaseEntrySchema = new Schema(
  {
    caseId: { type: Number, required: true },
    action: { type: String, required: true },
    userId: { type: String, required: true },
    modId: { type: String, required: true },
    reason: { type: String, default: "Nessun motivo fornito" },
    durationMs: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    context: {
      channelId: { type: String, default: null },
      messageId: { type: String, default: null },
    },
    edits: { type: [modCaseEditEntrySchema], default: [] },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const modCaseUserSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    cases: { type: [modCaseEntrySchema], default: [] },
  },
  {
    timestamps: true,
    autoCreate: false,
    collection: RESOLVED_MOD_CASE_USER_COLLECTION,
  },
);

modCaseUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });
modCaseUserSchema.index({ guildId: 1, "cases.caseId": 1 }, { unique: true });

const ModConfig = models.mod_config || model("mod_config", modConfigSchema);

if (
  models.mod_case &&
  models.mod_case.collection?.name !== RESOLVED_MOD_CASE_COLLECTION
) {
  mongoose.deleteModel("mod_case");
}
if (
  models.mod_case_user &&
  models.mod_case_user.collection?.name !== RESOLVED_MOD_CASE_USER_COLLECTION
) {
  mongoose.deleteModel("mod_case_user");
}

const ModCase = models.mod_case
  ? models.mod_case
  : model("mod_case", modCaseSchema, RESOLVED_MOD_CASE_COLLECTION);
const ModCaseUser = models.mod_case_user
  ? models.mod_case_user
  : model("mod_case_user", modCaseUserSchema);

module.exports = { ModConfig, ModCase, ModCaseUser };