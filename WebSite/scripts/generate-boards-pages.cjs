const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FAQ = fs.readFileSync(path.join(ROOT, "faq", "index.html"), "utf8");
const V = "20260919bachecaInvia1";

/** Prodotto: Bacheca (IT). Route base /bacheca. */
const PAGES = {
  index: {
    dir: "bacheca",
    title: "Bacheca",
    desc: "Bacheca di server e bot Discord della community Vinili & Caffè.",
    url: "https://www.viniliecaffe.it/bacheca/",
    page: "hub",
    kicker: "boards.kicker",
    kicker_it: "Vinili & Caffè",
    h1: "boards.title",
    h1_it: "Bacheca",
    lead: "boards.lead",
    lead_it:
      "Scopri server e bot della community, pubblica la tua scheda e falla crescere con voti e bump.",
    scripts: ["vc-boards-browse.js"],
    icon: "fa-th-large",
  },
  servers: {
    dir: "bacheca/server",
    title: "Bacheca · Server",
    desc: "Server Discord in Bacheca — Vinili & Caffè.",
    url: "https://www.viniliecaffe.it/bacheca/server/",
    page: "servers",
    kicker: "boards.serversKicker",
    kicker_it: "Bacheca",
    h1: "boards.serversTitle",
    h1_it: "Server Discord",
    lead: "boards.serversLead",
    lead_it: "Schede server approvate, ordinate per punteggio, voti o bump.",
    scripts: ["vc-boards-browse.js"],
    icon: "fa-server",
  },
  bots: {
    dir: "bacheca/bot",
    title: "Bacheca · Bot",
    desc: "Bot Discord in Bacheca — Vinili & Caffè.",
    url: "https://www.viniliecaffe.it/bacheca/bot/",
    page: "bots",
    kicker: "boards.botsKicker",
    kicker_it: "Bacheca",
    h1: "boards.botsTitle",
    h1_it: "Bot Discord",
    lead: "boards.botsLead",
    lead_it: "Schede bot approvate dallo staff Vinili & Caffè.",
    scripts: ["vc-boards-browse.js"],
    icon: "fa-robot",
  },
  view: {
    dir: "bacheca/scheda",
    title: "Bacheca · Scheda",
    desc: "Scheda in Bacheca — Vinili & Caffè.",
    url: "https://www.viniliecaffe.it/bacheca/scheda/",
    page: "view",
    kicker: "boards.detailKicker",
    kicker_it: "Scheda",
    h1: "boards.detailTitle",
    h1_it: "Dettaglio",
    lead: "boards.detailLead",
    lead_it: "Invita, vota o fai bump a questa scheda.",
    scripts: ["vc-boards-browse.js"],
    icon: "fa-id-card-o",
  },
  submit: {
    dir: "bacheca/invia",
    title: "Bacheca · Invia",
    desc: "Pubblica un server o un bot in Bacheca.",
    url: "https://www.viniliecaffe.it/bacheca/invia/",
    page: "submit",
    kicker: "boards.submitKicker",
    kicker_it: "Proprietario",
    h1: "boards.submitTitle",
    h1_it: "Invia scheda",
    lead: "boards.submitLead",
    lead_it: "Claim automatico per i server; i bot restano in attesa fino a conferma dello staff.",
    scripts: ["vc-boards-manage.js"],
    icon: "fa-plus-circle",
  },
  manage: {
    dir: "bacheca/le-mie",
    title: "Bacheca · Le mie schede",
    desc: "Gestisci le tue schede in Bacheca.",
    url: "https://www.viniliecaffe.it/bacheca/le-mie/",
    page: "manage",
    kicker: "boards.manageKicker",
    kicker_it: "Proprietario",
    h1: "boards.manageTitle",
    h1_it: "Le mie schede",
    lead: "boards.manageLead",
    lead_it: "Banner, colore, testo e tag. I cambiamenti sensibili tornano in moderazione.",
    scripts: ["vc-boards-manage.js"],
    icon: "fa-cog",
  },
  mod: {
    dir: "bacheca/mod",
    title: "Bacheca · Moderazione",
    desc: "Coda moderazione Bacheca.",
    url: "https://www.viniliecaffe.it/bacheca/mod/",
    page: "mod",
    kicker: "boards.modKicker",
    kicker_it: "Staff",
    h1: "boards.modTitle",
    h1_it: "Moderazione Bacheca",
    lead: "boards.modLead",
    lead_it: "Approva, rifiuta o sospendi le schede in coda.",
    scripts: ["vc-boards-mod.js"],
    icon: "fa-gavel",
  },
};

/* Legacy /boards/* → nginx (deploy/nginx-boards-redirect.conf). No HTML stubs. */

