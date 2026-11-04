/** Catalogo comandi Coffee per wiki sito — niente UI Discord ,help. */
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandType, ComponentType, MessageFlags, } = require("discord.js") as typeof import("discord.js");
const { DEFAULT_OBSOLETE_SLASH_NAMES } = require("../../shared/discord/purgeObsoleteApplicationCommands") as typeof import("../../shared/discord/purgeObsoleteApplicationCommands");
const { safeMessageReply } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
const { getGuildMemberCached } = require("../../shared/discord/interactionEntityCache") as typeof import("../../shared/discord/interactionEntityCache");
const { loadPermissions } = require("../Moderation/utils/commandPermissions") as typeof import("../Moderation/utils/commandPermissions");
const { E } = require("../../shared/emojis/emojiCatalog") as typeof import("../../shared/emojis/emojiCatalog");
const HELP_EMBED_COLOR = "#6f4e37";
const ERROR_EMBED_COLOR = "Red";
const PRIVATE_FLAG = 1 << 6;
const NO_REPLY_MENTIONS = { repliedUser: false };
const PAGE_ROLE_IDS = [IDs.roles.Member, (IDs.roles as any).Staff, IDs.roles.HighStaff, IDs.roles.Founder].filter(Boolean);
const PAGE_TITLES = { [IDs.roles.Member]: "Comandi Utente", [IDs.roles.Founder]: "Comandi Dev", all: "Comandi Disponibili" };
const CATEGORY_LABELS = { utility: "Utility", music: "Musica", tts: "TTS", dev: "Developer" };
const CATEGORY_ORDER = ["utility", "music", "tts", "dev"];
const PREFIX_MUSIC_SESSION_OWNER_COMMANDS = new Set(["skip", "stop", "pause", "resume", "volume", "shuffle", "clear", "repeat", "previous", "rewind", "restart"]);
const PREFIX_MUSIC_SESSION_OWNER_NOTE = " *Solo chi ha avviato la riproduzione può usarlo.*";
const HELP_PAGE_SIZE = 18;
const MAX_HELP_TEXT_LENGTH = 3900;
const PREFIX_HELP_DESCRIPTIONS = {
  help: "Mostra tutti i comandi disponibili.",
  join: "Fa entrare il bot nel tuo canale vocale.",
  leave: "Fa uscire il bot dal canale vocale.",
  voices: "Mostra le voci TTS disponibili.",
  set: "Impostazioni TTS: autojoin e voce personale.",
  play: "Riproduce un brano.",
  pause: "Mette in pausa la traccia in riproduzione.",
  resume: "Riprende la traccia in pausa.",
  stop: "Ferma la musica, svuota la coda e fa uscire il bot dal canale vocale.",
  skip: "Salta il brano in riproduzione e passa alla successiva in coda.",
  volume: "Imposta il volume della musica.",
  shuffle: "Mescola l'ordine dei brani in coda.",
  clear: "Svuota la coda dei brani in attesa.",
  repeat: "Ripetizione traccia, ripetizione della coda, disattiva tutto.",
  previous: "Torna al brano riprodotto prima di quello attuale.",
  rewind: "Riporta il brano in riproduzione all'inizio.",
  restart: "Ricomincia dall'inizio la sequenza del brano in riproduzione + della coda.",
  now: "Mostra il brano in riproduzione.",
  next: "Mostra il prossimo brano in coda.",
  queue: "Mostra la coda di riproduzione.",
};
const PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS = {
  "set.autojoin": "Attiva o disattiva l'autojoin TTS del bot.",
  "set.voice": "Imposta la lingua/voce TTS personale.",
  "now.playing": "Mostra il brano in riproduzione.",
  "next.up": "Mostra il prossimo brano in coda.",
  "repeat.disable": "Disattiva la ripetizione della traccia o della coda.",
  "repeat.enable": "Attiva la ripetizione della traccia in corso.",
  "repeat.queue": "Attiva la ripetizione dell'intera coda.",
  "play.queue": "Riproduce la coda dei brani in attesa.",
  "play.now": "Riproduce il brano in riproduzione.",
  "play.next": "Salta il brano in riproduzione e passa alla successiva in coda.",
  "play.previous": "Torna al brano riprodotto prima di quello attuale.",
  "play.rewind": "Riporta il brano in riproduzione all'inizio.",
  "play.restart": "Ricomincia dall'inizio la sequenza del brano in riproduzione + della coda.",
  "play.stop": "Ferma la musica, svuota la coda e fa uscire il bot dal canale vocale.",
  "play.shuffle": "Mescola l'ordine dei brani in coda.",
  "play.clear": "Svuota la coda dei brani in attesa.",
  "play.repeat": "Ripetizione traccia, ripetizione della coda, disattiva tutto.",
};

const CONTEXT_HELP_DESCRIPTIONS: Record<string, any> = {};
const CONTEXT_CATEGORY_OVERRIDES: Record<string, any> = {};
const OBSOLETE_SLASH_HELP_NAMES = new Set(
  (Array.isArray(DEFAULT_OBSOLETE_SLASH_NAMES) ? DEFAULT_OBSOLETE_SLASH_NAMES : [])
    .map((s?) => String(s || "").trim().toLowerCase())
    .filter(Boolean),
);

function normalizeCategoryKey(raw?) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "utility";
  if (value.includes("music")) return "music";
  if (value.includes("tts") || value.includes("voice")) return "tts";
  if (
    value.includes("dev") ||
    value.includes("admin") ||
    value.includes("owner") ||
    value.includes("staff")
  ) {
    return "dev";
  }
  if (value in CATEGORY_LABELS) return value;
  return "utility";
}

function buildMiniHelpNotFoundEmbed(query?) {
  return new EmbedBuilder()
    .setColor(ERROR_EMBED_COLOR)
    .setTitle("Mini Help 🔍")
    .setDescription(
      String(`${E.VC_Cross} Nessun comando trovato per \`${query}\`.`).slice(0, 4096),
    );
}

function buildNoAvailableCommandsEmbed() {
  return new EmbedBuilder()
    .setColor(ERROR_EMBED_COLOR)
    .setDescription(`${E.VC_Cross} Nessun comando disponibile.`);
}

function normalizeDescription(
  text?,
  fallback = `${E.VC_Cross} Nessuna descrizione disponibile.`,
) {
  const value = String(text || "").trim();
  return value.length ? value : fallback;
}

function getPrefixDescription(command?) {
  const commandName = String(command?.name || "").toLowerCase();
  let base;
  if (PREFIX_HELP_DESCRIPTIONS[commandName]) {
    base = PREFIX_HELP_DESCRIPTIONS[commandName];
  } else {
    const fromCommand = normalizeDescription(
      command?.description || command?.desc || command?.help || command?.usage || "",
      "",
    );
    base = fromCommand || `${E.VC_Cross} Descrizione non disponibile.`;
  }
  if (PREFIX_MUSIC_SESSION_OWNER_COMMANDS.has(commandName)) {
    return `${base}${PREFIX_MUSIC_SESSION_OWNER_NOTE}`;
  }
  return base;
}

