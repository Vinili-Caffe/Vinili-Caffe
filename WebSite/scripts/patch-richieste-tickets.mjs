#!/usr/bin/env node
/** Inietta Tickets nel dropdown Richieste dove manca (sorgente HTML). */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));

const ticketNavRow =
  '<a class="vc-snav-row" href="/tickets/"><span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-ticket"></i></span><span data-i18n="nav.tickets">Tickets</span></a>';
const ticketNavRowTpl =
  '<a class="vc-snav-row" href="{{TICKETS_PAGE_URL}}"><span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-ticket"></i></span><span data-i18n="nav.tickets">Tickets</span></a>';

function walkHtml(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkHtml(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

function ensureTickets(html) {
  let next = String(html || "");
  const hasTicket = (inner) =>
    /fa-ticket|TICKETS_PAGE_URL|SUPPORTO_PAGE_URL|nav\.tickets|href="\/tickets\//i.test(inner);

  const patterns = [
    /(<summary class="vc-snav-summary"><span[^>]*>\s*Richieste\s*<\/span>[\s\S]*?<div class="vc-snav-panel">)([\s\S]*?)(<\/div>\s*<\/details>)/gi,
    /(<summary class="vc-snav-summary"><span[^>]*data-i18n="nav\.requests"[^>]*>[\s\S]*?<\/span>[\s\S]*?<div class="vc-snav-panel">)([\s\S]*?)(<\/div>\s*<\/details>)/gi,
  ];

  for (const re of patterns) {
    next = next.replace(re, (full, open, inner, close) => {
      if (hasTicket(inner)) return full;
      let patched = String(inner || "");
      const row = /\{\{/.test(patched) ? ticketNavRowTpl : ticketNavRow;
      if (/\{\{RICHIESTE_SUGGERIMENTI_URL\}\}/.test(patched)) {
        patched = patched.replace(
          /(<a class="vc-snav-row(?:\s+vc-snav-row--active)?" href="\{\{RICHIESTE_SUGGERIMENTI_URL\}\}"[\s\S]*?<\/a>)/i,
          `$1\n                ${row}`,
        );
      } else if (/\/suggerimenti\//.test(patched)) {
        patched = patched.replace(
          /(<a class="vc-snav-row(?:\s+vc-snav-row--active)?" href="[^"]*suggerimenti[^"]*"[\s\S]*?<\/a>)/i,
          `$1\n              ${row}`,
        );
      } else {
        patched = `${patched.replace(/\s*$/, "")}\n                ${row}\n              `;
      }
      return `${open}${patched}${close}`;
    });
  }
  return next;
}

let patched = 0;
for (const file of walkHtml(ROOT)) {
  const before = readFileSync(file, "utf8");
  if (!/Richieste/.test(before)) continue;
  const after = ensureTickets(before);
  if (after !== before) {
    writeFileSync(file, after, "utf8");
    patched += 1;
    console.log("patched", relative(ROOT, file));
  }
}
console.log("done", patched);
