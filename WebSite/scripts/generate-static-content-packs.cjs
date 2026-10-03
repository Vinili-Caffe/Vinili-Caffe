#!/usr/bin/env node
/**
 * Bake static packs for regole / bot-faq / staff-guide (no per-visit webhook).
 * Run from repo root: node WebSite/scripts/generate-static-content-packs.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const outDir = path.join(root, "WebSite", "js");

function writePack(fileName, globalName, payload) {
  const body = `/* generated — do not edit by hand; run WebSite/scripts/generate-static-content-packs.js */\nwindow.${globalName} = ${JSON.stringify(payload)};\n`;
  const dest = path.join(outDir, fileName);
  fs.writeFileSync(dest, body, "utf8");
  console.log("wrote", dest, Buffer.byteLength(body), "bytes");
}

function bakeRegole() {
  const { buildCommunityRulesSitePayload } = require(path.join(
    root,
    "Vinyls",
    "Utils",
    "Web",
    "communityRulesPayload.js",
  ));
  writePack("vc-regole-static.js", "__VC_REGOLE_STATIC", buildCommunityRulesSitePayload());
}

function bakeBotFaq() {
  const { getBotFaqWebPayload } = require(path.join(
    root,
    "Vinyls",
    "Utils",
    "Utility",
    "botFaqPlainData.js",
  ));
  writePack("vc-bot-faq-static.js", "__VC_BOT_FAQ_STATIC", getBotFaqWebPayload());
}

function bakeStaffGuide() {
  const IDs = require(path.join(root, "Vinyls", "Utils", "Config", "ids.js"));
  const {
    listStaffGuideSectionMeta,
    buildStaffGuideSectionMarkdown,
    getStaffGuideSectionMeta,
  } = require(path.join(root, "Vinyls", "Utils", "Staff", "staffGuideContent.js"));
  const { discordGuideMarkdownToHtml } = require(path.join(
    root,
    "Vinyls",
    "Utils",
    "Web",
    "discordGuideMarkdown.js",
  ));

  const sections = listStaffGuideSectionMeta().map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description || "",
    parent: s.parent || null,
    emoji: s.emoji || "",
  }));

  const byId = {};
  for (const s of sections) {
    const md = buildStaffGuideSectionMarkdown(s.id);
    const meta = getStaffGuideSectionMeta(s.id);
    if (md == null || !meta) continue;
    byId[s.id] = {
      id: s.id,
      label: s.label,
      description: s.description || "",
      parent: s.parent || null,
      markdown: String(md),
      html: discordGuideMarkdownToHtml(md, { IDs }),
    };
  }

  writePack("vc-staff-guide-static.js", "__VC_STAFF_GUIDE_STATIC", {
    ok: true,
    sections,
    byId,
    generatedAt: new Date().toISOString(),
  });
}

bakeRegole();
bakeBotFaq();
bakeStaffGuide();
console.log("done");
