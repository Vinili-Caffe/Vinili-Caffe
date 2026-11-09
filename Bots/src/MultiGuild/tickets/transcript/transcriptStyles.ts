/** Trascrizioni: stili per telefono e aggiornamento delle trascrizioni salvate col formato vecchio. */
const LEGACY_TRANSCRIPT_UPGRADE_CSS = `
html, body { height: 100% !important; }
body {
  margin: 0 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  background: #313338 !important;
  color: #dbdee1 !important;
  letter-spacing: normal !important;
  word-spacing: normal !important;
}
body, body * {
  letter-spacing: normal !important;
  word-spacing: normal !important;
}
.wrap { max-width: none !important; margin: 0 !important; padding: 0 !important; min-height: 100% !important; }
.header {
  position: sticky !important;
  top: 0 !important;
  z-index: 2 !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 12px 16px !important;
  margin-bottom: 0 !important;
  background: #2b2d31 !important;
  border: 0 !important;
  border-bottom: 1px solid #1e1f22 !important;
  border-radius: 0 !important;
  box-shadow: 0 1px 0 rgba(0,0,0,0.2) !important;
}
.header .title { font-size: 16px !important; margin: 0 !important; color: #f2f3f5 !important; }
.header .sub { color: #949ba4 !important; font-size: 12px !important; margin-left: auto !important; }
.timeline {
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  overflow: visible !important;
  padding: 8px 0 24px !important;
}
.msg {
  display: grid !important;
  grid-template-columns: 40px 1fr !important;
  gap: 12px !important;
  padding: 6px 16px !important;
  border-bottom: 0 !important;
}
.msg:hover { background: rgba(0,0,0,0.08) !important; }
.avatar { width: 40px !important; height: 40px !important; border-radius: 50% !important; margin-top: 2px !important; }
.author { font-weight: 600 !important; color: #f2f3f5 !important; }
.time { color: #949ba4 !important; font-size: 0.75rem !important; }
.embed {
  margin-top: 6px !important;
  border-radius: 4px !important;
  background: #2b2d31 !important;
  max-width: 520px !important;
}
.att-media a, .att-file a, .embed-title { color: #00a8fc !important; }
`;

const TRANSCRIPT_MOBILE_CSS = `
/* markdown Discord: citazioni, codice, spoiler, titoli, elenchi, link */
.md-quote { margin: 4px 0; padding: 0 0 0 12px; border-left: 4px solid #4e5058; color: #dbdee1; }
pre.codeblock { margin: 6px 0; padding: 8px 10px; max-width: 100%; overflow-x: auto; background: #2b2d31; border: 1px solid #1e1f22; border-radius: 6px; }
pre.codeblock code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em; line-height: 1.45; color: #dbdee1; white-space: pre; }
.spoiler { background: #1e1f22; color: transparent; border-radius: 4px; padding: 0 2px; cursor: pointer; transition: color .15s, background .15s; }
.spoiler:hover, .spoiler:focus { background: rgba(255,255,255,0.08); color: inherit; }
.md-h { font-weight: 700; color: #f2f3f5; margin: 8px 0 2px; line-height: 1.25; }
.md-h1 { font-size: 1.5em; } .md-h2 { font-size: 1.25em; } .md-h3 { font-size: 1.05em; }
.md-sub { font-size: 0.78em; color: #949ba4; }
ul.md-list { margin: 2px 0; padding-left: 22px; }
ul.md-list li { margin: 1px 0; }
a.md-link { color: #00a8fc; text-decoration: none; word-break: break-all; }
a.md-link:hover { text-decoration: underline; }
.mention { border-radius: 3px; padding: 0 2px; font-weight: 500; background: rgba(88,101,242,0.3); color: #c9cdfb; }
html, body, body * {
  letter-spacing: normal !important;
  word-spacing: normal !important;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
}
.msg { grid-template-columns: 40px minmax(0, 1fr) !important; }
.time {
  white-space: nowrap !important;
  font-variant-numeric: tabular-nums !important;
}
.content, .embed-description, .embed-field-value, .embed-title, .embed-footer {
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
.inline-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  font-size: 0.9em !important;
  padding: 0.1em 0.35em !important;
  border-radius: 4px !important;
  background: rgba(0,0,0,0.35) !important;
}
@media (max-width: 720px) {
  html, body { overflow-x: hidden !important; -webkit-text-size-adjust: 100%; }
  .header {
    flex-wrap: wrap !important;
    align-items: flex-start !important;
    gap: 4px 8px !important;
    padding: 10px 12px !important;
  }
  .header-hash { font-size: 18px !important; margin-top: 1px !important; }
  .title, .header .title {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    font-size: 14px !important;
    line-height: 1.25 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  .sub, .header .sub {
    margin-left: 26px !important;
    width: calc(100% - 26px) !important;
    flex: 1 0 100% !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
    white-space: normal !important;
    overflow-wrap: break-word !important;
  }
  .timeline { padding: 4px 0 20px !important; }
  .msg {
    grid-template-columns: 32px minmax(0, 1fr) !important;
    gap: 8px !important;
    padding: 8px 10px !important;
  }
  .avatar { width: 32px !important; height: 32px !important; }
  .meta { gap: 4px 6px !important; }
  .author { font-size: 0.95rem !important; }
  .time {
    white-space: normal !important;
    font-size: 0.7rem !important;
    line-height: 1.3 !important;
  }
  .content { font-size: 0.95rem !important; }
  .embed {
    max-width: 100% !important;
    width: 100% !important;
    padding: 8px 10px 10px !important;
  }
  .embed-layout.has-thumb {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .embed-thumb-wrap {
    display: flex !important;
    justify-content: flex-start !important;
  }
  .embed-thumb {
    width: 72px !important;
    height: 72px !important;
  }
  .embed-fields {
    grid-template-columns: 1fr !important;
  }
  .embed-image,
  .att-media,
  .att-image,
  .att-video {
    max-width: 100% !important;
    max-height: min(55vh, 360px) !important;
  }
  .att-sticker { width: 112px !important; height: 112px !important; }
  .action-row {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  .discord-btn {
    width: 100% !important;
    max-width: 100% !important;
    white-space: normal !important;
    text-align: center !important;
    min-height: 36px !important;
    padding: 8px 12px !important;
  }
  .comp-chip { max-width: 100% !important; white-space: normal !important; }
  .custom-emoji.is-jumbo { width: 40px !important; height: 40px !important; }
}
`;

