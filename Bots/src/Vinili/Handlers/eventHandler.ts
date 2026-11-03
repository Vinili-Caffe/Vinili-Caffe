const path = require("path") as typeof import("path");
const { installEventLoader } = require("../../shared/runtime/createEventLoader") as typeof import("../../shared/runtime/createEventLoader");

export = (client?) => {
  installEventLoader(client, {
    extraEventFiles: (absBase?) => {
      const botRoot = path.dirname(absBase);
      return [path.join(botRoot, "Community", "services", "guildMemberUpdateService.js")];
    },
    folderLabelForRel: (rel?) => {
      const folder = path.dirname(String(rel || "")).replace(/\\/g, "/");
      if (folder === ".") return "Events";
      if (
        folder.startsWith("Community/") ||
        folder.startsWith("Staff/") ||
        folder.startsWith("Partner/")
      ) {
        return folder;
      }
      return `Events/${folder}`;
    },
  });
};
