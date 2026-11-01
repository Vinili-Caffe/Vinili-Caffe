const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getSession, buildPreviewEmbed, buildEditModal, buildSendModal, isValidUrl, updatePreview } = require("../../Utils/Interaction/embedBuilderUtils") as typeof import("../../Utils/Interaction/embedBuilderUtils");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "embedBuilderSessionsSnapshot.json");
const SESSION_TTL_MS = 60 * 60 * 1000;

export = {  };