const STATIC_NAV = `<nav class="vc-boards-nav" aria-label="Bacheca">
  <a href="/bacheca/">Home</a>
  <a href="/bacheca/server/">Server</a>
  <a href="/bacheca/bot/">Bot</a>
  <a href="/bacheca/invia/">Invia</a>
  <a href="/bacheca/le-mie/">Le mie</a>
</nav>`;

function staticRoot(page) {
  if (page === "submit") {
    return `${STATIC_NAV}
<div class="mt-4" data-vc-boards-static="submit">
  <div class="vc-boards-kind-tabs">
    <button type="button" class="vc-boards-btn" id="vc-boards-tab-server">Server</button>
    <button type="button" class="vc-boards-btn vc-boards-btn--ghost" id="vc-boards-tab-bot">Bot</button>
  </div>
  <p class="vc-boards-hint" id="vc-boards-kind-hint">Solo i server dove sei owner/admin e c’è già il bot Vinili &amp; Caffè. Accedi con Discord per caricare l’elenco.</p>
  <form class="vc-boards-form mt-3" id="vc-boards-submit-form">
    <label id="vc-boards-guild-wrap">Server Discord<select id="vc-boards-guild"><option value="">Accedi per vedere i server…</option></select></label>
    <label class="vc-boards-bot-only" hidden>Bot Client ID<input id="vc-boards-bot-id" inputmode="numeric" autocomplete="off" /></label>
    <label class="vc-boards-bot-only" hidden>Nome bot<input id="vc-boards-bot-name" maxlength="100" /></label>
    <label>Tagline<input id="vc-boards-tagline" maxlength="160" placeholder="Una riga che spiega il progetto" /></label>
    <label>Descrizione<textarea id="vc-boards-desc" maxlength="2000" placeholder="Cosa offre, regole, vibes…"></textarea></label>
    <label>Invite URL (https)<input id="vc-boards-invite" type="url" placeholder="https://discord.gg/…" /></label>
    <label class="vc-boards-bot-only" hidden>Link invita bot<input id="vc-boards-bot-invite" type="url" /></label>
    <label>Tag (virgola)<input id="vc-boards-tags" placeholder="gaming, community, italiano" /></label>
    <label>Banner URL<input id="vc-boards-banner" type="url" /></label>
    <label>Colore accent (#rrggbb)<input id="vc-boards-accent" placeholder="#d4a888" maxlength="7" /></label>
    <label>Testo lungo<textarea id="vc-boards-md" maxlength="4000" placeholder="Dettagli extra (testo semplice)"></textarea></label>
    <button type="submit" class="vc-boards-btn vc-boards-btn--primary"><i class="fa fa-paper-plane" aria-hidden="true"></i> Invia in moderazione</button>
  </form>
  <div id="vc-boards-msg" class="vc-boards-msg mt-4" hidden></div>
</div>`;
  }
  if (page === "hub") {
    return `${STATIC_NAV}
<div class="vc-boards-hub mt-4" data-vc-boards-static="hub">
  <div class="vc-boards-hub__cats">
    <a class="vc-boards-hub-card" href="/bacheca/server/"><span class="vc-boards-hub-card__k">Directory</span><h2>Server Discord</h2><p>Community verificate con il bot Vinili: vota, esplora e invita.</p></a>
    <a class="vc-boards-hub-card" href="/bacheca/bot/"><span class="vc-boards-hub-card__k">Directory</span><h2>Bot Discord</h2><p>Bot utili della community, con schede moderate dallo staff.</p></a>
  </div>
  <div class="vc-boards-hub__actions">
    <a class="vc-boards-hub-mini" href="/bacheca/invia/"><i class="fa fa-plus-circle" aria-hidden="true"></i><span><strong>Pubblica scheda</strong><span>Server con bot Vinili, oppure bot in revisione</span></span></a>
    <a class="vc-boards-hub-mini" href="/bacheca/le-mie/"><i class="fa fa-cog" aria-hidden="true"></i><span><strong>Le mie schede</strong><span>Banner, colore, tag e invite</span></span></a>
  </div>
</div>`;
  }
  return `${STATIC_NAV}
<div class="vc-boards-empty mt-4" data-vc-boards-static="loading">Caricamento…</div>`;
}

function buildMain(meta) {
  return `    <main class="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-28 sm:pt-32">
      <section class="vc-support-page-hero vc-regole-hero-card mb-6 sm:mb-8" aria-labelledby="vc-boards-hero-heading">
        <div class="max-w-3xl">
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-[rgba(212,168,136,0.78)]" data-i18n="${meta.kicker}">${meta.kicker_it}</p>
          <h1 id="vc-boards-hero-heading" class="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            <span class="text-[#ead4c0]" data-i18n="${meta.h1}">${meta.h1_it}</span>
          </h1>
          <p class="mt-4 max-w-2xl text-base leading-7 text-slate-200/88 sm:text-lg" data-i18n="${meta.lead}">${meta.lead_it}</p>
        </div>
      </section>
      <div id="vc-boards-root" class="vc-boards-root" aria-live="polite">
${staticRoot(meta.page)}
      </div>
    </main>`;
}

