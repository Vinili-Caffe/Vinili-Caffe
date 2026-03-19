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

const RolePersist = models.role_persist || model("role_persist", rolePersistSchema);
const RolePersistUser = models.RolePersistUser || model("RolePersistUser", rolePersistUserSchema, "rolepersistusers");

module.exports = RolePersist;
module.exports.RolePersistUser = RolePersistUser;