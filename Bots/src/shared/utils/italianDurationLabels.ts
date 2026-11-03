function formatItalianMinutesBold(minutes?) {
  const n = Math.max(0, Math.floor(Number(minutes) || 0));
  return n === 1 ? "**1 minuto**" : `**${n} minuti**`;
}

function formatItalianMinutesPlain(minutes?) {
  const n = Math.max(0, Math.floor(Number(minutes) || 0));
  return n === 1 ? "1 minuto" : `${n} minuti`;
}

export = { formatItalianMinutesBold, formatItalianMinutesPlain };
