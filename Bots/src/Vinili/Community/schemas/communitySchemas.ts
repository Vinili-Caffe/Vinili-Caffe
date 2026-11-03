const activity = require("./activityCommunitySchemas") as typeof import("./activityCommunitySchemas");
const siteDoc = require("./siteDocumentSchema") as typeof import("./siteDocumentSchema");

export = {
  ...activity,
  SITE_DOCUMENT_TYPE: siteDoc.SITE_DOCUMENT_TYPE,
  SiteDocument: siteDoc.SiteDocument,
};

