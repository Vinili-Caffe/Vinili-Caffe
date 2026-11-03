const regolamento = require("./regolamento") as typeof import("./regolamento");
const regole_staff = require("./regole_staff") as typeof import("./regole_staff");
const limiti = require("./limiti") as typeof import("./limiti");
const compiti = require("./compiti") as typeof import("./compiti");
const pause = require("./pause") as typeof import("./pause");
const lineeguida = require("./lineeguida") as typeof import("./lineeguida");
const comandi = require("./comandi") as typeof import("./comandi");
const valutazioni = require("./valutazioni") as typeof import("./valutazioni");
const pex = require("./pex") as typeof import("./pex");
const warnstaff = require("./warnstaff") as typeof import("./warnstaff");
const guidapartners = require("./guidapartners") as typeof import("./guidapartners");
const guidamiddle = require("./guidamiddle") as typeof import("./guidamiddle");

const SECTION_BUILDERS = {
  ...regolamento,
  ...regole_staff,
  ...limiti,
  ...compiti,
  ...pause,
  ...lineeguida,
  ...comandi,
  ...valutazioni,
  ...pex,
  ...warnstaff,
  ...guidapartners,
  ...guidamiddle,
};

function buildStaffGuideSectionMarkdown(sectionId?) {
  const id = String(sectionId || "").trim();
  const builder = SECTION_BUILDERS[id];
  if (!builder) return null;
  return builder();
}

export = { SECTION_BUILDERS, buildStaffGuideSectionMarkdown };
