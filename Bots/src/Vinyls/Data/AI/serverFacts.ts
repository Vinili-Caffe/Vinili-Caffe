function buildServerFactsText(client?) {
  const guildId = String(client?.config?.mainGuildId || "1329080093599076474");
  const developers = Array.isArray(client?.config?.developers)
    ? client.config.developers.map(String).filter(Boolean)
    : [];
  const devLine = developers.length
    ? `Account developer/fondatori del progetto (config bot): ${developers.map((id?) => `<@${id}>`).join(", ")}.`
    : "";
  return [
    "Vinili & Caffè è una community Discord italiana su musica, socialità, eventi, gaming e intrattenimento.",
    `Server Discord principale ID: ${guildId}. Sito ufficiale: https://www.viniliecaffe.it`,
    "Il progetto Vinili & Caffè è stato creato e gestito dai Founder del server (ruolo Founder).",
    "I Founder sono i creatori del server e del brand; i Manager e gli Admin gestiscono amministrazione e staff.",
    "Il bot ufficiale del server si chiama Vinili ed è l'assistente IA e bot di moderazione/community.",
    devLine,
    "Per staff aggiornato: ruoli Founder, Manager, Admin, Director, Senior Moderator, Mod, Helper, Staff, Partner Manager.",
  ]
    .filter(Boolean)
    .join("\n");
}

export = { buildServerFactsText };