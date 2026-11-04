const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const MENTION_RESPONSE_ROLE_IDS = [ IDs?.roles?.VIP, IDs?.roles?.VIPplus, IDs?.roles?.["VIP+"], IDs?.roles?.ServerBooster, IDs?.roles?.DoubleBooster, IDs?.roles?.Level100 ].filter(Boolean);
const MENTION_RESPONSE_ACCESS_HINT_IT = "VIP, VIP+, Server Booster, Double Booster o livello 100+.";
const MENTION_RESPONSE_PERK_BODY = "**Mention Response** in [Personalizza](https://www.viniliecaffe.it/personalizza/): risposta automatica quando ti @menzionano";
const MENTION_RESPONSE_PERK_LINE_DISCORD = `${E.VC_Ping} ${MENTION_RESPONSE_PERK_BODY}`;

function memberHasMentionResponseAccess(member?) {
  return Boolean(
    member?.roles?.cache &&
      MENTION_RESPONSE_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId)),
  );
}

export = { MENTION_RESPONSE_ACCESS_HINT_IT, MENTION_RESPONSE_PERK_BODY, MENTION_RESPONSE_PERK_LINE_DISCORD, memberHasMentionResponseAccess };