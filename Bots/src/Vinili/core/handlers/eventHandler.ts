const path = require("path") as typeof import("path");
const { installEventLoader } = require("../../../shared/runtime/createEventLoader") as typeof import("../../../shared/runtime/createEventLoader");
const { defaultModuleEventFolderLabel } = require("../../../shared/runtime/discoverModuleEventFiles") as typeof import("../../../shared/runtime/discoverModuleEventFiles");

export = (client?) => {
  installEventLoader(client, {
    extraEventFiles: (_absBase?, botRoot?) => {
      const root = botRoot || path.resolve(__dirname, "..", "..");
      return [path.join(root, "Community", "services", "guildMemberUpdateService.js")];
    },
    folderLabelForRel: defaultModuleEventFolderLabel,
  });
};