function getPrefixSubcommandDescription(command?, subcommandName?) {
  const commandName = String(command?.name || "").toLowerCase();
  const key = `${String(commandName || "").toLowerCase()}.${String(subcommandName || "").toLowerCase()}`;
  const withOwnerNote = (text?) =>
    PREFIX_MUSIC_SESSION_OWNER_COMMANDS.has(commandName)
      ? `${String(text || "").trim()}${PREFIX_MUSIC_SESSION_OWNER_NOTE}`
      : String(text || "").trim();
  if (PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS[key]) {
    return withOwnerNote(PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS[key]);
  }
  const commandSubDesc=command?.subcommandDescriptions||command?.subcommandsDescriptions||command?.subcommandHelp||command?.subcommandsHelp||null;
  if (commandSubDesc && typeof commandSubDesc === "object") {
    const fromCommand=commandSubDesc[String(subcommandName||"").toLowerCase()]||commandSubDesc[String(subcommandName||"").trim()];
    if (String(fromCommand || "").trim())
      return withOwnerNote(normalizeDescription(fromCommand, ""));
  }
  const parentDescription = String(command?.description || command?.desc || command?.help || "").trim();
  if (parentDescription) return withOwnerNote(parentDescription);
  return `${E.VC_Cross} Descrizione non disponibile.`;
}

function getPrefixBase(command?, client?) {
  void command;
  const p = String(client?.config?.prefix ?? "-").trim();
  return p || "-";
}

function extractPrefixSubcommands(command?) {
  const fromMeta=Array.isArray(command?.subcommands)?command.subcommands.map((s?) => String(s||"").trim().toLowerCase(),).filter(Boolean):[];
  const fromAliases=command?.subcommandAliases&&typeof command.subcommandAliases==="object"?Object.values(command.subcommandAliases).map((s?) => String(s||"").trim().toLowerCase(),).filter(Boolean):[];
  const commandSubDesc=command?.subcommandDescriptions||command?.subcommandsDescriptions||command?.subcommandHelp||command?.subcommandsHelp||null;
  const fromSubDesc=commandSubDesc&&typeof commandSubDesc==="object"?Object.keys(commandSubDesc).map((s?) => String(s||"").trim().toLowerCase(),).filter(Boolean):[];

  const src = String(command?.execute || "");
  const found = new Set();
  let match = null;

  const eqRegex = /subcommand\s*===\s*['"`]([a-z0-9._-]+)['"`]/gi;
  while ((match = eqRegex.exec(src)) !== null) {
    found.add(String(match[1]).toLowerCase());
  }

  const caseRegex = /case\s+['"`]([a-z0-9._-]+)['"`]\s*:/gi;
  while ((match = caseRegex.exec(src)) !== null) {
    found.add(String(match[1]).toLowerCase());
  }

  return Array.from(
    new Set([
      ...fromMeta,
      ...fromAliases,
      ...fromSubDesc,
      ...Array.from(found.values()),
    ]),
  );
}

function extractDirectAliasesForSubcommand(command?, subcommandName?) {
  const mapped=command?.subcommandAliases&&typeof command.subcommandAliases==="object"?command.subcommandAliases:{};
  const out = [];

  for (const [alias, target] of Object.entries(mapped)) {
    const normalizedAlias=String(alias||"").trim().toLowerCase();
    const normalizedTarget=String(target||"").trim().toLowerCase();
    if (!normalizedAlias || !normalizedTarget) continue;
    if (normalizedTarget !== subcommandName) continue;
    out.push(normalizedAlias);
  }

  return Array.from(new Set(out));
}

function getSlashTopLevelDescription(dataJson?) {
  return normalizeDescription(dataJson?.description, "Comando slash.");
}

function resolveContextCategory(command?, dataJson?) {
  const contextName = String(dataJson?.name || "").trim().toLowerCase();
  if (contextName && CONTEXT_CATEGORY_OVERRIDES[contextName]) {
    return normalizeCategoryKey(CONTEXT_CATEGORY_OVERRIDES[contextName]);
  }
  return normalizeCategoryKey(command?.category || "utility");
}

function shouldIncludeSlashCommandInHelp(command?) {
  if (!command || command.skipDeploy) return false;
  const dataJson = command?._helpDataJson || command?.data?.toJSON?.();
  const nm = String(dataJson?.name || command?.data?.name || "").trim().toLowerCase();
  if (OBSOLETE_SLASH_HELP_NAMES.has(nm)) return false;
  return true;
}

function getCommandPermissionNode(permissionRoot?, commandName?) {
  if (!permissionRoot || typeof permissionRoot !== "object") return null;
  const exact = permissionRoot[commandName];
  if (typeof exact !== "undefined") return exact;
  const wanted = String(commandName || "").trim().toLowerCase();
  if (!wanted) return null;
  for (const [key, value] of Object.entries(permissionRoot)) {
    if (String(key || "").trim().toLowerCase() === wanted) return value;
  }
  return null;
}

function normalizePermissionRoles(value?) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.roles)) {
    return value.roles;
  }
  return null;
}

function getSubcommandEntries(commandName?, dataJson?, permissionConfig?, commandType?, category?) {
  const entries = [];
  const options = Array.isArray(dataJson?.options) ? dataJson.options : [];
  if (commandType !== ApplicationCommandType.ChatInput) return entries;

  const subPermissions = permissionConfig?.subcommands || {};
  const commandRoles = normalizePermissionRoles(permissionConfig?.roles);
  const topDesc = getSlashTopLevelDescription(dataJson);

  const parseSubOption=(subOption?,groupName=null) => {if(!subOption?.name)return;const subName=subOption.name;const key=groupName?`${groupName}.${subName}` : subName;
    const allowedRoles=Object.prototype.hasOwnProperty.call(subPermissions,key,)?subPermissions[key]:commandRoles;
    const roleList = normalizePermissionRoles(allowedRoles);

    entries.push({
      invoke: groupName ? `/${commandName} ${groupName} ${subName}` : `/${commandName} ${subName}`,type:"slash",description:normalizeDescription(subOption.description,topDesc),category:normalizeCategoryKey(category),roles:roleList,});};for(const option of options){ if (option?.type === 1) {
      parseSubOption(option);
      continue;
    }
    if (option?.type === 2 && Array.isArray(option.options)) {
      for (const subOption of option.options) {
        if (subOption?.type === 1) parseSubOption(subOption, option.name);
      }
    }
  }
  return entries;
}

