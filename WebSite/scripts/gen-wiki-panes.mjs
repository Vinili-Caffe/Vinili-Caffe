#!/usr/bin/env node
/**
 * Generate wiki command panes HTML (no full site build) for live inject.
 * wikiRoleFilter1 + wikiEconomyOff1
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";
import { buildWikiCommandPanesInnerHtml } from "./wiki-command-discovery.mjs";
import {
  loadGaleoniEconomyUnlockMs,
  isWikiEconomyCategoryVisible,
} from "./wiki-help-visibility.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] || path.join("/tmp", "vc_wiki_panes1");
const vinyls = path.join(ROOT, "..", "Vinyls");
const require = createRequire(pathToFileURL(path.join(vinyls, "package.json")).href);
const ids = require("./Utils/Config/ids.js");

const panes = buildWikiCommandPanesInnerHtml({
  avatarProdUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
  avatarTestUrl: "https://cdn.discordapp.com/embed/avatars/4.png",
});
const unlock = loadGaleoniEconomyUnlockMs(vinyls);
const visible = isWikiEconomyCategoryVisible(vinyls);
const meta = {
  economyVisible: visible,
  economyUnlockMs: unlock,
  memberRoleId: String(ids?.roles?.Member || ""),
  vipRoleId: String(ids?.roles?.VIP || ""),
  hasEconomy: /data-vc-cmd-cat="economy"/.test(panes),
  rolesAttrCount: (panes.match(/data-vc-cmd-roles=/g) || []).length,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "panes.html"), panes, "utf8");
fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
console.log(JSON.stringify(meta));
console.log("wrote", OUT);