function injectSiteNav(html) {
  if (/data-i18n="nav\.bacheca"/.test(html)) return html;
  const navRow =
    '<a class="vc-snav-row" href="/bacheca/"><span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-th-large"></i></span><span data-i18n="nav.bacheca">Bacheca</span></a>';
  html = html.replace(
    /(<a class="vc-snav-row"[^>]*href="[^"]*ruoli[^"]*"[^>]*>[\s\S]*?<\/a>)/i,
    `$1\n                ${navRow}`,
  );
  if (!/data-i18n="footer\.bacheca"/.test(html)) {
    html = html.replace(
      /(<li><a href="[^"]*ruoli[^"]*"[^>]*data-i18n="footer\.roles"[^>]*>[\s\S]*?<\/a><\/li>)/i,
      `$1\n                <li><a href="/bacheca/" data-i18n="footer.bacheca">Bacheca</a></li>`,
    );
  }
  return html;
}

for (const meta of Object.values(PAGES)) {
  meta.staff_gate = true;
  meta.robots = "noindex, nofollow";

  let html = FAQ;
  html = html.replace(/(href|src)="\.\.\/(css|js)\//g, '$1="/$2/');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${meta.title}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"/i,
    `<meta name="description" content="${meta.desc}"`,
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/i,
    `<meta property="og:title" content="Vinili &amp; Caffè | ${meta.title}"`,
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"/i,
    `<meta property="og:description" content="${meta.desc}"`,
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"/i,
    `<meta property="og:url" content="${meta.url}"`,
  );
  html = html.replace(
    /<meta name="robots" content="[^"]*"/i,
    `<meta name="robots" content="${meta.robots}"`,
  );
  html = html.replace(/<main\b[\s\S]*?<\/main>/i, buildMain(meta));
  html = html.replace(/<body\b([^>]*)>/i, (m, a) => {
    // class PRIMA del data-attr (altrimenti "vc-boards-page" matcha dentro data-vc-boards-page)
    if (!/ class="[^"]*\bvc-boards-page\b/.test(a)) {
      if (/ class="/.test(a)) a = a.replace(/ class="/, ' class="vc-boards-page ');
      else a += ' class="vc-boards-page"';
    }
    if (!/data-vc-boards-page=/.test(a)) a += ` data-vc-boards-page="${meta.page}"`;
    return `<body${a}>`;
  });
  html = injectSiteNav(html);
  // FAQ attiva → togli active; attiva voce Bacheca se hub-ish
  html = html.replace(
    /<a class="vc-snav-row vc-snav-row--active" href="\/faq\/"[^>]*>/i,
    '<a class="vc-snav-row" href="/faq/">',
  );
  html = html.replace(
    /(<a class="vc-snav-row" href="\/bacheca\/">)/i,
    '<a class="vc-snav-row vc-snav-row--active" href="/bacheca/" aria-current="page">',
  );
  if (!html.includes("vc-boards.css")) {
    html = html.replace(
      'id="vc-image-lightbox-css" />',
      `id="vc-image-lightbox-css" />\n<link rel="stylesheet" href="/css/vc-boards.css?v=${V}" id="vc-boards-css" />`,
    );
  }
  let scripts = `    <script>
      window.__VC_BOARDS = {
        apiUrl: "/webhooks/site-boards",
        apiUrlLocal: "http://127.0.0.1:3042/webhooks/site-boards",
        page: "${meta.page}",
        staffOnly: true,
        basePath: "/bacheca"
      };
    </script>
<script src="/js/vc-boards-api.js?v=${V}" defer></script>
`;
  for (const s of meta.scripts) {
    scripts += `<script src="/js/${s}?v=${V}" defer></script>\n`;
  }
  // Solo vc-access-gate (niente staff-access-gate: iniettava gate stale e faceva race)
  scripts = `<script src="/js/vc-access-gate.js?v=${V}" defer></script>\n` + scripts;
  const faqRe =
    /<script src="\/js\/vc-regole-acc-utils\.js[\s\S]*?<script src="\/js\/faq-page\.js[^"]*" defer><\/script>\s*/i;
  if (faqRe.test(html)) html = html.replace(faqRe, scripts);
  else {
    html = html.replace(
      '<script src="/js/faq-page.js?v=20260907faqRegoleSwitcher2" defer></script>',
      scripts,
    );
  }
  const outDir = path.join(ROOT, meta.dir);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "index.html");
  fs.writeFileSync(out, html);
  console.log("wrote", path.relative(ROOT, out), fs.statSync(out).size);
}