function buildEntries(client?, permissions?) {
  const entries = [];

  for (const command of client.pcommands.values()) {
    if (!command?.name) continue;

    const perm = permissions.prefix?.[command.name];
    const commandRoles=Array.isArray(perm)?perm:Array.isArray(perm?.roles)?perm.roles:null;
    const subcommandRoles=perm&&typeof perm==="object"&&!Array.isArray(perm)?perm.subcommands||{}:{};
    const aliases=Array.isArray(command.aliases)?command.aliases.filter((alias?) => typeof alias==="string"&&alias.trim().length,):[];
    const prefixBase = getPrefixBase(command, client);
    const base={type:"prefix",description:getPrefixDescription(command),aliases,prefixBase,category:normalizeCategoryKey(command.folder||"misc"),roles:commandRoles,};

    const canonicalSubs=Array.isArray(command?.canonicalSubcommands)?Array.from(new Set(command.canonicalSubcommands.map((s?) => String(s||"").trim().toLowerCase()).filter(Boolean),),):Array.isArray(command?.subcommands)?Array.from(new Set(command.subcommands.map((s?) => String(s||"").trim().toLowerCase()).filter(Boolean),),):[];
    if (canonicalSubs.length) {
      for (const sub of canonicalSubs) {
        entries.push({
          ...base,
          invoke: `${prefixBase}${command.name} ${sub}`,
          description: getPrefixSubcommandDescription(command, sub),
          roles: Array.isArray(subcommandRoles[(sub as any)])
            ? subcommandRoles[(sub as any)]
            : commandRoles,
          aliases: [],
          subAliases: extractDirectAliasesForSubcommand(command, sub),
        });
      }
    } else {
      entries.push({
        ...base,
        invoke: `${prefixBase}${command.name}`,
      });
    }
  }

  const seenSlash = new Set();
  for (const command of client.commands.values()) {
    if (!shouldIncludeSlashCommandInHelp(command)) continue;
    const dataJson = command?._helpDataJson || command?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    if (commandType !== ApplicationCommandType.ChatInput) continue;
    const uniqueKey = `${dataJson.name}:${commandType}`;
    if (seenSlash.has(uniqueKey)) continue;
    seenSlash.add(uniqueKey);

    const perm = getCommandPermissionNode(permissions.slash, dataJson.name);
    const category = normalizeCategoryKey(command?.category || "utility");
    const hasSubcommands =
      Array.isArray(dataJson.options) &&
      dataJson.options.some((opt?) => opt?.type === 1 || opt?.type === 2);
    const roles = normalizePermissionRoles(perm);

    if (hasSubcommands) {
      entries.push(
        ...getSubcommandEntries(
          dataJson.name,
          dataJson,
          perm,
          commandType,
          category,
        ),
      );
      continue;
    }

    entries.push({
      invoke: `/${dataJson.name}`,
      type: "slash",
      description: getSlashTopLevelDescription(dataJson),
      category,
      roles,
    });
  }

  for (const command of client.commands.values()) {
    if (!shouldIncludeSlashCommandInHelp(command)) continue;
    const dataJson = command?._helpDataJson || command?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    if (
      commandType !== ApplicationCommandType.User &&
      commandType !== ApplicationCommandType.Message
    ) {
      continue;
    }
    const perm = getCommandPermissionNode(permissions.slash, dataJson.name);
    const roles = normalizePermissionRoles(perm);
    entries.push({
      invoke: `${dataJson.name}`,
      type: "context",
      description: normalizeDescription(
        command?.helpDescription ||
        command?.description ||
        CONTEXT_HELP_DESCRIPTIONS[dataJson.name] ||
        `Comando context (${commandType === ApplicationCommandType.User ? "utente" : "messaggio"}).`,
      ),
      category: resolveContextCategory(command, dataJson),
      roles,
    });
  }

  const dedupe = new Map();
  for (const entry of entries) {
    if (String(entry?.category || "").toLowerCase() === "misc") continue;
    const roleKey=Array.isArray(entry.roles)?entry.roles.slice().sort().join(","):"utente";
    const key = `${entry.type}:${entry.invoke}:${roleKey}`;
    if (!dedupe.has(key)) dedupe.set(key, entry);
  }

  const getCategoryIndex=(entry?) => {const key=String(entry?.category||"misc").toLowerCase();const idx=CATEGORY_ORDER.indexOf(key);return idx===-1?CATEGORY_ORDER.length:idx;};

  return Array.from(dedupe.values()).sort((a?, b?) => {
    const catCmp = getCategoryIndex(a) - getCategoryIndex(b);
    if (catCmp !== 0) return catCmp;
    return a.invoke.localeCompare(b.invoke, "it");
  });
}

function hasAnyRole(memberRoles?, roleIds?) {
  if (!memberRoles || !Array.isArray(roleIds) || !roleIds.length) return false;
  return roleIds.some((roleId?) => memberRoles.has(roleId));
}


function canMemberSeeEntry(entry?, memberRoles?) {
  const roles = entry?.roles;
  if (!Array.isArray(roles) || roles.length === 0) return true;
  if (hasAnyRole(memberRoles, roles)) return true;
  const memberHasMemberRole = IDs.roles.Member && memberRoles?.has(IDs.roles.Member);
  const entryOnlyVip=roles.length>0&&roles.every((r?) => String(r)===String((IDs.roles as any).VIP||""));
  if (memberHasMemberRole && entryOnlyVip) return true;
  return false;
}

function chunkEntriesByCategory(entries?, maxPerPage?) {
  if (!entries.length) return [];
  const byCategory = new Map();
  for (const entry of entries) {
    const key = String(entry?.category || "misc").toLowerCase();
    if (key === "misc") continue;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(entry);
  }
  const orderedCategories=Array.from(byCategory.keys()).sort((a?,b?) => {const ai=CATEGORY_ORDER.indexOf(a);const bi=CATEGORY_ORDER.indexOf(b);const safeA=ai===-1?CATEGORY_ORDER.length:ai;const safeB=bi===-1?CATEGORY_ORDER.length:bi;return safeA-safeB;});
  const chunks = [];
  let currentPage = [];
  for (const cat of orderedCategories) {
    const catEntries=(byCategory.get(cat)||[]).slice().sort((a?,b?) => String(a.invoke||"").localeCompare(String(b.invoke||""),"it"),);
    if (!catEntries.length) continue;
    if (currentPage.length + catEntries.length <= maxPerPage) {
      currentPage.push(...catEntries);
    } else {
      if (currentPage.length) chunks.push(currentPage);
      currentPage = [];
      if (catEntries.length <= maxPerPage) {
        currentPage = catEntries;
      } else {
        chunks.push(catEntries);
      }
    }
  }
  if (currentPage.length) chunks.push(currentPage);
  return chunks.length ? chunks : [];
}

