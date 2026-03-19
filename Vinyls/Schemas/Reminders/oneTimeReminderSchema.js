const mongoose = require("mongoose");
const { model, Schema } = mongoose;

const oneTimeReminderSchema=new Schema({key:{type:String,required:true,unique:true},userId:{type:String,required:true},message:{type:String,required:true},sendAt:{type:Date,required:true},sentAt:{type:Date,default:null},createdAt:{type:Date,default:Date.now},});

const RAW_ONE_TIME_REMINDER_COLLECTION = process.env.ONE_TIME_REMINDER_COLLECTION
  ? String(process.env.ONE_TIME_REMINDER_COLLECTION).trim().toLowerCase()
  : "";
const ONE_TIME_REMINDER_COLLECTION = (
  RAW_ONE_TIME_REMINDER_COLLECTION === "onetimereminder" ||
  RAW_ONE_TIME_REMINDER_COLLECTION === "onetimereminders" ||
  !RAW_ONE_TIME_REMINDER_COLLECTION
)
  ? "onetimereminders"
  : RAW_ONE_TIME_REMINDER_COLLECTION;

module.exports =
  mongoose.models.OneTimeReminder ||
  model("OneTimeReminder", oneTimeReminderSchema, ONE_TIME_REMINDER_COLLECTION);