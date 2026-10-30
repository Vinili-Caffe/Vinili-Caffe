const { runSponsorVerifyPanels } = require("./sponsorHelpers") as typeof import("./sponsorHelpers");

export = { name: "sponsorVerify", order: 60, section: "embedWithButtons", run: runSponsorVerifyPanels };