function renderPageText(page?) {
  const grouped = new Map();
  for (const entry of page.items) {
    const key = String(entry.category || "misc").toLowerCase();
    if (key === "misc") continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const orderedKeys=Array.from(grouped.keys()).sort((a?,b?) => {const ai=CATEGORY_ORDER.indexOf(a);const bi=CATEGORY_ORDER.indexOf(b);const safeA=ai===-1?CATEGORY_ORDER.length:ai;const safeB=bi===-1?CATEGORY_ORDER.length:bi;return safeA-safeB;});

  const sections = [];
  for (const categoryKey of orderedKeys) {
    const categoryEntries=(grouped.get(categoryKey)||[]).slice().sort((a?,b?) => String(a.invoke||"").localeCompare(String(b.invoke||""),"it"),);
    const categoryLabel=CATEGORY_LABELS[categoryKey]||categoryKey.charAt(0).toUpperCase()+categoryKey.slice(1);
    const rows=categoryEntries.map((entry?) => {const invokeNorm=normalizeInvokeLookup(entry.invoke);const prefixForAlias=entry.prefixBase!=null?String(entry.prefixBase):"+";let aliasList=Array.isArray(entry.aliases)&&entry.aliases.length?entry.aliases.map((a?) => String(a||"").trim()).filter((a?) => a&&normalizeInvokeLookup(prefixForAlias+a.replace(/^[/+]+/,""))!==invokeNorm):[];const isTicketCommand=invokeNorm.startsWith("ticket")||String(entry.invoke||"").toLowerCase().startsWith("+ticket");if(isTicketCommand&&Array.isArray(entry.subAliases)&&entry.subAliases.length){const existingNorm=new Set(aliasList.map((a?) => normalizeInvokeLookup(prefixForAlias+a.replace(/^[/+]+/,""))));for(const a of entry.subAliases){const s=String(a||"").trim();if(!s)continue;const norm=normalizeInvokeLookup(prefixForAlias+s.replace(/^[/+]+/,""));if(norm!==invokeNorm&&!existingNorm.has(norm)){existingNorm.add(norm);aliasList.push(s);}}}const aliasPart=aliasList.length?" | "+aliasList.map((a?) => "`"+(a.startsWith("+")||a.startsWith("/")?a:prefixForAlias+a)+"`").join(", "):"";const onlyMemberRole=Array.isArray(entry.roles)&&entry.roles.length===1&&String(entry.roles[0])===String(IDs.roles.Member);const roleHint=Array.isArray(entry.roles)&&entry.roles.length>0&&!onlyMemberRole?` *(Richiede: ${entry.roles.map((id?) => `<@&${id}>`).join(", ")})*`:"";return`- \`${entry.invoke}\`${aliasPart}-${entry.description}${roleHint}`;
    });
    sections.push(`**${categoryLabel}**\n${rows.join("\n")}`);
  }

  const raw=page.items.length?["## Comandi Disponibili","",`### ${PAGE_TITLES[page.roleId]||"Comandi Disponibili"}`,
      "",
      "Ecco la lista dei comandi disponibili.",
      "Usa il prefix o slash in base al comando.",
      "Mini-help rapido: `,help <comando>`.",
      "",
      sections.join("\n\n"),
    ].join("\n")
    : `${E.VC_Cross} Nessun comando disponibile in questa pagina.`;
  return raw;
}

function splitHelpTextByLength(text?, maxLen = MAX_HELP_TEXT_LENGTH) {
  const input = String(text || "");
  if (!input.length) return [""];
  if (input.length <= maxLen) return [input];

  const lines = input.split("\n");
  const chunks = [];
  let current = "";

  const pushCurrent=() => {if(!current.length)return;chunks.push(current);current="";};

  for (const line of lines) {
    const piece = current.length ? `\n${line}` : line;
    if ((current + piece).length <= maxLen) {
      current += piece;
      continue;
    }

    if (current.length) pushCurrent();

    if (line.length <= maxLen) {
      current = line;
      continue;
    }

    let rest = line;
    while (rest.length > maxLen) {
      chunks.push(rest.slice(0, maxLen));
      rest = rest.slice(maxLen);
    }
    current = rest;
  }

  pushCurrent();
  return chunks.length ? chunks : [input.slice(0, maxLen)];
}

function expandHelpDisplayPages(basePages?) {
  const expanded = [];

  for (const page of basePages) {
    const fullText = renderPageText(page);
    const chunks = splitHelpTextByLength(fullText, MAX_HELP_TEXT_LENGTH - 28);
    for (const chunk of chunks) {
      expanded.push({
        ...page,
        renderedText: chunk,
      });
    }
  }

  const total = expanded.length;
  expanded.forEach((page?, idx?) => {
    page.indexLabel = `${idx + 1}/${total}`;
    page.renderedText = `${String(page.renderedText || "").trimEnd()}\n\n**Pagina ${page.indexLabel}**`;
  });

  return expanded;
}

function buildNavigationRow(state?) {
  const base = `chelp:${state.ownerId}:${state.currentIndex}:${state.total}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${base}:prev`)
      .setEmoji(E.vegaleftarrow)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:next`)
      .setEmoji(E.vegarightarrow)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentIndex >= state.total - 1),
    new ButtonBuilder()
      .setCustomId(`${base}:close`)
      .setEmoji(E.VC_Cross)
      .setStyle(ButtonStyle.Danger),
  );
}

function parseCoffeeHelpCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== "chelp" || parts.length < 5) return null;
  const [, ownerId, pageRaw, totalRaw, action] = parts;
  if (!/^\d{16,20}$/.test(ownerId)) return null;
  if (!["prev", "next", "close"].includes(action)) return null;
  return {
    ownerId,
    page: Math.max(0, Math.floor(Number(pageRaw) || 0)),
    total: Math.max(1, Math.floor(Number(totalRaw) || 1)),
    action,
  };
}

async function buildCoffeeHelpDisplayPages(client?, member?) {
  const permissions = loadPermissions();
  const allEntries = buildEntries(client, permissions);
  const memberRoles = member?.roles?.cache || new Map();
  const allVisibleEntries = allEntries.filter((entry?) => canMemberSeeEntry(entry, memberRoles));
  const sortedVisible = dedupeAndSortEntries(allVisibleEntries);
  const chunks = chunkEntriesByCategory(sortedVisible, HELP_PAGE_SIZE);
  const groupedPages = chunks.map((items?) => ({
    roleId: "all",
    items,
    indexLabel: "",
    groupLabel: PAGE_TITLES.all || "Comandi Disponibili",
  }));
  return expandHelpDisplayPages(groupedPages);
}

async function handleCoffeeHelpNavInteraction(interaction?) {
  const parsed = parseCoffeeHelpCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id) !== parsed.ownerId) {
    await interaction
      .reply({
        content: `${E.vegax} Puoi usare i bottoni solo sul tuo help.`,
        flags: PRIVATE_FLAG,
      })
      .catch(() => null);
    return true;
  }
  if (parsed.action === "close") {
    await interaction.deferUpdate().catch(() => null);
    await interaction.message?.delete?.().catch(() => null);
    return true;
  }
  const member =
    interaction.member ||
    (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
  const displayPages = await buildCoffeeHelpDisplayPages(interaction.client, member);
  if (!displayPages.length) {
    await interaction.deferUpdate().catch(() => null);
    return true;
  }
  let page = parsed.page;
  if (parsed.action === "prev") page = Math.max(0, page - 1);
  else if (parsed.action === "next") page = Math.min(displayPages.length - 1, page + 1);
  page = Math.min(displayPages.length - 1, Math.max(0, page));
  const navState = {
    currentIndex: page,
    total: displayPages.length,
    ownerId: parsed.ownerId,
  };
  try {
    await interaction.update({
      components: [buildHelpV2Container(displayPages[page], navState)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: NO_REPLY_MENTIONS,
    });
  } catch {
    await interaction.deferUpdate().catch(() => null);
  }
  return true;
}

function buildHelpV2Container(page?, navState?) {
  const components=[{type:ComponentType.TextDisplay,content:page?.renderedText||renderPageText(page),},];
  if (navState.total > 1) {
    components.push((buildNavigationRow(navState).toJSON() as any));
  }
  return {
    type: ComponentType.Container,
    accentColor: 0x6f4e37,
    components,
  };
}

function buildHelpFallbackEmbed(page?) {
  const body = String(page?.renderedText || renderPageText(page) || "").trim();
  return new EmbedBuilder()
    .setColor(HELP_EMBED_COLOR)
    .setTitle("Comandi Disponibili 🔍")
    .setDescription((body || `${E.VC_Cross} Nessun comando.`).slice(0, 4096));
}

function normalizeInvokeLookup(value?) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[/+?!.\-]+/, "")
    .replace(/\s+/g, " ");
}

function getCategoryIndex(entry?) {
  const key = String(entry?.category || "misc").toLowerCase();
  const idx = CATEGORY_ORDER.indexOf(key);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

function dedupeAndSortEntries(entries?) {
  const map = new Map();
  for (const entry of entries) {
    const key = `${entry.type}:${entry.invoke}`;
    if (!map.has(key)) map.set(key, entry);
  }
  return Array.from(map.values()).sort((a?, b?) => {
    const catCmp = getCategoryIndex(a) - getCategoryIndex(b);
    if (catCmp !== 0) return catCmp;
    return String(a.invoke || "").localeCompare(String(b.invoke || ""), "it");
  });
}

function formatRoleMentions(roleIds?) {
  if (!Array.isArray(roleIds)) return "Tutti";
  const roles = roleIds
    .map((value?) => {
      const raw = String(value || "").trim();
      if (!raw) return null;
      if (/^\d{16,20}$/.test(raw)) return raw;
      let key = raw;
      if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
      else if (key.startsWith("roles.")) key = key.slice("roles.".length);
      const resolved = IDs?.roles?.[key];
      return resolved ? String(resolved) : null;
    })
    .filter(Boolean);
  if (!roles.length) return "Nessun ruolo configurato";
  return roles.map((roleId?) => `<@&${roleId}>`).join(", ");
}

function getPrefixPermissionConfig(permissions?, commandName?) {
  const raw = permissions?.prefix?.[commandName];
  if (Array.isArray(raw)) {
    return { roles: raw, subcommands: {} };
  }
  if (raw && typeof raw === "object") {
    return {
      roles: Array.isArray(raw.roles) ? raw.roles : null,
      subcommands:
        raw.subcommands && typeof raw.subcommands === "object"
          ? raw.subcommands
          : {},
    };
  }
  return { roles: null, subcommands: {} };
}

function pushChunkedField(fields?, name?, lines?, inline = false, maxLen = 980) {
  if (!Array.isArray(lines) || !lines.length) return;
  let current = "";
  let idx = 0;

  const flush=() => {if(!current.trim().length)return;fields.push({name:idx===0?name:`${name}(cont.)`,
      value: current.trim(),
      inline,
    });
    idx += 1;
    current = "";
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;
    const next = current.length ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      flush();
      current = line;
      continue;
    }
    current = next;
  }
  flush();
}

function collectCommandUsageSnippets(command?, commandName?, prefixBase?) {
  const snippets = new Set();
  const name = String(commandName || "").toLowerCase();
  const prefix = String(prefixBase || "+");
  const knownAliases=Array.isArray(command?.aliases)?command.aliases.map((alias?) => String(alias||"").trim().toLowerCase(),).filter(Boolean):[];

  const addSnippet=(value?) => {const text=String(value||"").trim();if(!text)return;if(text.length>200)return;snippets.add(text.replace(/\s+/g," "));};

  const candidateMeta=[command?.usage,command?.example,command?.helpUsage,...(Array.isArray(command?.usages)?command.usages:[]),...(Array.isArray(command?.examples)?command.examples:[]),];
  for (const candidate of candidateMeta) {
    if (typeof candidate !== "string") continue;
    const lines=candidate.split("\n").map((line?) => line.trim()).filter(Boolean);
    for (const line of lines) addSnippet(line);
  }

  const src = String(command?.execute || "");
  const backtickRegex = /`([^`\n]{3,200})`/g;
  let match = null;
  while ((match = backtickRegex.exec(src)) !== null) {
    const snippet = String(match[1] || "").trim();
    if (!snippet) continue;
    const lower = snippet.toLowerCase();
    if (lower.includes(`${prefix}${name}`) || lower.includes(`/${name}`)) {
      addSnippet(snippet);
      continue;
    }
    if (knownAliases.some((alias?) => lower.includes(`${prefix}${alias}`))) {
      addSnippet(snippet);
    }
  }

  const ordered=Array.from(snippets.values()).sort((a?: any,b?: any) => a.length-b.length,);
  return ordered.slice(0, 12);
}

function collectPrefixExampleLines(command?, commandName?, prefixBase?, subEntries = [], requestedSub = null) {
  const out = [];
  const push=(line?) => {const value=String(line||"").trim();if(!value)return;if(!out.includes(value))out.push(value);};

  const snippets=collectCommandUsageSnippets(command,commandName,prefixBase,);
  if (requestedSub) {
    for (const row of snippets) {
      const lower = (row as any).toLowerCase();
      if (
        lower.includes(`${prefixBase}${commandName} ${requestedSub}`) ||
        lower.includes(` ${requestedSub} `)
      ) {
        push(`- \`${row}\``);
      }
    }
  } else {
    for (const row of snippets) push(`- \`${row}\``);
  }

  if (subEntries.length) {
    for (const entry of subEntries) {
      push(`- \`${entry.invoke}\``);
    }
  } else {
    push(`- \`${prefixBase}${commandName}\``);
  }

  return out.slice(0, 16);
}

function buildPrefixDetailedHelpEmbed(query?, entries?, context: Record<string, any> = {}) {
  const normalized = normalizeInvokeLookup(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const queryToken = tokens[0] || "";
  if (!queryToken) return null;

  const commands=Array.from(context?.client?.pcommands?.values?.()||[],).filter((cmd?: any) => String(cmd?.name||"").trim().length);
  if (!commands.length) return null;

  let command: any =
    commands.find(
      (cmd?: any) =>
        String(cmd.name || "")
          .trim()
          .toLowerCase() === queryToken,
    ) || null;
  if (!command) {
    command =
      commands.find(
        (cmd?: any) =>
          Array.isArray(cmd.aliases) &&
          cmd.aliases.some(
            (alias?) =>
              String(alias || "")
                .trim()
                .toLowerCase() === queryToken,
          ),
      ) || null;
  }
  if (!command) return null;

  const commandName=String(command.name||"").trim().toLowerCase();
  const prefixBase = getPrefixBase(command, context?.client);
  const visibleForCommand=entries.filter((entry?) => {if(entry.type!=="prefix")return false;const invoke=normalizeInvokeLookup(entry.invoke);return invoke.split(" ")[0]===commandName;});
  if (!visibleForCommand.length) return null;

  const permissions = context?.permissions || {};
  const permConfig = getPrefixPermissionConfig(permissions, commandName);
  const subAliasesMap=command?.subcommandAliases&&typeof command.subcommandAliases==="object"?command.subcommandAliases:{};

  let requestedSub = tokens[1] || null;
  if (requestedSub && subAliasesMap[requestedSub]) {
    requestedSub =
      String(subAliasesMap[requestedSub] || "")
        .trim()
        .toLowerCase() || requestedSub;
  }

  const usageLines = [];
  const allSubs=Array.from(new Set(visibleForCommand.map((entry?) => normalizeInvokeLookup(entry.invoke).split(" ")[1]||null,).filter(Boolean),),);
  if (allSubs.length) {
    usageLines.push(`\`${prefixBase}${commandName} <subcommand>\``);
  } else {
    usageLines.push(`\`${prefixBase}${commandName}\``);
  }

  const aliases=Array.isArray(command.aliases)?command.aliases.map((alias?) => String(alias||"").trim().toLowerCase(),).filter(Boolean):[];
  if (aliases.length) {
    usageLines.push(
      `Alias: ${aliases.map((alias?) => `\`${prefixBase}${alias}\``).join(", ")}`,
    );
  }
  usageLines.push(`Ruoli: ${formatRoleMentions(permConfig.roles)}`);
  if (PREFIX_MUSIC_SESSION_OWNER_COMMANDS.has(commandName)) {
    usageLines.push(
      "${E.VC_Attention} Solo chi ha avviato la riproduzione può usarlo.",
    );
  }

  const subEntries=visibleForCommand.filter((entry?) => normalizeInvokeLookup(entry.invoke).split(" ").length>1,).filter((entry?) => {if(!requestedSub)return true;return normalizeInvokeLookup(entry.invoke).split(" ")[1]===requestedSub;}).sort((a?,b?) => String(a.invoke||"").localeCompare(String(b.invoke||""),"it"),);

  const subLines = [];
  const visibleInvokeSet = getVisibleInvokeSet(visibleForCommand);
  for (const entry of subEntries) {
    const subName = normalizeInvokeLookup(entry.invoke).split(" ")[1];
    const subRoleIds=Array.isArray(permConfig.subcommands?.[subName])?permConfig.subcommands[subName]:permConfig.roles;
    const subAliases = entry.subAliases ?? extractDirectAliasesForSubcommand(command, subName);
    const subAliasPart = Array.isArray(subAliases) && subAliases.length ? ` (${subAliases.join(", ")})` : "";
    subLines.push(
      `- \`${prefixBase}${commandName} ${subName}\`${subAliasPart} - ${normalizeDescription(entry.description)}`,
    );
    subLines.push(`Ruoli richiesti: ${formatRoleMentions(subRoleIds)}`);
  }
  if (requestedSub && !subLines.length) {
    const allKnownSubs=listPrefixSubcommandsForCommand(command,commandName,permissions,);
    for (const sub of allKnownSubs) {
      const invoke = `${prefixBase}${commandName} ${sub}`;
      const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
      const lock = isVisible ? "" : ` ${E.VC_Cross} Non accessibile con i tuoi ruoli.`;
      const subRoleIds=Array.isArray(permConfig.subcommands?.[sub])?permConfig.subcommands[sub]:permConfig.roles;
      const subAliases = extractDirectAliasesForSubcommand(command, sub);
      const subAliasPart = subAliases.length ? ` (${subAliases.join(", ")})` : "";
      subLines.push(
        `- \`${invoke}\`${subAliasPart} - ${normalizeDescription(getPrefixSubcommandDescription(command, sub))}${lock}`,
      );
      subLines.push(`Ruoli richiesti: ${formatRoleMentions(subRoleIds)}`);
    }
  }

  const snippetLines = collectPrefixExampleLines(command, commandName, prefixBase, subEntries.map((entry?) => ({ invoke: entry.invoke })), requestedSub);

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(String(`Guida: ${prefixBase}${commandName}`).slice(0, 256))
    .setDescription(String(getPrefixDescription(command) || "").slice(0, 4096));

  const fields = [];
  pushChunkedField(fields, "Sintassi 📝", usageLines);
  if (subLines.length) {
    pushChunkedField(
      fields,
      requestedSub ? `Subcommand: ${requestedSub}` : "Subcommands 🔍",
      subLines,
    );
  }
  pushChunkedField(fields, "Esempi di uso 💡", snippetLines);
  if (fields.length) embed.addFields(fields);
  return embed;
}

function formatSlashOptionPlaceholder(option?) {
  if (!option?.name) return "";
  return option.required ? `<${option.name}>` : `[${option.name}]`;
}

function getSlashSampleValueByType(optionType?) {
  if (optionType === 3) return "testo";
  if (optionType === 4) return "10";
  if (optionType === 5) return "true";
  if (optionType === 6) return "@utente";
  if (optionType === 7) return "#canale";
  if (optionType === 8) return "@ruolo";
  if (optionType === 9) return "@utente";
  if (optionType === 10) return "1.5";
  if (optionType === 11) return "file";
  return "valore";
}

function buildSlashExampleLine(commandName?, groupName?, subName?, optionList = []) {
  const parts = [`/${commandName}`];
  if (groupName) parts.push(groupName);
  if (subName) parts.push(subName);
  for (const opt of optionList) {
    if (!opt?.name || opt.type < 3 || opt.type > 11) continue;
    parts.push(getSlashSampleValueByType(opt.type));
  }
  return `- \`${parts.join(" ")}\``;
}

function buildSlashDetailedHelpEmbed(query?, entries?, context: Record<string, any> = {}) {
  const normalized = normalizeInvokeLookup(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const queryToken = tokens[0] || "";
  if (!queryToken) return null;
  const seen = new Set();
  const slashCommands = [];
  for (const cmd of Array.from(context?.client?.commands?.values?.() || [])) {
    if (!shouldIncludeSlashCommandInHelp(cmd)) continue;
    const dataJson = (cmd as any)?._helpDataJson || (cmd as any)?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const type = dataJson.type || ApplicationCommandType.ChatInput;
    if (type !== ApplicationCommandType.ChatInput) continue;
    const key = `${dataJson.name}:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slashCommands.push({ dataJson });
  }
  if (!slashCommands.length) return null;
  const hit = slashCommands.find(({ dataJson }) => String(dataJson.name || "").trim().toLowerCase() === queryToken);
  if (!hit) return null;
  const commandName = String(hit.dataJson.name || "").trim().toLowerCase();
  const visibleForCommand = entries.filter((entry?) => entry.type === "slash" && normalizeInvokeLookup(entry.invoke).split(" ")[0] === commandName);
  if (!visibleForCommand.length) return null;
  const options = Array.isArray(hit.dataJson.options) ? hit.dataJson.options : [];
  const hasSub = options.some((opt?) => opt?.type === 1 || opt?.type === 2);
  const requestedSub = tokens[1] || null;
  const syntaxLines = [];
  const optionLines = [];
  const exampleLines = [];
  if (!hasSub) {
    const placeholders = options.filter((opt?) => opt?.type >= 3 && opt?.type <= 11).map((opt?) => formatSlashOptionPlaceholder(opt)).filter(Boolean);
    syntaxLines.push(`\`/${commandName}${placeholders.length ? ` ${placeholders.join(" ")}` : ""}\``);
    exampleLines.push(buildSlashExampleLine(commandName, null, null, options));
  } else {
    for (const opt of options) {
      if (opt?.type === 1) {
        const subName = String(opt.name || "").trim().toLowerCase();
        if (requestedSub && requestedSub !== subName) continue;
        const subPlaceholders = (Array.isArray(opt.options) ? opt.options : []).filter((child?) => child?.type >= 3 && child?.type <= 11).map((child?) => formatSlashOptionPlaceholder(child)).filter(Boolean);
        syntaxLines.push(`\`/${commandName} ${subName}${subPlaceholders.length ? ` ${subPlaceholders.join(" ")}` : ""}\``);
        exampleLines.push(buildSlashExampleLine(commandName, null, subName, Array.isArray(opt.options) ? opt.options : []));
        optionLines.push(`- \`${subName}\` - ${normalizeDescription(opt.description)}`);
      }
      if (opt?.type === 2 && Array.isArray(opt.options)) {
        const groupName = String(opt.name || "").trim().toLowerCase();
        for (const sub of opt.options) {
          if (sub?.type !== 1 || !sub?.name) continue;
          const subName = String(sub.name || "").trim().toLowerCase();
          if (requestedSub && requestedSub !== groupName && requestedSub !== subName) continue;
          const subPlaceholders = (Array.isArray(sub.options) ? sub.options : []).filter((child?) => child?.type >= 3 && child?.type <= 11).map((child?) => formatSlashOptionPlaceholder(child)).filter(Boolean);
          syntaxLines.push(`\`/${commandName} ${groupName} ${subName}${subPlaceholders.length ? ` ${subPlaceholders.join(" ")}` : ""}\``);
          exampleLines.push(buildSlashExampleLine(commandName, groupName, subName, Array.isArray(sub.options) ? sub.options : []));
          optionLines.push(`- \`${groupName} ${subName}\` - ${normalizeDescription(sub.description)}`);
        }
      }
    }
  }
  const perm = context?.permissions?.slash?.[commandName];
  const roleIds = Array.isArray(perm) ? perm : Array.isArray(perm?.roles) ? perm.roles : null;
  const effectiveSyntax = syntaxLines.length ? syntaxLines : [`\`/${commandName}\``];
  const embed = new EmbedBuilder().setColor("#6f4e37").setTitle(String(`Guida: /${commandName}`).slice(0, 256)).setDescription(String(normalizeDescription(hit.dataJson.description)).slice(0, 4096));
  const fields = [];
  pushChunkedField(fields, "Sintassi 📝", effectiveSyntax);
  pushChunkedField(fields, "Permessi", [`Ruoli richiesti: ${formatRoleMentions(roleIds)}`]);
  if (optionLines.length) pushChunkedField(fields, "Opzioni 🔍", optionLines);
  pushChunkedField(fields, "Esempi di uso 💡", exampleLines.length ? exampleLines : [`- \`/${commandName}\``]);
  if (fields.length) embed.addFields(fields.slice(0, 25));
  return embed;
}

function buildDetailedHelpEmbed(query?, entries?, context: Record<string, any> = {}) {
  return (
    buildPrefixDetailedHelpEmbed(query, entries, context) ||
    buildSlashDetailedHelpEmbed(query, entries, context) ||
    null
  );
}

function getVisibleInvokeSet(entries?) {
  const set = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const invoke = normalizeInvokeLookup(entry?.invoke);
    if (invoke) set.add(invoke);
  }
  return set;
}

