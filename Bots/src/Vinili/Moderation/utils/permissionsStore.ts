const path = require("path") as typeof import("path");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { createPermissionsStore } = require("../../../shared/moderation/createPermissionsStore") as typeof import("../../../shared/moderation/createPermissionsStore");

export = createPermissionsStore({
  ids: IDs,
  normalizeRoles: false,
  cacheTtlMs: 3000,
  permissionsCandidates: [
    path.resolve(__dirname, "../../permissions.json"),
    path.join(process.cwd(), "permissions.json"),
  ],
  transformParsed: (parsed?) => {
    try {
      require("../../Config/emergencyRoleIdRemap").remapDeepRoleIdsInPlace(parsed);
    } catch (_) {}
  },
});
