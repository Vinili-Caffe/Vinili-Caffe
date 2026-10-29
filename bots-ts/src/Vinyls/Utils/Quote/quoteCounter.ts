const {
  nextQuoteCount,
  nextRepostCount,
  nextClipCount,
  decrementQuoteCount,
} = require("../Global/globalSettingsBucket") as typeof import("../Global/globalSettingsBucket");

export = { nextQuoteCount, nextRepostCount, nextClipCount, decrementQuoteCount };