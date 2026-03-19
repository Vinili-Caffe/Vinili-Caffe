const mongoose = require("mongoose");
const { model, Schema } = mongoose;

const oneTimeReminderSchema=new Schema({key:{type:String,required:true,unique:true},userId:{type:String,required:true},message:{type:String,required:true},sendAt:{type:Date,required:true},sentAt:{type:Date,default:null},createdAt:{type:Date,default:Date.now},});

const ONE_TIME_REMINDER_COLLECTION = process.env.ONE_TIME_REMINDER_COLLECTION ? String(process.env.ONE_TIME_REMINDER_COLLECTION).trim() : "";

module.exports =
  mongoose.models.OneTimeReminder ||
  (ONE_TIME_REMINDER_COLLECTION
    ? model("OneTimeReminder", oneTimeReminderSchema, ONE_TIME_REMINDER_COLLECTION)
    : model("OneTimeReminder", oneTimeReminderSchema));