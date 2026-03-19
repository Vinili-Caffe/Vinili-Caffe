const { Schema, model, models } = require("mongoose");

const rolePersistEntrySchema = new Schema({ roleId: { type: String, required: true }, setBy: { type: String, default: null }, reason: { type: String, default: "Nessun motivo fornito" } }, { _id: false });
const rolePersistUserSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  roles: { type: [rolePersistEntrySchema], default: [] },
}, { timestamps: true });
rolePersistUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const RAW_ROLE_PERSIST_USER_COLLECTION = process.env.ROLE_PERSIST_USER_COLLECTION
  ? String(process.env.ROLE_PERSIST_USER_COLLECTION).trim().toLowerCase()
  : "";
const ROLE_PERSIST_USER_COLLECTION = (
  RAW_ROLE_PERSIST_USER_COLLECTION === "rolepersistuser" ||
  RAW_ROLE_PERSIST_USER_COLLECTION === "rolepersistusers" ||
  RAW_ROLE_PERSIST_USER_COLLECTION === "role_persist" ||
  RAW_ROLE_PERSIST_USER_COLLECTION === "role_persists" ||
  !RAW_ROLE_PERSIST_USER_COLLECTION
)
  ? "rolepersistusers"
  : RAW_ROLE_PERSIST_USER_COLLECTION;

const RolePersistUser = models.RolePersistUser
  ? models.RolePersistUser
  : model("RolePersistUser", rolePersistUserSchema, ROLE_PERSIST_USER_COLLECTION);

module.exports = { RolePersistUser };