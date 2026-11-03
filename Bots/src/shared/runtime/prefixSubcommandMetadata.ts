function inferSubcommandsFromExecute(command?) {
  const src = String(command?.execute || "");
  if (!src) return [];
  const out = new Set();
  let match = null;

  const eqRegex =
    /\b(?:sub|subcommand|mode|action|type|operation|choice)\s*={2,3}\s*['"`]([a-z0-9._-]+)['"`]/gi;
  while ((match = eqRegex.exec(src)) !== null) {
    out.add(String(match[1] || "").toLowerCase());
  }

  const caseRegex = /\bcase\s+['"`]([a-z0-9._-]+)['"`]\s*:/gi;
  while ((match = caseRegex.exec(src)) !== null) {
    out.add(String(match[1] || "").toLowerCase());
  }

  const includesRegex =
    /\[((?:\s*['"`][a-z0-9._-]+['"`]\s*,?)+)\]\.includes\((?:[^)]*)\)/gi;
  while ((match = includesRegex.exec(src)) !== null) {
    const block = String(match[1] || "");
    const tokenRegex = /['"`]([a-z0-9._-]+)['"`]/gi;
    let tokenMatch = null;
    while ((tokenMatch = tokenRegex.exec(block)) !== null) {
      out.add(String(tokenMatch[1] || "").toLowerCase());
    }
  }

  return Array.from(out.values()).filter(Boolean);
}

/**
 * @param {object} command
 * @param {{ extraSubcommands?: string[] }} [options]
 */
function ensurePrefixSubcommandMetadata(command?, options: Record<string, any> = {}) {
  if (!command || typeof command !== "object") return command;
  const declared = Array.isArray(command?.subcommands)
    ? command.subcommands
        .map((sub?) => String(sub || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  const mappedTargets =
    command?.subcommandAliases && typeof command.subcommandAliases === "object"
      ? Object.values(command.subcommandAliases)
          .map((sub?) => String(sub || "").trim().toLowerCase())
          .filter(Boolean)
      : [];
  const extras = Array.isArray(options.extraSubcommands)
    ? options.extraSubcommands.map((s?) => String(s || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const inferred = inferSubcommandsFromExecute(command);
  const known = Array.from(new Set([...declared, ...mappedTargets, ...extras, ...inferred]));
  if (!known.length) return command;

  command.canonicalSubcommands = Array.from(new Set(declared));
  command.subcommands = known;
  if (!command.subcommandAliases || typeof command.subcommandAliases !== "object") {
    command.subcommandAliases = {};
  }
  for (const sub of known) {
    if (!String(command.subcommandAliases[sub] || "").trim()) {
      command.subcommandAliases[sub] = sub;
    }
  }
  return command;
}

export = { inferSubcommandsFromExecute, ensurePrefixSubcommandMetadata };
