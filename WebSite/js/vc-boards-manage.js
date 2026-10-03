/**
 * Bacheca — wizard Aggiungi (auth → claim → tutorial → form → bozza → review) + le mie.
 */
(function () {
  "use strict";

  /* boardsSocialSvgAll1: tutti i social con logo SVG ufficiale */
  /* boardsDraftBadge1: badge Bozza sand/bronzo */

  /* boardsGenInvite2: Genera invite più robusto + errori chiari */
  /* boardsAccentCustom1: picker custom (click sul hex) — niente native Windows "Canale…" */
  /* boardsRequiredStar1: asterisco sui campi obbligatori (tutti i form bacheca) */
  /* boardsStepsBack1: click su passi fatti → torna indietro */
  /* boardsGuildsRelogin1: re-login con scope guilds (non solo identify) */
  /* boardsSubmitResume1: refresh su Pubblica ripristina server + bozza form */
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

  function joinHttpsUrl(raw) {
    var v = String(raw || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    var suffix = stripHttpsSuffix(v);
    return suffix ? HTTPS_PREFIX + suffix : "";
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

    function needLogin() {
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
      var body = {
        tagline: (document.getElementById("vc-boards-tagline") || {}).value || "",
        description: (document.getElementById("vc-boards-desc") || {}).value || "",
        tags: (document.getElementById("vc-boards-tags") || {}).value || "",
        categories: checkedVals("vc-boards-cat"),
        locales: checkedVals("vc-boards-loc"),
        siteUrl: joinHttpsUrl((document.getElementById("vc-boards-site") || {}).value || ""),
        socials: socials,
        bannerUrl: joinHttpsUrl((document.getElementById("vc-boards-banner") || {}).value || ""),
        accent: (document.getElementById("vc-boards-accent") || {}).value || "",
        inviteUrl: joinInviteUrl((document.getElementById("vc-boards-invite") || {}).value || ""),
      };
      if (kind === "bot") {
        body.name = ((document.getElementById("vc-boards-bot-name") || {}).value || "").trim();
        body.botInviteUrl = (document.getElementById("vc-boards-bot-invite") || {}).value || "";
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

    function reqStar(on) {
      return on
        ? '<span class="vc-boards-field__req" aria-hidden="true">*</span>'
        : "";
    }

    function fieldBlock(label, hint, controlHtml, required) {
      var hasPrefix = String(controlHtml || "").indexOf("vc-boards-url-prefix") !== -1;
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
        '<span class="vc-boards-msel__btn-label is-placeholder" id="vc-boards-cat-btn-label">Seleziona categorie…</span>' +
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
        '<span class="vc-boards-msel__btn-label is-placeholder" id="vc-boards-loc-btn-label">Seleziona lingue…</span>' +
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
          '" value="' +
          B.esc(handle) +
          '" placeholder="' +
          B.esc(String(meta.placeholder || "").replace(/^@/, "")) +
          '" /></span></label>'
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
              '<input id="vc-boards-bot-invite" type="url" value="' +
                B.esc(prefill.botInviteUrl || "") +
                '" placeholder="https://discord.com/oauth2/…" />',
              true,
            ) +
            "</div>"
          : "") +
        (function () {
          var minTag = Math.max(8, Math.min(80, Number((cfg && cfg.minTaglineChars) || 20) || 20));
          var minDesc = Math.max(20, Math.min(500, Number((cfg && cfg.minDescriptionChars) || 80) || 80));
          var maxDesc = Math.max(2000, Math.min(8000, Number((cfg && cfg.maxMarkdownChars) || 4000) || 4000));
          return (
            '<label class="vc-boards-field vc-boards-field--rich is-required">' +
            '<span class="vc-boards-field__meta"><span class="vc-boards-field__label">Descrizione breve' +
            reqStar(true) +
            "</span>" +
            fieldHintHtml("Min " + minTag + " · max 160 — compare in card") +
            "</span>" +
            '<span class="vc-boards-field__control">' +
            '<input id="vc-boards-tagline" minlength="' +
            minTag +
            '" maxlength="160" value="' +
            B.esc(prefill.tagline || "") +
            '" placeholder="Una riga che spiega il progetto" />' +
            '<span class="vc-boards-charcount" id="vc-boards-tagline-count" aria-live="polite"></span>' +
            "</span></label>" +
            '<label class="vc-boards-field vc-boards-field--rich vc-boards-field--desc is-required">' +
            '<span class="vc-boards-field__meta"><span class="vc-boards-field__label">Descrizione lunga' +
            reqStar(true) +
            "</span>" +
            fieldHintHtml(
              "Min " +
                minDesc +
                " · **grassetto**, *corsivo*, elenchi, link [testo](https://…)",
            ) +
            "</span>" +
            '<span class="vc-boards-field__control">' +
            '<textarea id="vc-boards-desc" minlength="' +
            minDesc +
            '" maxlength="' +
            maxDesc +
            '" placeholder="Cosa offre, regole, vibes…">' +
            B.esc(prefill.description || prefill.markdown || "") +
            "</textarea>" +
            '<span class="vc-boards-charcount" id="vc-boards-desc-count" aria-live="polite"></span>' +
            "</span>" +
            '<div class="vc-boards-desc-preview" id="vc-boards-desc-preview">' +
            '<div class="vc-boards-desc-preview__head">Anteprima</div>' +
            '<div class="vc-boards-desc-preview__body vc-boards-detail__desc" id="vc-boards-desc-preview-body"></div>' +
            "</div></label>"
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
        '<input id="vc-boards-invite" type="text" inputmode="url" autocomplete="off" spellcheck="false" value="' +
        B.esc(stripInviteSuffix(prefill.inviteUrl || "")) +
        '" placeholder="codice" /></span></label>' +
        (kind === "server"
          ? '<button type="button" class="vc-boards-btn" id="vc-boards-gen-invite"><i class="fa fa-magic" aria-hidden="true"></i> Genera</button>'
          : "") +
        "</div>" +
        fieldBlock(
          "Sito web",
          "",
          '<span class="vc-boards-url-prefix" aria-hidden="true">' +
            HTTPS_PREFIX +
            "</span>" +
            '<input id="vc-boards-site" type="text" inputmode="url" autocomplete="url" spellcheck="false" value="' +
            B.esc(stripHttpsSuffix(prefill.siteUrl || "")) +
            '" placeholder="www.esempio.it" />',
        );
      /* boardsNoVisitorNotes1: niente campo note visitatori */
      var extras =
        '<div class="vc-boards-form-grid vc-boards-form-grid--social">' +
        socialHtml +
        "</div>" +
        '<div class="vc-boards-form-grid">' +
        fieldBlock(
          "Tag",
          "Scegli o crea tag riusabili (max " +
            String((cfg && cfg.maxTags) || 12) +
            ")",
          '<div class="vc-boards-tsel" id="vc-boards-tag-tsel" data-max="' +
            B.esc(String((cfg && cfg.maxTags) || 12)) +
            '">' +
            '<div class="vc-boards-tsel__picked" id="vc-boards-tag-picked"></div>' +
            '<button type="button" class="vc-boards-tsel__btn vc-no-sfx" id="vc-boards-tag-btn" aria-haspopup="listbox" aria-expanded="false">' +
            '<i class="fa fa-hashtag" aria-hidden="true"></i>' +
            '<span class="vc-boards-tsel__btn-label is-placeholder" id="vc-boards-tag-btn-label">Seleziona o crea tag…</span>' +
            '<i class="fa fa-chevron-up vc-boards-tsel__chev" aria-hidden="true"></i></button>' +
            '<div class="vc-boards-tsel__panel vc-boards-tsel__panel--up" id="vc-boards-tag-panel" hidden>' +
            '<input type="search" class="vc-boards-tsel__q" id="vc-boards-tag-q" placeholder="Cerca o digita un nuovo tag…" autocomplete="off" />' +
            '<div class="vc-boards-tsel__list" id="vc-boards-tag-list" role="listbox"></div>' +
            "</div>" +
            '<input type="hidden" id="vc-boards-tags" value="' +
            B.esc((prefill.tags || []).join(", ")) +
            '" />' +
            "</div>",
        ) +
        fieldBlock(
          "Colore accent",
          "Clicca il campo o l'anteprima per scegliere",
          '<span class="vc-boards-accent" id="vc-boards-accent-wrap">' +
            '<span class="vc-boards-accent-row">' +
            '<button type="button" class="vc-boards-accent-swatch vc-no-sfx" id="vc-boards-accent-swatch" title="Anteprima colore" aria-label="Apri selettore colore">' +
            '<span class="vc-boards-accent-swatch__face" aria-hidden="true"></span></button>' +
            '<input id="vc-boards-accent" class="vc-boards-accent-hex" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="#d4a888" maxlength="7" value="' +
            B.esc(prefill.accent || "") +
            '" aria-haspopup="dialog" aria-expanded="false" aria-controls="vc-boards-accent-pop" />' +
            "</span>" +
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
            '<span class="vc-boards-accent-pop__hexlab" id="vc-boards-accent-hexlab">#d4a888</span></span>' +
            "</span></span>",
        ) +
        "</div>" +
        fieldBlock(
          "Banner URL",
          "",
          '<span class="vc-boards-url-prefix" aria-hidden="true">' +
            HTTPS_PREFIX +
            "</span>" +
            '<input id="vc-boards-banner" type="text" inputmode="url" autocomplete="off" spellcheck="false" value="' +
            B.esc(stripHttpsSuffix(prefill.bannerUrl || "")) +
            '" placeholder="cdn.esempio.it/banner.jpg" />',
        );
      return (
        section("fa-pencil", "Testi", "Come appare in bacheca", identity) +
        section(
          "fa-tags",
          "Classificazione",
          "Almeno una categoria e una lingua (max " +
            String((cfg && cfg.maxCategories) || 12) +
            " categorie, max " +
            String((cfg && cfg.maxTags) || 12) +
            " tag)",
          classify,
        ) +
        section("fa-link", "Link", "Invite e sito pubblico", links) +
        section("fa-sliders", "Dettagli", "Opzionali — social, tag, stile", extras)
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
      if (!wrap || !hex || !pop || !sv || !hue) return;

      var state = hexToHsv(hex.value || "#d4a888");
      var open = false;
      var dragging = false;

      function emit(c) {
        try {
          hex.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (e0) {}
        try {
          hex.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e1) {}
      }

      function paint(fromHexInput) {
        var c = hsvToHex(state.h, state.s, state.v);
        if (!fromHexInput) hex.value = c;
        if (face) face.style.background = c;
        if (live) live.style.background = c;
        if (hexlab) hexlab.textContent = c;
        var hueDeg = Math.round(state.h);
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
          hex.style.setProperty("--vc-boards-accent-live", c);
        } catch (eS) {}
        return c;
      }

      function setOpen(next) {
        open = !!next;
        pop.hidden = !open;
        wrap.classList.toggle("is-open", open);
        hex.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) paint(false);
      }

      function applyFromPointer(ev) {
        var rect = sv.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var x = (ev.clientX - rect.left) / rect.width;
        var y = (ev.clientY - rect.top) / rect.height;
        state.s = Math.max(0, Math.min(1, x));
        state.v = Math.max(0, Math.min(1, 1 - y));
        emit(paint(false));
      }

      paint(!!normalizeAccentHex(hex.value));

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
        var c = normalizeAccentHex(hex.value);
        if (!c) return;
        state = hexToHsv(c);
        paint(true);
      });
      hex.addEventListener("blur", function () {
        var c = normalizeAccentHex(hex.value);
        if (c) {
          hex.value = c;
          state = hexToHsv(c);
          paint(true);
        }
      });

      hue.addEventListener("input", function () {
        state.h = Number(hue.value) || 0;
        emit(paint(false));
      });

      sv.addEventListener("pointerdown", function (ev) {
        dragging = true;
        try {
          sv.setPointerCapture(ev.pointerId);
        } catch (eC) {}
        applyFromPointer(ev);
      });
      sv.addEventListener("pointermove", function (ev) {
        if (!dragging) return;
        applyFromPointer(ev);
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
            : "Seleziona o crea tag…";
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
            : "Seleziona categorie…";
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

    /* boardsDescMinPreview1: contatori + anteprima formattazione live */
    function bindDescLive(rootEl, cfg) {
      var minTag = Math.max(8, Math.min(80, Number((cfg && cfg.minTaglineChars) || 20) || 20));
      var minDesc = Math.max(20, Math.min(500, Number((cfg && cfg.minDescriptionChars) || 80) || 80));
      var maxTag = 160;
      var maxDesc = Math.max(2000, Math.min(8000, Number((cfg && cfg.maxMarkdownChars) || 4000) || 4000));
      var tag = rootEl.querySelector("#vc-boards-tagline");
      var tagCnt = rootEl.querySelector("#vc-boards-tagline-count");
      var desc = rootEl.querySelector("#vc-boards-desc");
      var descCnt = rootEl.querySelector("#vc-boards-desc-count");
      var prev = rootEl.querySelector("#vc-boards-desc-preview-body");

      function syncCount(el, cnt, min, max) {
        if (!el || !cnt) return 0;
        var n = String(el.value || "").trim().length;
        cnt.textContent = n + "/" + max + " (min " + min + ")";
        cnt.classList.toggle("is-short", n > 0 && n < min);
        cnt.classList.toggle("is-ok", n >= min);
        cnt.classList.toggle("is-empty", n === 0);
        return n;
      }

      function syncTag() {
        syncCount(tag, tagCnt, minTag, maxTag);
      }

      function syncDesc() {
        var n = syncCount(desc, descCnt, minDesc, maxDesc);
        if (!prev) return;
        var raw = desc ? String(desc.value || "") : "";
        var html = B.formatDescHtml(raw);
        prev.innerHTML =
          html ||
          '<p class="vc-boards-desc-preview__empty">L’anteprima della formattazione appare mentre scrivi…</p>';
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
      syncTag();
      syncDesc();
      return {
        minTagline: minTag,
        minDescription: minDesc,
        validate: function () {
          var tn = tag ? String(tag.value || "").trim().length : 0;
          var dn = desc ? String(desc.value || "").trim().length : 0;
          if (tn < minTag) {
            return {
              ok: false,
              message: "Descrizione breve: almeno " + minTag + " caratteri (ora " + tn + ").",
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
            : "Seleziona lingue…";
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

      /* boardsOpaqueAlign1: kind in chrome (allineato a Esplora), wizard opaco */
      var shell =
        B.navHtml("submit").replace(
          "</nav>",
          '<div class="vc-boards-seg vc-boards-chrome__kind" role="tablist" aria-label="Tipo">' +
            '<button type="button" class="vc-boards-seg__btn vc-no-sfx is-active" data-kind="server" id="vc-boards-tab-server">' +
            '<i class="fa fa-server" aria-hidden="true"></i>' +
            '<span data-i18n="boards.kindServer">Server</span></button>' +
            '<button type="button" class="vc-boards-seg__btn vc-no-sfx" data-kind="bot" id="vc-boards-tab-bot">' +
            '<i class="fa fa-android" aria-hidden="true"></i>' +
            '<span data-i18n="boards.kindBot">Bot</span></button>' +
            "</div></nav>",
        ) +
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
        var kind = url.kind || ss.kind || state.kind || "server";
        var guildId = url.guildId || ss.guildId || "";
        var listingId = url.listingId || ss.listingId || "";
        var wantStep = url.step || ss.step || "";
        if (!guildId) return false;

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
          '<p class="vc-boards-pick-actions__hint">Dopo aver aggiunto il bot su Discord, torna qui e premi Aggiorna lista.</p>' +
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
          '<p class="vc-boards-hint" data-i18n="boards.pickHint">Scegli un server che gestisci.</p>' +
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
          grid.innerHTML =
            '<div class="vc-boards-empty vc-boards-empty--in-grid">' +
            "<p>Nessun server gestibile. Devi essere owner o avere Gestisci server.</p>" +
            '<p class="vc-boards-hint">Se il bot non è ancora nel server, aggiungilo e aggiorna la lista.</p>' +
            "</div>";
          return;
        }
        grid.innerHTML = rows
          .map(function (g) {
            var badges = [];
            if (g.alreadyListed) badges.push('<span class="vc-boards-badge">già in bacheca</span>');
            else if (g.hasDraft) {
              badges.push(
                '<span class="vc-boards-badge vc-boards-badge--draft">' +
                  '<i class="fa fa-pencil" aria-hidden="true"></i> Bozza</span>',
              );
            }
            if (!g.botPresent) badges.push('<span class="vc-boards-badge vc-boards-badge--warn">manca bot</span>');
            var disabled = g.alreadyListed ? " is-disabled" : "";
            return (
              '<button type="button" class="vc-boards-claim-card vc-no-sfx' +
              disabled +
              '" data-id="' +
              B.esc(g.id) +
              '"' +
              (g.alreadyListed ? " disabled" : "") +
              ">" +
              (g.iconUrl
                ? '<img src="' + B.esc(g.iconUrl) + '" alt="" width="48" height="48" />'
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
            '<p class="vc-boards-hint" data-i18n="boards.pickHint">Scegli un server che gestisci.</p>' +
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
              '<div class="vc-boards-empty"><p class="vc-boards-hint">Il login deve includere il permesso <strong>guilds</strong> per vedere i tuoi server.</p>' +
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
          "Per pubblicare questo server il bot deve essere presente.</p>" +
          '<div class="vc-boards-tutorial__guild" title="' +
          guildName +
          '"><i class="fa fa-server" aria-hidden="true"></i><span>' +
          guildName +
          "</span></div>" +
          "</div></div>" +
          '<ol class="vc-boards-tutorial__steps">' +
          '<li><span class="vc-boards-tutorial__n" aria-hidden="true">1</span>' +
          '<span class="vc-boards-tutorial__t">Apri il link di invito bot</span></li>' +
          '<li><span class="vc-boards-tutorial__n" aria-hidden="true">2</span>' +
          '<span class="vc-boards-tutorial__t">Seleziona il server e autorizza</span></li>' +
          '<li><span class="vc-boards-tutorial__n" aria-hidden="true">3</span>' +
          '<span class="vc-boards-tutorial__t">Torna qui e conferma l’aggiunta</span></li>' +
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
          '<p class="vc-boards-tutorial__note">Dopo l’invito Discord può impiegare qualche secondo.</p>' +
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
          '<p class="vc-boards-hint">Inserisci il Client ID del bot (Developer Portal → Application).</p>' +
          '<form class="vc-boards-form" id="vc-boards-bot-id-form">' +
          '<label class="is-required">Bot Client ID' +
          reqStar(true) +
          '<input id="vc-boards-bot-id" inputmode="numeric" autocomplete="off" required /></label>' +
          '<label class="is-required">Nome bot' +
          reqStar(true) +
          '<input id="vc-boards-bot-name-early" maxlength="100" required /></label>' +
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
        }
        var title = (g.name || prefill.name || "la tua scheda").trim();
        var icoHtml = g.iconUrl
          ? '<img class="vc-boards-form-hero__img" src="' + B.esc(g.iconUrl) + '" alt="" width="56" height="56" />'
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
          '<p class="vc-boards-form-hero__lead">Compila i campi: testi, categorie e invite sono i più importanti.</p>' +
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
        var L = state.listing || {};
        var check = L.checklist || { items: [], complete: false, missing: [] };
        var itemsHtml = (check.items || [])
          .map(function (it) {
            return (
              '<li class="' +
              (it.ok ? "is-ok" : it.required ? "is-missing" : "is-opt") +
              '">' +
              '<i class="fa ' +
              (it.ok ? "fa-check" : it.required ? "fa-times" : "fa-minus") +
              '" aria-hidden="true"></i> ' +
              B.esc(it.label) +
              (it.required ? "" : " <em>(opz.)</em>") +
              "</li>"
            );
          })
          .join("");
        stepEl.innerHTML =
          '<div class="vc-boards-review">' +
          "<h2 data-i18n=\"boards.reviewTitle\">Controlla prima dell’invio</h2>" +
          '<ul class="vc-boards-checklist">' +
          itemsHtml +
          "</ul>" +
          '<div class="vc-boards-detail__actions">' +
          '<button type="button" class="vc-boards-btn vc-boards-btn--ghost" id="vc-boards-edit-again">Modifica</button>' +
          '<button type="button" class="vc-boards-btn vc-boards-btn--primary" id="vc-boards-submit-mod"' +
          (check.complete ? "" : " disabled") +
          ' data-i18n="boards.submitReview"><i class="fa fa-paper-plane" aria-hidden="true"></i> Invia a controllo</button>' +
          "</div></div>";
        document.getElementById("vc-boards-edit-again").addEventListener("click", function () {
          go("form");
        });
        var submitBtn = document.getElementById("vc-boards-submit-mod");
        submitBtn.addEventListener("click", async function () {
          if (!state.listing || !state.listing.id) {
            setMsg(msg, "Salva prima la bozza.", true);
            return;
        }
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
      var bootSs = readSsResume() || {};
      var bootKind = bootUrl.kind || bootSs.kind || "";
      if (bootKind === "bot") {
        state.kind = "bot";
        syncKindTabs();
        if (bootUrl.guildId || bootSs.guildId) {
          var didBot = await tryResumeWizard([]);
          if (didBot) return;
        }
        await go("bot-id");
        return;
      }
      await go("pick");
    }

    async function renderManage() {
      if (!B.token()) return needLogin();
      root.innerHTML =
        B.navHtml("manage") +
        '<div id="vc-boards-msg" class="vc-boards-msg mt-4" hidden></div><div id="vc-boards-mine" class="mt-3"></div>';
      var msg = document.getElementById("vc-boards-msg");
      var mine = document.getElementById("vc-boards-mine");
      var out = await B.api("/me/listings");
      if (!out.ok) {
        setMsg(msg, out.message || "Errore.", true);
        return;
      }
      var list = out.listings || [];
      if (!list.length) {
        mine.innerHTML =
          '<div class="vc-boards-empty">Nessuna scheda. <a class="vc-boards-btn vc-boards-btn--primary" href="/bacheca/invia/">Aggiungine una</a></div>';
        try {
          if (B.markContentReady) B.markContentReady();
        } catch (eReady3) {}
        return;
      }
      mine.innerHTML = list
        .map(function (L) {
          var cont =
            L.status === "draft"
              ? ' · <a href="/bacheca/invia/?guildId=' +
                encodeURIComponent(L.discordId || "") +
                "&listingId=" +
                encodeURIComponent(L.id || "") +
                "&step=form&kind=" +
                encodeURIComponent(L.kind || "server") +
                '">continua bozza</a>'
              : "";
          return (
            '<div class="vc-boards-mod-row" data-id="' +
            B.esc(L.id) +
            '">' +
            "<div><strong>" +
            B.esc(L.name) +
            "</strong> · " +
            B.esc(B.kindLabel(L.kind)) +
            " · <em>" +
            B.esc(B.statusLabel(L.status)) +
            "</em>" +
            cont +
            (L.slug && L.status === "approved"
              ? ' · <a href="' + B.esc(B.listingUrl(L.slug)) + '">apri</a>'
              : "") +
            "</div>" +
            '<form class="vc-boards-form vc-boards-edit-form">' +
            '<label class="is-required">Nome' +
            reqStar(true) +
            '<input name="name" value="' +
            B.esc(L.name || "") +
            '" /></label>' +
            '<label class="is-required">Tagline' +
            reqStar(true) +
            '<input name="tagline" id="vc-boards-tagline-' +
            B.esc(L.id) +
            '" minlength="20" maxlength="160" value="' +
            B.esc(L.tagline || "") +
            '" /></label>' +
            '<label class="is-required vc-boards-field--desc">Descrizione' +
            reqStar(true) +
            '<textarea name="description" class="vc-boards-edit-desc" data-preview="vc-boards-desc-preview-' +
            B.esc(L.id) +
            '" minlength="80" maxlength="4000" placeholder="**grassetto**, *corsivo*, elenchi, link">' +
            B.esc(L.description || L.markdown || "") +
            "</textarea>" +
            '<div class="vc-boards-desc-preview">' +
            '<div class="vc-boards-desc-preview__head">Anteprima</div>' +
            '<div class="vc-boards-desc-preview__body vc-boards-detail__desc" id="vc-boards-desc-preview-' +
            B.esc(L.id) +
            '"></div></div></label>' +
            '<label class="is-required">Invite URL' +
            reqStar(true) +
            '<input name="inviteUrl" value="' +
            B.esc(L.inviteUrl || "") +
            '" /></label>' +
            (L.kind === "bot"
              ? '<label class="is-required">Bot invite' +
                reqStar(true) +
                '<input name="botInviteUrl" value="' +
                B.esc(L.botInviteUrl || "") +
                '" /></label>'
              : "") +
            '<label>Tag<input name="tags" value="' +
            B.esc((L.tags || []).join(", ")) +
            '" /></label>' +
            '<label class="is-required">Categorie' +
            reqStar(true) +
            '<input name="categories" value="' +
            B.esc((L.categories || []).join(", ")) +
            '" placeholder="gaming, social" /></label>' +
            '<label class="is-required">Lingue' +
            reqStar(true) +
            '<input name="locales" value="' +
            B.esc((L.locales || []).join(", ")) +
            '" placeholder="it, en" /></label>' +
            '<label>Sito<input name="siteUrl" value="' +
            B.esc(L.siteUrl || "") +
            '" /></label>' +
            '<label>Banner URL<input name="bannerUrl" value="' +
            B.esc(L.bannerUrl || "") +
            '" /></label>' +
            '<label>Icon URL<input name="iconUrl" value="' +
            B.esc(L.iconUrl || "") +
            '" /></label>' +
            '<label>Accent<input name="accent" value="' +
            B.esc(L.accent || "") +
            '" /></label>' +
            '<div class="vc-boards-detail__actions">' +
            '<button type="submit" class="vc-boards-btn vc-boards-btn--primary">Salva</button>' +
            (L.status === "draft"
              ? '<button type="button" class="vc-boards-btn" data-submit-id="' +
                B.esc(L.id) +
                '">Invia a controllo</button>'
              : "") +
            "</div></form></div>"
          );
        })
        .join("");

      mine.querySelectorAll(".vc-boards-edit-desc").forEach(function (ta) {
        var pid = ta.getAttribute("data-preview");
        var body = pid ? document.getElementById(pid) : null;
        function sync() {
          if (!body) return;
          var html = B.formatDescHtml(ta.value || "");
          body.innerHTML =
            html ||
            '<p class="vc-boards-desc-preview__empty">L’anteprima della formattazione appare mentre scrivi…</p>';
        }
        ta.addEventListener("input", sync);
        sync();
      });
      mine.querySelectorAll(".vc-boards-edit-form").forEach(function (form) {
        form.addEventListener("submit", async function (e) {
          e.preventDefault();
          var wrap = form.closest("[data-id]");
          var id = wrap.getAttribute("data-id");
          var fd = new FormData(form);
          var patch = {};
          fd.forEach(function (v, k) {
            if (k === "categories" || k === "locales" || k === "tags") {
              patch[k] = String(v)
                .split(/[,;]/)
                .map(function (s) {
                  return s.trim();
                })
                .filter(Boolean);
            } else {
              patch[k] = String(v);
            }
          });
          var tn = String(patch.tagline || "").trim().length;
          var dn = String(patch.description || "").trim().length;
          if (tn < 20) {
            setMsg(msg, "Descrizione breve: almeno 20 caratteri (ora " + tn + ").", true);
            return;
          }
          if (dn < 80) {
            setMsg(msg, "Descrizione lunga: almeno 80 caratteri (ora " + dn + ").", true);
            return;
          }
          setMsg(msg, "Salvataggio…");
          var r = await B.api("/listings/" + encodeURIComponent(id), { method: "PATCH", json: patch });
          if (r.ok) {
            setMsg(
              msg,
              r.listing && r.listing.status === "pending"
                ? "Salvato. Campi sensibili → di nuovo in moderazione."
                : "Salvato.",
            );
          } else {
            setMsg(msg, r.message || "Errore salvataggio.", true);
          }
        });
      });
      mine.querySelectorAll("[data-submit-id]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = btn.getAttribute("data-submit-id");
          setMsg(msg, "Invio…");
          var r = await B.api("/listings/" + encodeURIComponent(id) + "/submit", { method: "POST", json: {} });
          setMsg(msg, r.message || (r.ok ? "Inviata in moderazione." : "Invio fallito."), !r.ok);
          if (r.ok) setTimeout(function () { location.reload(); }, 600);
        });
      });
      try {
        if (B.markContentReady) B.markContentReady();
      } catch (eReady4) {}
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
