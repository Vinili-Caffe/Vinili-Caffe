/**
 * Sorgenti 24/7: radio italiane (stream pubblici) + chill preset del bot.
 * Preferenza: MP3/Icecast/AAC diretti (Lavalink li risolve meglio degli HLS).
 * URL verificati dalla VPS dove possibile; alts = fallback se il primario cade.
 */

/* type non esportato: `export type` + `export =` con esbuild keepNames → `*_module.exports` rotto */
type AlwaysOnRadio = { id: string; label: string; url: string; alts?: string[] };

const ITALIAN_RADIOS: AlwaysOnRadio[] = [
  /* — RTL network — */
  { id: "rtl1025", label: "RTL 102.5", url: "https://streamingv2.shoutcast.com/rtl-1025" },
  { id: "rtlbest", label: "RTL 102.5 Best", url: "http://shoutcast.rtl.it:3020/", alts: ["http://shoutcast.rtl.it:3020"] },
  { id: "rtlgroove", label: "RTL 102.5 Groove", url: "http://shoutcast.rtl.it:3040/", alts: ["http://shoutcast.rtl.it:3040"] },
  { id: "rtllounge", label: "RTL 102.5 Lounge", url: "http://shoutcast.rtl.it:3070/", alts: ["http://shoutcast.rtl.it:3070"] },
  { id: "radiofreccia", label: "Radiofreccia", url: "https://streamingv2.shoutcast.com/radiofreccia", alts: ["http://shoutcast.rtl.it:3060/", "http://shoutcast.rtl.it:3060"] },
  { id: "radiozeta", label: "Radio Zeta", url: "http://shoutcast.rtl.it:3030/", alts: ["http://shoutcast.rtl.it:3030"] },

  /* — RDS — */
  { id: "rds", label: "RDS", url: "https://icstream.rds.radio/rds", alts: ["http://icstream.rds.radio/rds"] },
  { id: "rdsrelax", label: "RDS Relax", url: "http://icstream.rds.radio/rdsrelax" },

  /* — Radio 105 — */
  { id: "radio105", label: "Radio 105", url: "http://icecast.unitedradio.it/Radio105.mp3", alts: ["https://icy.unitedradio.it/Radio105.mp3"] },
  { id: "radio105classics", label: "105 Classics", url: "http://icy.unitedradio.it/105Classics.mp3" },
  { id: "radio105miami", label: "105 Miami", url: "https://icy.unitedradio.it/105Miami.mp3", alts: ["http://icy.unitedradio.it/105Miami.mp3"] },
  { id: "radio105hiphop", label: "105 Hip Hop & RnB", url: "http://icy.unitedradio.it/105HipHopRnB.mp3", alts: ["http://icy.unitedradio.it/105HipHop.mp3"] },
  { id: "radio105zoo", label: "105 Zoo", url: "http://icy.unitedradio.it/105Zoo.mp3" },
  { id: "radio105hits", label: "105 Hits", url: "http://icy.unitedradio.it/105Hits.mp3" },
  { id: "radio105rap", label: "105 Rap Italia", url: "http://icy.unitedradio.it/105RapItalia.mp3" },

  /* — Virgin Radio — */
  { id: "virgin", label: "Virgin Radio", url: "https://icy.unitedradio.it/Virgin.mp3", alts: ["http://icy.unitedradio.it/Virgin.mp3", "http://icecast.unitedradio.it/Virgin.mp3"] },
  { id: "virginhits", label: "Virgin Radio Rock Hits", url: "http://icy.unitedradio.it/VirginRockHits.mp3" },
  { id: "virginclassics", label: "Virgin Radio Classic Rock", url: "http://icy.unitedradio.it/VirginRockClassics.mp3" },
  { id: "virginalt", label: "Virgin Radio Rock Alternative", url: "http://icy.unitedradio.it/VirginRockAlternative.mp3" },
  { id: "virgin70", label: "Virgin Radio Rock '70", url: "http://icy.unitedradio.it/VirginRock70.mp3" },
  { id: "virgin80", label: "Virgin Radio Rock '80", url: "http://icy.unitedradio.it/VirginRock80.mp3" },
  { id: "virgin90", label: "Virgin Radio Rock '90", url: "http://icy.unitedradio.it/Virgin_03.mp3" },
  { id: "virginballads", label: "Virgin Radio Rock Ballads", url: "http://icy.unitedradio.it/Virgin_06.mp3" },
  { id: "virginparty", label: "Virgin Radio Rock Party", url: "http://icy.unitedradio.it/VirginRockParty.mp3" },
  { id: "virginacdc", label: "Virgin Rockstar AC/DC", url: "http://icy.unitedradio.it/um1026.mp3" },
  { id: "virginaerosmith", label: "Virgin Rockstar Aerosmith", url: "http://icy.unitedradio.it/um1028.mp3" },
  { id: "virgingnr", label: "Virgin Rockstar Guns N' Roses", url: "http://icy.unitedradio.it/um1029.mp3" },
  { id: "virginoasis", label: "Virgin Rockstar Oasis", url: "http://icy.unitedradio.it/um1030.mp3" },
  { id: "virginvasco", label: "Virgin MUSIC STAR Vasco", url: "http://icy.unitedradio.it/Vasco.mp3" },
  { id: "virginpinodaniele", label: "Virgin MUSIC STAR Pino Daniele", url: "http://icy.unitedradio.it/Daniele.mp3" },

  /* — R101 — */
  { id: "r101", label: "R101", url: "http://icecast.unitedradio.it/r101", alts: ["http://icecast.unitedradio.it/r101_mp3"] },
  { id: "r101italy", label: "R101 Made in Italy", url: "http://icy.unitedradio.it/R101MadeInItaly.aac" },
  { id: "r101legend", label: "R101 Enjoy The Music", url: "http://icy.unitedradio.it/101Legend.aac" },

  /* — Rai — */
  { id: "rai1", label: "Rai Radio 1", url: "https://icestreaming.rai.it/1.mp3", alts: ["http://icestreaming.rai.it/1.mp3"] },
  { id: "rai2", label: "Rai Radio 2", url: "https://icestreaming.rai.it/2.mp3", alts: ["http://icestreaming.rai.it/2.mp3"] },
  { id: "rai3", label: "Rai Radio 3", url: "https://icestreaming.rai.it/3.mp3", alts: ["http://icestreaming.rai.it/3.mp3"] },
  { id: "raituttait", label: "Rai Tutta Italiana", url: "http://icestreaming.rai.it/4.mp3" },
  { id: "raiclassica", label: "Rai Radio Classica", url: "http://icestreaming.rai.it/5.mp3" },
  { id: "raiisoradio", label: "Rai IsoRadio", url: "http://icestreaming.rai.it/6.mp3" },
  { id: "raigiparlamento", label: "Rai GR Parlamento", url: "http://icestreaming.rai.it/7.mp3" },
  { id: "raitechete", label: "Rai Radio Techetè", url: "http://icestreaming.rai.it/9.mp3" },
  { id: "railive", label: "Rai Radio Live", url: "http://icestreaming.rai.it/10.mp3" },

  /* — GEDI / Deejay — */
  { id: "radio24", label: "Radio 24", url: "http://shoutcast2.radio24.it:8000/;", alts: ["http://shoutcast2.radio24.it:8000/", "http://shoutcast.radio24.it:8000/"] },
  {
    id: "deejay",
    label: "Radio Deejay",
    url: "https://4c4b867c89244861ac216426883d1ad0.msvdn.net/radiodeejay/radiodeejay/master_ma.m3u8",
    alts: ["https://radiodeejay-lh.akamaihd.net/i/RadioDeejay_Live_1@189857/master.m3u8"],
  },
  {
    id: "m2o",
    label: "m2o",
    url: "https://4c4b867c89244861ac216426883d1ad0.msvdn.net/radiom2o/radiom2o/master_ma.m3u8",
    alts: ["http://radiom2o-lh.akamaihd.net/i/RadioM2o_Live_1@42518/master.m3u8"],
  },
  {
    id: "capital",
    label: "Radio Capital",
    url: "https://4c4b867c89244861ac216426883d1ad0.msvdn.net/radiocapital/radiocapital/master_ma.m3u8",
    alts: ["http://radiocapital-lh.akamaihd.net/i/RadioCapital_Live_1@196312/master.m3u8"],
  },

  /* — Kiss Kiss — */
  { id: "kisskiss", label: "Radio Kiss Kiss", url: "https://kisskiss.fluidstream.eu/KissKiss.mp3", alts: ["http://ice07.fluidstream.net:8080/KissKiss.mp3", "http://wma08.fluidstream.net:4610/"] },
  { id: "kisskissitalia", label: "Kiss Kiss Italia", url: "http://wma07.fluidstream.net:3616/;stream", alts: ["http://ice07.fluidstream.net/KKItalia.mp3"] },
  { id: "kisskissnapoli", label: "Kiss Kiss Napoli", url: "http://ice08.fluidstream.net/KKNapoli.aac", alts: ["http://wma06.fluidstream.net:3612/"] },
  { id: "kisskisshits", label: "Kiss Kiss Hits", url: "http://ice08.fluidstream.net/kk_hits.aac" },
  { id: "kisskisshistory", label: "Kiss Kiss History Hits", url: "http://ice08.fluidstream.net/kk_history.aac" },

  /* — Radio Monte Carlo — */
  { id: "rmc", label: "Radio Monte Carlo", url: "http://edge.radiomontecarlo.net/RMC.mp3" },
  { id: "rmc2", label: "RMC 2", url: "http://edge.radiomontecarlo.net/MC2.mp3" },
  { id: "rmchits", label: "RMC Hits", url: "http://edge.radiomontecarlo.net/rmcweb001" },
  { id: "rmcgreatest", label: "RMC Greatest Hits / Buddha-Bar", url: "http://edge.radiomontecarlo.net/rmcweb002" },
  { id: "rmcitalia", label: "RMC Italia", url: "http://edge.radiomontecarlo.net/rmcweb005" },
  { id: "rmclove", label: "RMC Love Songs", url: "http://edge.radiomontecarlo.net/rmcweb006" },
  { id: "rmcgreatartists", label: "RMC Great Artists", url: "http://edge.radiomontecarlo.net/rmcweb007" },
  { id: "rmc80", label: "RMC 80", url: "http://edge.radiomontecarlo.net/rmcweb008" },
  { id: "rmc90", label: "RMC 90", url: "http://edge.radiomontecarlo.net/rmcweb009" },
  { id: "rmcmarine", label: "RMC Marine", url: "http://edge.radiomontecarlo.net/rmcweb010" },
  { id: "rmcnewclassics", label: "RMC New Classics", url: "http://edge.radiomontecarlo.net/rmcweb011" },
  { id: "rmcnights", label: "RMC Nights Story", url: "http://edge.radiomontecarlo.net/rmcweb012" },
  { id: "rmcromantic", label: "RMC Romantic Rock", url: "http://edge.radiomontecarlo.net/rmcweb015" },
  { id: "rmcparty", label: "RMC Party", url: "http://edge.radiomontecarlo.net/rmcweb018" },
  { id: "rmcjazz", label: "RMC Jazz", url: "http://edge.radiomontecarlo.net/rmcweb019" },
  { id: "rmcvip", label: "RMC VIP Lounge", url: "http://edge.radiomontecarlo.net/rmcweb020" },
  { id: "rmcvoyage", label: "RMC Voyage Voyage", url: "http://edge.radiomontecarlo.net/rmcweb022" },
  { id: "rmcdisco", label: "RMC Disco Funk", url: "http://edge.radiomontecarlo.net/rmcweb025" },
  { id: "rmcsport", label: "RMC Sport Network", url: "http://stream17.tmwradio.com/tmw.mp3" },

  /* — Radio Italia / Subasio / United Music — */
  { id: "radioitalia", label: "Radio Italia", url: "https://radioitaliasmi.akamaized.net/hls/live/2093120/RadioItalia/master.m3u8" },
  { id: "radioitaliatrend", label: "Radio Italia Trend", url: "https://stream4.xdevel.com/audio0s976608-1379/stream/icecast.audio" },
  { id: "subasio", label: "Radio Subasio", url: "http://icy.unitedradio.it/Subasio.mp3", alts: ["http://onair18.xdevel.com:8152"] },
  { id: "subasioplus", label: "Radio Subasio +", url: "http://onair11.xdevel.com:8050" },
  { id: "subasioamore", label: "Subasio Per un'ora d'amore", url: "http://icy.unitedradio.it/SubasioPerUnOraDAmore.mp3" },
  { id: "subasiocollection", label: "Subasio Collection", url: "http://icy.unitedradio.it/SubasioCollection.mp3" },
  { id: "umhitsitalia", label: "United Music Hits Italia", url: "https://icy.unitedradio.it/um011.mp3" },
  { id: "umitalia2000", label: "United Music Italia 2000", url: "https://icy.unitedradio.it/um013.mp3" },
  { id: "umitalia60", label: "United Music Italia 60", url: "https://icy.unitedradio.it/um014.mp3" },
  { id: "umitalia80", label: "United Music Italia 80", url: "https://icy.unitedradio.it/um016.mp3" },
  { id: "umitalia90", label: "United Music Italia 90", url: "https://icy.unitedradio.it/um018.mp3" },
  { id: "umitalia70", label: "United Music Italia 70", url: "https://icy.unitedradio.it/um020.mp3" },

  /* — news / talk / sport — */
  { id: "popolare", label: "Radio Popolare", url: "http://livex.radiopopolare.it/radiopop" },
  { id: "sportiva", label: "Radio Sportiva", url: "https://sportiva.inmystream.it/stream/sportiva", alts: ["https://mediahit.it:8320/stream", "http://nr5.newradio.it:8545/stream.mp3"] },
  { id: "radicale", label: "Radio Radicale", url: "http://live.radioradicale.it/live.mp3" },
  { id: "lifegate", label: "LifeGate Radio", url: "https://router.xdevel.com/audio0s975809-345/stream/icecast.audio", alts: ["http://onair11.xdevel.com:8024"] },
  { id: "bianconera", label: "Radio Bianconera", url: "https://stream.tmwradio.com/bianconera.aac" },

  /* — dance / web music — */
  { id: "discoradio", label: "Discoradio", url: "https://stream.discoradio.it/live" },
  { id: "dancefloor90", label: "Dancefloor 90s", url: "http://streaming.radiodancefloor.it/live.mp3" },
  { id: "discofunk", label: "70 80 Disco Funk", url: "https://discofunk.streamingmedia.it/play" },
  { id: "ritmo80", label: "Ritmo 80", url: "http://ice02.fluidstream.net/ritmo80.aac" },
  { id: "romantica", label: "Romantica Radio", url: "https://vetrina.multi-radio.com/romanticaradio" },
  { id: "veniceclassic", label: "Venice Classic Radio", url: "http://116.202.241.212:8020/" },
  { id: "funkycorner", label: "Funky Corner Radio", url: "http://andromeda.shoutca.st:8411/stream" },
  { id: "rtr99pooh", label: "RTR 99 Canale Pooh", url: "https://rtr99.fluidstream.eu/rtr99_pooh.mp3" },
  { id: "ballaballa", label: "Radio Balla Balla", url: "http://ice09.fluidstream.net/ballaballa.mp3" },
  { id: "relaxitalia", label: "Radio Relax Italia", url: "https://radiorelax.streamingmedia.it/play" },

  /* — regionali / altre — */
  { id: "zorro", label: "Radio Zorro", url: "https://nr9.newradio.it/proxy/radiozorro?mp=/stream" },
  { id: "lattemiele", label: "Lattemiele", url: "https://sr15.inmystream.it:8000/stream", alts: ["http://onair18.xdevel.com:8014/"] },
  { id: "bruno", label: "Radio Bruno", url: "https://stream7.xdevel.com/audio4s975355-396/stream/icecast.audio", alts: ["http://stream1.xdevel.com/audio4s975355-254/stream/icecast.audio"] },
  { id: "studioplus", label: "Radio Studio Più", url: "http://ice.studiopiu.net/rete.aac", alts: ["http://77.241.4.100:8010/;"] },
  { id: "ibiza", label: "Radio Ibiza", url: "http://wma08.fluidstream.net:5010/;stream.aac", alts: ["http://wma02.fluidstream.net:5010/"] },
  { id: "numberone", label: "Radio Number One", url: "https://spark-numberone-live.coolnetwork.it/numberone" },
  { id: "norba", label: "Radio Norba", url: "http://onair11.xdevel.com:9990/", alts: ["http://onair20.xdevel.com:8348/;"] },
  { id: "norbamusic", label: "Radio Norba Music", url: "http://onair15.xdevel.com:7086/;", alts: ["http://onair7.xdevel.com:8738/"] },
  { id: "bella", label: "Radio Bella & Monella", url: "http://ice02.fluidstream.net/bella.mp3" },
  { id: "sorriso", label: "Radio Sorriso", url: "http://wma01.fluidstream.net/sorriso" },
  { id: "marilu", label: "Radio Marilù", url: "http://wma01.fluidstream.net/marilu" },
  { id: "holiday", label: "Radio Holiday", url: "http://stream.radioholiday.it:8000/" },
  { id: "maria", label: "Radio Maria", url: "http://dreamsiteradiocp2.com:8016/stream" },
  { id: "cuore", label: "Radio Cuore", url: "http://nr9.newradio.it:9029" },
  { id: "margherita", label: "Radio Margherita", url: "http://onair20.xdevel.com:8011/" },
  { id: "radiorock", label: "Radio Rock", url: "http://rrock.fluidstream.eu/radiorock.mp3" },
  { id: "marte", label: "Radio Marte", url: "https://stream1.xdevel.com/audio0s975753-313/stream/icecast.audio", alts: ["http://onair18.xdevel.com:8142/"] },
  { id: "armisa", label: "Radio Armisa", url: "https://onair.armisa.it/listen/armisa/radio.mp3" },
  { id: "playstudio", label: "Radio Playstudio", url: "https://rsd.streamingmedia.it/play.mp3" },
  { id: "pico", label: "Radio Pico", url: "http://onair11.xdevel.com:8064/" },
];

