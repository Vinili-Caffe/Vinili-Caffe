function disableRows(components) {
  const rows = Array.isArray(components) ? components : [];
  return rows.map((row) => {
    const comps = Array.isArray(row?.components) ? row.components : [];
    return {
      type: row.type,
      components: comps.map((c) => ({
        type: c.type,
        style: c.style,
        label: c.label,
        custom_id: c.customId || c.custom_id,
        disabled: true,
      })),
    };
  });
}

function buildReviewStatusLine(isConfirm, reviewerUserId) {
  const ts = Math.floor(Date.now() / 1000);
  return isConfirm
    ? `<:success:1461731530333229226> Rimozione **confermata** da <@${reviewerUserId}> (<t:${ts}:f>).`
    : `<:cancel:1461730653677551691> Segnalazione **negata** da <@${reviewerUserId}> (<t:${ts}:f>).`;
}

function buildUpdatedLogContent(originalContent, isConfirm, reviewerUserId) {
  const statusLine = buildReviewStatusLine(isConfirm, reviewerUserId);
  const nextContent = String(originalContent || "")
    .replace(/\n?<:VC_Attention:1482534443632558151> In attesa di conferma High Staff\.\s*$/i, "")
    .trim();
  return `${nextContent}\n${statusLine}`;
}

module.exports = {
  disableRows,
  buildReviewStatusLine,
  buildUpdatedLogContent,
};