function resolvePrefixCommandByToken(client?, token?) {
  const safeToken=String(token||"").trim().toLowerCase();
  if (!safeToken) return null;
  const commands = Array.from(client?.pcommands?.values?.() || []);
  for (const command of commands) {
    const name=String((command as any)?.name||"").trim().toLowerCase();
    if (name && name === safeToken) return command;
    const aliases=Array.isArray((command as any)?.aliases)?(command as any).aliases.map((alias?) => String(alias||"").trim().toLowerCase(),):[];
    if (aliases.includes(safeToken)) return command;
  }
  return null;
}

function listPrefixSubcommandsForCommand(command?, commandName?, permissions?) {
  const baseSubcommands=Array.from(new Set([...extractPrefixSubcommands(command),...(Array.isArray(command?.subcommands)?command.subcommands.map((s?) => String(s||"").trim().toLowerCase(),).filter(Boolean):[]),]),);
  if (String(commandName || "").toLowerCase() === "security") {
    baseSubcommands.push("panic status", "panic enable", "panic disable");
  }
  const subcommands = Array.from(new Set(baseSubcommands));
  return subcommands.sort((a?, b?) => a.localeCompare(b, "it"));
}

function buildSubcommandFallbackEmbed(query?, visibleEntries?, context: Record<string, any> = {}) {
  const normalized = normalizeInvokeLookup(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const queryToken = tokens[0] || "";
  if (!queryToken) return null;

  const permissions = context?.permissions || {};
  const visibleInvokeSet = getVisibleInvokeSet(visibleEntries);

  const prefixCommand: any=resolvePrefixCommandByToken(context?.client,queryToken,);
  if (prefixCommand) {
    const commandName=String(prefixCommand.name||"").trim().toLowerCase();
    const prefixBase = getPrefixBase(prefixCommand, context?.client);
    const subcommands=listPrefixSubcommandsForCommand(prefixCommand,commandName,permissions,);
    if (subcommands.length) {
      const lines=subcommands.map((sub?) => {const invoke=`${prefixBase}${commandName} ${sub}`;
        const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
        const lock = isVisible ? "" : ` ${E.VC_Cross} Non accessibile con i tuoi ruoli.`;
        const subAliases = extractDirectAliasesForSubcommand(prefixCommand, sub);
        const subAliasPart = subAliases.length ? `(${subAliases.join(", ")})` : "";
        return `-\`${invoke}\`${subAliasPart}-${normalizeDescription(getPrefixSubcommandDescription(prefixCommand,sub))}${lock}`;
      });
      return new EmbedBuilder()
        .setColor(HELP_EMBED_COLOR)
        .setTitle(String(`Subcommands 🔍: ${prefixBase}${commandName}`).slice(0, 256))
        .setDescription(String(lines.join("\n")).slice(0, 4096));
    }
  }

  return null;
}

function buildMiniHelpEmbed(query?, entries?, context: Record<string, any> = {}) {
  const detailed = buildDetailedHelpEmbed(query, entries, context);
  if (detailed) return detailed;

  const normalizedQuery = normalizeInvokeLookup(query);
  const matches=entries.filter((entry?) => {const invoke=normalizeInvokeLookup(entry.invoke);if(!invoke)return false;const commandToken=invoke.split(" ")[0]||"";const baseMatch=invoke===normalizedQuery||invoke.startsWith(`${normalizedQuery}`) ||
      commandToken === normalizedQuery;
    if (baseMatch) return true;
    if (entry.type !== "prefix" || !Array.isArray(entry.aliases)) return false;
    return entry.aliases.some(
      (alias?) => String(alias || "").toLowerCase() === normalizedQuery,
    );
  });

  if (!matches.length) {
    const fallback = buildSubcommandFallbackEmbed(query, entries, context);
    if (fallback) return fallback;
    return buildMiniHelpNotFoundEmbed(query);
  }

  const limited = matches.slice(0, 20);
  const lines=limited.map((entry?) => {const categoryKey=String(entry.category||"").toLowerCase();const categoryLabel=CATEGORY_LABELS[categoryKey]||categoryKey||"Misc";const invokeNorm=normalizeInvokeLookup(entry.invoke);const prefixForAlias=entry.prefixBase!=null?String(entry.prefixBase):"+";let aliasList=Array.isArray(entry.aliases)&&entry.aliases.length?entry.aliases.map((a?) => String(a||"").trim()).filter((a?) => a&&normalizeInvokeLookup(prefixForAlias+a.replace(/^[/+]+/,""))!==invokeNorm):[];const isTicketCommand=invokeNorm.startsWith("ticket")||String(entry.invoke||"").toLowerCase().startsWith("+ticket");if(isTicketCommand&&Array.isArray(entry.subAliases)&&entry.subAliases.length){const existingNorm=new Set(aliasList.map((a?) => normalizeInvokeLookup(prefixForAlias+a.replace(/^[/+]+/,""))));for(const a of entry.subAliases){const s=String(a||"").trim();if(!s)continue;const norm=normalizeInvokeLookup(prefixForAlias+s.replace(/^[/+]+/,""));if(norm!==invokeNorm&&!existingNorm.has(norm)){existingNorm.add(norm);aliasList.push(s);}}}const aliasPart=aliasList.length?" | "+aliasList.map((a?) => "`"+(a.startsWith("+")||a.startsWith("/")?a:prefixForAlias+a)+"`").join(", "):"";const onlyMemberRole=Array.isArray(entry.roles)&&entry.roles.length===1&&String(entry.roles[0])===String(IDs.roles.Member);const roleHint=Array.isArray(entry.roles)&&entry.roles.length>0&&!onlyMemberRole?`\n  \`Ruolo:\` ${entry.roles.map((id?) => `<@&${id}>`).join(", ")}`:"";return`- \`${entry.invoke}\`${aliasPart}-${entry.description}\n\`Categoria:\` ${categoryLabel}${roleHint}`;
  });
  const extra=matches.length>limited.length?`\n\n...e altri**${matches.length-limited.length}**risultati.`
      : "";

  return new EmbedBuilder()
    .setColor(HELP_EMBED_COLOR)
    .setTitle(String(`Mini Help 💡: ${query}`).slice(0, 256))
    .setDescription(String(`${lines.join("\n")}${extra}`).slice(0, 4096));
}

/** Catalog for site wiki — same entries/filter as ,help for the given Discord roles. */
function buildWikiHelpCatalog(client?, roleIds = []) {
  if (!client?.pcommands && !client?.commands) return { categories: [], commandCount: 0 };
  const permissions = loadPermissions();
  const allEntries = buildEntries(client, permissions);
  const memberRoles = new Set(
    (Array.isArray(roleIds) ? roleIds : [])
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId && !memberRoles.has(memberRoleId)) memberRoles.add(memberRoleId);

  const visible = allEntries.filter((entry?) => canMemberSeeEntry(entry, memberRoles));
  const byCat = new Map();
  for (const entry of visible) {
    const key = String(entry?.category || "misc").toLowerCase();
    if (!key || key === "misc") continue;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(entry);
  }

  const categories = [];
  const pushCat = (key?) => {
    const list = byCat.get(key);
    if (!list || !list.length) return;
    list.sort((a?, b?) => String(a.invoke || "").localeCompare(String(b.invoke || ""), "it"));
    const title = CATEGORY_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
    categories.push({
      id: key,
      title,
      commands: list.map((entry?) => {
        const invoke = String(entry.invoke || "").trim();
        const description =
          String(entry.description || "").trim() || "Nessuna descrizione disponibile.";
        const aliases = Array.isArray(entry.aliases)
          ? entry.aliases.map((a?) => String(a || "").trim()).filter(Boolean)
          : [];
        const prefixBase = entry.prefixBase != null ? String(entry.prefixBase) : ",";
        const aliasDisplay = aliases.map((a?) =>
          a.startsWith(",") || a.startsWith("+") || a.startsWith("/") ? a : `${prefixBase}${a}`,
        );
        const roles = Array.isArray(entry.roles) ? entry.roles.map(String) : [];
        return {
          invoke,
          type: String(entry.type || "prefix"),
          description,
          aliases: aliasDisplay,
          roles,
          rolesCsv: roles.join(","),
          usage: invoke,
          example: invoke,
          blurb: description.length > 160 ? `${description.slice(0, 159).trim()}…` : description,
          search: `${invoke} ${description} ${title} ${aliasDisplay.join(" ")}`.toLowerCase(),
          categoryTitle: title,
        };
      }),
    });
    byCat.delete(key);
  };

  for (const key of CATEGORY_ORDER) pushCat(key);
  for (const key of Array.from(byCat.keys()).sort((a?, b?) => a.localeCompare(b, "it"))) {
    pushCat(key);
  }

  return {
    categories,
    commandCount: categories.reduce((n?, c?) => n + (c.commands?.length || 0), 0),
  };
}

export = {
  buildWikiHelpCatalog,
  buildEntries,
  canMemberSeeEntry,
  loadPermissions,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
};