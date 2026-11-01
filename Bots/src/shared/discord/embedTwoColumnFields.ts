const EMBED_FIELD_EMPTY = "\u200b";

function embedTwoColumnStack(leftLines?, rightLines?) {
  return [
    { name: EMBED_FIELD_EMPTY, value: leftLines.join("\n"), inline: true },
    { name: EMBED_FIELD_EMPTY, value: rightLines.join("\n"), inline: true },
  ];
}

export = {
  embedTwoColumnStack,
};
