/**
 * Legge i file dei bot Vinyls / Coffee e genera l'HTML degli accordion comandi per la wiki.
 * Slash / menu contestuale: stessa categoria della cartella Commands (Admin, Staff, Dev…), insieme ai prefix.
 * Prefix: cartella Prefix, esclusi skipLoad / skipPrefix. Slash senza skipDeploy.
 * Categorie admin e dev: omesse dalla wiki pubblica.
 * Visibilità comandi (prefix/slash/context): come +help per un utente con solo ruolo Member
 * (permissions.json + canMemberSeeEntry). Cartella Prefix "misc" esclusa come in help.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";
import {
  loadWikiHelpContext,
  getCommandPermissionNode,
  getPrefixPermissionConfig,
  isPrefixCommandVisibleOnWiki,
  isSlashOrContextVisibleOnWiki,
} from "./wiki-help-visibility.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const PREFIX_FOLDER_LABELS = {
  utility: "Utility",
  tts: "TTS",
  level: "Livelli",
  minigames: "Minigiochi",
  stats: "Statistiche",
  moderation: "Moderazione",
  admin: "Admin",
  staff: "Staff",
  event: "Eventi",
  dev: "Dev",
};

const CATEGORY_ORDER = [
  "utility",
  "tts",
  "level",
  "minigames",
  "stats",
  "staff",
  "moderation",
  "event",
];

/** Cartelle Admin / Dev: non mostrate sulla wiki (comandi sensibili o solo team). */
function wikiPublicCategory(id) {
  const k = String(id || "").toLowerCase();
  return k !== "admin" && k !== "dev";
}

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escPre(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncateBlurb(s, max = 140) {
  const t = String(s || "").trim();
  if (!t) return "—";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function extractBracedBlock(src, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(openBraceIndex + 1, i);
    }
  }
  return null;
}

function parseConstStringMap(src, constName) {
  const needle = `const ${constName} = {`;
  const start = src.indexOf(needle);
  if (start === -1) return {};
  const brace = start + needle.length - 1;
  const inner = extractBracedBlock(src, brace);
  if (!inner) return {};
  const out = {};
  const re = /\s*(?:"([^"]+)"|([a-zA-Z0-9_.-]+))\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const key = m[1] || m[2];
    out[key] = String(m[3] || "")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return out;
}

function extractModuleExportsBlock(src) {
  const token = "module.exports";
  const pos = src.lastIndexOf(token);
  if (pos === -1) return null;
  const brace = src.indexOf("{", pos);
  if (brace === -1) return null;
  return extractBracedBlock(src, brace);
}

