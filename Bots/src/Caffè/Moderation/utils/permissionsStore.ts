const path = require("path") as typeof import("path");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { createPermissionsStore } = require("../../../shared/moderation/createPermissionsStore") as typeof import("../../../shared/moderation/createPermissionsStore");

export = createPermissionsStore({
  ids: IDs,
  permissionsCandidates: [
    path.resolve(__dirname, "../../permissions.json"),
    path.join(process.cwd(), "permissions.json"),
  ],
});
