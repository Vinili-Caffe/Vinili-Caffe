const mongoose = require("mongoose");
const { model, Schema } = mongoose;

const voiceStateSchema=new Schema({guildId:{type:String,required:true,unique:true},channelId:{type:String,required:true},updatedAt:{type:Date,default:Date.now},lastTtsMessageId:{type:String,default:null},lastTtsProcessedAt:{type:Date,default:null},});

module.exports =
  mongoose.models.VoiceState || model("VoiceState", voiceStateSchema);