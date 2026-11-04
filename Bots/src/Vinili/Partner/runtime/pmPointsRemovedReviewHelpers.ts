const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function disableRows(components?) {
  const rows = Array.isArray(components) ? components : [];
  return rows.map((row?) => {
    const comps = Array.isArray(row?.components) ? row.components : [];
    return {
      type: row.type,
      components: comps.map((c?) => ({
        type: c.type,
        style: c.style,
        label: c.label,
        custom_id: c.customId || c.custom_id,
        disabled: true,
      })),
    };
  });
}

function buildReviewStatusLine(isConfirm?, reviewerUserId?) {
  const ts = Math.floor(Date.now() / 1000);
  return isConfirm
    ? `${E.success} Rimozione **confermata** da <@${reviewerUserId}> (<t:${ts}:f>).`
    : `${E.cancel} Segnalazione **negata** da <@${reviewerUserId}> (<t:${ts}:f>).`;
}

function buildUpdatedLogContent(originalContent?, isConfirm?, reviewerUserId?) {
  const statusLine = buildReviewStatusLine(isConfirm, reviewerUserId);
  const nextContent = String(originalContent || "")
    .replace(/\n?${E.VC_Attention} In attesa di conferma High Staff\.\s*$/i, "")
    .trim();
  return `${nextContent}\n${statusLine}`;
}

export = {
  disableRows,
  buildUpdatedLogContent,
};
