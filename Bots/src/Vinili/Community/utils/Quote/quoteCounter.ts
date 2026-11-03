const {
  nextQuoteCount,
  nextRepostCount,
  nextClipCount,
  decrementQuoteCount,
} = require("../../../Community/services/globalSettingsBucket") as typeof import("../../../Community/services/globalSettingsBucket");

export = { nextQuoteCount, nextRepostCount, nextClipCount, decrementQuoteCount };