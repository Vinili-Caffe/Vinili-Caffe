const { installEventLoader } = require("../../../shared/runtime/createEventLoader") as typeof import("../../../shared/runtime/createEventLoader");
const { defaultModuleEventFolderLabel } = require("../../../shared/runtime/discoverModuleEventFiles") as typeof import("../../../shared/runtime/discoverModuleEventFiles");

export = (client?) => {
  installEventLoader(client, {
    folderLabelForRel: defaultModuleEventFolderLabel,
  });
};