/** Stesso chill del giradischi sito; override: MUSIC_ALWAYS_ON_CHILL_URL */
const DEFAULT_CHILL_URL = "https://www.youtube.com/watch?v=8ArUNzZZb78";
const DEFAULT_CHILL_LABEL = "Lofi chill 24/7";

function listItalianRadios(): AlwaysOnRadio[] {
  return ITALIAN_RADIOS.map((r) => ({ ...r, alts: r.alts ? [...r.alts] : undefined }));
}

function getRadioById(id?) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return null;
  return ITALIAN_RADIOS.find((r) => r.id === key) || null;
}

function getChillPreset() {
  const fromEnv = String(process.env.MUSIC_ALWAYS_ON_CHILL_URL || "").trim();
  const url = /^https?:\/\/\S+/i.test(fromEnv) ? fromEnv.slice(0, 500) : DEFAULT_CHILL_URL;
  return { id: "chill", label: DEFAULT_CHILL_LABEL, url };
}

function alwaysOnCatalogPublic() {
  return {
    radios: ITALIAN_RADIOS.map(({ id, label }) => ({ id, label })),
    chill: { id: "chill", label: DEFAULT_CHILL_LABEL },
  };
}

function radioPlayUrls(radio: AlwaysOnRadio): string[] {
  const out: string[] = [];
  const push = (u?) => {
    const s = String(u || "").trim();
    if (s && !out.includes(s)) out.push(s);
  };
  push(radio.url);
  for (const a of radio.alts || []) push(a);
  return out;
}

function resolveAlwaysOnPlayTarget(source?, radioId?) {
  const src = String(source || "").trim().toLowerCase();
  if (src === "chill") {
    const chill = getChillPreset();
    return { kind: "chill" as const, id: chill.id, label: chill.label, url: chill.url, urls: [chill.url] };
  }
  if (src === "radio") {
    const radio = getRadioById(radioId) || ITALIAN_RADIOS[0];
    if (!radio) return null;
    const urls = radioPlayUrls(radio);
    return { kind: "radio" as const, id: radio.id, label: radio.label, url: urls[0], urls };
  }
  return null;
}

export = {
  listItalianRadios,
  getRadioById,
  getChillPreset,
  alwaysOnCatalogPublic,
  resolveAlwaysOnPlayTarget,
  radioPlayUrls,
};