function extractArrayOfStringsFromExportBlock(block, propName) {
  const re = new RegExp(`\\b${propName}\\s*:`);
  const match = block.match(re);
  if (!match || match.index == null) return [];
  let i = match.index + match[0].length;
  while (i < block.length && /\s/.test(block[i])) i++;
  if (block[i] !== "[") return [];
  let depth = 0;
  const startBracket = i;
  for (; i < block.length; i++) {
    const c = block[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        const inner = block.slice(startBracket + 1, i);
        const out = [];
        for (const mm of inner.matchAll(/['"]([a-zA-Z0-9._-]+)['"]/g)) {
          out.push(mm[1].toLowerCase());
        }
        return out;
      }
    }
  }
  return [];
}

function extractCanonicalSubcommandsFromBlock(block) {
  const a = extractArrayOfStringsFromExportBlock(block, "canonicalSubcommands");
  const b = extractArrayOfStringsFromExportBlock(block, "subcommands");
  return [...new Set([...a, ...b])];
}

function resolvePrefixNameFromBinding(filePath, src, varName) {
  const re = new RegExp(
    `const\\s+${varName.replace(/[^$\w]/g, "")}\\s*=\\s*require\\(\\s*["']([^"']+)["']\\s*\\)(?:\\.(\\w+))?`,
  );
  const m = src.match(re);
  if (!m) return null;
  const rel = m[1];
  const exportKey = m[2] || null;
  try {
    const dir = path.dirname(filePath);
    const req = createRequire(pathToFileURL(filePath).href);
    const mod = req(path.join(dir, rel));
    const target = exportKey && mod && typeof mod[exportKey] === "object" ? mod[exportKey] : mod;
    const n = target && typeof target.name === "string" ? target.name.trim() : "";
    return n || null;
  } catch {
    return null;
  }
}

function parsePrefixCommandFile(filePath, src) {
  const block = extractModuleExportsBlock(src);
  if (!block) return null;
  if (/\bskipLoad:\s*true/.test(block) || /\bskipPrefix:\s*true/.test(block)) return null;
  let name = null;
  const literalM = block.match(/\bname:\s*["']([a-zA-Z0-9_-]+)["']/);
  if (literalM) name = literalM[1];
  else {
    const varM = block.match(/\bname:\s*([\w$]+)\.name\b/);
    if (varM) name = resolvePrefixNameFromBinding(filePath, src, varM[1]);
  }
  if (!name) {
    const base = path.basename(filePath, ".js");
    if (/^[a-z][a-z0-9_-]*$/i.test(base)) name = base;
  }
  if (!name) return null;
  const descM = block.match(/\bdescription:\s*["']([^"']*)["']/);
  const subDescBlock = block.match(/subcommandDescriptions:\s*\{([\s\S]*?)\n\s*\}/);
  let subHints = null;
  if (subDescBlock) {
    const inner = subDescBlock[1];
    const sm = [...inner.matchAll(/\b([a-zA-Z0-9_-]+)\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
    if (sm.length) subHints = Object.fromEntries(sm.map((x) => [x[1], x[2].replace(/\\"/g, '"')]));
  }
  const canonicalSubs = extractCanonicalSubcommandsFromBlock(block);
  return {
    name,
    fileDescription: descM ? descM[1] : null,
    subHints,
    canonicalSubs,
  };
}

function parseSlashFromSrc(src, categoryFolder) {
  if (/\bskipDeploy:\s*true/.test(src)) return null;
  const slashIdx = src.search(/\bdata:\s*new\s+SlashCommandBuilder\s*\(\s*\)/);
  const ctxIdx = src.search(/\bdata:\s*new\s+ContextMenuCommandBuilder\s*\(\s*\)/);
  if (slashIdx !== -1 && (ctxIdx === -1 || slashIdx < ctxIdx)) {
    const endProbe = src.slice(slashIdx).search(/\n\s*async\s+execute\b/);
    const end = endProbe === -1 ? slashIdx + 4000 : slashIdx + endProbe;
    const chunk = src.slice(slashIdx, end);
    const nameM = chunk.match(/\.setName\s*\(\s*["']([^"']+)["']\s*\)/);
    const descM = chunk.match(/\.setDescription\s*\(\s*["']([^"']+)["']\s*\)/);
    if (!nameM) return null;
    return {
      kind: "slash",
      folder: categoryFolder,
      name: nameM[1],
      description: descM ? descM[1] : "",
    };
  }
  if (ctxIdx !== -1) {
    const end = ctxIdx + 1200;
    const chunk = src.slice(ctxIdx, end);
    const nameM = chunk.match(/\.setName\s*\(\s*["']([^"']+)["']\s*\)/);
    if (!nameM) return null;
    return {
      kind: "context",
      folder: categoryFolder,
      name: nameM[1],
      description: "",
    };
  }
  return null;
}

function listPrefixFiles(prefixRoot) {
  if (!fs.existsSync(prefixRoot)) return [];
  const out = [];
  for (const folder of fs.readdirSync(prefixRoot)) {
    const folderPath = path.join(prefixRoot, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath)) {
      if (!file.endsWith(".js")) continue;
      out.push({ folder, file: path.join(folderPath, file) });
    }
  }
  return out;
}

function listSlashFiles(commandsRoot) {
  if (!fs.existsSync(commandsRoot)) return [];
  const out = [];
  for (const folder of fs.readdirSync(commandsRoot)) {
    const folderPath = path.join(commandsRoot, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath)) {
      if (!file.endsWith(".js")) continue;
      out.push({ folder, file: path.join(folderPath, file) });
    }
  }
  return out;
}

function hintForPrefixCommand(name, meta, prefixMap, subMap) {
  const key = String(name || "").toLowerCase();
  if (prefixMap[key]) return prefixMap[key];
  if (meta.fileDescription) return meta.fileDescription;
  const subLines = [];
  if (subMap && typeof subMap === "object") {
    for (const [sk, sv] of Object.entries(subMap)) {
      const dot = sk.indexOf(".");
      if (dot !== -1 && sk.slice(0, dot).toLowerCase() === key) {
        subLines.push(`${sk.slice(dot + 1)}: ${sv}`);
      }
    }
  }
  if (meta.subHints && typeof meta.subHints === "object") {
    for (const [k, v] of Object.entries(meta.subHints)) {
      subLines.push(`${k}: ${v}`);
    }
  }
  if (subLines.length) return subLines.join(" · ");
  return "Comando con prefisso.";
}

function collectVinili() {
  const vinylsRoot = path.join(REPO_ROOT, "Vinyls");
  const helpPath = path.join(vinylsRoot, "Prefix", "Utility", "help.js");
  const helpSrc = read(helpPath);
  const prefixDesc = parseConstStringMap(helpSrc, "PREFIX_HELP_DESCRIPTIONS");
  const subDesc = parseConstStringMap(helpSrc, "PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS");
  const ctxDesc = parseConstStringMap(helpSrc, "CONTEXT_HELP_DESCRIPTIONS");

  let wikiCtx = null;
  try {
    wikiCtx = loadWikiHelpContext(vinylsRoot);
  } catch (err) {
    console.warn("[build-site] wiki help context (Vinyls):", err?.message || err);
  }
  const permFilter =
    wikiCtx &&
    wikiCtx.memberRoleSet &&
    wikiCtx.memberRoleSet.size &&
    wikiCtx.ids
      ? wikiCtx
      : null;

  const cfg = JSON.parse(read(path.join(vinylsRoot, "config.json")));
  const prefix = String(cfg.prefix ?? "+");

  const categories = new Map();

  function ensureCat(id) {
    if (!categories.has(id)) {
      categories.set(id, { id, title: PREFIX_FOLDER_LABELS[id] || id, commands: [] });
    }
    return categories.get(id);
  }

  for (const { folder, file } of listSlashFiles(path.join(vinylsRoot, "Commands"))) {
    const src = read(file);
    const parsed = parseSlashFromSrc(src, folder);
    if (!parsed) continue;
    if (permFilter) {
      const node = getCommandPermissionNode(permFilter.permissions.slash, parsed.name);
      if (!isSlashOrContextVisibleOnWiki(node, permFilter.memberRoleSet, permFilter.ids)) {
        continue;
      }
    }
    const folderKey = String(parsed.folder || folder).toLowerCase();
    if (!wikiPublicCategory(folderKey)) continue;
    const cat = ensureCat(folderKey);
    if (!cat.title || cat.title === folderKey) {
      cat.title = PREFIX_FOLDER_LABELS[folderKey] || folder;
    }
    if (parsed.kind === "slash") {
      const titleText = `/${parsed.name}`;
      const desc = String(parsed.description || "").trim() || "Comando slash Discord.";
      cat.commands.push({
        search: `${titleText} ${desc} ${cat.title} slash`.toLowerCase(),
        titleText,
        blurb: truncateBlurb(desc, 160),
        description: desc,
        usage: titleText,
        example: titleText,
        categoryTitle: cat.title,
      });
    } else {
      const hint =
        ctxDesc[parsed.name] ||
        "Menu contestuale (tasto destro sul messaggio o sull’utente).";
      const titleText = parsed.name;
      const usage = `Discord: tasto destro sul messaggio o sull’utente → App → «${parsed.name}»`;
      cat.commands.push({
        search: `${titleText} ${hint} ${cat.title} menu`.toLowerCase(),
        titleText,
        blurb: truncateBlurb(hint, 160),
        description: hint,
        usage,
        example: "Dal menu contestuale (tasto destro).",
        categoryTitle: cat.title,
      });
    }
  }

  for (const { folder, file } of listPrefixFiles(path.join(vinylsRoot, "Prefix"))) {
    const src = read(file);
    const meta = parsePrefixCommandFile(file, src);
    if (!meta) continue;
    const folderKey = String(folder).toLowerCase();
    if (folderKey === "misc") continue;
    if (!wikiPublicCategory(folderKey)) continue;
    if (permFilter) {
      const nameKey = String(meta.name || "").trim().toLowerCase();
      const permCfg = getPrefixPermissionConfig(permFilter.permissions, nameKey);
      if (
        !isPrefixCommandVisibleOnWiki(
          permCfg,
          meta.canonicalSubs,
          permFilter.memberRoleSet,
          permFilter.ids,
        )
      ) {
        continue;
      }
    }
    const cat = ensureCat(folderKey);
    if (!cat.title || cat.title === folderKey) {
      cat.title = PREFIX_FOLDER_LABELS[folderKey] || folder;
    }
    const hint = hintForPrefixCommand(meta.name, meta, prefixDesc, subDesc);
    const titleText = `${prefix}${meta.name}`;
    const desc = String(hint || "").trim() || "Comando con prefisso.";
    const usage =
      meta.canonicalSubs && meta.canonicalSubs.length
        ? `${titleText} <sottocomando>`
        : titleText;
    cat.commands.push({
      search: `${titleText} ${desc} ${cat.title} prefix`.toLowerCase(),
      titleText,
      blurb: truncateBlurb(desc, 160),
      description: desc,
      usage,
      example: titleText,
      categoryTitle: cat.title,
    });
  }

  for (const c of categories.values()) {
    c.commands.sort((a, b) => a.search.localeCompare(b.search));
  }

  const ordered = [];
  for (const id of CATEGORY_ORDER) {
    const c = categories.get(id);
    if (c && c.commands.length && wikiPublicCategory(id)) ordered.push(c);
  }
  for (const [id, c] of categories) {
    if (!CATEGORY_ORDER.includes(id) && c.commands.length && wikiPublicCategory(id)) ordered.push(c);
  }

  return { prefix, categories: ordered };
}

function collectCaffe() {
  const coffeeRoot = path.join(REPO_ROOT, "Coffee");
  const helpPath = path.join(coffeeRoot, "Prefix", "Utility", "help.js");
  const helpSrc = read(helpPath);
  const prefixDesc = parseConstStringMap(helpSrc, "PREFIX_HELP_DESCRIPTIONS");
  const subDesc = parseConstStringMap(helpSrc, "PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS");
  let wikiCtx = null;
  try {
    wikiCtx = loadWikiHelpContext(coffeeRoot);
  } catch (err) {
    console.warn("[build-site] wiki help context (Coffee):", err?.message || err);
  }
  const permFilter =
    wikiCtx &&
    wikiCtx.memberRoleSet &&
    wikiCtx.memberRoleSet.size &&
    wikiCtx.ids
      ? wikiCtx
      : null;

  const cfg = JSON.parse(read(path.join(coffeeRoot, "config.json")));
  const prefix = String(cfg.prefix ?? "-");

  const categories = new Map();
  function ensureCat(id) {
    if (!categories.has(id)) {
      categories.set(id, { id, title: PREFIX_FOLDER_LABELS[id] || id, commands: [] });
    }
    return categories.get(id);
  }

  for (const { folder, file } of listPrefixFiles(path.join(coffeeRoot, "Prefix"))) {
    const src = read(file);
    const meta = parsePrefixCommandFile(file, src);
    if (!meta) continue;
    const folderKey = String(folder).toLowerCase();
    if (folderKey === "misc") continue;
    if (!wikiPublicCategory(folderKey)) continue;
    if (permFilter) {
      const nameKey = String(meta.name || "").trim().toLowerCase();
      const permCfg = getPrefixPermissionConfig(permFilter.permissions, nameKey);
      if (
        !isPrefixCommandVisibleOnWiki(
          permCfg,
          meta.canonicalSubs,
          permFilter.memberRoleSet,
          permFilter.ids,
        )
      ) {
        continue;
      }
    }
    const cat = ensureCat(folderKey);
    cat.title = PREFIX_FOLDER_LABELS[folderKey] || folder;
    const hint = hintForPrefixCommand(meta.name, meta, prefixDesc, subDesc);
    const titleText = `${prefix}${meta.name}`;
    const desc = String(hint || "").trim() || "Comando con prefisso.";
    const usage =
      meta.canonicalSubs && meta.canonicalSubs.length
        ? `${titleText} <sottocomando>`
        : titleText;
    cat.commands.push({
      search: `${titleText} ${desc} ${cat.title} prefix`.toLowerCase(),
      titleText,
      blurb: truncateBlurb(desc, 160),
      description: desc,
      usage,
      example: titleText,
      categoryTitle: cat.title,
    });
  }

  for (const c of categories.values()) {
    c.commands.sort((a, b) => a.search.localeCompare(b.search));
  }

  const ordered = [];
  for (const id of CATEGORY_ORDER) {
    const c = categories.get(id);
    if (c && c.commands.length && wikiPublicCategory(id)) ordered.push(c);
  }
  for (const [id, c] of categories) {
    if (!CATEGORY_ORDER.includes(id) && c.commands.length && wikiPublicCategory(id)) ordered.push(c);
  }

  return { prefix, categories: ordered };
}

function comandoMetaLabel(n) {
  if (n === 1) return "1 comando";
  return `${n} comandi`;
}

function buildPaneInnerHtml(botAttrName, avatarUrlAttr, categories) {
  const srcEsc = escAttr(avatarUrlAttr);
  const grpName = escAttr(`wiki-grp-${botAttrName}`);
  const itemName = escAttr(`wiki-item-${botAttrName}`);
  let html = "";
  categories.forEach((cat) => {
    const n = cat.commands.length;
    const ctitle = escHtml(cat.title);
    const cid = escAttr(String(cat.id || ""));
    const meta = comandoMetaLabel(n);
    html += `          <details class="vc-cmd-acc vc-cmd-grp" name="${grpName}" data-vc-cmd-cat="${cid}">
            <summary class="vc-cmd-acc-sum">
              <img class="vc-cmd-acc-avatar" src="${srcEsc}" alt="" width="32" height="32" decoding="async" />
              <span class="vc-cmd-acc-text">
                <span class="vc-cmd-acc-title vc-cmd-grp-title">${ctitle}</span>
                <span class="vc-cmd-acc-meta" data-vc-cmd-grp-meta>${meta}</span>
              </span>
              <i class="fa fa-chevron-down vc-cmd-acc-chev" aria-hidden="true"></i>
            </summary>
            <div class="vc-cmd-acc-body vc-cmd-grp-list">
`;
    for (const cmd of cat.commands) {
      const searchAttr = escAttr(String(cmd.search || "").toLowerCase());
      const titleLine = escHtml(cmd.titleText);
      const blurb = escHtml(cmd.blurb);
      const desc = escHtml(cmd.description);
      const usage = escPre(cmd.usage);
      const example = escPre(cmd.example);
      const catPill = escHtml(cmd.categoryTitle);
      html += `              <details class="vc-cmd-item" name="${itemName}" data-vc-cmd-search="${searchAttr}">
                <summary class="vc-cmd-item-sum">
                  <div class="vc-cmd-item-sum-text">
                    <span class="vc-cmd-item-name">${titleLine}</span>
                    <span class="vc-cmd-item-blurb">${blurb}</span>
                  </div>
                  <i class="fa fa-chevron-down vc-cmd-item-chev" aria-hidden="true"></i>
                </summary>
                <div class="vc-cmd-item-body">
                  <div class="vc-cmd-field">
                    <div class="vc-cmd-field-label">Descrizione</div>
                    <div class="vc-cmd-field-text">${desc}</div>
                  </div>
                  <div class="vc-cmd-field">
                    <div class="vc-cmd-field-label">Utilizzo</div>
                    <pre class="vc-cmd-code vc-cmd-code--usage" translate="no">${usage}</pre>
                  </div>
                  <div class="vc-cmd-field">
                    <div class="vc-cmd-field-label">Esempio</div>
                    <pre class="vc-cmd-code vc-cmd-code--example" translate="no">${example}</pre>
                  </div>
                  <div class="vc-cmd-field vc-cmd-field--category">
                    <div class="vc-cmd-field-label">Categoria</div>
                    <span class="vc-cmd-cat-pill"><i class="fa fa-diamond" aria-hidden="true"></i><span>${catPill}</span></span>
                  </div>
                </div>
              </details>
`;
    }
    html += `            </div>
          </details>
`;
  });
  return html;
}

/**
 * @param {{ avatarProdUrl: string; avatarTestUrl: string }} opts URL già risolte (anche relative)
 * @returns {string} HTML (senza wrapper esterno)
 */
export function buildWikiCommandPanesInnerHtml(opts) {
  const { avatarProdUrl, avatarTestUrl } = opts;
  try {
    const vinili = collectVinili();
    const caffe = collectCaffe();
    let out = "";
    out += `          <div class="vc-cmd-pane" id="wiki-cmd-pane-prod" role="tabpanel" aria-labelledby="wiki-tab-prod" data-pane="prod">\n`;
    out += buildPaneInnerHtml("prod", avatarProdUrl, vinili.categories);
    out += `          </div>\n`;
    out += `          <div class="vc-cmd-pane" id="wiki-cmd-pane-test" role="tabpanel" aria-labelledby="wiki-tab-test" data-pane="test" hidden>\n`;
    out += buildPaneInnerHtml("test", avatarTestUrl, caffe.categories);
    out += `          </div>\n`;
    return out;
  } catch (err) {
    console.warn("[build-site] wiki-command-discovery:", err?.message || err);
    return `          <p class="text-sm text-slate-400">Impossibile generare l&apos;elenco comandi automatico.</p>\n`;
  }
}