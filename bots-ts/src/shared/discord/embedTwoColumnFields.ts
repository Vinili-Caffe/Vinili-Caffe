const EMBED_FIELD_EMPTY = "\u200b";

function embedInlineField(name?) {
  return { name, value: EMBED_FIELD_EMPTY, inline: true };
}

function embedInlineSpacer() {
  return { name: EMBED_FIELD_EMPTY, value: EMBED_FIELD_EMPTY, inline: true };
}

function embedTwoColumnRow(left?, right?) {
  return [embedInlineField(left), embedInlineField(right), embedInlineSpacer()];
}

function embedTwoColumnStack(leftLines?, rightLines?) {
  return [
    { name: EMBED_FIELD_EMPTY, value: leftLines.join("\n"), inline: true },
    { name: EMBED_FIELD_EMPTY, value: rightLines.join("\n"), inline: true },
  ];
}

export = {
  EMBED_FIELD_EMPTY,
  embedInlineField,
  embedInlineSpacer,
  embedTwoColumnRow,
  embedTwoColumnStack,
};
