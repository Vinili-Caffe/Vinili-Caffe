const { runSponsorTicketPanels } = require("./sponsorHelpers") as typeof import("./sponsorHelpers");

export = { name: "sponsorTicket", order: 70, section: "embedWithButtons", run: runSponsorTicketPanels };