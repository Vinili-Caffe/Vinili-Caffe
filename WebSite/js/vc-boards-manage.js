/**
 * Bacheca — wizard Aggiungi (auth → claim → tutorial → form → bozza → review) + le mie.
 * boardsCineRestore2: niente kill cine globale su manage/submit/mod
 */
(function () {
  "use strict";

  /* boardsBannerHttps1: Discord CDN banner sempre https (no mixed content) */
  /* boardsFeatures1 + boardsDeformat2: backtick/quote via + clamp paste breve 160 */
  /* boardsTaglinePasteKeep1: paste breve tiene spazi/a capo; niente maxlength nativo (incolla lunghi → taglia) */
  /* boardsNoAutoDeformat1: MAI strip markdown su paste/input; solo bottone Deformatta; data-maxlength ok */
  /* boardsTaglineSoftLimit1: breve = stesso textarea della lunga; paste libero, cap 160 solo in JS */
  /* boardsTaglineOverCount1: niente taglio — counter in negativo oltre 160, blocca solo in invio */
  /* boardsKeepMdDraft1: bozza NON deve strippare md; value dopo mount + preferisci localDraft */
  /* boardsNoBlurStrip1: mai riscrivere value dopo bozza; Deformatta fuori dal label + confirm */
  /* boardsTagline500: descrizione breve max 500 */
  /* boardsReqStarPos1: * obbligatorio attaccato al testo (no grid-item a parte) */
  /* boardsReviewUi1: tab Revisione = hero + stato + checklist compatta (no pill verdi) */
  /* boardsMineEditor1: Le mie = lista card + stesso editor Pubblica (no form piatto) */
  /* boardsMinePreview1: card In revisione → anteprima scheda; Bozze in sezione dedicata */
  /* boardsMineList1: lista breve server sempre in apertura (no auto-editor se 1 sola);
     card stile claim; editor = stessi campi Pubblica; Genera invite cablato; Indietro sempre */
  /* boardsLinkCheck1: ✓/✗ su social, sito, invite, banner (probe live) */
  /* boardsLinkCheck2: soft ✓ se social anti-bot (IG 429) */
  /* boardsDiscordMd1: stessa markdown chat Discord su breve/lunga + anteprima */
  /* boardsSocialSvgAll1: tutti i social con logo SVG ufficiale */
  /* boardsDraftBadge1: badge Bozza sand/bronzo */

  /* boardsGenInvite2: Genera invite più robusto + errori chiari */
  /* boardsAccentCustom1: picker custom (click sul hex) — niente native Windows "Canale…" */
  /* boardsAccentHueDrag1: hue non si resetta a rosso (skip hex→hsv da picker;
     drag pointer sulla barra; accent conta come bozza). */
  /* boardsRequiredStar1: asterisco sui campi obbligatori (tutti i form bacheca) */
  /* boardsStepsBack1: click su passi fatti → torna indietro */
  /* boardsGuildsRelogin1: re-login con scope guilds (non solo identify) */
  /* boardsSubmitResume1: refresh su Pubblica ripristina server + bozza form */
  /* boardsSubmitPickFirst1: tab Pubblica/invia senza guildId → sempre scelta server
     (no auto-apertura bozza da sessionStorage). Resume solo con ?guildId= / continua. */
  /* boardsCatsTagsIt1 + boardsTagsPick1 + boardsMaxCatsTags12 */
  var CAT_LABELS = {
    community: "Community",
    social: "Social",
    amicizia: "Amicizia",
    chiacchiere: "Chiacchiere",
    chill: "Chill / Vocal",
    hangout: "Hangout",
    "late-night": "Late night",
    eventi: "Eventi",
    tornei: "Tornei",
    quiz: "Quiz / Trivia",
    italia: "Italia",
    international: "Internazionale",
    lingue: "Lingue",
    "language-exchange": "Language exchange",
    gaming: "Gaming",
    esports: "Esports",
    clan: "Clan / Team",
    "indie-games": "Indie games",
    speedrun: "Speedrun",
    minecraft: "Minecraft",
    roblox: "Roblox",
    fortnite: "Fortnite",
    valorant: "Valorant",
    lol: "League of Legends",
    gta: "GTA",
    fivem: "FiveM / RP",
    genshin: "Genshin / gacha",
    honkai: "Honkai",
    zenless: "Zenless Zone Zero",
    pokemon: "Pokémon",
    apex: "Apex Legends",
    overwatch: "Overwatch",
    rust: "Rust",
    warzone: "Warzone / CoD",
    "rocket-league": "Rocket League",
    osu: "osu!",
    smash: "Smash Bros",
    nintendo: "Nintendo",
    fps: "FPS",
    mmo: "MMO / RPG",
    "mobile-games": "Giochi mobile",
    "retro-games": "Retro / Emulazione",
    "giochi-tavolo": "Giochi da tavolo",
    dnd: "D&D / TTRPG",
    musica: "Musica",
    karaoke: "Karaoke",
    radio: "Radio",
    podcast: "Podcast",
    dj: "DJ",
    producer: "Producer / Beatmaking",
    kpop: "K-pop",
    jpop: "J-pop",
    metal: "Metal",
    hiphop: "Hip-hop / Rap",
    stream: "Streaming",
    vtuber: "VTuber",
    "twitch-creators": "Creator Twitch",
    "youtube-creators": "Creator YouTube",
    anime: "Anime",
    manga: "Manga",
    otaku: "Otaku",
    cosplay: "Cosplay",
    roleplay: "Roleplay",
    "city-rp": "City RP",
    fantasy: "Fantasy",
    horror: "Horror",
    scifi: "Sci-Fi",
    mystery: "Mystery",
    "true-crime": "True crime",
    fumetti: "Fumetti",
    memes: "Memes",
    art: "Arte",
    creativita: "Creatività",
    design: "Design",
    "3d-art": "3D / Blender",
    editing: "Video editing",
    photography: "Fotografia",
    scrittura: "Scrittura",
    teatro: "Teatro",
    ballo: "Ballo / Dance",
    cinema: "Cinema",
    movies: "Film",
    series: "Serie TV",
    books: "Libri",
    "book-club": "Book club",
    istruzione: "Istruzione",
    studio: "Studio",
    universita: "Università",
    coding: "Coding",
    tech: "Tech",
    ai: "AI",
    "bot-dev": "Sviluppo bot",
    opensource: "Open source",
    crypto: "Crypto",
    trading: "Trading",
    business: "Business",
    lavoro: "Lavoro",
    freelance: "Freelance",
    marketing: "Marketing",
    science: "Scienza",
    spazio: "Spazio",
    storia: "Storia",
    filosofia: "Filosofia",
    sports: "Sport",
    calcio: "Calcio",
    basket: "Basket",
    tennis: "Tennis",
    formula1: "Formula 1",
    fitness: "Fitness",
    outdoor: "Outdoor",
    animali: "Animali",
    food: "Food",
    cucina: "Cucina",
    viaggi: "Viaggi",
    travel: "Travel",
    moda: "Moda",
    fashion: "Fashion",
    bellezza: "Bellezza",
    salute: "Salute",
    lifestyle: "Lifestyle",
    auto: "Auto",
    moto: "Moto",
    faidate: "Fai da te",
    collezionismo: "Collezionismo",
    vinili: "Vinili / Musica fisica",
    cafe: "Caffè / Chill café",
    dating: "Dating",
    lgbt: "LGBTQ+",
    nsfw: "NSFW",
    giveaway: "Giveaway",
    partnership: "Partnership",
    support: "Supporto",
    news: "Notizie",
    altro: "Altro",
  };
  /* boardsCatMenuFa1: FA icons (no Twemoji ZWJ breakage) */
  var CAT_ICO = {
    community: "fa-users",
    social: "fa-comments",
    amicizia: "fa-handshake-o",
    chiacchiere: "fa-commenting-o",
    chill: "fa-coffee",
    hangout: "fa-coffee",
    "late-night": "fa-moon-o",
    eventi: "fa-calendar",
    tornei: "fa-trophy",
    quiz: "fa-question-circle",
    italia: "fa-flag",
    international: "fa-globe",
    lingue: "fa-language",
    "language-exchange": "fa-exchange",
    gaming: "fa-gamepad",
    esports: "fa-trophy",
    clan: "fa-shield",
    "indie-games": "fa-puzzle-piece",
    speedrun: "fa-fighter-jet",
    minecraft: "fa-cube",
    roblox: "fa-cubes",
    fortnite: "fa-paper-plane",
    valorant: "fa-crosshairs",
    lol: "fa-shield",
    gta: "fa-car",
    fivem: "fa-taxi",
    genshin: "fa-star",
    honkai: "fa-star-o",
    zenless: "fa-bolt",
    pokemon: "fa-paw",
    apex: "fa-crosshairs",
    overwatch: "fa-bullseye",
    rust: "fa-fire",
    warzone: "fa-bomb",
    "rocket-league": "fa-futbol-o",
    osu: "fa-circle-o",
    smash: "fa-hand-rock-o",
    nintendo: "fa-gamepad",
    fps: "fa-bullseye",
    mmo: "fa-map",
    "mobile-games": "fa-mobile",
    "retro-games": "fa-history",
    "giochi-tavolo": "fa-th",
    dnd: "fa-magic",
    musica: "fa-music",
    karaoke: "fa-microphone",
    radio: "fa-rss",
    podcast: "fa-microphone",
    dj: "fa-headphones",
    producer: "fa-headphones",
    kpop: "fa-heart",
    jpop: "fa-heart-o",
    metal: "fa-fire",
    hiphop: "fa-music",
    stream: "fa-video-camera",
    vtuber: "fa-user-circle",
    "twitch-creators": "fa-video-camera",
    "youtube-creators": "fa-play-circle",
    anime: "fa-heart",
    manga: "fa-book",
    otaku: "fa-star-o",
    cosplay: "fa-user-secret",
    roleplay: "fa-magic",
    "city-rp": "fa-building",
    fantasy: "fa-magic",
    horror: "fa-moon-o",
    scifi: "fa-rocket",
    mystery: "fa-search",
    "true-crime": "fa-gavel",
    fumetti: "fa-picture-o",
    memes: "fa-smile-o",
    art: "fa-paint-brush",
    creativita: "fa-lightbulb-o",
    design: "fa-pencil",
    "3d-art": "fa-cube",
    editing: "fa-film",
    photography: "fa-camera",
    scrittura: "fa-pencil-square-o",
    teatro: "fa-ticket",
    ballo: "fa-music",
    cinema: "fa-film",
    movies: "fa-film",
    series: "fa-television",
    books: "fa-book",
    "book-club": "fa-book",
    istruzione: "fa-graduation-cap",
    studio: "fa-leanpub",
    universita: "fa-university",
    coding: "fa-code",
    tech: "fa-cogs",
    ai: "fa-android",
    "bot-dev": "fa-terminal",
    opensource: "fa-code-fork",
    crypto: "fa-btc",
    trading: "fa-line-chart",
    business: "fa-briefcase",
    lavoro: "fa-suitcase",
    freelance: "fa-laptop",
    marketing: "fa-bullhorn",
    science: "fa-flask",
    spazio: "fa-rocket",
    storia: "fa-bank",
    filosofia: "fa-balance-scale",
    sports: "fa-futbol-o",
    calcio: "fa-futbol-o",
    basket: "fa-circle",
    tennis: "fa-circle",
    formula1: "fa-road",
    fitness: "fa-heartbeat",
    outdoor: "fa-tree",
    animali: "fa-paw",
    food: "fa-cutlery",
    cucina: "fa-cutlery",
    viaggi: "fa-plane",
    travel: "fa-suitcase",
    moda: "fa-shopping-bag",
    fashion: "fa-shopping-bag",
    bellezza: "fa-diamond",
    salute: "fa-medkit",
    lifestyle: "fa-leaf",
    auto: "fa-car",
    moto: "fa-bicycle",
    faidate: "fa-wrench",
    collezionismo: "fa-archive",
    vinili: "fa-music",
    cafe: "fa-coffee",
    dating: "fa-heart",
    lgbt: "fa-flag",
    nsfw: "fa-eye-slash",
    giveaway: "fa-gift",
    partnership: "fa-handshake-o",
    support: "fa-life-ring",
    news: "fa-newspaper-o",
    altro: "fa-star",
  };
  function catIcoHtml(key) {
    var ico = CAT_ICO[key] || "fa-tag";
    return '<i class="fa ' + ico + '" aria-hidden="true"></i>';
  }
  /* boardsLocalesDd32: catalogo completo + bandiere via .vc-lang-flag--xx */
  var LOCALE_LABELS = {
    it: "Italiano",
    en: "English",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    pt: "Português",
    ru: "Русский",
    zh: "中文",
    ja: "日本語",
    ko: "한국어",
    ar: "العربية",
    nl: "Nederlands",
    pl: "Polski",
    tr: "Türkçe",
    hi: "हिन्दी",
    id: "Indonesia",
    uk: "Українська",
    vi: "Tiếng Việt",
    ro: "Română",
    sv: "Svenska",
    cs: "Čeština",
    da: "Dansk",
    el: "Ελληνικά",
    fi: "Suomi",
    hu: "Magyar",
    no: "Norsk",
    th: "ไทย",
    he: "עברית",
    bn: "বাংলা",
    ms: "Bahasa Melayu",
    fil: "Filipino",
    ca: "Català",
    sk: "Slovenčina",
    bg: "Български",
    hr: "Hrvatski",
    sr: "Српски",
    sl: "Slovenščina",
    et: "Eesti",
    lv: "Latviešu",
    lt: "Lietuvių",
    fa: "فارسی",
    ur: "اردو",
    sw: "Kiswahili",
    af: "Afrikaans",
    sq: "Shqip",
    ka: "ქართული",
    hy: "Հայերեն",
    az: "Azərbaycan",
    kk: "Қазақша",
    uz: "Oʻzbekcha",
    mn: "Монгол",
    ne: "नेपाली",
    si: "සිංහල",
    my: "မြန်မာ",
    km: "ខ្មែរ",
    lo: "ລາວ",
    am: "አማርኛ",
    ga: "Gaeilge",
    cy: "Cymraeg",
    eu: "Euskara",
    gl: "Galego",
    is: "Íslenska",
    mt: "Malti",
    lb: "Lëtzebuergesch",
    be: "Беларуская",
    mk: "Македонски",
    bs: "Bosanski",
    ta: "தமிழ்",
    te: "తెలుగు",
    yo: "Yorùbá",
  };
  var LOCALE_ORDER = Object.keys(LOCALE_LABELS);
  function localeFlagHtml(code) {
    var c = String(code || "")
      .toLowerCase()
      .replace(/[^a-z0-9\-]/g, "");
    return '<span class="vc-lang-flag vc-lang-flag--' + c + '" aria-hidden="true"></span>';
  }
  /* boardsSocialSvgAll1: tutti i social con logo SVG ufficiale (come TikTok/X) */
  var SOCIAL_SVG =
    '<svg class="vc-boards-social-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="';
  var SOCIAL_META = {
    youtube: {
      label: "YouTube",
      ico: "fa-youtube",
      svg:
        SOCIAL_SVG +
        'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
      placeholder: "@canale",
      prefix: "@",
      hostRe: /(?:youtube\.com\/(?:@|c\/|channel\/)?|youtu\.be\/)/i,
      toUrl: function (h) {
        return "https://www.youtube.com/@" + h;
      },
    },
    twitch: {
      label: "Twitch",
      ico: "fa-twitch",
      svg:
        SOCIAL_SVG +
        'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>',
      placeholder: "nickname",
      prefix: "@",
      hostRe: /twitch\.tv\//i,
      toUrl: function (h) {
        return "https://www.twitch.tv/" + h;
      },
    },
    instagram: {
      label: "Instagram",
      ico: "fa-instagram",
      svg:
        SOCIAL_SVG +
        'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
      placeholder: "@utente",
      prefix: "@",
      hostRe: /instagram\.com\//i,
      toUrl: function (h) {
        return "https://www.instagram.com/" + h;
      },
    },
    tiktok: {
      label: "TikTok",
      ico: "fa-music",
      svg:
        SOCIAL_SVG +
        'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
      placeholder: "@utente",
      prefix: "@",
      hostRe: /tiktok\.com\/@?/i,
      toUrl: function (h) {
        return "https://www.tiktok.com/@" + h;
      },
    },
    x: {
      label: "X",
      ico: "fa-twitter",
      svg:
        SOCIAL_SVG +
        'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
      placeholder: "@utente",
      prefix: "@",
      hostRe: /(?:x\.com\/|twitter\.com\/)/i,
      toUrl: function (h) {
        return "https://x.com/" + h;
      },
    },
    github: {
      label: "GitHub",
      ico: "fa-github",
      svg:
        SOCIAL_SVG +
        'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
      placeholder: "username",
      prefix: "@",
      hostRe: /github\.com\//i,
      toUrl: function (h) {
        return "https://github.com/" + h;
      },
    },
  };
  var SOCIAL_KEYS = Object.keys(SOCIAL_META);
  var INVITE_PREFIX = "https://discord.gg/";
  var HTTPS_PREFIX = "https://";

  function stripInviteSuffix(raw) {
    var v = String(raw || "").trim();
    if (!v) return "";
    v = v.replace(/^https?:\/\/(www\.)?discord\.gg\//i, "");
    v = v.replace(/^https?:\/\/(www\.)?discord\.com\/invite\//i, "");
    v = v.replace(/^discord\.gg\//i, "");
    return v.replace(/^\/+/, "").split(/[?#]/)[0].trim();
  }

  function joinInviteUrl(raw) {
    var v = String(raw || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) {
      var code = stripInviteSuffix(v);
      return code ? INVITE_PREFIX + code : v;
    }
    var suffix = stripInviteSuffix(v);
    return suffix ? INVITE_PREFIX + suffix : "";
  }

  function stripHttpsSuffix(raw) {
    var v = String(raw || "").trim();
    if (!v) return "";
    return v.replace(/^https?:\/\//i, "").replace(/^\/+/, "");
  }

  function schemeFromUrl(raw) {
    var m = String(raw || "")
      .trim()
      .match(/^(https?):\/\//i);
    return m ? String(m[1]).toLowerCase() + "://" : HTTPS_PREFIX;
  }

  function hostRequiresHttps(host) {
    var h = String(host || "")
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, "");
    if (!h) return false;
    return (
      h === "discord.com" ||
      h.endsWith(".discord.com") ||
      h === "discord.gg" ||
      h.endsWith(".discord.gg") ||
      h === "discordapp.com" ||
      h.endsWith(".discordapp.com") ||
      h === "discordapp.net" ||
      h.endsWith(".discordapp.net") ||
      h === "discord.co" ||
      h.endsWith(".discord.co")
    );
  }

  function forceHttpsIfRequired(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    try {
      var parsed = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u.replace(/^\/+/, ""));
      if (hostRequiresHttps(parsed.hostname)) {
        parsed.protocol = "https:";
        return parsed.toString();
      }
      return /^https?:\/\//i.test(u) ? u : parsed.toString();
    } catch (_) {
      if (/^(?:https?:\/\/)?(?:[a-z0-9.-]+\.)?discord(?:app)?\.(?:com|net|gg|co)\b/i.test(u)) {
        return u.replace(/^http:\/\//i, "https://").replace(/^(?!https?:\/\/)/i, "https://");
      }
      return u;
    }
  }

  function joinSchemeUrl(raw, scheme) {
    var v = String(raw || "").trim();
    if (!v) return "";
    var sch = scheme === "http://" ? "http://" : "https://";
    var out = "";
    if (/^https?:\/\//i.test(v)) out = v.replace(/^https?:\/\//i, sch);
    else {
      var suffix = stripHttpsSuffix(v);
      out = suffix ? sch + suffix : "";
    }
    return forceHttpsIfRequired(out);
  }

  function joinHttpsUrl(raw) {
    return joinSchemeUrl(raw, HTTPS_PREFIX);
  }

  function syncSchemePrefixForInput(input) {
    if (!input) return;
    var host = input.closest ? input.closest(".vc-boards-field__control") : null;
    var prefix = host && host.querySelector ? host.querySelector("[data-vc-scheme-toggle]") : null;
    if (!prefix) return;
    var joined = joinSchemeUrl(input.value || "", String(prefix.textContent || "").trim().toLowerCase());
    if (!joined) return;
    try {
      var u = new URL(joined);
      if (hostRequiresHttps(u.hostname) && String(prefix.textContent || "").toLowerCase().indexOf("http://") === 0) {
        prefix.textContent = "https://";
        prefix.setAttribute("title", "Clicca per passare a http://");
      }
    } catch (_) {}
  }

  function readSchemePrefix(inputId) {
    var input = document.getElementById(inputId);
    var host = input && input.closest ? input.closest(".vc-boards-field__control") : null;
    var btn = host && host.querySelector ? host.querySelector("[data-vc-scheme-toggle]") : null;
    var s = String((btn && btn.textContent) || HTTPS_PREFIX)
      .trim()
      .toLowerCase();
    if (s.indexOf("https://") === 0) return "https://";
    if (s.indexOf("http://") === 0) return "http://";
    return HTTPS_PREFIX;
  }

  function schemePrefixBtnHtml(url) {
    var scheme = schemeFromUrl(url);
    var other = scheme === "https://" ? "http://" : "https://";
    /* scheme è solo http://|https:// — niente escape necessario */
    return (
      '<button type="button" class="vc-boards-url-prefix vc-boards-url-prefix--toggle vc-no-sfx" data-vc-scheme-toggle' +
      ' aria-label="Cambia protocollo tra https e http" title="Clicca per passare a ' +
      other +
      '">' +
      scheme +
      "</button>"
    );
  }

  function socialHandleFromValue(key, raw) {
    var v = String(raw || "").trim();
    if (!v) return "";
    var meta = SOCIAL_META[key] || {};
    try {
      if (/^https?:\/\//i.test(v)) {
        var u = new URL(v);
        var path = String(u.pathname || "").replace(/^\/+|\/+$/g, "");
        if (key === "youtube") {
          path = path.replace(/^@/, "").replace(/^(c|channel)\//, "");
        }
        if (key === "tiktok") path = path.replace(/^@/, "");
        return decodeURIComponent(path.split("/")[0] || "").replace(/^@/, "");
      }
    } catch (_) {}
    v = v.replace(/^@+/, "").replace(/^\/+/, "");
    if (meta.hostRe) v = v.replace(meta.hostRe, "");
    return v.split(/[/?#]/)[0].replace(/^@+/, "").trim();
  }

  function socialUrlFromHandle(key, raw) {
    var h = socialHandleFromValue(key, raw);
    if (!h) return "";
    if (/^https?:\/\//i.test(String(raw || "").trim()) && !h) {
      return String(raw || "").trim();
    }
    var meta = SOCIAL_META[key];
    if (!meta || typeof meta.toUrl !== "function") return "";
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(h)) return "";
    return meta.toUrl(h);
  }

  function setMsg(el, text, isErr) {
    /* boardsMsgToast1 */
    if (el) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("vc-boards-msg--err");
    }
    var B = window.VcBoards;
    if (B && typeof B.toastMsg === "function") B.toastMsg(text, isErr);
    else if (window.VcSiteToast) {
      if (!text) window.VcSiteToast.hide();
      else window.VcSiteToast.show(String(text || ""), !!isErr);
    }
  }

  function triggerDiscordLogin(forceGuilds) {
    /* boardsGuildsRelogin1: dalla bacheca forza consent + scope guilds */
    if (forceGuilds) {
      try {
        if (typeof window.__vcDiscordReauthGuilds === "function") {
          window.__vcDiscordReauthGuilds();
          return true;
        }
      } catch (eRe) {}
      try {
        var authUrlFn = window.__vcDiscordAuthUrl;
        var startFn = window.__vcDiscordStartOAuth;
        if (typeof authUrlFn === "function" && typeof startFn === "function") {
          startFn(
            null,
            authUrlFn({
              prompt: "consent",
              scopes: "identify guilds guilds.join",
            }),
          );
          return true;
        }
      } catch (eForce) {}
    }
    try {
      var btn = document.getElementById("discord-login-btn");
      if (btn) {
        btn.click();
        return true;
      }
    } catch (_) {}
    try {
      if (typeof window.__vcDiscordLogin === "function") {
        window.__vcDiscordLogin();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function boot(attempt) {
    var B = window.VcBoards;
    var root = document.getElementById("vc-boards-root");
    if (!root) return;
    if (!B) {
      if ((attempt || 0) < 50) {
        setTimeout(function () {
          boot((attempt || 0) + 1);
        }, 40);
        return;
      }
      if (!root.getAttribute("data-vc-boards-booted")) {
        root.setAttribute("data-vc-boards-booted", "err");
        root.innerHTML =
          '<div class="vc-boards-empty">Impossibile caricare Bacheca. Ricarica la pagina.</div>';
      }
      return;
    }
    if (root.getAttribute("data-vc-boards-booted") === "1") return;
    root.setAttribute("data-vc-boards-booted", "1");

    var page = (document.body && document.body.getAttribute("data-vc-boards-page")) || "";
    page = String(page).trim().toLowerCase();
    /* boardsCineRestore1: manage/submit/mod tengono il layout cine (no kill globale) */
    try {
      if (document.body) document.body.classList.add("vc-boards-page");
    } catch (_) {}

    function needLogin() {
      /* boardsLoginGate1 */
      if (B.showBoardsGate) {
        B.showBoardsGate({ mode: "login" });
        try {
          root.innerHTML = B.navHtml(page === "manage" ? "manage" : "submit");
        } catch (_) {}
      } else {
        root.innerHTML =
          B.navHtml(page === "manage" ? "manage" : "submit") +
          '<div class="vc-boards-wizard mt-4">' +
          '<div class="vc-boards-empty">' +
          '<p data-i18n="boards.loginRequired">Accedi con Discord per continuare.</p>' +
          '<button type="button" class="vc-boards-btn vc-boards-btn--primary mt-3" id="vc-boards-login-cta">' +
          '<i class="fa fa-sign-in" aria-hidden="true"></i> Accedi con Discord</button>' +
          "</div></div>";
        var cta = document.getElementById("vc-boards-login-cta");
        if (cta) {
          cta.addEventListener("click", function () {
            if (!triggerDiscordLogin()) {
              setMsg(document.getElementById("vc-boards-msg"), "Usa il login in alto a destra.", true);
            }
          });
        }
      }
      try {
        if (B.markContentReady) B.markContentReady();
      } catch (eNeed) {}
    }

    function stepsHtml(active) {
      /* boardsFormPolish1 + boardsStepsBack1 */
      var steps = [
        { id: "pick", label: "Scegli" },
        { id: "bot", label: "Bot" },
        { id: "form", label: "Scheda" },
        { id: "review", label: "Revisione" },
      ];
      var order = steps.map(function (s) {
        return s.id;
      });
      var ai = Math.max(0, order.indexOf(active));
      return (
        '<ol class="vc-boards-steps" aria-label="Passi">' +
        steps
          .map(function (s, i) {
            var done = i < ai;
            var cur = i === ai;
            var cls = done ? " is-done" : cur ? " is-active" : "";
            var mark = done
              ? '<i class="fa fa-check" aria-hidden="true"></i>'
              : String(i + 1);
            var inner =
              '<span class="vc-boards-steps__num" aria-hidden="true">' +
              mark +
              '</span><span class="vc-boards-steps__label">' +
              s.label +
              "</span>";
            if (done) {
              return (
                '<li class="vc-boards-steps__item' +
                cls +
                ' is-clickable">' +
                '<button type="button" class="vc-boards-steps__btn vc-no-sfx" data-vc-step="' +
                s.id +
                '" aria-label="Torna a ' +
                s.label +
                '">' +
                inner +
                "</button></li>"
              );
            }
            return (
              '<li class="vc-boards-steps__item' +
              cls +
              '" aria-current="' +
              (cur ? "step" : "false") +
              '">' +
              inner +
              "</li>"
            );
          })
          .join("") +
        "</ol>"
      );
    }

    function checkedVals(name) {
      return Array.prototype.slice
        .call(document.querySelectorAll('input[name="' + name + '"]:checked'))
        .map(function (el) {
          return el.value;
        });
    }

    function collectFormFields(kind) {
      var socials = {};
      SOCIAL_KEYS.forEach(function (k) {
        var el = document.getElementById("vc-boards-social-" + k);
        if (!el) return;
        var url = socialUrlFromHandle(k, el.value);
        if (url) socials[k] = url;
      });
      var paidRadio = document.querySelector('input[name="vc-boards-paid-tier"]:checked');
      var body = {
        tagline: (document.getElementById("vc-boards-tagline") || {}).value || "",
        description: (document.getElementById("vc-boards-desc") || {}).value || "",
        tags: (document.getElementById("vc-boards-tags") || {}).value || "",
        categories: checkedVals("vc-boards-cat"),
        locales: checkedVals("vc-boards-loc"),
        siteUrl: joinSchemeUrl(
          (document.getElementById("vc-boards-site") || {}).value || "",
          readSchemePrefix("vc-boards-site"),
        ),
        socials: socials,
        /* boardsBannerUpload1: URL da upload (hidden) o vuoto */
        bannerUrl: String((document.getElementById("vc-boards-banner") || {}).value || "").trim(),
        accent: (document.getElementById("vc-boards-accent") || {}).value || "",
        inviteUrl: joinInviteUrl((document.getElementById("vc-boards-invite") || {}).value || ""),
        /* boardsFeatures1 */
        features: {
          paidTier: paidRadio && paidRadio.value === "paid" ? "paid" : "free",
          paidFeaturesAvailable: Boolean(
            (document.getElementById("vc-boards-feat-paid-extra") || {}).checked,
          ),
          acceptsPartnerships: Boolean(
            (document.getElementById("vc-boards-feat-partnerships") || {}).checked,
          ),
          requireVerification: Boolean(
            (document.getElementById("vc-boards-feat-verify") || {}).checked,
          ),
        },
      };
      if (kind === "bot") {
        body.name = ((document.getElementById("vc-boards-bot-name") || {}).value || "").trim();
        body.botInviteUrl = (document.getElementById("vc-boards-bot-invite") || {}).value || "";
        body.features.requireVerification = false;
      }
      return body;
    }

    function section(ico, title, sub, body) {
      return (
        '<section class="vc-boards-section">' +
        '<header class="vc-boards-section__head">' +
        '<span class="vc-boards-section__ico" aria-hidden="true"><i class="fa ' +
        ico +
        '"></i></span>' +
        '<div><h3 class="vc-boards-section__title">' +
        title +
        "</h3>" +
        (sub ? '<p class="vc-boards-section__sub">' + sub + "</p>" : "") +
        "</div></header>" +
        '<div class="vc-boards-section__body">' +
        body +
        "</div></section>"
      );
    }

    function fieldHintHtml(hint) {
      var h = String(hint || "").trim();
      if (!h) return "";
      if (/^opzionale\b/i.test(h)) {
        return '<span class="vc-boards-field__hint">' + B.esc(h) + "</span>";
      }
      return (
        '<span class="vc-boards-field__tip vc-no-sfx" tabindex="0" role="note" data-tip="' +
        B.esc(h) +
        '" aria-label="' +
        B.esc(h) +
        '">?</span>'
      );
    }

    /* boardsDeformat1: togli markdown/discord markup da breve/lunga */
    /* boardsDeformat2: niente backtick residui, quote >, clamp breve */
    function stripBoardMarkdown(raw, opts) {
      opts = opts || {};
      var s = String(raw || "");
      s = s.replace(/```[\s\S]*?```/g, function (block) {
        return String(block || "")
          .replace(/^```[^\n]*\n?/, "")
          .replace(/```$/, "");
      });
      /* inline code, anche vuoto / multi */
      s = s.replace(/`+([^`\n]*)`+/g, "$1");
      s = s.replace(/`+/g, "");
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
      s = s.replace(/<(https?:\/\/[^>\s]+)>/gi, "$1");
      s = s.replace(/\|\|([\s\S]*?)\|\|/g, "$1");
      s = s.replace(/^#{1,6}\s+/gm, "");
      s = s.replace(/^>{1,3}\s?/gm, "");
      s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, "$1");
      s = s.replace(/\*\*([^*\n]+)\*\*/g, "$1");
      s = s.replace(/__([^_\n]+)__/g, "$1");
      s = s.replace(/~~([^~\n]+)~~/g, "$1");
      s = s.replace(/\*([^*\n]+)\*/g, "$1");
      s = s.replace(/(^|[\s([{])_([^_\n]+)_(?=[\s)\]}.,!?;:]|$)/g, "$1$2");
      s = s.replace(/^\s*[-*+]\s+/gm, "");
      s = s.replace(/^\s*\d+\.\s+/gm, "");
      s = s.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, ":$1:");
      /* residui marker Discord */
      s = s.replace(/[*_~|]{2,}/g, "");
      s = s.replace(/(^|[\s])[*_~|](?=[\s]|$)/g, "$1");
      s = s.replace(/`+/g, "");
      /* boardsNoAutoDeformat1: anche in Deformatta tieni a capo/spazi (niente collasso a una riga) */
      s = s.replace(/[ \t]+\n/g, "\n");
      s = s.replace(/\n{3,}/g, "\n\n");
      return s.replace(/^\s+|\s+$/g, "");
    }

    function deformatBtnHtml(targetSel) {
      return (
        '<button type="button" class="vc-boards-deformat" data-boards-deformat="' +
        B.esc(String(targetSel || "")) +
        '" title="Rimuovi formattazione markdown" aria-label="Deformatta testo">' +
        "Deformatta</button>"
      );
    }

    function fieldToolsHtml(hint, deformatTarget) {
      return (
        '<span class="vc-boards-field__tools">' +
        (deformatTarget ? deformatBtnHtml(deformatTarget) : "") +
        fieldHintHtml(hint) +
        "</span>"
      );
    }

    function isTaglineField(field) {
      if (!field) return false;
      var id = String(field.id || "");
      return (
        id === "vc-boards-tagline" ||
        id.indexOf("vc-boards-tagline-") === 0 ||
        (field.classList && field.classList.contains("vc-boards-tagline"))
      );
    }

    function clampFieldValue(field, raw, opts) {
      opts = opts || {};
      var max = Number(
        (field && (field.getAttribute("data-maxlength") || field.getAttribute("maxlength"))) || 0,
      ) || 0;
      var next = String(raw == null ? "" : raw);
      var truncated = false;
      if (max > 0 && next.length > max) {
        next = next.slice(0, max);
        truncated = true;
      }
      if (field && next !== String(field.value || "")) {
        field.value = next;
        try {
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (eEv) {}
      }
      if (truncated && opts.notify !== false) {
        try {
          if (B && typeof B.toastMsg === "function") {
            B.toastMsg("Massimo " + max + " caratteri (testo tagliato).", true);
          }
        } catch (eT) {}
      }
      return { value: next, truncated: truncated };
    }

    function applyDeformatToField(field) {
      if (!field) return false;
      var before = String(field.value || "");
      if (!before) return false;
      /* boardsNoBlurStrip1: solo click esplicito + conferma — mai automatico */
      try {
        if (
          !window.confirm(
            "Togliere tutta la formattazione Discord da questo testo?\n(grassetto, corsivo, spoiler, ecc.)",
          )
        ) {
          return false;
        }
      } catch (eC) {
        return false;
      }
      var inline = isTaglineField(field);
      var next = stripBoardMarkdown(before, { inline: inline });
      if (next === before) return false;
      field.value = next;
      try {
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (eEv) {}
      try {
        field.focus();
      } catch (eF) {}
      return true;
    }

    function bindTaglineClamp(rootEl) {
      var scope = rootEl || document;
      scope.querySelectorAll("#vc-boards-tagline, textarea.vc-boards-tagline").forEach(function (el) {
        if (!el || el.getAttribute("data-tagline-clamp") === "1") return;
        el.setAttribute("data-tagline-clamp", "1");
        el.setAttribute("data-vc-keep-md", "1");
        var max =
          Number(el.getAttribute("data-maxlength") || el.getAttribute("maxlength") || 500) || 500;
        /* boardsTaglineOverCount1: paste/libero senza taglio; max solo per counter/validazione */
        try {
          el.removeAttribute("maxlength");
        } catch (eRm) {}
        el.setAttribute("data-maxlength", String(max));
      });
    }

    function bindDeformatButtons(rootEl) {
      if (!rootEl || rootEl.__vcBoardsDeformatBound) return;
      rootEl.__vcBoardsDeformatBound = 1;
      rootEl.addEventListener(
        "click",
        function (ev) {
          var btn = ev.target && ev.target.closest ? ev.target.closest("[data-boards-deformat]") : null;
          if (!btn || !rootEl.contains(btn)) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          var sel = String(btn.getAttribute("data-boards-deformat") || "").trim();
          var field = null;
          if (sel) {
            try {
              field = rootEl.querySelector(sel);
            } catch (eQ) {
              field = null;
            }
          }
          if (!field) {
            var host = btn.closest(".vc-boards-field, .vc-boards-field--tagline, .vc-boards-field--desc");
            field = host ? host.querySelector("textarea, input") : null;
          }
          applyDeformatToField(field);
        },
        true,
      );
    }

    function reqStar(on) {
      return on
        ? '<span class="vc-boards-field__req" aria-hidden="true">*</span>'
        : "";
    }

    function fieldBlock(label, hint, controlHtml, required) {
      var hasPrefix = String(controlHtml || "").indexOf("vc-boards-url-prefix") !== -1;
      var hasCheck = String(controlHtml || "").indexOf("vc-boards-link-check") !== -1;
      var req = !!required;
      return (
        '<label class="vc-boards-field vc-boards-field--rich' +
        (req ? " is-required" : "") +
        '">' +
        '<span class="vc-boards-field__meta"><span class="vc-boards-field__label">' +
        label +
        reqStar(req) +
        "</span>" +
        fieldHintHtml(hint) +
        "</span>" +
        '<span class="vc-boards-field__control' +
        (hasPrefix ? " vc-boards-field__control--prefix" : "") +
        (hasCheck && !hasPrefix ? " vc-boards-field__control--check" : "") +
        '">' +
        controlHtml +
        "</span></label>"
      );
    }

    function formFieldsHtml(kind, prefill, cfg) {
      /* boardsFormFields2 */
      prefill = prefill || {};
      var cats = (cfg && cfg.categories) || Object.keys(CAT_LABELS);
      var locs = (cfg && cfg.locales) || Object.keys(LOCALE_LABELS);
      var labels = (cfg && cfg.categoryLabels) || CAT_LABELS;
      var selCats = prefill.categories || [];
      var selLocs = prefill.locales || (prefill.locale ? [prefill.locale] : []);
      var socials = prefill.socials || {};
      var catOpts = cats
        .map(function (c) {
          var on = selCats.indexOf(c) >= 0;
          return (
            '<label class="vc-boards-msel__opt' +
            (on ? " is-on" : "") +
            '"><input type="checkbox" name="vc-boards-cat" value="' +
            B.esc(c) +
            '"' +
            (on ? " checked" : "") +
            ' /><span class="vc-boards-msel__opt-ico" aria-hidden="true">' +
            catIcoHtml(c) +
            '</span><span class="vc-boards-msel__opt-label">' +
            B.esc(labels[c] || c) +
            "</span></label>"
          );
        })
        .join("");
      var maxCats = Math.max(1, Math.min(24, Number((cfg && cfg.maxCategories) || 12) || 12));
      var catMenu =
        '<div class="vc-boards-msel" id="vc-boards-cat-msel" data-max="' +
        B.esc(String(maxCats)) +
        '">' +
        '<button type="button" class="vc-boards-msel__btn vc-boards-msel__btn--menu vc-no-sfx" id="vc-boards-cat-btn" aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="vc-boards-msel__btn-ico" aria-hidden="true"><i class="fa fa-tags"></i></span>' +
        '<span class="vc-boards-msel__btn-label is-placeholder" id="vc-boards-cat-btn-label">Seleziona le categorie</span>' +
        '<i class="fa fa-chevron-down vc-boards-msel__chev" aria-hidden="true"></i></button>' +
        '<div class="vc-boards-msel__picked" id="vc-boards-cat-picked"></div>' +
        '<div class="vc-boards-msel__panel" id="vc-boards-cat-panel" hidden>' +
        '<input type="search" class="vc-boards-msel__q" id="vc-boards-cat-q" placeholder="Cerca categoria…" autocomplete="off" />' +
        '<div class="vc-boards-msel__list" role="listbox">' +
        catOpts +
        "</div></div></div>";
      var locLabels = Object.assign({}, LOCALE_LABELS, (cfg && cfg.localeLabels) || {});
      var locKeys =
        (locs && locs.length ? locs.slice() : null) ||
        LOCALE_ORDER.slice();
      locKeys.forEach(function (c) {
        if (!locLabels[c]) locLabels[c] = String(c).toUpperCase();
      });
      var maxLocs = Math.max(1, Math.min(32, Number((cfg && cfg.maxLocales) || 32) || 32));
      var locOpts = locKeys
        .map(function (c) {
          var on = selLocs.indexOf(c) >= 0;
          return (
            '<label class="vc-boards-msel__opt' +
            (on ? " is-on" : "") +
            '"><input type="checkbox" name="vc-boards-loc" value="' +
            B.esc(c) +
            '"' +
            (on ? " checked" : "") +
            ' /><span class="vc-boards-msel__opt-ico vc-boards-msel__opt-ico--flag" aria-hidden="true">' +
            localeFlagHtml(c) +
            '</span><span class="vc-boards-msel__opt-label">' +
            B.esc(locLabels[c] || c) +
            "</span></label>"
          );
        })
        .join("");
      var locMenu =
        '<div class="vc-boards-msel" id="vc-boards-loc-msel" data-max="' +
        B.esc(String(maxLocs)) +
        '">' +
        '<button type="button" class="vc-boards-msel__btn vc-boards-msel__btn--menu vc-no-sfx" id="vc-boards-loc-btn" aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="vc-boards-msel__btn-ico" aria-hidden="true"><i class="fa fa-globe"></i></span>' +
        '<span class="vc-boards-msel__btn-label is-placeholder" id="vc-boards-loc-btn-label">Seleziona le lingue</span>' +
        '<i class="fa fa-chevron-down vc-boards-msel__chev" aria-hidden="true"></i></button>' +
        '<div class="vc-boards-msel__picked" id="vc-boards-loc-picked"></div>' +
        '<div class="vc-boards-msel__panel" id="vc-boards-loc-panel" hidden>' +
        '<input type="search" class="vc-boards-msel__q" id="vc-boards-loc-q" placeholder="Cerca lingua…" autocomplete="off" />' +
        '<div class="vc-boards-msel__list" role="listbox">' +
        locOpts +
        "</div></div></div>";
      var socialHtml = SOCIAL_KEYS.map(function (k) {
        var meta = SOCIAL_META[k] || { label: k, ico: "fa-link", placeholder: "nick", prefix: "@" };
        var handle = socialHandleFromValue(k, socials[k] || "");
        var icoHtml = meta.svg
          ? '<span class="vc-boards-social-ico vc-boards-social-ico--' +
            k +
            '" aria-hidden="true">' +
            meta.svg +
            "</span>"
          : '<i class="fa ' +
            meta.ico +
            ' vc-boards-social-ico vc-boards-social-ico--' +
            k +
            '" aria-hidden="true"></i>';
        return (
          '<label class="vc-boards-field vc-boards-field--social">' +
          '<span class="vc-boards-field__label">' +
          B.esc(meta.label) +
          "</span>" +
          '<span class="vc-boards-field__control vc-boards-field__control--social">' +
          icoHtml +
          '<span class="vc-boards-social-at" aria-hidden="true">@</span>' +
          '<input id="vc-boards-social-' +
          k +
          '" type="text" inputmode="text" autocomplete="off" spellcheck="false" data-social="' +
          k +
          '" data-link-kind="' +
          k +
          '" value="' +
          B.esc(handle) +
          '" placeholder="' +
          B.esc(String(meta.placeholder || "").replace(/^@/, "")) +
          '" />' +
          '<span class="vc-boards-link-check" data-link-check="' +
          k +
          '" aria-hidden="true"></span></span></label>'
        );
      }).join("");
      var identity =
        (kind === "bot"
          ? '<div class="vc-boards-form-grid">' +
            fieldBlock(
              "Nome bot",
              "",
              '<input id="vc-boards-bot-name" maxlength="100" value="' + B.esc(prefill.name || "") + '" />',
              true,
            ) +
            fieldBlock(
              "Link invita bot",
              "",
              '<input id="vc-boards-bot-invite" type="url" data-link-kind="bot_invite" value="' +
                B.esc(prefill.botInviteUrl || "") +
                '" placeholder="https://discord.com/oauth2/…" />' +
                '<span class="vc-boards-link-check" data-link-check="bot_invite" aria-hidden="true"></span>',
              true,
            ) +
            "</div>"
          : "") +
        (function () {
          var minTag = Math.max(8, Math.min(80, Number((cfg && cfg.minTaglineChars) || 20) || 20));
          var minDesc = Math.max(20, Math.min(500, Number((cfg && cfg.minDescriptionChars) || 80) || 80));
          var maxDesc = Math.max(2000, Math.min(8000, Number((cfg && cfg.maxMarkdownChars) || 4000) || 4000));
          return (
            /* boardsNoBlurStrip1: div (non label) — Deformatta non “ruba” il blur del textarea */
            '<div class="vc-boards-field vc-boards-field--rich vc-boards-field--tagline is-required">' +
            '<span class="vc-boards-field__meta"><label class="vc-boards-field__label" for="vc-boards-tagline">Descrizione breve' +
            reqStar(true) +
            "</label>" +
            fieldToolsHtml(
              "Come la lunga · min " + minTag + " · max 500 (oltre il limite il counter va in negativo)",
              "#vc-boards-tagline",
            ) +
            "</span>" +
            '<span class="vc-boards-field__control">' +
            '<textarea id="vc-boards-tagline" class="vc-boards-tagline" rows="8" minlength="' +
            minTag +
            '" data-maxlength="500" spellcheck="false" autocomplete="off" placeholder="**grassetto** · *corsivo* · __sottolineato__ · ~~barrato~~ · ||spoiler|| · `codice`"></textarea>' +
            '<span class="vc-boards-charcount" id="vc-boards-tagline-count" aria-live="polite"></span>' +
            "</span>" +
            '<div class="vc-boards-desc-preview vc-boards-desc-preview--tagline" id="vc-boards-tagline-preview">' +
            '<div class="vc-boards-desc-preview__head">Anteprima Discord</div>' +
            '<div class="vc-boards-desc-preview__body vc-boards-md" id="vc-boards-tagline-preview-body"></div>' +
            "</div></div>" +
            '<div class="vc-boards-field vc-boards-field--rich vc-boards-field--desc is-required">' +
            '<span class="vc-boards-field__meta"><label class="vc-boards-field__label" for="vc-boards-desc">Descrizione completa' +
            reqStar(true) +
            "</label>" +
            fieldToolsHtml(
              "Markdown Discord · min " + minDesc + " · ** * __ ~~ || `",
              "#vc-boards-desc",
            ) +
            "</span>" +
            '<span class="vc-boards-field__control">' +
            '<textarea id="vc-boards-desc" rows="8" minlength="' +
            minDesc +
            '" maxlength="' +
            maxDesc +
            '" spellcheck="false" autocomplete="off" placeholder="**grassetto** · *corsivo* · __sottolineato__ · ~~barrato~~ · ||spoiler|| · `codice`"></textarea>' +
            '<span class="vc-boards-charcount" id="vc-boards-desc-count" aria-live="polite"></span>' +
            "</span>" +
            '<div class="vc-boards-desc-preview" id="vc-boards-desc-preview">' +
            '<div class="vc-boards-desc-preview__head">Anteprima Discord</div>' +
            '<div class="vc-boards-desc-preview__body vc-boards-detail__desc vc-boards-md" id="vc-boards-desc-preview-body"></div>' +
            "</div></div>"
          );
        })();
      var classify =
        '<div class="vc-boards-chip-block is-required"><p class="vc-boards-chip-block__label">Categorie' +
        reqStar(true) +
        ' <span class="vc-boards-chip-block__hint">(max ' +
        B.esc(String(maxCats)) +
        ")</span></p>" +
        catMenu +
        "</div>" +
        '<div class="vc-boards-chip-block is-required"><p class="vc-boards-chip-block__label">Lingue' +
        reqStar(true) +
        ' <span class="vc-boards-chip-block__hint">(max ' +
        B.esc(String(maxLocs)) +
        ")</span></p>" +
        locMenu +
        "</div>";
      var inviteRequired = kind !== "bot";
      var links =
        '<div class="vc-boards-invite-row">' +
        '<label class="vc-boards-field vc-boards-field--rich vc-boards-field--grow' +
        (inviteRequired ? " is-required" : "") +
        '">' +
        '<span class="vc-boards-field__meta"><span class="vc-boards-field__label">Invite Discord' +
        reqStar(inviteRequired) +
        "</span></span>" +
        '<span class="vc-boards-field__control vc-boards-field__control--prefix">' +
        '<span class="vc-boards-url-prefix" aria-hidden="true">' +
        INVITE_PREFIX +
        "</span>" +
        '<input id="vc-boards-invite" type="text" inputmode="url" autocomplete="off" spellcheck="false" data-link-kind="invite" value="' +
        B.esc(stripInviteSuffix(prefill.inviteUrl || "")) +
        '" placeholder="codice" />' +
        '<span class="vc-boards-link-check" data-link-check="invite" aria-hidden="true"></span></span></label>' +
        (kind === "server"
          ? '<button type="button" class="vc-boards-btn" id="vc-boards-gen-invite"><i class="fa fa-magic" aria-hidden="true"></i> Genera</button>'
          : "") +
        "</div>" +
        fieldBlock(
          "Sito web",
          "",
          schemePrefixBtnHtml(prefill.siteUrl || "") +
            '<input id="vc-boards-site" type="text" inputmode="url" autocomplete="url" spellcheck="false" data-link-kind="website" value="' +
            B.esc(stripHttpsSuffix(prefill.siteUrl || "")) +
            '" placeholder="www.esempio.it" />' +
            '<span class="vc-boards-link-check" data-link-check="website" aria-hidden="true"></span>',
        );
      /* boardsNoVisitorNotes1: niente campo note visitatori */
      /* boardsAccentAlign1: Tag + Colore in colonna (allineati), reset icon-only */
      var extras =
        '<div class="vc-boards-form-grid vc-boards-form-grid--social">' +
        socialHtml +
        "</div>" +
        fieldBlock(
          "Tag",
          "Massimo " + String((cfg && cfg.maxTags) || 12),
          '<div class="vc-boards-tsel" id="vc-boards-tag-tsel" data-max="' +
            B.esc(String((cfg && cfg.maxTags) || 12)) +
            '">' +
            '<div class="vc-boards-tsel__picked" id="vc-boards-tag-picked"></div>' +
            '<button type="button" class="vc-boards-tsel__btn vc-no-sfx" id="vc-boards-tag-btn" aria-haspopup="listbox" aria-expanded="false">' +
            '<i class="fa fa-hashtag" aria-hidden="true"></i>' +
            '<span class="vc-boards-tsel__btn-label is-placeholder" id="vc-boards-tag-btn-label">Seleziona o crea tag</span>' +
            '<i class="fa fa-chevron-up vc-boards-tsel__chev" aria-hidden="true"></i></button>' +
            '<div class="vc-boards-tsel__panel vc-boards-tsel__panel--up" id="vc-boards-tag-panel" hidden>' +
            '<input type="search" class="vc-boards-tsel__q" id="vc-boards-tag-q" placeholder="Cerca o crea un tag…" autocomplete="off" />' +
            '<div class="vc-boards-tsel__list" id="vc-boards-tag-list" role="listbox"></div>' +
            "</div>" +
            '<input type="hidden" id="vc-boards-tags" value="' +
            B.esc((prefill.tags || []).join(", ")) +
            '" />' +
            "</div>",
        ) +
        fieldBlock(
          "Colore accent",
          "",
          '<span class="vc-boards-accent" id="vc-boards-accent-wrap">' +
            '<span class="vc-boards-accent-row">' +
            '<button type="button" class="vc-boards-accent-swatch vc-no-sfx" id="vc-boards-accent-swatch" title="Anteprima colore" aria-label="Apri selettore colore">' +
            '<span class="vc-boards-accent-swatch__face" aria-hidden="true"></span></button>' +
            '<span class="vc-boards-accent-hexwrap">' +
            '<input id="vc-boards-accent" class="vc-boards-accent-hex" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="Predefinito" maxlength="7" value="' +
            B.esc(prefill.accent || "") +
            '" aria-haspopup="dialog" aria-expanded="false" aria-controls="vc-boards-accent-pop" />' +
            '<button type="button" class="vc-boards-accent-reset vc-no-sfx" id="vc-boards-accent-reset"' +
            (prefill.accent ? "" : " hidden") +
            ' title="Colore predefinito" aria-label="Ripristina colore predefinito">' +
            '<i class="fa fa-times" aria-hidden="true"></i></button>' +
            "</span></span>" +
            '<span class="vc-boards-accent-pop vc-no-sfx" id="vc-boards-accent-pop" hidden role="dialog" aria-label="Selettore colore">' +
            '<span class="vc-boards-accent-pop__sv" id="vc-boards-accent-sv" tabindex="-1">' +
            '<span class="vc-boards-accent-pop__sv-white" aria-hidden="true"></span>' +
            '<span class="vc-boards-accent-pop__sv-black" aria-hidden="true"></span>' +
            '<span class="vc-boards-accent-pop__thumb" id="vc-boards-accent-sv-thumb" aria-hidden="true"></span></span>' +
            /* boardsAccentHueRail1: rail arcobaleno + range opacity 0 (WebKit track nera) */
            '<span class="vc-boards-accent-pop__hue-wrap" id="vc-boards-accent-hue-wrap">' +
            '<span class="vc-boards-accent-pop__hue-rail" aria-hidden="true"></span>' +
            '<span class="vc-boards-accent-pop__hue-knob" id="vc-boards-accent-hue-knob" aria-hidden="true"></span>' +
            '<input type="range" class="vc-boards-accent-pop__hue vc-no-sfx" id="vc-boards-accent-hue" min="0" max="360" step="1" aria-label="Tonalita" /></span>' +
            '<span class="vc-boards-accent-pop__meta">' +
            '<span class="vc-boards-accent-pop__live" id="vc-boards-accent-live" aria-hidden="true"></span>' +
            '<span class="vc-boards-accent-pop__hexlab" id="vc-boards-accent-hexlab">Predefinito</span></span>' +
            "</span></span>",
        ) +
        fieldBlock(
          "Banner",
          "Immagine di copertina della scheda (opzionale).",
          '<div class="vc-boards-banner-upload" id="vc-boards-banner-box">' +
            '<input type="hidden" id="vc-boards-banner" value="' +
            B.esc(prefill.bannerUrl || "") +
            '" />' +
            '<input type="file" id="vc-boards-banner-file" class="vc-boards-banner-upload__input" accept="image/png,image/jpeg,image/webp,image/gif" hidden />' +
            '<div class="vc-boards-banner-upload__preview' +
            (prefill.bannerUrl ? " has-image" : "") +
            '" id="vc-boards-banner-preview"' +
            (prefill.bannerUrl
              ? ' style="background-image:url(' + B.esc(prefill.bannerUrl) + ')"'
              : "") +
            ' role="img" aria-label="Anteprima banner">' +
            '<label class="vc-boards-banner-upload__empty vc-no-sfx" for="vc-boards-banner-file"' +
            (prefill.bannerUrl ? " hidden" : "") +
            ">" +
            '<i class="fa fa-image" aria-hidden="true"></i>' +
            "<span>Aggiungi banner</span></label>" +
            '<div class="vc-boards-banner-upload__overlay">' +
            '<label class="vc-boards-banner-upload__act vc-no-sfx" for="vc-boards-banner-file" title="Cambia banner">' +
            '<i class="fa fa-image" aria-hidden="true"></i><span>Modifica</span></label>' +
            '<button type="button" class="vc-boards-banner-upload__act vc-boards-banner-upload__act--danger vc-no-sfx" id="vc-boards-banner-clear" title="Rimuovi banner"' +
            (prefill.bannerUrl ? "" : " hidden") +
            '><i class="fa fa-trash" aria-hidden="true"></i><span>Rimuovi</span></button>' +
            "</div></div>" +
            '<p class="vc-boards-banner-upload__hint" id="vc-boards-banner-hint">PNG, JPG, WEBP o GIF · max 2,5 MB</p>' +
            "</div>",
        );
        /* boardsBannerHover1 */
      /* boardsFeaturesUi2 */
      var feat = prefill.features || {};
      var paidTier = String(feat.paidTier || "free").toLowerCase() === "paid" ? "paid" : "free";
      function featRow(title, desc, controlHtml, rowCls) {
        return (
          '<div class="vc-boards-feat__row' +
          (rowCls ? " " + rowCls : "") +
          '">' +
          '<div class="vc-boards-feat__text">' +
          '<span class="vc-boards-feat__label">' +
          B.esc(title) +
          "</span>" +
          '<span class="vc-boards-feat__hint">' +
          B.esc(desc) +
          "</span></div>" +
          '<div class="vc-boards-feat__ctrl">' +
          controlHtml +
          "</div></div>"
        );
      }
      function featCheck(id, on) {
        return (
          '<label class="vc-boards-feat__toggle">' +
          '<input type="checkbox" id="' +
          id +
          '"' +
          (on ? " checked" : "") +
          " />" +
          '<span class="vc-boards-feat__toggle-ui" aria-hidden="true"></span>' +
          '<span class="vc-boards-feat__toggle-txt">Applicabile</span></label>'
        );
      }
      var featuresBody =
        '<div class="vc-boards-feat">' +
        featRow(
          "Funzionalità a pagamento",
          "Il progetto è gratis, a pagamento, oppure ha paywall sulle funzioni principali.",
          '<div class="vc-boards-feat__choices" role="radiogroup" aria-label="Funzionalità a pagamento">' +
            '<label class="vc-boards-feat__choice">' +
            '<input type="radio" name="vc-boards-paid-tier" value="free"' +
            (paidTier === "free" ? " checked" : "") +
            " />" +
            '<span class="vc-boards-feat__choice-dot" aria-hidden="true"></span>' +
            '<span class="vc-boards-feat__choice-copy"><b>Gratuito</b><i>Nessun paywall sulle funzioni principali</i></span></label>' +
            '<label class="vc-boards-feat__choice">' +
            '<input type="radio" name="vc-boards-paid-tier" value="paid"' +
            (paidTier === "paid" ? " checked" : "") +
            " />" +
            '<span class="vc-boards-feat__choice-dot" aria-hidden="true"></span>' +
            '<span class="vc-boards-feat__choice-copy"><b>A pagamento</b><i>Serve un pagamento per accedere</i></span></label></div>',
          "vc-boards-feat__row--paid",
        ) +
        featRow(
          "Funzioni premium opzionali",
          "Extra o perk sbloccabili con pagamenti/abbonamenti opzionali.",
          featCheck("vc-boards-feat-paid-extra", Boolean(feat.paidFeaturesAvailable)),
        ) +
        (kind === "server"
          ? '<div class="vc-boards-feat__sep"><span>Server Discord</span></div>' +
            featRow(
              "Accetta partnership",
              "Accetta partnership con altri progetti.",
              featCheck("vc-boards-feat-partnerships", Boolean(feat.acceptsPartnerships)),
            ) +
            featRow(
              "Verifica all’ingresso",
              "Serve verificarsi per l’accesso completo.",
              featCheck("vc-boards-feat-verify", Boolean(feat.requireVerification)),
            )
          : featRow(
              "Accetta partnership",
              "Accetta partnership con altri progetti.",
              featCheck("vc-boards-feat-partnerships", Boolean(feat.acceptsPartnerships)),
            )) +
        "</div>";
      return (
        section("fa-pencil", "Contenuti", "Titolo e descrizioni della scheda", identity) +
        section("fa-tags", "Classificazione", "Categoria e lingua obbligatorie", classify) +
        section("fa-link", "Collegamenti", "Invite Discord e sito web", links) +
        section("fa-sliders", "Personalizzazione", "Campi facoltativi", extras) +
        section("fa-magic", "Funzionalità", "Pagamento, partnership e accesso", featuresBody)
      );
    }

    function normalizeTag(raw) {
      return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_\-]/g, "")
        .slice(0, 32);
    }

    function normalizeAccentHex(raw) {
      var s = String(raw || "").trim();
      if (!s) return "";
      if (s.charAt(0) !== "#") s = "#" + s;
      if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        s =
          "#" +
          s.charAt(1) +
          s.charAt(1) +
          s.charAt(2) +
          s.charAt(2) +
          s.charAt(3) +
          s.charAt(3);
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(s)) return "";
      return s.toLowerCase();
    }

    function hexToHsv(hexStr) {
      var h = normalizeAccentHex(hexStr) || "#d4a888";
      var r = parseInt(h.slice(1, 3), 16) / 255;
      var g = parseInt(h.slice(3, 5), 16) / 255;
      var b = parseInt(h.slice(5, 7), 16) / 255;
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var d = max - min;
      var hh = 0;
      if (d) {
        if (max === r) hh = ((g - b) / d) % 6;
        else if (max === g) hh = (b - r) / d + 2;
        else hh = (r - g) / d + 4;
        hh *= 60;
        if (hh < 0) hh += 360;
      }
      var s = max === 0 ? 0 : d / max;
      return { h: hh, s: s, v: max };
    }

    function hsvToHex(h, s, v) {
      h = ((Number(h) % 360) + 360) % 360;
      s = Math.max(0, Math.min(1, Number(s) || 0));
      v = Math.max(0, Math.min(1, Number(v) || 0));
      var c = v * s;
      var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      var m = v - c;
      var r = 0;
      var g = 0;
      var b = 0;
      if (h < 60) {
        r = c;
        g = x;
      } else if (h < 120) {
        r = x;
        g = c;
      } else if (h < 180) {
        g = c;
        b = x;
      } else if (h < 240) {
        g = x;
        b = c;
      } else if (h < 300) {
        r = x;
        b = c;
      } else {
        r = c;
        b = x;
      }
      function to2(n) {
        var v2 = Math.round((n + m) * 255);
        var s2 = Math.max(0, Math.min(255, v2)).toString(16);
        return s2.length === 1 ? "0" + s2 : s2;
      }
      return ("#" + to2(r) + to2(g) + to2(b)).toLowerCase();
    }

    function bindAccentPicker(rootEl) {
      var wrap = rootEl.querySelector("#vc-boards-accent-wrap");
      var hex = rootEl.querySelector("#vc-boards-accent");
      var swatch = rootEl.querySelector("#vc-boards-accent-swatch");
      var face = rootEl.querySelector(".vc-boards-accent-swatch__face");
      var pop = rootEl.querySelector("#vc-boards-accent-pop");
      var sv = rootEl.querySelector("#vc-boards-accent-sv");
      var thumb = rootEl.querySelector("#vc-boards-accent-sv-thumb");
      var hue = rootEl.querySelector("#vc-boards-accent-hue");
      var hueWrap = rootEl.querySelector("#vc-boards-accent-hue-wrap");
      var hueKnob = rootEl.querySelector("#vc-boards-accent-hue-knob");
      var live = rootEl.querySelector("#vc-boards-accent-live");
      var hexlab = rootEl.querySelector("#vc-boards-accent-hexlab");
      var resetBtn = rootEl.querySelector("#vc-boards-accent-reset");
      if (!wrap || !hex || !pop || !sv || !hue) return;

      var DEFAULT_ACCENT = "#d4a888";
      var state = hexToHsv(normalizeAccentHex(hex.value) || DEFAULT_ACCENT);
      var open = false;
      var dragging = false;
      var hueDragging = false;
      /* boardsAccentHueDrag1: emit da picker non deve rifare hex→hsv (h=0 su grigi → rosso) */
      var syncFromPicker = false;

      function emit() {
        syncFromPicker = true;
        try {
          hex.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (e0) {}
        try {
          hex.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e1) {}
        syncFromPicker = false;
      }

      function syncResetBtn() {
        if (!resetBtn) return;
        if (normalizeAccentHex(hex.value)) resetBtn.removeAttribute("hidden");
        else resetBtn.setAttribute("hidden", "");
      }

      function paint(fromHexInput, keepEmpty) {
        var c = hsvToHex(state.h, state.s, state.v);
        if (keepEmpty) {
          hex.value = "";
          wrap.classList.add("is-default");
          if (face) face.style.background = DEFAULT_ACCENT;
          if (live) live.style.background = DEFAULT_ACCENT;
          if (hexlab) hexlab.textContent = "Predefinito";
        } else {
          if (!fromHexInput) hex.value = c;
          wrap.classList.remove("is-default");
          if (face) face.style.background = c;
          if (live) live.style.background = c;
          if (hexlab) hexlab.textContent = c;
        }
        var hueDeg = Math.round(((Number(state.h) % 360) + 360) % 360);
        if (hueDeg === 360) hueDeg = 0;
        state.h = hueDeg;
        sv.style.setProperty("--vc-accent-hue", String(hueDeg));
        hue.value = String(hueDeg);
        if (hueWrap) {
          hueWrap.style.setProperty("--vc-accent-hue", String(hueDeg));
          hueWrap.style.setProperty("--vc-hue-pct", (hueDeg / 360) * 100 + "%");
        }
        if (hueKnob) hueKnob.style.background = "hsl(" + hueDeg + ", 100%, 50%)";
        if (thumb) {
          thumb.style.left = state.s * 100 + "%";
          thumb.style.top = (1 - state.v) * 100 + "%";
        }
        try {
          hex.style.setProperty("--vc-boards-accent-live", keepEmpty ? DEFAULT_ACCENT : c);
        } catch (eS) {}
        syncResetBtn();
        return keepEmpty ? "" : c;
      }

      function applyHexToState(hexStr, keepHueIfGray) {
        var c = normalizeAccentHex(hexStr);
        if (!c) return "";
        var next = hexToHsv(c);
        if (keepHueIfGray && next.s < 0.02) next.h = state.h;
        state = next;
        return c;
      }

      function setOpen(next) {
        open = !!next;
        pop.hidden = !open;
        wrap.classList.toggle("is-open", open);
        hex.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
          if (normalizeAccentHex(hex.value)) paint(true);
          else paint(false, true);
        }
      }

      function applySvFromPointer(ev) {
        var rect = sv.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var x = (ev.clientX - rect.left) / rect.width;
        var y = (ev.clientY - rect.top) / rect.height;
        state.s = Math.max(0, Math.min(1, x));
        state.v = Math.max(0, Math.min(1, 1 - y));
        emit(paint(false));
      }

      function applyHueFromPointer(ev) {
        if (!hueWrap) return;
        var rect = hueWrap.getBoundingClientRect();
        if (!rect.width) return;
        var x = (ev.clientX - rect.left) / rect.width;
        state.h = Math.max(0, Math.min(359, Math.round(x * 360)));
        emit(paint(false));
      }

      if (normalizeAccentHex(hex.value)) paint(true);
      else paint(false, true);

      function openPicker(ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        setOpen(true);
      }

      hex.addEventListener("focus", function () {
        setOpen(true);
      });
      hex.addEventListener("click", openPicker);
      if (swatch) swatch.addEventListener("click", openPicker);

      hex.addEventListener("input", function () {
        if (syncFromPicker) return;
        if (!String(hex.value || "").trim()) {
          state = hexToHsv(DEFAULT_ACCENT);
          paint(false, true);
          return;
        }
        var c = applyHexToState(hex.value, true);
        if (!c) return;
        paint(true);
      });
      hex.addEventListener("blur", function () {
        if (!String(hex.value || "").trim()) {
          state = hexToHsv(DEFAULT_ACCENT);
          paint(false, true);
          return;
        }
        var c = applyHexToState(hex.value, true);
        if (c) {
          hex.value = c;
          paint(true);
        }
      });

      if (resetBtn) {
        resetBtn.addEventListener("click", function (ev) {
          try {
            if (ev && ev.preventDefault) ev.preventDefault();
          } catch (ePr) {}
          state = hexToHsv(DEFAULT_ACCENT);
          paint(false, true);
          setOpen(false);
          emit();
        });
      }

      hue.addEventListener("input", function () {
        state.h = Number(hue.value) || 0;
        emit(paint(false));
      });
      hue.addEventListener("change", function () {
        state.h = Number(hue.value) || 0;
        emit(paint(false));
      });

      /* boardsAccentHueDrag1: drag sulla wrap (range opacity-0 a volte non riceve drag Windows) */
      if (hueWrap) {
        hueWrap.addEventListener("pointerdown", function (ev) {
          hueDragging = true;
          try {
            hueWrap.setPointerCapture(ev.pointerId);
          } catch (eHc) {}
          applyHueFromPointer(ev);
          try {
            ev.preventDefault();
          } catch (ePd) {}
        });
        hueWrap.addEventListener("pointermove", function (ev) {
          if (!hueDragging) return;
          applyHueFromPointer(ev);
        });
        function endHueDrag(ev) {
          hueDragging = false;
          try {
            if (ev && ev.pointerId != null) hueWrap.releasePointerCapture(ev.pointerId);
          } catch (eHr) {}
        }
        hueWrap.addEventListener("pointerup", endHueDrag);
        hueWrap.addEventListener("pointercancel", endHueDrag);
      }

      sv.addEventListener("pointerdown", function (ev) {
        dragging = true;
        try {
          sv.setPointerCapture(ev.pointerId);
        } catch (eC) {}
        applySvFromPointer(ev);
      });
      sv.addEventListener("pointermove", function (ev) {
        if (!dragging) return;
        applySvFromPointer(ev);
      });
      function endDrag(ev) {
        dragging = false;
        try {
          if (ev && ev.pointerId != null) sv.releasePointerCapture(ev.pointerId);
        } catch (eR) {}
      }
      sv.addEventListener("pointerup", endDrag);
      sv.addEventListener("pointercancel", endDrag);

      document.addEventListener(
        "pointerdown",
        function (ev) {
          if (!open) return;
          if (wrap.contains(ev.target)) return;
          setOpen(false);
        },
        true,
      );
      document.addEventListener("keydown", function (ev) {
        if (!open) return;
        if (ev.key === "Escape") setOpen(false);
      });
    }

    function bindTagMenu(rootEl, seedTags, maxTags) {
      var tsel = rootEl.querySelector("#vc-boards-tag-tsel");
      if (!tsel) return;
      var btn = tsel.querySelector("#vc-boards-tag-btn");
      var panel = tsel.querySelector("#vc-boards-tag-panel");
      var picked = tsel.querySelector("#vc-boards-tag-picked");
      var btnLabel = tsel.querySelector("#vc-boards-tag-btn-label");
      var q = tsel.querySelector("#vc-boards-tag-q");
      var list = tsel.querySelector("#vc-boards-tag-list");
      var hidden = tsel.querySelector("#vc-boards-tags");
      var max = Math.max(1, Math.min(24, Number(maxTags || tsel.getAttribute("data-max") || 12) || 12));
      var catalog = [];
      var selected = [];
      var counts = {};

      function seedFromHidden() {
        selected = String((hidden && hidden.value) || "")
          .split(/[,;]/)
          .map(normalizeTag)
          .filter(Boolean);
        var uniq = [];
        selected.forEach(function (t) {
          if (uniq.indexOf(t) < 0) uniq.push(t);
        });
        selected = uniq.slice(0, max);
      }

      function writeHidden() {
        if (hidden) hidden.value = selected.join(", ");
        if (btnLabel) {
          btnLabel.textContent = selected.length
            ? selected.length + (selected.length === 1 ? " tag" : " tag")
            : "Seleziona o crea tag";
          btnLabel.classList.toggle("is-placeholder", !selected.length);
        }
        if (picked) {
          picked.innerHTML = selected
            .map(function (t) {
              return (
                '<button type="button" class="vc-boards-tsel__tag" data-value="' +
                B.esc(t) +
                '">#' +
                B.esc(t) +
                ' <i class="fa fa-times" aria-hidden="true"></i></button>'
              );
            })
            .join("");
        }
      }

      function setOpen(open) {
        tsel.classList.toggle("is-open", open);
        if (panel) panel.hidden = !open;
        if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open && q) {
          try {
            q.focus();
          } catch (_) {}
        }
      }

      function toggleTag(tag) {
        tag = normalizeTag(tag);
        if (!tag) return;
        var i = selected.indexOf(tag);
        if (i >= 0) selected.splice(i, 1);
        else {
          if (selected.length >= max) {
            setMsg(null, "Massimo " + max + " tag.", true);
            return;
          }
          selected.push(tag);
          if (catalog.indexOf(tag) < 0) catalog.unshift(tag);
        }
        writeHidden();
        renderList();
      }

      function renderList() {
        if (!list) return;
        var needle = normalizeTag((q && q.value) || "");
        var rows = catalog.filter(function (t) {
          return !needle || t.indexOf(needle) >= 0;
        });
        rows.sort(function (a, b) {
          var ca = counts[a] || 0;
          var cb = counts[b] || 0;
          if (cb !== ca) return cb - ca;
          return a.localeCompare(b);
        });
        var html = rows
          .slice(0, 120)
          .map(function (t) {
            var on = selected.indexOf(t) >= 0;
            var n = counts[t] || 0;
            return (
              '<button type="button" class="vc-boards-tsel__opt' +
              (on ? " is-on" : "") +
              '" data-value="' +
              B.esc(t) +
              '" role="option" aria-selected="' +
              (on ? "true" : "false") +
              '"><span class="vc-boards-tsel__opt-check" aria-hidden="true">' +
              (on ? '<i class="fa fa-check"></i>' : "") +
              '</span><span class="vc-boards-tsel__opt-label">#' +
              B.esc(t) +
              "</span>" +
              (n
                ? '<span class="vc-boards-tsel__opt-count">' + B.esc(String(n)) + "</span>"
                : "") +
              "</button>"
            );
          })
          .join("");
        var canCreate =
          needle &&
          catalog.indexOf(needle) < 0 &&
          selected.indexOf(needle) < 0 &&
          selected.length < max;
        if (canCreate) {
          html =
            '<button type="button" class="vc-boards-tsel__opt vc-boards-tsel__opt--create" data-create="' +
            B.esc(needle) +
            '" role="option"><span class="vc-boards-tsel__opt-check" aria-hidden="true"><i class="fa fa-plus"></i></span><span class="vc-boards-tsel__opt-label">Crea <strong>#' +
            B.esc(needle) +
            /* boardsTagsPickSyntax1 */
            '</strong></span><span class="vc-boards-tsel__opt-count">nuovo</span></button>' +
            html;
        } else if (!rows.length) {
          html =
            '<p class="vc-boards-tsel__empty">Nessun tag. Digita un nome e crea il primo.</p>';
        }
        list.innerHTML = html;
      }

      seedFromHidden();
      catalog = (Array.isArray(seedTags) ? seedTags : [])
        .map(normalizeTag)
        .filter(Boolean);
      selected.forEach(function (t) {
        if (catalog.indexOf(t) < 0) catalog.unshift(t);
      });
      writeHidden();
      renderList();

      if (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          setOpen(!tsel.classList.contains("is-open"));
        });
      }
      if (q) {
        q.addEventListener("input", renderList);
        q.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            var needle = normalizeTag(q.value);
            if (needle) {
              toggleTag(needle);
              q.value = "";
              renderList();
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        });
      }
      if (list) {
        list.addEventListener("click", function (e) {
          var create = e.target.closest("[data-create]");
          if (create) {
            toggleTag(create.getAttribute("data-create"));
            if (q) q.value = "";
            renderList();
            return;
          }
          var opt = e.target.closest(".vc-boards-tsel__opt[data-value]");
          if (opt) toggleTag(opt.getAttribute("data-value"));
        });
      }
      if (picked) {
        picked.addEventListener("click", function (e) {
          var tag = e.target.closest(".vc-boards-tsel__tag");
          if (!tag) return;
          toggleTag(tag.getAttribute("data-value"));
        });
      }
      document.addEventListener(
        "click",
        function (e) {
          if (!tsel.contains(e.target)) setOpen(false);
        },
        true,
      );

      /* load shared + user-created tags */
      B.api("/tags")
        .then(function (out) {
          if (!out || !out.ok) return;
          if (out.maxTags) {
            max = Math.max(1, Math.min(24, Number(out.maxTags) || max));
            tsel.setAttribute("data-max", String(max));
          }
          var incoming = Array.isArray(out.items)
            ? out.items
            : (out.tags || []).map(function (t) {
                return { tag: t, count: 0 };
              });
          incoming.forEach(function (row) {
            var t = normalizeTag(row.tag || row);
            if (!t) return;
            counts[t] = Number(row.count) || counts[t] || 0;
            if (catalog.indexOf(t) < 0) catalog.push(t);
          });
          renderList();
        })
        .catch(function () {});
    }

    function bindCategoryMenu(rootEl, labels, maxCategories) {
      var msel = rootEl.querySelector("#vc-boards-cat-msel");
      if (!msel) return;
      var btn = msel.querySelector("#vc-boards-cat-btn");
      var panel = msel.querySelector("#vc-boards-cat-panel");
      var picked = msel.querySelector("#vc-boards-cat-picked");
      var btnLabel = msel.querySelector("#vc-boards-cat-btn-label");
      var q = msel.querySelector("#vc-boards-cat-q");
      var opts = msel.querySelectorAll(".vc-boards-msel__opt");
      var max = Math.max(
        1,
        Math.min(24, Number(maxCategories || msel.getAttribute("data-max") || 12) || 12),
      );

      function selectedCount() {
        var n = 0;
        opts.forEach(function (opt) {
          var inp = opt.querySelector("input");
          if (inp && inp.checked) n += 1;
        });
        return n;
      }

      function sync() {
        var on = [];
        opts.forEach(function (opt) {
          var inp = opt.querySelector("input");
          var active = !!(inp && inp.checked);
          opt.classList.toggle("is-on", active);
          if (active) {
            on.push({
              v: inp.value,
              t: labels[inp.value] || inp.value,
              ico: catIcoHtml(inp.value),
            });
          }
        });
        if (btnLabel) {
          btnLabel.textContent = on.length
            ? on.length + "/" + max + (on.length === 1 ? " categoria" : " categorie")
            : "Seleziona le categorie";
          btnLabel.classList.toggle("is-placeholder", !on.length);
        }
        if (picked) {
          picked.innerHTML = on
            .map(function (x) {
              return (
                '<button type="button" class="vc-boards-msel__tag" data-value="' +
                B.esc(x.v) +
                '"><span class="vc-boards-msel__tag-ico" aria-hidden="true">' +
                x.ico +
                "</span>" +
                B.esc(x.t) +
                ' <i class="fa fa-times" aria-hidden="true"></i></button>'
              );
            })
            .join("");
        }
      }

      function setOpen(open) {
        msel.classList.toggle("is-open", open);
        if (panel) panel.hidden = !open;
        if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
      }

      if (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          setOpen(!msel.classList.contains("is-open"));
        });
      }
      opts.forEach(function (opt) {
        opt.addEventListener("change", function (ev) {
          var inp = opt.querySelector("input");
          if (inp && inp.checked && selectedCount() > max) {
            inp.checked = false;
            setMsg(null, "Massimo " + max + " categorie.", true);
          }
          sync();
        });
      });
      if (picked) {
        picked.addEventListener("click", function (e) {
          var tag = e.target.closest(".vc-boards-msel__tag");
          if (!tag) return;
          var v = tag.getAttribute("data-value");
          var inp = msel.querySelector('input[value="' + v + '"]');
          if (inp) {
            inp.checked = false;
            sync();
          }
        });
      }
      if (q) {
        q.addEventListener("input", function () {
          var needle = String(q.value || "").toLowerCase().trim();
          opts.forEach(function (opt) {
            var t = String(opt.textContent || "").toLowerCase();
            opt.hidden = !!(needle && t.indexOf(needle) < 0);
          });
        });
      }
      document.addEventListener(
        "click",
        function (e) {
          if (!msel.contains(e.target)) setOpen(false);
        },
        true,
      );
      /* se bozza aveva troppe categorie, taglia */
      var over = [];
      opts.forEach(function (opt) {
        var inp = opt.querySelector("input");
        if (inp && inp.checked) over.push(inp);
      });
      if (over.length > max) {
        over.slice(max).forEach(function (inp) {
          inp.checked = false;
        });
      }
      sync();
    }

    /* boardsLinkCheck1: ✓ trovato / ✗ non valido su social, sito, invite, banner */
    function bindLinkChecks(rootEl) {
      var scope = rootEl || document;
      if (!scope || scope.__vcBoardsLinkChecksBound) return;
      scope.__vcBoardsLinkChecksBound = 1;
      var timers = new WeakMap();
      var seqs = new WeakMap();

      function setCheckState(badge, state, title) {
        if (!badge) return;
        badge.classList.remove("is-ok", "is-bad", "is-pending", "is-idle");
        badge.classList.add(state === "ok" || state === "bad" || state === "pending" ? "is-" + state : "is-idle");
        var host = badge.closest ? badge.closest(".vc-boards-field__control") : null;
        if (host) {
          host.classList.toggle("is-check-ok", state === "ok");
          host.classList.toggle("is-check-bad", state === "bad");
        }
        if (state === "ok") {
          badge.innerHTML = '<i class="fa fa-check" aria-hidden="true"></i>';
          badge.setAttribute("title", title || "Trovato");
          badge.setAttribute("aria-label", title || "Trovato");
          badge.setAttribute("aria-hidden", "false");
        } else if (state === "bad") {
          badge.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
          badge.setAttribute("title", title || "Non valido o non trovato");
          badge.setAttribute("aria-label", title || "Non valido o non trovato");
          badge.setAttribute("aria-hidden", "false");
        } else if (state === "pending") {
          badge.innerHTML = '<i class="fa fa-circle-o-notch fa-spin" aria-hidden="true"></i>';
          badge.setAttribute("title", "Controllo…");
          badge.setAttribute("aria-label", "Controllo in corso");
          badge.setAttribute("aria-hidden", "false");
        } else {
          badge.innerHTML = "";
          badge.removeAttribute("title");
          badge.removeAttribute("aria-label");
          badge.setAttribute("aria-hidden", "true");
        }
      }

      function resolveValue(input, kind) {
        var raw = String((input && input.value) || "").trim();
        if (!raw) return "";
        if (kind === "invite") return joinInviteUrl(raw);
        if (kind === "website" || kind === "banner") {
          return forceHttpsIfRequired(joinSchemeUrl(raw, readSchemePrefix(input.id)));
        }
        if (kind === "bot_invite") return raw;
        return socialHandleFromValue(kind, raw) || raw.replace(/^@+/, "");
      }

      function localInvalid(kind, value) {
        if (!value) return false;
        if (kind === "invite") {
          var code = stripInviteSuffix(value);
          return !/^[A-Za-z0-9-]{2,64}$/.test(code);
        }
        if (kind === "bot_invite") {
          return !(
            /discord\.com\/(api\/)?oauth2\/authorize/i.test(value) ||
            /discordapp\.com\/(api\/)?oauth2\/authorize/i.test(value)
          ) || !/[?&]client_id=\d{5,}/i.test(value);
        }
        if (kind === "website" || kind === "banner") {
          try {
            var u = new URL(value);
            return !u.hostname || u.hostname.indexOf(".") < 0;
          } catch (_) {
            return true;
          }
        }
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(value).replace(/^@+/, ""))) return true;
        if (!socialUrlFromHandle(kind, value) && SOCIAL_META[kind]) return true;
        return false;
      }

      function probeBannerClient(url) {
        return new Promise(function (resolve) {
          var img = new Image();
          var done = false;
          function finish(ok) {
            if (done) return;
            done = true;
            resolve(ok);
          }
          img.onload = function () {
            finish(true);
          };
          img.onerror = function () {
            finish(false);
          };
          setTimeout(function () {
            finish(false);
          }, 6000);
          img.referrerPolicy = "no-referrer";
          var safe = forceHttpsIfRequired(url);
          img.src = safe + (safe.indexOf("?") >= 0 ? "&" : "?") + "_vcb=" + Date.now();
        });
      }

      async function runCheck(input) {
        if (!input || !input.getAttribute) return;
        var kind = String(input.getAttribute("data-link-kind") || "").trim();
        if (!kind) return;
        var host = input.closest ? input.closest(".vc-boards-field__control") : null;
        var badge =
          (host && host.querySelector && host.querySelector('[data-link-check="' + kind + '"]')) ||
          scope.querySelector('[data-link-check="' + kind + '"]');
        var value = resolveValue(input, kind);
        if (!value) {
          setCheckState(badge, "idle");
          return;
        }
        if (localInvalid(kind, value)) {
          setCheckState(badge, "bad", "Formato non valido");
          return;
        }
        var seq = (seqs.get(input) || 0) + 1;
        seqs.set(input, seq);
        setCheckState(badge, "pending");
        try {
          if (kind === "banner") {
            var imgOk = await probeBannerClient(value);
            if (seqs.get(input) !== seq) return;
            if (imgOk) {
              setCheckState(badge, "ok", "Immagine trovata");
              return;
            }
          }
          if (!B.token || !B.token()) {
            setCheckState(badge, "bad", "Login richiesto per verificare");
            return;
          }
          var out = await B.api("/probe-link", {
            method: "POST",
            json: { kind: kind, value: value },
          });
          if (seqs.get(input) !== seq) return;
          if (out && out.ok && out.found) {
            var soft = String(out.reason || "").indexOf("soft_ok") === 0;
            setCheckState(
              badge,
              "ok",
              out.label
                ? "Trovato: " + out.label
                : soft
                  ? "Handle valido (verifica automatica limitata)"
                  : "Trovato",
            );
          } else {
            setCheckState(badge, "bad", (out && out.message) || "Non trovato");
          }
        } catch (eProbe) {
          if (seqs.get(input) !== seq) return;
          setCheckState(badge, "bad", "Controllo non riuscito");
        }
      }

      function schedule(input) {
        if (!input) return;
        var prev = timers.get(input);
        if (prev) clearTimeout(prev);
        timers.set(
          input,
          setTimeout(function () {
            runCheck(input);
          }, 450),
        );
      }

      scope.querySelectorAll("[data-link-kind]").forEach(function (input) {
        if (input.getAttribute("data-link-bound") === "1") return;
        input.setAttribute("data-link-bound", "1");
        input.addEventListener("input", function () {
          schedule(input);
        });
        input.addEventListener("change", function () {
          schedule(input);
        });
        input.addEventListener("blur", function () {
          runCheck(input);
        });
        if (String(input.value || "").trim()) schedule(input);
      });

      scope.querySelectorAll("[data-vc-scheme-toggle]").forEach(function (btn) {
        if (btn.getAttribute("data-link-scheme-bound") === "1") return;
        btn.setAttribute("data-link-scheme-bound", "1");
        btn.addEventListener("click", function () {
          var host = btn.closest ? btn.closest(".vc-boards-field__control") : null;
          var input = host && host.querySelector ? host.querySelector("[data-link-kind]") : null;
          if (input) schedule(input);
        });
      });

      scope.__vcBoardsRunLinkCheck = function (selOrEl) {
        var el =
          typeof selOrEl === "string"
            ? scope.querySelector(selOrEl) || document.getElementById(String(selOrEl).replace(/^#/, ""))
            : selOrEl;
        if (el) runCheck(el);
      };
    }

    /* boardsBannerUpload1: casella file → upload → hidden bannerUrl */
    /* boardsBannerToast1: feedback upload → toast (hint resta solo formato) */
    function bindBannerUpload(rootEl) {
      var scope = rootEl || document;
      var fileInput = scope.querySelector
        ? scope.querySelector("#vc-boards-banner-file")
        : document.getElementById("vc-boards-banner-file");
      var hidden = scope.querySelector
        ? scope.querySelector("#vc-boards-banner")
        : document.getElementById("vc-boards-banner");
      var preview = scope.querySelector
        ? scope.querySelector("#vc-boards-banner-preview")
        : document.getElementById("vc-boards-banner-preview");
      var clearBtn = scope.querySelector
        ? scope.querySelector("#vc-boards-banner-clear")
        : document.getElementById("vc-boards-banner-clear");
      var hint = scope.querySelector
        ? scope.querySelector("#vc-boards-banner-hint")
        : document.getElementById("vc-boards-banner-hint");
      var msgEl = document.getElementById("vc-boards-msg");
      var HINT_DEFAULT = "PNG, JPG, WEBP o GIF · max 2,5 MB";
      if (!fileInput || !hidden || fileInput.getAttribute("data-vc-banner-bound") === "1") return;
      fileInput.setAttribute("data-vc-banner-bound", "1");

      function resetHint() {
        if (hint) hint.textContent = HINT_DEFAULT;
      }

      function bannerToast(text, isErr) {
        resetHint();
        setMsg(msgEl, text, !!isErr);
      }

      function setPreview(url) {
        var u = String(url || "").trim();
        hidden.value = u;
        var emptyEl = preview
          ? preview.querySelector(".vc-boards-banner-upload__empty")
          : null;
        if (preview) {
          if (u) {
            preview.style.backgroundImage = "url(" + u.replace(/"/g, "%22") + ")";
            preview.classList.add("has-image");
          } else {
            preview.style.backgroundImage = "";
            preview.classList.remove("has-image");
          }
        }
        if (emptyEl) {
          if (u) emptyEl.setAttribute("hidden", "");
          else emptyEl.removeAttribute("hidden");
        }
        if (clearBtn) {
          if (u) clearBtn.removeAttribute("hidden");
          else clearBtn.setAttribute("hidden", "");
        }
      }

      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          setPreview("");
          try {
            fileInput.value = "";
          } catch (_) {}
          resetHint();
          setMsg(msgEl, "");
        });
      }

      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (String(file.type || "").indexOf("image/") !== 0) {
          bannerToast("Formato non supportato.", true);
          return;
        }
        if (file.size > 2.5 * 1024 * 1024) {
          bannerToast("Immagine troppo grande (max 2,5 MB).", true);
          return;
        }
        if (!B.token || !B.token()) {
          bannerToast("Accedi con Discord per caricare.", true);
          return;
        }
        bannerToast("Caricamento…");
        var reader = new FileReader();
        reader.onload = async function () {
          var dataUrl = String(reader.result || "");
          if (dataUrl.indexOf("data:image/") !== 0) {
            bannerToast("Lettura file non riuscita.", true);
            return;
          }
          try {
            var r = await B.api("/me/banner-upload", {
              method: "POST",
              json: { image: dataUrl },
            });
            if (!r || !r.ok || !r.url) {
              bannerToast((r && r.message) || "Upload non riuscito.", true);
              return;
            }
            setPreview(r.url);
            bannerToast("Banner caricato.");
          } catch (eUp) {
            bannerToast("Errore di rete durante l’upload.", true);
          }
        };
        reader.onerror = function () {
          bannerToast("Lettura file non riuscita.", true);
        };
        reader.readAsDataURL(file);
      });
    }

    /* boardsSchemeToggle1: click su https:// ↔ http:// (sito) */
    function bindSchemePrefixToggles(rootEl) {
      var scope = rootEl || document;
      scope.querySelectorAll("[data-vc-scheme-toggle]").forEach(function (btn) {
        if (btn.getAttribute("data-vc-scheme-bound") === "1") return;
        btn.setAttribute("data-vc-scheme-bound", "1");
        btn.addEventListener("click", function (ev) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (eStop) {}
          var hostEl = btn.closest ? btn.closest(".vc-boards-field__control") : null;
          var inputEl = hostEl && hostEl.querySelector ? hostEl.querySelector("input") : null;
          var joined = inputEl
            ? joinSchemeUrl(inputEl.value || "", "http://")
            : "";
          /* Discord CDN / host sicuri: niente toggle a http */
          try {
            if (joined && hostRequiresHttps(new URL(joined).hostname)) {
              btn.textContent = "https://";
              btn.setAttribute("title", "Questo host richiede https://");
              syncSchemePrefixForInput(inputEl);
              try {
                btn.dispatchEvent(new Event("change", { bubbles: true }));
              } catch (eCh0) {}
              return;
            }
          } catch (_) {}
          var cur = String(btn.textContent || "")
            .trim()
            .toLowerCase();
          var next = cur.indexOf("https://") === 0 ? "http://" : "https://";
          btn.textContent = next;
          btn.setAttribute(
            "title",
            "Clicca per passare a " + (next === "https://" ? "http://" : "https://"),
          );
          try {
            btn.dispatchEvent(new Event("change", { bubbles: true }));
          } catch (eCh) {}
        });
      });
      ["vc-boards-site"].forEach(function (id) {
        var input = scope.querySelector ? scope.querySelector("#" + id) : document.getElementById(id);
        if (!input || input.getAttribute("data-vc-scheme-input") === "1") return;
        input.setAttribute("data-vc-scheme-input", "1");
        function syncFromValue() {
          var v = String(input.value || "").trim();
          var m = v.match(/^(https?):\/\//i);
          var host = input.closest ? input.closest(".vc-boards-field__control") : null;
          var prefix = host && host.querySelector ? host.querySelector("[data-vc-scheme-toggle]") : null;
          if (m && prefix) {
            prefix.textContent = String(m[1]).toLowerCase() + "://";
            prefix.setAttribute(
              "title",
              "Clicca per passare a " +
                (prefix.textContent === "https://" ? "http://" : "https://"),
            );
          }
          if (m) input.value = stripHttpsSuffix(v);
          syncSchemePrefixForInput(input);
        }
        input.addEventListener("paste", function () {
          setTimeout(syncFromValue, 0);
        });
        input.addEventListener("input", function () {
          syncSchemePrefixForInput(input);
        });
        input.addEventListener("change", syncFromValue);
        input.addEventListener("blur", syncFromValue);
        syncSchemePrefixForInput(input);
      });
    }

    /* boardsDescMinPreview1: contatori + anteprima formattazione live */
    function bindDescLive(rootEl, cfg) {
      var minTag = Math.max(8, Math.min(80, Number((cfg && cfg.minTaglineChars) || 20) || 20));
      var minDesc = Math.max(20, Math.min(500, Number((cfg && cfg.minDescriptionChars) || 80) || 80));
      var maxTag = 500;
      var maxDesc = Math.max(2000, Math.min(8000, Number((cfg && cfg.maxMarkdownChars) || 4000) || 4000));
      var tag = rootEl.querySelector("#vc-boards-tagline");
      var tagCnt = rootEl.querySelector("#vc-boards-tagline-count");
      var tagPrev = rootEl.querySelector("#vc-boards-tagline-preview-body");
      var desc = rootEl.querySelector("#vc-boards-desc");
      var descCnt = rootEl.querySelector("#vc-boards-desc-count");
      var prev = rootEl.querySelector("#vc-boards-desc-preview-body");

      function syncCount(el, cnt, min, max, opts) {
        if (!el || !cnt) return 0;
        opts = opts || {};
        var raw = String(el.value || "");
        var n = opts.rawLength ? raw.length : raw.trim().length;
        var over = max > 0 && n > max;
        var left = max > 0 ? max - n : 0;
        if (over) {
          /* boardsTaglineOverCount1: es. -20 · 180/160 */
          cnt.textContent = left + " · " + n + "/" + max;
        } else {
          cnt.textContent = n + "/" + max + " (min " + min + ")";
        }
        cnt.classList.toggle("is-short", n > 0 && n < min);
        cnt.classList.toggle("is-over", over);
        cnt.classList.toggle("is-ok", n >= min && !over);
        cnt.classList.toggle("is-empty", n === 0);
        return n;
      }

      function syncTag() {
        syncCount(tag, tagCnt, minTag, maxTag, { rawLength: true });
        if (!tagPrev) return;
        var rawT = tag ? String(tag.value || "") : "";
        var htmlT = B.formatDescHtml(rawT, { inline: true });
        tagPrev.innerHTML =
          htmlT ||
          '<p class="vc-boards-desc-preview__empty">Anteprima Discord mentre scrivi…</p>';
        tagPrev.classList.toggle("is-empty", !htmlT);
      }

      function syncDesc() {
        var n = syncCount(desc, descCnt, minDesc, maxDesc);
        if (!prev) return;
        var raw = desc ? String(desc.value || "") : "";
        var html = B.formatDescHtml(raw);
        prev.innerHTML =
          html ||
          '<p class="vc-boards-desc-preview__empty">Anteprima Discord mentre scrivi…</p>';
        prev.classList.toggle("is-empty", !html);
        return n;
      }

      if (tag) {
        tag.setAttribute("minlength", String(minTag));
        tag.addEventListener("input", syncTag);
        tag.addEventListener("change", syncTag);
      }
      if (desc) {
        desc.setAttribute("minlength", String(minDesc));
        desc.setAttribute("maxlength", String(maxDesc));
        desc.addEventListener("input", syncDesc);
        desc.addEventListener("change", syncDesc);
      }
      bindDeformatButtons(rootEl);
      bindTaglineClamp(rootEl);
      syncTag();
      syncDesc();
      return {
        minTagline: minTag,
        minDescription: minDesc,
        maxTagline: maxTag,
        validate: function () {
          var tn = tag ? String(tag.value || "").length : 0;
          var tnTrim = tag ? String(tag.value || "").trim().length : 0;
          var dn = desc ? String(desc.value || "").trim().length : 0;
          if (tnTrim < minTag) {
            return {
              ok: false,
              message: "Descrizione breve: almeno " + minTag + " caratteri (ora " + tnTrim + ").",
            };
          }
          if (tn > maxTag) {
            return {
              ok: false,
              message:
                "Descrizione breve: massimo " +
                maxTag +
                " caratteri (ora " +
                tn +
                ", " +
                (maxTag - tn) +
                ").",
            };
          }
          if (dn < minDesc) {
            return {
              ok: false,
              message: "Descrizione lunga: almeno " + minDesc + " caratteri (ora " + dn + ").",
            };
          }
          return { ok: true };
        },
      };
    }

    function bindLocaleMenu(rootEl, labels, maxLocales) {
      var msel = rootEl.querySelector("#vc-boards-loc-msel");
      if (!msel) return;
      var btn = msel.querySelector("#vc-boards-loc-btn");
      var panel = msel.querySelector("#vc-boards-loc-panel");
      var picked = msel.querySelector("#vc-boards-loc-picked");
      var btnLabel = msel.querySelector("#vc-boards-loc-btn-label");
      var q = msel.querySelector("#vc-boards-loc-q");
      var opts = msel.querySelectorAll(".vc-boards-msel__opt");
      var max = Math.max(
        1,
        Math.min(32, Number(maxLocales || msel.getAttribute("data-max") || 32) || 32),
      );
      var lab = labels || LOCALE_LABELS;

      function selectedCount() {
        var n = 0;
        opts.forEach(function (opt) {
          var inp = opt.querySelector("input");
          if (inp && inp.checked) n += 1;
        });
        return n;
      }

      function sync() {
        var on = [];
        opts.forEach(function (opt) {
          var inp = opt.querySelector("input");
          var active = !!(inp && inp.checked);
          opt.classList.toggle("is-on", active);
          if (active) {
            on.push({
              v: inp.value,
              t: lab[inp.value] || LOCALE_LABELS[inp.value] || inp.value,
              ico: localeFlagHtml(inp.value),
            });
          }
        });
        if (btnLabel) {
          btnLabel.textContent = on.length
            ? on.length + "/" + max + (on.length === 1 ? " lingua" : " lingue")
            : "Seleziona le lingue";
          btnLabel.classList.toggle("is-placeholder", !on.length);
        }
        if (picked) {
          picked.innerHTML = on
            .map(function (x) {
              return (
                '<button type="button" class="vc-boards-msel__tag" data-value="' +
                B.esc(x.v) +
                '"><span class="vc-boards-msel__tag-ico vc-boards-msel__tag-ico--flag" aria-hidden="true">' +
                x.ico +
                "</span>" +
                B.esc(x.t) +
                ' <i class="fa fa-times" aria-hidden="true"></i></button>'
              );
            })
            .join("");
        }
      }

      function setOpen(open) {
        msel.classList.toggle("is-open", open);
        if (panel) panel.hidden = !open;
        if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
      }

      if (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          setOpen(!msel.classList.contains("is-open"));
        });
      }
      opts.forEach(function (opt) {
        opt.addEventListener("change", function () {
          var inp = opt.querySelector("input");
          if (inp && inp.checked && selectedCount() > max) {
            inp.checked = false;
            setMsg(null, "Massimo " + max + " lingue.", true);
          }
          sync();
        });
      });
      if (picked) {
        picked.addEventListener("click", function (e) {
          var tag = e.target.closest(".vc-boards-msel__tag");
          if (!tag) return;
          var v = tag.getAttribute("data-value");
          var inp = msel.querySelector('input[value="' + v + '"]');
          if (inp) {
            inp.checked = false;
            sync();
          }
        });
      }
      if (q) {
        q.addEventListener("input", function () {
          var needle = String(q.value || "").toLowerCase().trim();
          opts.forEach(function (opt) {
            var t = String(opt.textContent || "").toLowerCase();
            opt.hidden = !!(needle && t.indexOf(needle) < 0);
          });
        });
      }
      document.addEventListener(
        "click",
        function (e) {
          if (!msel.contains(e.target)) setOpen(false);
        },
        true,
      );
      var over = [];
      opts.forEach(function (opt) {
        var inp = opt.querySelector("input");
        if (inp && inp.checked) over.push(inp);
      });
      if (over.length > max) {
        over.slice(max).forEach(function (inp) {
          inp.checked = false;
        });
      }
      sync();
    }

    async function renderSubmit() {
      if (!B.token()) return needLogin();
      if (B.dismissBoardsGate) B.dismissBoardsGate();

      var WIZ_KEY = "vc_boards_submit_wiz_v1";
      var FORM_PREFIX = "vc_boards_submit_form_v1:";

      var state = {
        kind: "server",
        step: "pick",
        guild: null,
        listing: null,
        cfg: null,
        botInviteUrl: "",
        _resumed: false,
      };

      function readUrlResume() {
        try {
          var q = new URLSearchParams(window.location.search || "");
          return {
            guildId: String(q.get("guildId") || q.get("g") || "").trim(),
            listingId: String(q.get("listingId") || "").trim(),
            step: String(q.get("step") || "").trim(),
            kind: String(q.get("kind") || "").trim(),
          };
        } catch (eU) {
          return { guildId: "", listingId: "", step: "", kind: "" };
        }
      }

      function readSsResume() {
        try {
          var raw = sessionStorage.getItem(WIZ_KEY);
          if (!raw) return null;
          var data = JSON.parse(raw);
          if (!data || typeof data !== "object") return null;
          var at = Number(data.t) || 0;
          if (at && Date.now() - at > 24 * 60 * 60 * 1000) return null;
          return data;
        } catch (eS) {
          return null;
        }
      }

      function persistWizard() {
        try {
          var u = new URL(window.location.href);
          var gId = state.guild && state.guild.id ? String(state.guild.id) : "";
          if (!gId || state.step === "pick" || state.step === "bot-id") {
            u.searchParams.delete("guildId");
            u.searchParams.delete("g");
            u.searchParams.delete("listingId");
            u.searchParams.delete("step");
            if (state.kind === "bot") u.searchParams.set("kind", "bot");
            else u.searchParams.delete("kind");
          } else {
            u.searchParams.set("guildId", gId);
            u.searchParams.set("step", state.step);
            u.searchParams.set("kind", state.kind || "server");
            if (state.listing && state.listing.id) {
              u.searchParams.set("listingId", String(state.listing.id));
            } else {
              u.searchParams.delete("listingId");
            }
          }
          var next = u.pathname + u.search + u.hash;
          if (next !== window.location.pathname + window.location.search + window.location.hash) {
            history.replaceState(null, "", next);
          }
        } catch (eUrl) {}
        try {
          if (!state.guild || !state.guild.id || state.step === "pick") {
            sessionStorage.removeItem(WIZ_KEY);
          } else {
            sessionStorage.setItem(
              WIZ_KEY,
              JSON.stringify({
                kind: state.kind,
                step: state.step,
                guildId: state.guild.id,
                guildName: state.guild.name || "",
                guildIcon: state.guild.iconUrl || "",
                botPresent: !!state.guild.botPresent,
                listingId: (state.listing && state.listing.id) || "",
                t: Date.now(),
              }),
            );
          }
        } catch (eSs) {}
      }

      function formDraftKey() {
        var id = state.guild && state.guild.id ? String(state.guild.id) : "";
        if (!id) return "";
        return FORM_PREFIX + String(state.kind || "server") + ":" + id;
      }

      function normalizeDraftTags(tags) {
        if (Array.isArray(tags)) {
          return tags
            .map(function (t) {
              return normalizeTag(t);
            })
            .filter(Boolean);
        }
        return String(tags || "")
          .split(/[,\s]+/)
          .map(function (t) {
            return normalizeTag(t);
          })
          .filter(Boolean);
      }

      function loadFormDraft() {
        var key = formDraftKey();
        if (!key) return null;
        try {
          var raw = sessionStorage.getItem(key);
          if (!raw) return null;
          var data = JSON.parse(raw);
          if (!data || typeof data !== "object") return null;
          var at = Number(data.t) || 0;
          if (at && Date.now() - at > 24 * 60 * 60 * 1000) return null;
          var fields = data.fields;
          if (!fields || typeof fields !== "object") return null;
          fields = Object.assign({}, fields);
          fields.tags = normalizeDraftTags(fields.tags);
          return fields;
        } catch (eF) {
          return null;
        }
      }

      function saveFormDraftNow() {
        var key = formDraftKey();
        if (!key || !document.getElementById("vc-boards-form")) return;
        try {
          var fields = collectFormFields(state.kind);
          sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), fields: fields }));
        } catch (eSave) {}
      }

      function clearFormDraft() {
        var key = formDraftKey();
        if (!key) return;
        try {
          sessionStorage.removeItem(key);
        } catch (eClr) {}
      }

      function clearWizardResume() {
        try {
          sessionStorage.removeItem(WIZ_KEY);
        } catch (e0) {}
        try {
          var u = new URL(window.location.href);
          ["guildId", "g", "listingId", "step"].forEach(function (k) {
            u.searchParams.delete(k);
          });
          if (state.kind !== "bot") u.searchParams.delete("kind");
          history.replaceState(null, "", u.pathname + u.search + u.hash);
        } catch (e1) {}
      }

      var cfgOut = await B.api("/config");
      state.cfg =
        cfgOut && cfgOut.ok
          ? cfgOut
          : {
              categories: Object.keys(CAT_LABELS),
              locales: LOCALE_ORDER.slice(),
              categoryLabels: CAT_LABELS,
              localeLabels: LOCALE_LABELS,
              maxLocales: 32,
              minTaglineChars: 20,
              minDescriptionChars: 80,
            };
      state.botInviteUrl = state.cfg.botInviteUrl || "";

      /* boardsHeaderNav1: chrome = solo Server|Bot centrato */
      try {
        var urlKind0 = String(
          new URLSearchParams(window.location.search || "").get("kind") || "",
        )
          .trim()
          .toLowerCase();
        if (urlKind0 === "bot") state.kind = "bot";
      } catch (_) {}
      var shell =
        B.navHtml("submit", { kind: state.kind || "server", idPrefix: "vc-boards-tab" }) +
        '<div class="vc-boards-wizard mt-4" id="vc-boards-wizard">' +
        '<div id="vc-boards-steps-wrap"></div>' +
        '<div id="vc-boards-step" class="mt-3"></div>' +
        '<div id="vc-boards-msg" class="vc-boards-msg mt-4" hidden></div></div>';
      root.innerHTML = shell;
      var msg = document.getElementById("vc-boards-msg");
      var stepEl = document.getElementById("vc-boards-step");
      var stepsWrap = document.getElementById("vc-boards-steps-wrap");

      function syncKindTabs() {
        var sBtn = document.getElementById("vc-boards-tab-server");
        var bBtn = document.getElementById("vc-boards-tab-bot");
        if (sBtn) sBtn.classList.toggle("is-active", state.kind === "server");
        if (bBtn) bBtn.classList.toggle("is-active", state.kind === "bot");
      }

      async function hydrateListing() {
        if (!state.listing || !state.listing.id) return;
        if (state.listing.checklist || state.listing.tagline != null || state.listing.status) return;
        var mine = await B.api("/me/listings");
        if (!mine.ok) return;
        var found = (mine.listings || []).find(function (x) {
          return x.id === state.listing.id;
        });
        if (found) state.listing = found;
      }

      function stepTargetFromUi(uiId) {
        if (uiId === "pick") return "pick";
        if (uiId === "bot") return state.kind === "bot" ? "bot-id" : "tutorial";
        if (uiId === "form") return "form";
        if (uiId === "review") return "review";
        return "";
      }

      function bindStepsNav() {
        if (!stepsWrap) return;
        stepsWrap.querySelectorAll("[data-vc-step]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var ui = String(btn.getAttribute("data-vc-step") || "").trim();
            var target = stepTargetFromUi(ui);
            if (!target || target === state.step) return;
            /* Solo indietro: non saltare avanti a review senza bozza */
            var uiActive =
              state.step === "pick" || state.step === "bot-id"
                ? "pick"
                : state.step === "tutorial"
                  ? "bot"
                  : state.step;
            var order = ["pick", "bot", "form", "review"];
            if (order.indexOf(ui) >= order.indexOf(uiActive)) return;
            if (state.step === "form" || state.step === "review") {
              try {
                saveFormDraftNow();
              } catch (eSave) {}
            }
            if (target === "pick") {
              /* torna a scelta server/bot — tiene kind */
              go("pick");
              return;
            }
            if (target === "form" && !(state.guild && state.guild.id) && state.kind !== "bot") {
              go("pick");
              return;
            }
            if (target === "review" && !(state.listing && state.listing.id)) return;
            go(target);
          });
        });
      }

      async function go(step) {
        state.step = step;
        stepsWrap.innerHTML = stepsHtml(
          step === "pick" || step === "bot-id" ? "pick" : step === "tutorial" ? "bot" : step,
        );
        bindStepsNav();
        setMsg(msg, "");
        if (step === "pick") await renderPick();
        else if (step === "tutorial") renderTutorial();
        else if (step === "bot-id") renderBotId();
        else if (step === "form") await renderForm();
        else if (step === "review") {
          await hydrateListing();
          renderReview();
        }
        persistWizard();
        try {
          if (B.markContentReady) B.markContentReady();
        } catch (eReady) {}
      }

      async function tryResumeWizard(guilds) {
        if (state._resumed) return false;
        var url = readUrlResume();
        var ss = readSsResume() || {};
        /* boardsSubmitPickFirst1: senza guildId in URL non riprendere da SS
           (click tab Pubblica deve sempre mostrare l’elenco server). */
        var guildId = String(url.guildId || "").trim();
        if (!guildId) return false;
        var kind = url.kind || ss.kind || state.kind || "server";
        var listingId = url.listingId || ss.listingId || "";
        var wantStep = url.step || ss.step || "";

        if (kind === "bot") {
          state.kind = "bot";
          syncKindTabs();
          state.guild = {
            id: guildId,
            name: ss.guildName || "",
            botPresent: true,
            claimable: true,
          };
          if (listingId) state.listing = { id: listingId };
          state._resumed = true;
          var botStep = wantStep === "review" ? "review" : wantStep === "bot-id" ? "bot-id" : "form";
          if (botStep === "review" && !listingId) botStep = "form";
          await go(botStep);
          return true;
        }

        state.kind = "server";
        syncKindTabs();
        var g = (guilds || []).find(function (x) {
          return String(x.id) === String(guildId);
        });
        if (!g || g.alreadyListed) return false;
        state.guild = g;
        if (listingId) state.listing = { id: listingId };
        else if (g.hasDraft && g.draftId) state.listing = { id: g.draftId };
        state._resumed = true;
        var step = wantStep;
        if (!g.botPresent) {
          if (!step || step === "pick" || step === "form" || step === "review") step = "tutorial";
        } else if (!step || step === "pick" || step === "tutorial" || step === "bot-id") {
          step = "form";
        }
        if (step === "review" && !(state.listing && state.listing.id)) step = "form";
        await go(step);
        return true;
      }

      /* boardsPickAddBot1: invite Vinili + refresh lista dopo add */
      function pickBotInviteUrl() {
        return String(
          state.botInviteUrl ||
            (state.cfg && state.cfg.botInviteUrl) ||
            "",
        ).trim();
      }

      function pickAddBotBarHtml() {
        var invite = pickBotInviteUrl();
        return (
          '<div class="vc-boards-pick-actions" id="vc-boards-pick-actions">' +
          (invite
            ? '<a class="vc-boards-btn vc-boards-btn--primary vc-no-sfx" id="vc-boards-add-bot" href="' +
              B.esc(invite) +
              '" target="_blank" rel="noopener noreferrer">' +
              '<i class="fa fa-plus" aria-hidden="true"></i> Aggiungi bot a un server</a>'
            : "") +
          '<button type="button" class="vc-boards-btn vc-no-sfx" id="vc-boards-refresh-pick">' +
          '<i class="fa fa-refresh" aria-hidden="true"></i> Aggiorna lista</button>' +
          '<p class="vc-boards-pick-actions__hint">Dopo l’aggiunta su Discord, aggiorna l’elenco.</p>' +
          "</div>"
        );
      }

      /* boardsPickSoftRefresh1: skeleton solo sulla griglia, no reload pagina */
      function claimSkeletonHtml(count) {
        var n = Math.max(4, Math.min(Number(count) || 6, 12));
        var out = "";
        for (var i = 0; i < n; i += 1) {
          out +=
            '<div class="vc-boards-claim-card vc-boards-claim-card--skel" aria-hidden="true">' +
            '<span class="vc-boards-claim-skel__ava"></span>' +
            '<span class="vc-boards-claim-skel__body"><i></i><i></i></span></div>';
        }
        return out;
      }

      function setPickRefreshBusy(busy) {
        var refresh = document.getElementById("vc-boards-refresh-pick");
        if (!refresh) return;
        refresh.disabled = !!busy;
        refresh.classList.toggle("is-busy", !!busy);
        refresh.setAttribute("aria-busy", busy ? "true" : "false");
      }

      function ensurePickChrome(skelCount) {
        var grid = document.getElementById("vc-boards-claim-grid");
        var bar = document.getElementById("vc-boards-pick-actions");
        if (grid && bar) return grid;
        stepEl.innerHTML =
          '<p class="vc-boards-hint" data-i18n="boards.pickHint">Seleziona un server di cui sei il proprietario Discord.</p>' +
          pickAddBotBarHtml() +
          '<div class="vc-boards-claim-grid is-loading" id="vc-boards-claim-grid" aria-busy="true">' +
          claimSkeletonHtml(skelCount || 6) +
          "</div>";
        bindPickAddBotActions();
        return document.getElementById("vc-boards-claim-grid");
      }

      function paintClaimGrid(rows) {
        var grid = document.getElementById("vc-boards-claim-grid");
        if (!grid) return;
        grid.classList.remove("is-loading");
        grid.removeAttribute("aria-busy");
        if (!rows.length) {
          /* boardsOwnerOnly1 */
          grid.innerHTML =
            '<div class="vc-boards-empty vc-boards-empty--in-grid">' +
            "<p>Nessun server disponibile. Puoi pubblicare solo server di cui sei il proprietario Discord.</p>" +
            '<p class="vc-boards-hint">Se il bot non è presente, aggiungilo al server e aggiorna l’elenco.</p>' +
            "</div>";
          return;
        }
        /* boardsPickDisabled1: già in bacheca → card disattivata (niente badge) */
        grid.innerHTML = rows
          .map(function (g) {
            var badges = [];
            if (!g.alreadyListed) {
              if (g.hasDraft) {
                badges.push(
                  '<span class="vc-boards-badge vc-boards-badge--draft">' +
                    '<i class="fa fa-pencil" aria-hidden="true"></i> Bozza</span>',
                );
              }
              if (!g.botPresent) {
                badges.push('<span class="vc-boards-badge vc-boards-badge--warn">manca bot</span>');
              }
            }
            var disabled = g.alreadyListed ? " is-disabled" : "";
            return (
              '<button type="button" class="vc-boards-claim-card vc-no-sfx' +
              disabled +
              '" data-id="' +
              B.esc(g.id) +
              '"' +
              (g.alreadyListed ? ' disabled aria-disabled="true" title="Già presente in bacheca"' : "") +
              ">" +
              ((B.animMediaUrl ? B.animMediaUrl(g.iconUrl) : g.iconUrl)
                ? '<img class="vc-boards-claim-card__ico-img" src="' +
                  B.esc(B.animMediaUrl ? B.animMediaUrl(g.iconUrl) : g.iconUrl) +
                  '" alt="" width="48" height="48" decoding="async" data-vc-anim-media="1" draggable="false" />'
                : '<span class="vc-boards-claim-card__ico"><i class="fa fa-server"></i></span>') +
              "<div><strong>" +
              B.esc(g.name) +
              "</strong>" +
              (badges.length ? '<div class="vc-boards-claim-card__badges">' + badges.join("") + "</div>" : "") +
              "</div></button>"
            );
          })
          .join("");
        grid.querySelectorAll(".vc-boards-claim-card:not([disabled])").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            var g = rows.find(function (x) {
              return x.id === id;
            });
            if (!g) return;
            state.guild = g;
            state.listing = null;
            if (g.hasDraft && g.draftId) {
              state.listing = { id: g.draftId };
            }
            if (!g.botPresent) go("tutorial");
            else go("form");
          });
        });
      }

      function bindPickAddBotActions() {
        var refresh = document.getElementById("vc-boards-refresh-pick");
        if (refresh && !refresh._vcBound) {
          refresh._vcBound = true;
          refresh.addEventListener("click", function () {
            if (refresh.disabled) return;
            renderPick({ soft: true });
          });
        }
      }

      async function renderPick(opts) {
        opts = opts || {};
        if (state.kind === "bot") {
          renderBotId();
          return;
        }
        var soft = !!opts.soft;
        var prevCount = 6;
        try {
          var gPrev = document.getElementById("vc-boards-claim-grid");
          if (gPrev) {
            prevCount = gPrev.querySelectorAll(".vc-boards-claim-card, .vc-boards-claim-card--skel").length || 6;
          }
        } catch (eCnt) {}

        var grid = soft ? ensurePickChrome(prevCount) : null;
        if (!soft) {
          setMsg(msg, "Carico i tuoi server…");
          stepEl.innerHTML =
            '<p class="vc-boards-hint" data-i18n="boards.pickHint">Seleziona un server di cui sei il proprietario Discord.</p>' +
            pickAddBotBarHtml() +
            '<div class="vc-boards-claim-grid is-loading" id="vc-boards-claim-grid" aria-busy="true">' +
            claimSkeletonHtml(6) +
            "</div>";
          bindPickAddBotActions();
          grid = document.getElementById("vc-boards-claim-grid");
        } else if (grid) {
          grid.innerHTML = claimSkeletonHtml(prevCount);
          grid.classList.add("is-loading");
          grid.setAttribute("aria-busy", "true");
          setMsg(msg, "");
        }
        setPickRefreshBusy(true);

        try {
          var claim = await B.api("/me/claimable-servers");
          if (!claim.ok) {
            var needGuilds =
              claim.error === "missing_guilds_scope" ||
              claim.error === "invalid_token" ||
              /guilds|sessione|login/i.test(String(claim.message || ""));
            setMsg(
              msg,
              claim.message ||
                "Serve permesso guilds: effettua di nuovo il login (autorizza l’accesso ai server).",
              true,
            );
            stepEl.innerHTML =
              '<div class="vc-boards-empty"><p class="vc-boards-hint">Per visualizzare i server è necessario il permesso <strong>guilds</strong> in fase di accesso.</p>' +
              '<button type="button" class="vc-boards-btn vc-boards-btn--primary" id="vc-boards-relogin">Rifai login Discord</button></div>' +
              pickAddBotBarHtml();
            var relog = document.getElementById("vc-boards-relogin");
            if (relog) {
              relog.addEventListener("click", function () {
                triggerDiscordLogin(true);
              });
            }
            if (needGuilds) {
              /* auto-hint: non aprire OAuth da solo (serve gesto utente) */
            }
            bindPickAddBotActions();
            try {
              if (B.markContentReady) B.markContentReady();
            } catch (eReady2) {}
            return;
          }
          setMsg(msg, "");
          if (claim.botInviteUrl) state.botInviteUrl = claim.botInviteUrl;
          /* refresh invite href if bar already present */
          var addBot = document.getElementById("vc-boards-add-bot");
          if (addBot && state.botInviteUrl) addBot.setAttribute("href", state.botInviteUrl);
          ensurePickChrome(prevCount);
          var guilds = claim.guilds || [];
          paintClaimGrid(guilds);
          if (!soft && !state._resumed) {
            var resumed = await tryResumeWizard(guilds);
            if (resumed) return;
          }
        } finally {
          setPickRefreshBusy(false);
        }
      }

      function renderTutorial() {
        /* boardsTutorialUi1: card step + CTA gerarchia */
        var g = state.guild || {};
        var invite = g.inviteBotUrl || state.botInviteUrl || "#";
        var guildName = B.esc(g.name || "il server");
        stepEl.innerHTML =
          '<div class="vc-boards-tutorial">' +
          '<div class="vc-boards-tutorial__head">' +
          '<span class="vc-boards-tutorial__ico" aria-hidden="true"><i class="fa fa-puzzle-piece"></i></span>' +
          "<div class=\"vc-boards-tutorial__titles\">" +
          '<h2 data-i18n="boards.tutorialTitle">Invita il bot Vinili &amp; Caffè</h2>' +
          '<p class="vc-boards-tutorial__lead" data-i18n="boards.tutorialLead">' +
          "Per pubblicare questo server è necessario che il bot sia presente.</p>" +
          '<div class="vc-boards-tutorial__guild" title="' +
          guildName +
          '"><i class="fa fa-server" aria-hidden="true"></i><span>' +
          guildName +
          "</span></div>" +
          "</div></div>" +
          '<ol class="vc-boards-tutorial__steps">' +
          '<li><span class="vc-boards-tutorial__n" aria-hidden="true">1</span>' +
          '<span class="vc-boards-tutorial__t">Apri il link di invito del bot</span></li>' +
          '<li><span class="vc-boards-tutorial__n" aria-hidden="true">2</span>' +
          '<span class="vc-boards-tutorial__t">Seleziona il server e autorizza</span></li>' +
          '<li><span class="vc-boards-tutorial__n" aria-hidden="true">3</span>' +
          '<span class="vc-boards-tutorial__t">Torna qui e conferma l’operazione</span></li>' +
          "</ol>" +
          '<div class="vc-boards-tutorial__actions">' +
          '<a class="vc-boards-btn vc-boards-btn--primary vc-boards-tutorial__cta" href="' +
          B.esc(invite) +
          '" target="_blank" rel="noopener noreferrer">' +
          '<i class="fa fa-external-link" aria-hidden="true"></i> Invita bot</a>' +
          '<div class="vc-boards-tutorial__actions-row">' +
          '<button type="button" class="vc-boards-btn" id="vc-boards-bot-added">' +
          '<i class="fa fa-check" aria-hidden="true"></i> Ho aggiunto il bot</button>' +
          '<button type="button" class="vc-boards-btn vc-boards-btn--ghost" id="vc-boards-back-pick">Indietro</button>' +
          "</div>" +
          '<p class="vc-boards-tutorial__note">Dopo l’invito, Discord può impiegare alcuni secondi ad aggiornare lo stato.</p>' +
          "</div></div>";
        document.getElementById("vc-boards-back-pick").addEventListener("click", function () {
          state.guild = null;
          state.listing = null;
          clearWizardResume();
          go("pick");
        });
        document.getElementById("vc-boards-bot-added").addEventListener("click", async function () {
          setMsg(msg, "Verifico…");
          var claim = await B.api("/me/claimable-servers");
          if (!claim.ok) {
            setMsg(msg, claim.message || "Verifica fallita.", true);
            return;
          }
          var g2 = (claim.guilds || []).find(function (x) {
            return x.id === g.id;
          });
          if (!g2 || !g2.botPresent) {
            setMsg(msg, "Bot ancora assente. Attendi qualche secondo e riprova.", true);
            return;
          }
          state.guild = g2;
          setMsg(msg, "");
          go("form");
        });
        try {
          if (typeof window.__vcI18nApply === "function") window.__vcI18nApply(stepEl);
        } catch (eI18n) {}
      }

      function renderBotId() {
        stepsWrap.innerHTML = stepsHtml("pick");
        stepEl.innerHTML =
          '<p class="vc-boards-hint">Inserisci il Client ID dell’applicazione (Discord Developer Portal).</p>' +
          '<form class="vc-boards-form" id="vc-boards-bot-id-form">' +
          '<label class="is-required"><span class="vc-boards-field__caption">Client ID bot' +
          reqStar(true) +
          '</span><input id="vc-boards-bot-id" inputmode="numeric" autocomplete="off" required /></label>' +
          '<label class="is-required"><span class="vc-boards-field__caption">Nome bot' +
          reqStar(true) +
          '</span><input id="vc-boards-bot-name-early" maxlength="100" required /></label>' +
          '<button type="submit" class="vc-boards-btn vc-boards-btn--primary">Continua</button>' +
          "</form>";
        document.getElementById("vc-boards-bot-id-form").addEventListener("submit", function (e) {
          e.preventDefault();
          var id = document.getElementById("vc-boards-bot-id").value.trim();
          var name = document.getElementById("vc-boards-bot-name-early").value.trim();
          if (!/^\d{17,22}$/.test(id)) {
            setMsg(msg, "Client ID non valido.", true);
            return;
          }
          state.guild = { id: id, name: name, botPresent: true, claimable: true };
          state.listing = null;
          go("form");
        });
      }

      async function ensureListing(fields) {
        if (state.listing && state.listing.id) {
          var patch = Object.assign({}, fields);
          var r = await B.api("/listings/" + encodeURIComponent(state.listing.id), {
            method: "PATCH",
            json: patch,
          });
          if (!r.ok) return r;
          state.listing = r.listing;
          return r;
        }
        var body = Object.assign(
          {
            kind: state.kind,
            discordId: state.guild && state.guild.id,
            name: state.kind === "bot" ? fields.name || (state.guild && state.guild.name) : state.guild && state.guild.name,
            iconUrl: state.guild && state.guild.iconUrl,
          },
          fields,
        );
        var created = await B.api("/listings", { method: "POST", json: body });
        if (created.ok && created.listing) state.listing = created.listing;
        return created;
      }

      async function loadPrefill() {
        if (state.listing && state.listing.id && !state.listing.tagline && state.listing.status == null) {
          var mine = await B.api("/me/listings");
          if (mine.ok) {
            var found = (mine.listings || []).find(function (x) {
              return x.id === state.listing.id;
            });
            if (found) state.listing = found;
          }
        }
        return state.listing || {};
      }

      async function renderForm() {
        var prefill = await loadPrefill();
        if (state.kind === "bot" && state.guild && !prefill.name) {
          prefill = Object.assign({}, prefill, { name: state.guild.name });
        }
        var g = state.guild || {};
        /* boardsFormCleanPrefix1: niente invite/sito/banner precompilati da Discord */
        prefill = Object.assign({}, prefill);
        if (!state.listing || !state.listing.id) {
          prefill.inviteUrl = "";
          prefill.siteUrl = "";
          prefill.bannerUrl = "";
        }
        /* boardsSubmitResume1: campi digitati prima di Continua sopravvivono al refresh */
        var localDraft = loadFormDraft();
        if (localDraft) {
          prefill = Object.assign({}, prefill, localDraft);
          if (localDraft.categories && localDraft.categories.length) prefill.categories = localDraft.categories;
          if (localDraft.locales && localDraft.locales.length) prefill.locales = localDraft.locales;
          if (localDraft.tags && localDraft.tags.length) prefill.tags = localDraft.tags;
          if (localDraft.socials) prefill.socials = Object.assign({}, prefill.socials || {}, localDraft.socials);
          /* boardsKeepMdDraft1: testo locale vince sempre su listing (evita md perso al re-render) */
          if (localDraft.tagline != null) prefill.tagline = String(localDraft.tagline);
          if (localDraft.description != null) prefill.description = String(localDraft.description);
          else if (localDraft.markdown != null) prefill.description = String(localDraft.markdown);
        }
        var title = (g.name || prefill.name || "la tua scheda").trim();
        var keepTagline = String(prefill.tagline || "");
        var keepDesc = String(prefill.description || prefill.markdown || "");
        var heroIconUrl = B.animMediaUrl ? B.animMediaUrl(g.iconUrl) : g.iconUrl;
        var icoHtml = heroIconUrl
          ? '<img class="vc-boards-form-hero__img" src="' +
            B.esc(heroIconUrl) +
            '" alt="" width="56" height="56" decoding="async" data-vc-anim-media="1" draggable="false" />'
          : '<span class="vc-boards-form-hero__img vc-boards-form-hero__img--fallback" aria-hidden="true"><i class="fa ' +
            (state.kind === "bot" ? "fa-android" : "fa-server") +
            '"></i></span>';
        stepEl.innerHTML =
          '<div class="vc-boards-form-hero">' +
          icoHtml +
          '<div class="vc-boards-form-hero__text">' +
          '<p class="vc-boards-form-hero__kicker">' +
          (state.kind === "bot" ? "Scheda bot" : "Scheda server") +
          "</p>" +
          '<h2 class="vc-boards-form-hero__title">' +
          B.esc(title) +
          "</h2>" +
          '<p class="vc-boards-form-hero__lead">Compila i campi obbligatori e procedi all’invio in moderazione.</p>' +
          "</div></div>" +
          '<form class="vc-boards-form vc-boards-form--editor" id="vc-boards-form">' +
          formFieldsHtml(state.kind, prefill, state.cfg) +
          '<div class="vc-boards-form-actions">' +
          '<button type="button" class="vc-boards-form-actions__back vc-no-sfx" id="vc-boards-back">' +
          '<i class="fa fa-chevron-left" aria-hidden="true"></i><span>Indietro</span></button>' +
          '<button type="submit" class="vc-boards-form-actions__next vc-no-sfx">' +
          '<span data-i18n="boards.continue">Continua</span><i class="fa fa-arrow-right" aria-hidden="true"></i></button>' +
          "</div></form>";

        try {
          if (window.VcEmojiRender && typeof VcEmojiRender.enhance === "function") {
            VcEmojiRender.enhance(stepEl);
          }
        } catch (eBakeEmoji) {}

        /* boardsKeepMdDraft1: assegna md via .value (niente innerHTML sul testo) */
        try {
          var tagEl = document.getElementById("vc-boards-tagline");
          var descEl = document.getElementById("vc-boards-desc");
          if (tagEl) tagEl.value = keepTagline;
          if (descEl) descEl.value = keepDesc;
        } catch (eKeepMd) {}

        bindCategoryMenu(
          stepEl,
          (state.cfg && state.cfg.categoryLabels) || CAT_LABELS,
          (state.cfg && state.cfg.maxCategories) || 12,
        );
        bindLocaleMenu(
          stepEl,
          Object.assign({}, LOCALE_LABELS, (state.cfg && state.cfg.localeLabels) || {}),
          (state.cfg && state.cfg.maxLocales) || 32,
        );
        bindTagMenu(
          stepEl,
          (state.cfg && state.cfg.suggestedTags) || [],
          (state.cfg && state.cfg.maxTags) || 12,
        );
        bindAccentPicker(stepEl);
        var descLive = bindDescLive(stepEl, state.cfg || {});
        bindSchemePrefixToggles(stepEl);
        bindLinkChecks(stepEl);
        bindBannerUpload(stepEl);

        document.getElementById("vc-boards-back").addEventListener("click", function () {
          saveFormDraftNow();
          if (state.kind === "server" && state.guild && !state.guild.botPresent) go("tutorial");
          else if (state.kind === "bot") go("bot-id");
          else {
            state.guild = null;
            state.listing = null;
            clearWizardResume();
            go("pick");
          }
        });

        var formEl = document.getElementById("vc-boards-form");
        var draftTimer = null;
        var serverDraftTimer = null;
        var serverDraftSeq = 0;
        function formHasDraftPayload(fields) {
          if (!fields || typeof fields !== "object") return false;
          if (state.listing && state.listing.id) return true;
          var tags = String(fields.tags || "").trim();
          var socials = fields.socials && typeof fields.socials === "object" ? fields.socials : {};
          return !!(
            String(fields.tagline || "").trim() ||
            String(fields.description || "").trim() ||
            String(fields.inviteUrl || "").trim() ||
            String(fields.siteUrl || "").trim() ||
            String(fields.bannerUrl || "").trim() ||
            String(fields.botInviteUrl || "").trim() ||
            String(fields.name || "").trim() ||
            String(fields.accent || "").trim() ||
            tags ||
            (Array.isArray(fields.categories) && fields.categories.length) ||
            (Array.isArray(fields.locales) && fields.locales.length) ||
            Object.keys(socials).length
          );
        }
        function scheduleFormDraft() {
          /* boardsDraftAuto1: salva locale subito + bozza server con toast */
          saveFormDraftNow();
          if (draftTimer) clearTimeout(draftTimer);
          draftTimer = setTimeout(function () {
            draftTimer = null;
            saveFormDraftNow();
          }, 180);
          if (serverDraftTimer) clearTimeout(serverDraftTimer);
          serverDraftTimer = setTimeout(function () {
            serverDraftTimer = null;
            var fields = collectFormFields(state.kind);
            if (!formHasDraftPayload(fields)) return;
            var seq = ++serverDraftSeq;
            ensureListing(fields)
              .then(function (out) {
                if (seq !== serverDraftSeq) return;
                if (!out || !out.ok) return;
                /* boardsNoBlurStrip1: NON toccare .value dopo la bozza (race/blur = md che sparisce) */
                saveFormDraftNow();
                persistWizard();
                if (window.VcFormDrafts && typeof window.VcFormDrafts.notifySaved === "function") {
                  window.VcFormDrafts.notifySaved({ message: "Bozza salvata." });
                } else {
                  setMsg(msg, "Bozza salvata.");
                }
              })
              .catch(function () {});
          }, 700);
        }
        if (formEl) {
          formEl.addEventListener("input", scheduleFormDraft);
          formEl.addEventListener("change", scheduleFormDraft);
        }
        if (!state._formLeaveBound) {
          state._formLeaveBound = true;
          window.addEventListener("pagehide", function () {
            saveFormDraftNow();
            persistWizard();
          });
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "hidden") {
              saveFormDraftNow();
              persistWizard();
            }
          });
        }

        var genBtn = document.getElementById("vc-boards-gen-invite");
        if (genBtn) {
          genBtn.addEventListener("click", async function () {
            /* boardsGenInvite2: genera subito con guildId; messaggio errore reale */
            if (genBtn.disabled) return;
            if (!state.guild || !state.guild.id) {
              setMsg(msg, "Seleziona prima un server.", true);
              return;
            }
            genBtn.disabled = true;
            setMsg(msg, "Genero invite…");
            try {
              var out = await B.api("/generate-invite", {
                method: "POST",
                json: {
                  guildId: state.guild.id,
                  listingId: (state.listing && state.listing.id) || undefined,
                },
              });
              if (!out || !out.ok) {
                var why =
                  (out && String(out.message || "").trim()) ||
                  (out && out.error === "missing_guilds_scope"
                    ? "Serve permesso guilds: rifai login Discord."
                    : "") ||
                  (out && out.error === "no_invite_channel"
                    ? "Nessun canale con permesso Crea invito."
                    : "") ||
                  (out && out.error ? String(out.error) : "") ||
                  "Generazione fallita. Incolla un invite manualmente.";
                setMsg(msg, why, true);
                return;
              }
              var inv = document.getElementById("vc-boards-invite");
              if (inv && out.inviteUrl) inv.value = stripInviteSuffix(out.inviteUrl);
              if (out.listing) state.listing = out.listing;
              saveFormDraftNow();
              persistWizard();
              setMsg(msg, "Invite generato.");
              try {
                if (stepEl.__vcBoardsRunLinkCheck) stepEl.__vcBoardsRunLinkCheck(inv);
              } catch (eChk) {}
              /* Salva in bozza in background se possibile (non blocca l’invite già in form). */
              try {
                var fields = collectFormFields(state.kind);
                if (out.inviteUrl) fields.inviteUrl = joinInviteUrl(stripInviteSuffix(out.inviteUrl));
                var saved = await ensureListing(fields);
                if (saved && saved.ok && saved.listing) {
                  state.listing = saved.listing;
                  persistWizard();
                }
              } catch (eSave) {}
            } catch (eGen) {
              setMsg(
                msg,
                (eGen && eGen.message) || "Generazione fallita. Controlla la connessione o incolla un invite.",
                true,
              );
            } finally {
              genBtn.disabled = false;
            }
          });
        }

        document.getElementById("vc-boards-form").addEventListener("submit", async function (e) {
          e.preventDefault();
          var v = descLive && descLive.validate ? descLive.validate() : { ok: true };
          if (!v.ok) {
            setMsg(msg, v.message || "Descrizioni troppo corte.", true);
            return;
          }
          var fields = collectFormFields(state.kind);
          setMsg(msg, "Salvo bozza…");
          var out = await ensureListing(fields);
          if (!out.ok) {
            setMsg(msg, out.message || "Salvataggio fallito.", true);
            return;
          }
          saveFormDraftNow();
          setMsg(msg, "Bozza salvata.");
          go("review");
        });
      }

      function renderReview() {
        /* boardsReviewUi1 */
        var L = state.listing || {};
        var g = state.guild || {};
        var check = L.checklist || { items: [], complete: false, missing: [] };
        var items = check.items || [];
        var required = items.filter(function (it) {
          return !!it.required;
        });
        var optional = items.filter(function (it) {
          return !it.required;
        });
        var missingN = (check.missing || []).length;
        var title = String(L.name || g.name || "la tua scheda").trim();
        var tagline = String(L.tagline || "").trim();
        var iconUrl = B.animMediaUrl
          ? B.animMediaUrl(L.iconUrl || g.iconUrl || "")
          : String(L.iconUrl || g.iconUrl || "").trim();
        var icoHtml = iconUrl
          ? '<img class="vc-boards-form-hero__img" src="' +
            B.esc(iconUrl) +
            '" alt="" width="56" height="56" decoding="async" data-vc-anim-media="1" draggable="false" />'
          : '<span class="vc-boards-form-hero__img vc-boards-form-hero__img--fallback" aria-hidden="true"><i class="fa ' +
            (state.kind === "bot" ? "fa-android" : "fa-server") +
            '"></i></span>';

        function splitCheckLabel(label) {
          var raw = String(label || "").trim();
          var m = raw.match(/^(.*?)\s*\((min\.\s*\d+\s*caratteri)\)$/i);
          if (m) return { title: m[1], hint: m[2] };
          return { title: raw, hint: "" };
        }

        function checkItemHtml(it) {
          var parts = splitCheckLabel(it.label);
          var cls = it.ok ? "is-ok" : it.required ? "is-missing" : "is-opt";
          var ico = it.ok ? "fa-check" : it.required ? "fa-times" : "fa-minus";
          var stateLabel = it.ok ? "ok" : it.required ? "mancante" : "opzionale";
          return (
            '<li class="' +
            cls +
            '">' +
            '<span class="vc-boards-check-mark" aria-hidden="true"><i class="fa ' +
            ico +
            '"></i></span>' +
            '<span class="vc-boards-check-text">' +
            '<span class="vc-boards-check-title">' +
            B.esc(parts.title) +
            "</span>" +
            (parts.hint
              ? '<span class="vc-boards-check-hint">' + B.esc(parts.hint) + "</span>"
              : "") +
            (!it.required
              ? '<span class="vc-boards-check-hint">opzionale' +
                (it.ok ? " · compilato" : " · non compilato") +
                "</span>"
              : "") +
            "</span>" +
            '<span class="vc-boards-check-state">' +
            B.esc(stateLabel) +
            "</span></li>"
          );
        }

        function groupHtml(label, list) {
          if (!list.length) return "";
          return (
            '<div class="vc-boards-review__group">' +
            '<p class="vc-boards-review__group-label">' +
            B.esc(label) +
            "</p>" +
            '<ul class="vc-boards-checklist">' +
            list.map(checkItemHtml).join("") +
            "</ul></div>"
          );
        }

        var statusHtml = check.complete
          ? '<div class="vc-boards-review__status is-ready" role="status">' +
            '<span class="vc-boards-review__status-ico" aria-hidden="true"><i class="fa fa-check"></i></span>' +
            '<div class="vc-boards-review__status-text">' +
            "<strong>Pronto per l’invio</strong>" +
            "<p>Lo staff revisionerà la scheda prima della pubblicazione.</p>" +
            "</div></div>"
          : '<div class="vc-boards-review__status is-blocked" role="status">' +
            '<span class="vc-boards-review__status-ico" aria-hidden="true"><i class="fa fa-exclamation"></i></span>' +
            '<div class="vc-boards-review__status-text">' +
            "<strong>Mancano " +
            missingN +
            (missingN === 1 ? " campo" : " campi") +
            " obbligatori</strong>" +
            "<p>Torna indietro e completa i punti in rosso.</p>" +
            "</div></div>";

        stepEl.innerHTML =
          '<div class="vc-boards-review">' +
          '<div class="vc-boards-form-hero">' +
          icoHtml +
          '<div class="vc-boards-form-hero__text">' +
          '<p class="vc-boards-form-hero__kicker">' +
          (state.kind === "bot" ? "Revisione bot" : "Revisione server") +
          "</p>" +
          '<h2 class="vc-boards-form-hero__title" data-i18n="boards.reviewTitle">' +
          B.esc(title) +
          "</h2>" +
          (tagline
            ? '<p class="vc-boards-form-hero__lead vc-boards-review__tagline">' +
              B.esc(tagline.length > 160 ? tagline.slice(0, 157) + "…" : tagline) +
              "</p>"
            : '<p class="vc-boards-form-hero__lead">Controlla i punti sotto, poi invia in moderazione.</p>') +
          "</div></div>" +
          statusHtml +
          '<section class="vc-boards-section vc-boards-review__panel">' +
          '<div class="vc-boards-section__head">' +
          '<span class="vc-boards-section__ico" aria-hidden="true"><i class="fa fa-list-ul"></i></span>' +
          '<div class="vc-boards-section__titles">' +
          '<h3 class="vc-boards-section__title">Checklist scheda</h3>' +
          '<p class="vc-boards-section__sub">Obbligatori e opzionali prima dell’invio</p>' +
          "</div></div>" +
          '<div class="vc-boards-section__body">' +
          groupHtml("Obbligatori", required) +
          groupHtml("Opzionali", optional) +
          "</div></section>" +
          '<div class="vc-boards-form-actions">' +
          '<button type="button" class="vc-boards-form-actions__back vc-no-sfx" id="vc-boards-edit-again">' +
          '<i class="fa fa-chevron-left" aria-hidden="true"></i><span>Modifica</span></button>' +
          '<button type="button" class="vc-boards-form-actions__next vc-no-sfx" id="vc-boards-submit-mod"' +
          (check.complete ? "" : " disabled") +
          ' data-i18n="boards.submitReview"><span>Invia in moderazione</span>' +
          '<i class="fa fa-paper-plane" aria-hidden="true"></i></button>' +
          "</div></div>";

        try {
          if (window.VcEmojiRender && typeof VcEmojiRender.enhance === "function") {
            VcEmojiRender.enhance(stepEl);
          }
        } catch (eBakeEmojiRev) {}

        document.getElementById("vc-boards-edit-again").addEventListener("click", function () {
          go("form");
        });
        var submitBtn = document.getElementById("vc-boards-submit-mod");
        submitBtn.addEventListener("click", async function () {
          if (!state.listing || !state.listing.id) {
            setMsg(msg, "Salva prima la bozza.", true);
            return;
          }
          if (submitBtn.disabled) return;
          setMsg(msg, "Invio…");
          var out = await B.api("/listings/" + encodeURIComponent(state.listing.id) + "/submit", {
            method: "POST",
            json: {},
          });
          if (!out.ok) {
            if (out.listing) state.listing = out.listing;
            setMsg(msg, out.message || "Invio fallito.", true);
            if (out.checklist) renderReview();
            return;
          }
          setMsg(msg, "Inviata in moderazione.");
          clearFormDraft();
          clearWizardResume();
          setTimeout(function () {
            location.href = "/bacheca/le-mie/";
          }, 700);
        });
      }

      document.getElementById("vc-boards-tab-server").addEventListener("click", function () {
        state.kind = "server";
        state.guild = null;
        state.listing = null;
        state._resumed = false;
        clearWizardResume();
        syncKindTabs();
        go("pick");
      });
      document.getElementById("vc-boards-tab-bot").addEventListener("click", function () {
        state.kind = "bot";
        state.guild = null;
        state.listing = null;
        state._resumed = false;
        clearWizardResume();
        syncKindTabs();
        go("bot-id");
      });
      syncKindTabs();

      var bootUrl = readUrlResume();
      /* boardsSubmitPickFirst1: ingresso pulito su /invia/ → azzera resume SS */
      if (!bootUrl.guildId && !bootUrl.listingId) {
        try {
          sessionStorage.removeItem(WIZ_KEY);
        } catch (eClrBoot) {}
      }
      var bootSs = readSsResume() || {};
      var bootKind = bootUrl.kind || bootSs.kind || "";
      if (bootKind === "bot") {
        state.kind = "bot";
        syncKindTabs();
        if (bootUrl.guildId) {
          var didBot = await tryResumeWizard([]);
          if (didBot) return;
        }
        await go("bot-id");
        return;
      }
      await go("pick");
    }

    function manageEditIdFromUrl() {
      try {
        var u = new URL(location.href);
        return String(u.searchParams.get("id") || u.searchParams.get("listingId") || "").trim();
      } catch (eUrl) {
        return "";
      }
    }

    function setManageEditId(id) {
      try {
        var u = new URL(location.href);
        if (id) u.searchParams.set("id", String(id));
        else {
          u.searchParams.delete("id");
          u.searchParams.delete("listingId");
        }
        history.replaceState({}, "", u.pathname + u.search + u.hash);
      } catch (eSet) {}
    }

    function manageStatusMeta(st) {
      var s = String(st || "");
      if (s === "pending") {
        return {
          cls: "is-pending",
          ico: "fa-hourglass-half",
          title: "In moderazione",
          lead: "La scheda è in coda. Puoi ancora modificare i contenuti.",
        };
      }
      if (s === "approved") {
        return {
          cls: "is-ready",
          ico: "fa-check",
          title: "Approvata",
          lead: "Pubblica in bacheca. Puoi modificarla senza nuova moderazione.",
        };
      }
      if (s === "rejected") {
        return {
          cls: "is-blocked",
          ico: "fa-times",
          title: "Rifiutata",
          lead: "Correggi i contenuti e salva: tornerà in moderazione.",
        };
      }
      if (s === "suspended") {
        return {
          cls: "is-blocked",
          ico: "fa-ban",
          title: "Sospesa",
          lead: "Scheda non visibile. Contatta lo staff se serve riattivarla.",
        };
      }
      return {
        cls: "is-draft",
        ico: "fa-pencil",
        title: "Bozza",
        lead: "Completa i campi e inviala in moderazione quando è pronta.",
      };
    }

    /* boardsMineUi2: card Le mie = layout Esplora (banner full-bleed + body + foot azioni) */
    function manageListCardHtml(L) {
      var st = manageStatusMeta(L.status);
      var status = String(L.status || "").toLowerCase();
      var isPending = status === "pending";
      var isDraft = status === "draft";
      var isApproved = status === "approved";
      /* boardsMineStatusBadge1: stato = badge (non testo plain) */
      var isRejected = status === "rejected";
      var isSuspended = status === "suspended";
      var statusBadgeCls = isDraft
        ? "vc-boards-badge vc-boards-badge--draft vc-boards-mine-card__status"
        : isPending
          ? "vc-boards-badge vc-boards-badge--pending vc-boards-mine-card__status"
          : isApproved
            ? "vc-boards-badge vc-boards-badge--ok vc-boards-mine-card__status"
            : isRejected || isSuspended
              ? "vc-boards-badge vc-boards-badge--bad vc-boards-mine-card__status"
              : "vc-boards-badge vc-boards-mine-card__status";
      var statusIco = isDraft
        ? "fa-pencil"
        : isPending
          ? "fa-hourglass-half"
          : isApproved
            ? "fa-check"
            : isRejected
              ? "fa-times"
              : isSuspended
                ? "fa-ban"
                : "fa-circle";
      /* boardsPrettyPath1 */
      var previewHref = isPending
        ? B.listingUrl
          ? B.listingUrl({ kind: L.kind, id: L.id, preview: true })
          : "/bacheca/server/" + encodeURIComponent(L.id) + "/?preview=1"
        : isApproved && (L.id || L.slug)
          ? B.listingUrl
            ? B.listingUrl(L)
            : "/bacheca/server/" + encodeURIComponent(L.id || L.slug) + "/"
          : "";
      var editHref = "/bacheca/le-mie/?id=" + encodeURIComponent(L.id);
      var mineBannerUrl = B.animMediaUrl ? B.animMediaUrl(L.bannerUrl) : L.bannerUrl;
      var mineIconUrl = B.animMediaUrl ? B.animMediaUrl(L.iconUrl) : L.iconUrl;
      var bannerStyle = mineBannerUrl
        ? ' style="background-image:url(' + B.esc(mineBannerUrl) + ')"'
        : L.accent
          ? ' style="background:linear-gradient(120deg,' + B.esc(L.accent) + '88,#1a1410)"'
          : "";
      var iconHtml = mineIconUrl
        ? '<img class="vc-boards-mine-card__icon" src="' +
          B.esc(mineIconUrl) +
          '" alt="" width="56" height="56" loading="lazy" decoding="async" data-vc-anim-media="1" draggable="false" />'
        : '<span class="vc-boards-mine-card__icon vc-boards-mine-card__icon--empty" aria-hidden="true"><i class="fa ' +
          (L.kind === "bot" ? "fa-android" : "fa-server") +
          '"></i></span>';
      var taglineHtml = L.tagline
        ? '<p class="vc-boards-mine-card__tagline vc-boards-md">' +
          B.formatDescHtml(L.tagline, { inline: true }) +
          "</p>"
        : isPending
          ? '<p class="vc-boards-mine-card__tagline">Anteprima privata · in attesa dello staff</p>'
          : isDraft
            ? '<p class="vc-boards-mine-card__tagline">Bozza incompleta · tocca per continuare</p>'
            : "";
      var tagsHtml = (L.tags || [])
        .slice(0, 4)
        .map(function (t) {
          return '<span class="vc-boards-tag">' + B.esc(t) + "</span>";
        })
        .join("");
      /* boardsMineFootUi1: stato inline col kind; footer = bottoni a griglia */
      var statusChip =
        '<span class="' +
        statusBadgeCls +
        '"><i class="fa ' +
        statusIco +
        '" aria-hidden="true"></i><span>' +
        B.esc(st.title) +
        "</span></span>";
      var media =
        '<div class="vc-boards-mine-card__banner"' +
        bannerStyle +
        "></div>" +
        '<div class="vc-boards-mine-card__body">' +
        iconHtml +
        '<div class="vc-boards-mine-card__copy">' +
        '<div class="vc-boards-mine-card__kindrow">' +
        '<span class="vc-boards-mine-card__kind">' +
        B.esc(B.kindLabel(L.kind)) +
        "</span>" +
        statusChip +
        "</div>" +
        '<h3 class="vc-boards-mine-card__name">' +
        B.esc(L.name || "Scheda") +
        "</h3>" +
        taglineHtml +
        (tagsHtml ? '<div class="vc-boards-mine-card__tags">' + tagsHtml + "</div>" : "") +
        "</div></div>";
      /* boardsMineDelete1: Elimina bozza/ritiro + no nested button */
      var delBtn =
        '<button type="button" class="vc-boards-mine-card__btn vc-boards-mine-card__btn--danger vc-no-sfx" data-mine-delete="' +
        B.esc(L.id) +
        '" aria-label="Elimina scheda">' +
        '<i class="fa fa-trash" aria-hidden="true"></i><span>Elimina</span></button>';
      var footActions = "";
      var footCols = "1";
      if (isPending) {
        footCols = "3";
        footActions =
          '<a class="vc-boards-mine-card__btn vc-no-sfx" href="' +
          B.esc(previewHref) +
          '"><i class="fa fa-eye" aria-hidden="true"></i><span>Anteprima</span></a>' +
          '<a class="vc-boards-mine-card__btn vc-boards-mine-card__btn--primary vc-no-sfx" href="' +
          B.esc(editHref) +
          '"><i class="fa fa-pencil" aria-hidden="true"></i><span>Modifica</span></a>' +
          delBtn;
      } else if (isDraft) {
        footCols = "2";
        footActions =
          '<button type="button" class="vc-boards-mine-card__btn vc-boards-mine-card__btn--primary vc-no-sfx" data-mine-edit="' +
          B.esc(L.id) +
          '"><i class="fa fa-pencil" aria-hidden="true"></i><span>Continua bozza</span></button>' +
          delBtn;
      } else if (previewHref) {
        footCols = "3";
        footActions =
          '<a class="vc-boards-mine-card__btn vc-no-sfx" href="' +
          B.esc(previewHref) +
          '"><i class="fa fa-external-link" aria-hidden="true"></i><span>Apri</span></a>' +
          '<button type="button" class="vc-boards-mine-card__btn vc-boards-mine-card__btn--primary vc-no-sfx" data-mine-edit="' +
          B.esc(L.id) +
          '"><i class="fa fa-pencil" aria-hidden="true"></i><span>Modifica</span></button>' +
          delBtn;
      } else {
        footCols = "2";
        footActions =
          '<button type="button" class="vc-boards-mine-card__btn vc-boards-mine-card__btn--primary vc-no-sfx" data-mine-edit="' +
          B.esc(L.id) +
          '"><i class="fa fa-pencil" aria-hidden="true"></i><span>Modifica</span></button>' +
          delBtn;
      }
      var foot =
        '<div class="vc-boards-mine-card__foot" data-cols="' +
        footCols +
        '">' +
        footActions +
        "</div>";
      var shellCls =
        "vc-boards-mine-card vc-boards-mine-card--rich vc-no-sfx" +
        (isPending ? " vc-boards-mine-card--pending" : "") +
        (isDraft ? " vc-boards-mine-card--draft" : "") +
        (isApproved ? " vc-boards-mine-card--ok" : "");
      if (isPending && previewHref) {
        return (
          '<article class="' +
          shellCls +
          '">' +
          '<a class="vc-boards-mine-card__hit vc-no-sfx" href="' +
          B.esc(previewHref) +
          '">' +
          media +
          "</a>" +
          foot +
          "</article>"
        );
      }
      return (
        '<article class="' +
        shellCls +
        '">' +
        '<div class="vc-boards-mine-card__hit" data-mine-edit="' +
        B.esc(L.id) +
        '" role="button" tabindex="0">' +
        media +
        "</div>" +
        foot +
        "</article>"
      );
    }

    async function renderManage() {
      if (!B.token()) return needLogin();
      if (B.dismissBoardsGate) B.dismissBoardsGate();
      /* boardsHeaderNav1 + boardsMineKindSwitch1: Server|Bot centrato */
      function kindFromUrlEarly() {
        try {
          var k = String(new URL(location.href).searchParams.get("kind") || "")
            .trim()
            .toLowerCase();
          return k === "bot" ? "bot" : "server";
        } catch (_) {
          return "server";
        }
      }
      root.innerHTML =
        B.navHtml("manage", {
          kind: kindFromUrlEarly(),
          idPrefix: "vc-boards-tab",
        }) +
        '<div id="vc-boards-msg" class="vc-boards-msg mt-4" hidden></div>' +
        '<div id="vc-boards-mine" class="vc-boards-mine mt-3"></div>';
      var msg = document.getElementById("vc-boards-msg");
      var mine = document.getElementById("vc-boards-mine");
      var cfgOut = await B.api("/config");
      var cfg =
        cfgOut && cfgOut.ok && cfgOut.config
          ? cfgOut.config
          : {
              categories: Object.keys(CAT_LABELS),
              categoryLabels: CAT_LABELS,
              locales: LOCALE_ORDER.slice(),
              localeLabels: LOCALE_LABELS,
              maxCategories: 12,
              maxLocales: 32,
              maxTags: 12,
              minTaglineChars: 20,
              minDescriptionChars: 80,
              maxMarkdownChars: 4000,
            };
      var out = await B.api("/me/listings");
      if (!out.ok) {
        setMsg(msg, out.message || "Errore.", true);
        try {
          if (B.markContentReady) B.markContentReady();
        } catch (eReadyFail) {}
        return;
      }
      var list = out.listings || [];

      function kindFromUrl() {
        try {
          var k = String(new URL(location.href).searchParams.get("kind") || "")
            .trim()
            .toLowerCase();
          return k === "bot" ? "bot" : k === "server" ? "server" : "";
        } catch (_) {
          return "";
        }
      }

      function setManageKindUrl(kind) {
        try {
          var u = new URL(location.href);
          if (kind === "bot") u.searchParams.set("kind", "bot");
          else u.searchParams.delete("kind");
          history.replaceState({}, "", u.pathname + u.search + u.hash);
        } catch (_) {}
      }

      /* boardsFeatures1 fix: state locale per paintEditor (prima ReferenceError) */
      var state = {
        kind: kindFromUrl() || "server",
        listing: null,
        guild: null,
        cfg: cfg,
      };

      function syncKindTabs() {
        var sBtn = document.getElementById("vc-boards-tab-server");
        var bBtn = document.getElementById("vc-boards-tab-bot");
        if (sBtn) sBtn.classList.toggle("is-active", state.kind === "server");
        if (bBtn) bBtn.classList.toggle("is-active", state.kind === "bot");
      }

      function listingsForKind() {
        return list.filter(function (x) {
          var k = String(x.kind || "server") === "bot" ? "bot" : "server";
          return k === state.kind;
        });
      }

      function paintList() {
        setManageEditId("");
        setManageKindUrl(state.kind);
        syncKindTabs();
        var scoped = listingsForKind();
        if (!scoped.length) {
          /* boardsMineEmpty1: empty verticale (no striscia larga testo+bottone) */
          var isBotEmpty = state.kind === "bot";
          mine.innerHTML =
            '<div class="vc-boards-empty vc-boards-empty--mine">' +
            '<span class="vc-boards-empty__ico" aria-hidden="true"><i class="fa ' +
            (isBotEmpty ? "fa-android" : "fa-server") +
            '"></i></span>' +
            '<p class="vc-boards-empty__title">' +
            (isBotEmpty ? "Nessuna scheda bot" : "Nessuna scheda server") +
            "</p>" +
            '<p class="vc-boards-empty__sub">' +
            (isBotEmpty
              ? "Quando pubblichi un bot, lo trovi qui per modificarlo e seguirne lo stato."
              : "Quando pubblichi un server, lo trovi qui per modificarlo e seguirne lo stato.") +
            "</p>" +
            '<a class="vc-boards-btn vc-boards-btn--primary vc-no-sfx" href="/bacheca/invia/">' +
            '<i class="fa fa-plus" aria-hidden="true"></i><span>' +
            (isBotEmpty ? "Pubblica un bot" : "Pubblica un server") +
            "</span></a></div>";
          try {
            if (B.markContentReady) B.markContentReady();
          } catch (eReadyEmpty) {}
          return;
        }
        var pending = scoped.filter(function (x) {
          return String(x.status || "") === "pending";
        });
        var drafts = scoped.filter(function (x) {
          return String(x.status || "") === "draft";
        });
        var others = scoped.filter(function (x) {
          var s = String(x.status || "");
          return s !== "pending" && s !== "draft";
        });
        /* boardsMineNoHead1: niente titoli/lead sopra le card — resto solo badge stato */
        /* boardsMineGridSide1: tutte le schede in una sola griglia affiancata */
        var ordered = pending.concat(drafts, others);
        mine.innerHTML =
          '<div class="vc-boards-mine-pick">' +
          '<div id="vc-boards-mine-list" class="vc-boards-mine-list">' +
          ordered.map(manageListCardHtml).join("") +
          "</div>" +
          '<div class="vc-boards-mine-cta">' +
          '<a class="vc-boards-btn vc-boards-btn--primary vc-no-sfx" href="/bacheca/invia/">' +
          '<i class="fa fa-plus" aria-hidden="true"></i><span>Pubblica un’altra scheda</span></a></div>' +
          "</div>";
        function openMineEditor(id) {
          var L = list.find(function (x) {
            return String(x.id) === String(id);
          });
          if (L) paintEditor(L);
        }
        mine.querySelectorAll("[data-mine-edit]").forEach(function (el) {
          el.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            openMineEditor(el.getAttribute("data-mine-edit"));
          });
          el.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              openMineEditor(el.getAttribute("data-mine-edit"));
            }
          });
        });
        /* boardsMineDelete1 */
        mine.querySelectorAll("[data-mine-delete]").forEach(function (btn) {
          btn.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var id = btn.getAttribute("data-mine-delete");
            var L = list.find(function (x) {
              return String(x.id) === String(id);
            });
            if (!L) return;
            var st = String(L.status || "").toLowerCase();
            var label =
              st === "draft"
                ? "Eliminare questa bozza? L’azione non si può annullare."
                : st === "pending"
                  ? "Ritirare questa scheda dalla moderazione e eliminarla?"
                  : "Eliminare definitivamente questa scheda?";
            if (!window.confirm(label)) return;
            btn.disabled = true;
            B.api("/me/listings/" + encodeURIComponent(id), { method: "DELETE" })
              .then(function (out) {
                if (!(out && out.ok)) {
                  btn.disabled = false;
                  if (B.toastMsg) B.toastMsg((out && out.message) || "Eliminazione non riuscita.", true);
                  return;
                }
                list = list.filter(function (x) {
                  return String(x.id) !== String(id);
                });
                if (B.toastMsg) B.toastMsg(st === "draft" ? "Bozza eliminata." : "Scheda eliminata.");
                paintList();
              })
              .catch(function () {
                btn.disabled = false;
                if (B.toastMsg) B.toastMsg("Errore di rete.", true);
              });
          });
        });
        try {
          if (window.VcEmojiRender && typeof VcEmojiRender.enhance === "function") {
            VcEmojiRender.enhance(mine);
          }
        } catch (eEm) {}
        try {
          if (B.markContentReady) B.markContentReady();
        } catch (eReadyList) {}
      }

      function paintEditor(L) {
        /* boardsMineFormMatch1: stesso shell/hero/azioni del form /invia/ */
        setManageEditId(L.id);
        state.kind = L.kind === "bot" ? "bot" : "server";
        setManageKindUrl(state.kind);
        syncKindTabs();
        state.listing = L;
        state.guild = L.discordId
          ? { id: L.discordId, name: L.name, iconUrl: L.iconUrl || "" }
          : null;
        state.cfg = cfg;
        var st = manageStatusMeta(L.status);
        var prefill = Object.assign({}, L, {
          description: L.description || L.markdown || "",
          tags: Array.isArray(L.tags) ? L.tags : [],
        });
        var keepTagline = String(prefill.tagline || "");
        var keepDesc = String(prefill.description || "");
        var editIconUrl = B.animMediaUrl ? B.animMediaUrl(L.iconUrl) : L.iconUrl;
        var icoHtml = editIconUrl
          ? '<img class="vc-boards-form-hero__img" src="' +
            B.esc(editIconUrl) +
            '" alt="" width="56" height="56" decoding="async" data-vc-anim-media="1" draggable="false" />'
          : '<span class="vc-boards-form-hero__img vc-boards-form-hero__img--fallback" aria-hidden="true"><i class="fa ' +
            (L.kind === "bot" ? "fa-android" : "fa-server") +
            '"></i></span>';
        var heroActs = "";
        if (L.slug && L.status === "approved") {
          heroActs +=
            '<a class="vc-boards-form-hero__link vc-no-sfx" href="' +
            B.esc(B.listingUrl(L)) +
            '"><i class="fa fa-external-link" aria-hidden="true"></i><span>Apri scheda</span></a>';
        }
        if (L.status === "draft") {
          heroActs +=
            '<button type="button" class="vc-boards-form-hero__link vc-no-sfx" id="vc-boards-mine-submit">' +
            '<i class="fa fa-paper-plane" aria-hidden="true"></i><span>Invia in moderazione</span></button>';
          heroActs +=
            '<button type="button" class="vc-boards-form-hero__link vc-boards-form-hero__link--danger vc-no-sfx" id="vc-boards-mine-delete">' +
            '<i class="fa fa-trash" aria-hidden="true"></i><span>Elimina bozza</span></button>';
        } else if (L.status === "pending" || L.status === "rejected" || L.status === "approved") {
          heroActs +=
            '<button type="button" class="vc-boards-form-hero__link vc-boards-form-hero__link--danger vc-no-sfx" id="vc-boards-mine-delete">' +
            '<i class="fa fa-trash" aria-hidden="true"></i><span>Elimina</span></button>';
        }
        var leadText =
          st && st.lead
            ? st.lead
            : "Modifica i contenuti della scheda.";

        mine.innerHTML =
          '<div class="vc-boards-wizard mt-4 vc-boards-mine-editor" id="vc-boards-wizard" data-id="' +
          B.esc(L.id) +
          '">' +
          '<div class="vc-boards-form-hero">' +
          icoHtml +
          '<div class="vc-boards-form-hero__text">' +
          '<p class="vc-boards-form-hero__kicker">' +
          (L.kind === "bot" ? "Scheda bot" : "Scheda server") +
          (st && st.title ? " · " + B.esc(st.title) : "") +
          "</p>" +
          '<h2 class="vc-boards-form-hero__title">' +
          B.esc(L.name || "La tua scheda") +
          "</h2>" +
          '<p class="vc-boards-form-hero__lead">' +
          B.esc(leadText) +
          "</p>" +
          (heroActs ? '<div class="vc-boards-form-hero__acts">' + heroActs + "</div>" : "") +
          "</div></div>" +
          '<form class="vc-boards-form vc-boards-form--editor" id="vc-boards-form" data-mine-id="' +
          B.esc(L.id) +
          '">' +
          formFieldsHtml(L.kind === "bot" ? "bot" : "server", prefill, cfg) +
          '<div class="vc-boards-form-actions">' +
          '<button type="button" class="vc-boards-form-actions__back vc-no-sfx" id="vc-boards-mine-back">' +
          '<i class="fa fa-chevron-left" aria-hidden="true"></i><span>Indietro</span></button>' +
          '<button type="submit" class="vc-boards-form-actions__next vc-no-sfx">' +
          '<span>Salva</span><i class="fa fa-arrow-right" aria-hidden="true"></i></button>' +
          "</div></form></div>";

        try {
          if (window.VcEmojiRender && typeof VcEmojiRender.enhance === "function") {
            VcEmojiRender.enhance(mine);
          }
        } catch (eBakeEmoji) {}

        try {
          var tagEl = document.getElementById("vc-boards-tagline");
          var descEl = document.getElementById("vc-boards-desc");
          if (tagEl) tagEl.value = keepTagline;
          if (descEl) descEl.value = keepDesc;
        } catch (eKeepMd) {}

        bindCategoryMenu(mine, (cfg && cfg.categoryLabels) || CAT_LABELS, (cfg && cfg.maxCategories) || 12);
        bindLocaleMenu(
          mine,
          Object.assign({}, LOCALE_LABELS, (cfg && cfg.localeLabels) || {}),
          (cfg && cfg.maxLocales) || 32,
        );
        bindTagMenu(mine, (cfg && cfg.suggestedTags) || [], (cfg && cfg.maxTags) || 12);
        bindAccentPicker(mine);
        var descLive = bindDescLive(mine, cfg || {});
        bindSchemePrefixToggles(mine);
        bindLinkChecks(mine);
        bindBannerUpload(mine);

        var backBtn = document.getElementById("vc-boards-mine-back");
        if (backBtn) {
          backBtn.addEventListener("click", function () {
            paintList();
          });
        }

        var genBtn = document.getElementById("vc-boards-gen-invite");
        if (genBtn) {
          genBtn.addEventListener("click", async function () {
            if (genBtn.disabled) return;
            var gid = (state.guild && state.guild.id) || L.discordId || "";
            if (!gid) {
              setMsg(msg, "Server non collegato: incolla un invite manualmente.", true);
              return;
            }
            genBtn.disabled = true;
            setMsg(msg, "Genero invite…");
            try {
              var out = await B.api("/generate-invite", {
                method: "POST",
                json: { guildId: gid, listingId: L.id || undefined },
              });
              if (!out || !out.ok) {
                var why =
                  (out && String(out.message || "").trim()) ||
                  (out && out.error === "missing_guilds_scope"
                    ? "Serve permesso guilds: rifai login Discord."
                    : "") ||
                  (out && out.error === "no_invite_channel"
                    ? "Nessun canale con permesso Crea invito."
                    : "") ||
                  (out && out.error ? String(out.error) : "") ||
                  "Generazione fallita. Incolla un invite manualmente.";
                setMsg(msg, why, true);
                return;
              }
              var inv = document.getElementById("vc-boards-invite");
              if (inv && out.inviteUrl) inv.value = stripInviteSuffix(out.inviteUrl);
              if (out.listing) {
                L = out.listing;
                state.listing = out.listing;
              }
              setMsg(msg, "Invite generato.");
              try {
                if (mine.__vcBoardsRunLinkCheck) mine.__vcBoardsRunLinkCheck(inv);
              } catch (eChk) {}
            } catch (eGen) {
              setMsg(
                msg,
                (eGen && eGen.message) || "Generazione fallita. Controlla la connessione o incolla un invite.",
                true,
              );
            } finally {
              genBtn.disabled = false;
            }
          });
        }

        var formEl = document.getElementById("vc-boards-form");
        if (formEl) {
          formEl.addEventListener("submit", async function (e) {
            e.preventDefault();
            var id = formEl.getAttribute("data-mine-id") || L.id;
            var v = descLive && typeof descLive.validate === "function" ? descLive.validate() : { ok: true };
            if (v && v.ok === false) {
              setMsg(msg, v.message || "Controlla i campi.", true);
              return;
            }
            var patch = collectFormFields(L.kind === "bot" ? "bot" : "server");
            if (typeof patch.tags === "string") {
              patch.tags = String(patch.tags)
                .split(/[,;]/)
                .map(function (s) {
                  return s.trim();
                })
                .filter(Boolean);
            }
            setMsg(msg, "Salvataggio…");
            var r = await B.api("/listings/" + encodeURIComponent(id), { method: "PATCH", json: patch });
            if (r.ok) {
              if (r.listing) {
                L = r.listing;
                var idx = list.findIndex(function (x) {
                  return String(x.id) === String(id);
                });
                if (idx >= 0) list[idx] = r.listing;
              }
              setMsg(
                msg,
                r.listing && r.listing.status === "pending"
                  ? "Salvato. Campi sensibili → di nuovo in moderazione."
                  : "Salvato.",
              );
              paintEditor(r.listing || L);
            } else {
              setMsg(msg, r.message || "Errore salvataggio.", true);
            }
          });
        }

        var submitBtn = document.getElementById("vc-boards-mine-submit");
        if (submitBtn) {
          submitBtn.addEventListener("click", async function () {
            setMsg(msg, "Invio…");
            var r = await B.api("/listings/" + encodeURIComponent(L.id) + "/submit", {
              method: "POST",
              json: {},
            });
            setMsg(msg, r.message || (r.ok ? "Inviata in moderazione." : "Invio fallito."), !r.ok);
            if (r.ok) {
              setTimeout(function () {
                location.reload();
              }, 600);
            }
          });
        }

        var delEditorBtn = document.getElementById("vc-boards-mine-delete");
        if (delEditorBtn) {
          delEditorBtn.addEventListener("click", async function () {
            var st = String(L.status || "").toLowerCase();
            var ask =
              st === "draft"
                ? "Eliminare questa bozza? L’azione non si può annullare."
                : st === "pending"
                  ? "Ritirare questa scheda dalla moderazione e eliminarla?"
                  : "Eliminare definitivamente questa scheda?";
            if (!window.confirm(ask)) return;
            delEditorBtn.disabled = true;
            setMsg(msg, "Eliminazione…");
            var out = await B.api("/me/listings/" + encodeURIComponent(L.id), { method: "DELETE" });
            if (!(out && out.ok)) {
              delEditorBtn.disabled = false;
              setMsg(msg, (out && out.message) || "Eliminazione non riuscita.", true);
              return;
            }
            list = list.filter(function (x) {
              return String(x.id) !== String(L.id);
            });
            setManageEditId("");
            setMsg(msg, st === "draft" ? "Bozza eliminata." : "Scheda eliminata.");
            paintList();
          });
        }

        try {
          if (B.markContentReady) B.markContentReady();
        } catch (eReady4) {}
      }

      var tabServer = document.getElementById("vc-boards-tab-server");
      var tabBot = document.getElementById("vc-boards-tab-bot");
      if (tabServer) {
        tabServer.addEventListener("click", function () {
          if (state.kind === "server" && !manageEditIdFromUrl()) return;
          state.kind = "server";
          state.listing = null;
          state.guild = null;
          paintList();
        });
      }
      if (tabBot) {
        tabBot.addEventListener("click", function () {
          if (state.kind === "bot" && !manageEditIdFromUrl()) return;
          state.kind = "bot";
          state.listing = null;
          state.guild = null;
          paintList();
        });
      }

      /* boardsMineList1: sempre lista breve in apertura; editor solo con ?id= / ?listingId= */
      var wantId = manageEditIdFromUrl();
      var editing = null;
      if (wantId) {
        editing = list.find(function (x) {
          return String(x.id) === String(wantId);
        });
      }
      if (editing) paintEditor(editing);
      else {
        syncKindTabs();
        paintList();
      }
    }

    if (page === "submit")
      renderSubmit().catch(function (err) {
      root.innerHTML =
        B.navHtml("submit") +
        '<div class="vc-boards-empty mt-4">Errore caricamento form. Ricarica.</div>';
      try {
        console.error("[bacheca submit]", err);
      } catch (_) {}
    });
    else if (page === "manage")
      renderManage().catch(function (err) {
      root.innerHTML =
        B.navHtml("manage") +
        '<div class="vc-boards-empty mt-4">Errore caricamento schede. Ricarica.</div>';
      try {
        console.error("[bacheca manage]", err);
      } catch (_) {}
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot(0);
    });
  } else {
    boot(0);
  }
})();

/* boardsListingUi1 */

/* boardsAnimIcon1 */

/* boardsManageStateFix1 */

/* boardsFeaturesUi2 */

/* boardsBannerUpload1 */

