const path = require("path") as typeof import("path");
const { createVoiceSessionService } = require("../../../shared/voice/voiceSessionService") as typeof import("../../../shared/voice/voiceSessionService");
export = createVoiceSessionService({
  snapshotPath: path.join(__dirname, "..", "..", "Data", "voiceSessionSnapshot.json"),
  snapshotKey: "coffee_voice_sessions",
});