function isModernTranscriptHtml(html?) {
  const s = String(html || "");
  return (
    s.includes('data-vc-tx-modern="1"') ||
    s.includes("header-hash") ||
    s.includes("data-vc-tx-upgrade=")
  );
}

function injectHeadSnippet(html?, snippet?) {
  const raw = String(html || "");
  if (!raw || !snippet) return raw;
  if (/<\/head>/i.test(raw)) return raw.replace(/<\/head>/i, `${snippet}</head>`);
  return `${snippet}${raw}`;
}

function ensureTranscriptMobileCss(html?) {
  let raw = String(html || "");
  if (!raw) return raw;
    raw = raw.replace(/<style\s+data-vc-tx-mobile="[^"]*"[\s\S]*?<\/style>/gi, "");
  raw = raw.replace(/<script\s+data-vc-tx-mobile="[^"]*"[\s\S]*?<\/script>/gi, "");
  return injectHeadSnippet(
    raw,
    `<style data-vc-tx-mobile="2">${TRANSCRIPT_MOBILE_CSS}</style>` +
      `<script data-vc-tx-mobile="2">document.documentElement.setAttribute("data-vc-tx-mobile","2");</script>`,
  );
}

function upgradeMarkdownInStoredHtml(html?) {
  const raw = String(html || "");
  if (!raw) return raw;
    return raw
    .replace(/\*\*([^*<>\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_<>\n]+)__/g, "<u>$1</u>")
    .replace(/~~([^~<>\n]+)~~/g, "<s>$1</s>");
}

function upgradeLegacyTranscriptHtml(html?) {
  let raw = String(html || "");
  if (!raw) return raw;
  if (!isModernTranscriptHtml(raw)) {
    const inject =
      `<style data-vc-tx-upgrade="1">${LEGACY_TRANSCRIPT_UPGRADE_CSS}</style>` +
      `<script data-vc-tx-upgrade="1">document.documentElement.setAttribute("data-vc-tx-modern","1");</script>`;
    raw = injectHeadSnippet(raw, inject);
  }
  raw = upgradeMarkdownInStoredHtml(raw);
  return ensureTranscriptMobileCss(raw);
}

export = { TRANSCRIPT_MOBILE_CSS, upgradeLegacyTranscriptHtml };
