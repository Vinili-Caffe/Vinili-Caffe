const { Schema, model, models } = require("mongoose");

const rolePersistSchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},roleId:{type:String,required:true,index:true},setBy:{type:String,default:null},reason:{type:String,default:"Nessun motivo fornito"},},{timestamps:true},);
rolePersistSchema.index({ guildId: 1, userId: 1, roleId: 1 }, { unique: true });

const rolePersistEntrySchema = new Schema({ roleId: { type: String, required: true }, setBy: { type: String, default: null }, reason: { type: String, default: "Nessun motivo fornito" } }, { _id: false });
const rolePersistUserSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  roles: { type: [rolePersistEntrySchema], default: [] },
}, { timestamps: true });
rolePersistUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const ROLE_PERSIST_COLLECTION = process.env.ROLE_PERSIST_COLLECTION ? String(process.env.ROLE_PERSIST_COLLECTION).trim() : "";
const ROLE_PERSIST_USER_COLLECTION = process.env.ROLE_PERSIST_USER_COLLECTION ? String(process.env.ROLE_PERSIST_USER_COLLECTION).trim() : "";

const RolePersist = models.role_persist
  ? models.role_persist
  : ROLE_PERSIST_COLLECTION
    ? model("role_persist", rolePersistSchema, ROLE_PERSIST_COLLECTION)
    : model("role_persist", rolePersistSchema);

const RolePersistUser = models.RolePersistUser
  ? models.RolePersistUser
  : ROLE_PERSIST_USER_COLLECTION
    ? model("RolePersistUser", rolePersistUserSchema, ROLE_PERSIST_USER_COLLECTION)
    : model("RolePersistUser", rolePersistUserSchema, "rolepersistusers");

module.exports = RolePersist;
module.exports.RolePersistUser = RolePersistUser;