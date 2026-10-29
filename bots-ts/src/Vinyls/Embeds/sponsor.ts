const { runSponsorPanel } = require("./sponsorHelpers") as typeof import("./sponsorHelpers");

export = { name: "sponsor", order: 50, section: "embedWithButtons", run: runSponsorPanel };