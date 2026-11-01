/** Wordle answer/guess banks (exactly 5 letters). */
"use strict";

const WORDLE_IT = Object.freeze(["abito","acqua","aglio","alare","alcol","altro","amaca","amaro","amica","amico","amore","anima","arena","arnia","aroma","ascia","asino","asola","aspro","assai","astro","atomo","avaro","avena","avido","avvio","azoto","bacio","bagno","balia","ballo","balzo","banca","banco","banda","bando","barba","barca","barco","barra","basso","basto","beato","belga","bello","belva","benda","beone","berci","biada","bivio","bocca","bolla","bollo","bomba","bordo","borgo","borsa","bosco","botte","bozza","brace","brama","brano","bravo","breve","brici","briga","brina","bruco","bruma","bruno","bucce","buchi","buono","burro","busto","butta","cablo","cacao","cacio","caffe","cagna","calce","caldo","calma","calvo","calza","calze","campo","cando","cango","canna","canto","cappa","capra","carne","carta","casco","cassa","causa","cebra","cedro","cento","cerca","certo","cervo","cesta","cetra","cielo","cingo","circa","circo","cispa","citta","clero","clima","clone","cloro","cobra","cocca","colle","colmo","colpa","colpo","colto","conto","copia","coppa","corda","corno","corpo","corsa","corta","corte","corto","cosmo","costa","cotto","crema","creta","crine","croce","crude","culla","cuoco","cuore","curva","custa","danza","dardo","dazio","delta","denso","desta","dieta","dingo","disco","ditta","dogma","dolce","donna","dorso","dozza","drago","droga","duomo","ebano","ebete","edile","egual","elica","elico","epoca","erede","eremo","eroso","esame","esile","esito","estro","etica","etnia","evaso","eviro","evito","falce","falco","falli","falso","fango","fatto","fauna","ferro","feudo","fiaba","fiato","fibra","fieno","fiero","finta","fiore","firma","fisco","fisso","fitto","fiume","fobia","folla","fondo","fonte","forca","forma","forno","forte","forza","fossa","frase","frate","freno","frigo","fuoco","fuori","furbo","furto","fusto","galla","gamba","gambo","gamma","garbo","garza","gatto","gelso","gemma","genio","gente","gesto","getto","ghiro","gioco","giogo","gioia","gogna","golfo","gomma","gonna","gotta","grado","grano","grata","grave","greco","grido","grumo","guida","gusto","idolo","igloo","image","impio","inane","indio","infra","iodio","iride","isola","istmo","jeans","latte","leale","legno","lento","leone","lepre","letto","libro","lieve","limbo","lince","linea","linfa","lista","litio","litro","liuto","logge","lonza","lotta","lucci","lungo","luogo","lutto","madre","magia","magro","malto","mamma","manco","manto","marea","marmo","marna","massa","matto","media","medio","melma","menta","mente","merce","merlo","messe","mesto","metro","mezzo","micio","miele","milza","minio","misto","mitra","molla","molle","molto","mondo","monte","morbo","morso","morte","mosca","mosto","motto","mucca","muffa","museo","mutua","natio","nervo","netto","ninfa","nitro","nonna","nonno","norma","notte","nozze","nulli","nuora","nuoto","nuovo","nutre","nutri","odore","ogiva","oliva","oltre","ombra","onere","onice","onore","opera","oppio","orcio","ormai","osare","osseo","ovest","ovile","ovulo","ozono","padre","paese","palco","palla","palmo","panca","panda","panna","panno","pappa","parco","parte","passo","pasta","pasto","patto","paura","pavia","pelle","penna","penne","perde","perso","pesca","pesce","peste","petto","pezza","pezzo","piano","picco","piede","pieno","pigna","pinza","pista","pizza","poeta","ponte","porta","porto","primo","prova","quasi","ricco","rosso","salto","scala","scuro","secco","sedia","selva","sogno","soldi","sopra","sotto","sport","stato","terra","tetto","tigre","torre","torta","tutto","umido","valle","vento","verde","vetro","vigna","viola","volpe","vuoto","zaino","zebra"]);
const WORDLE_EN = Object.freeze(["about","above","abuse","actor","acute","adieu","admit","adopt","adult","after","again","agent","agree","ahead","album","alert","alike","alive","allow","alone","along","alter","among","anger","angle","angry","apart","apple","apply","arena","argue","arise","array","aside","asset","audio","audit","avoid","awake","award","aware","badly","baker","bases","basic","basis","beach","began","begin","being","below","bench","birth","black","blame","blind","block","blood","board","boost","booth","bound","brain","brand","bread","break","breed","brief","bring","broad","broke","brown","build","built","buyer","cable","carry","catch","cause","chain","chair","chart","chase","cheap","check","chest","chief","child","china","chose","civil","claim","class","clean","clear","click","clock","close","cloth","cloud","coach","coast","could","count","court","cover","craft","crane","crash","crate","cream","crime","cross","crowd","crown","crude","curve","cycle","daily","dance","dated","dealt","death","debut","delay","depth","doing","doubt","dozen","draft","drama","drawn","dream","dress","drill","drink","drive","drove","dying","eager","early","earth","eight","elite","empty","enemy","enjoy","enter","entry","equal","error","event","every","exact","exist","extra","faith","false","fault","fiber","field","fifth","fifty","fight","final","first","fixed","flash","fleet","floor","fluid","focus","force","forge","forth","forty","forum","found","frame","frank","fraud","fresh","front","fruit","fully","funny","giant","given","glass","globe","going","grace","grade","grand","grant","grass","great","green","gross","group","grown","guard","guess","guest","guide","happy","heart","heavy","hence","horse","hotel","house","human","ideal","image","index","inner","input","issue","judge","known","label","large","laser","later","laugh","layer","learn","lease","least","leave","legal","level","light","limit","links","lives","local","logic","loose","lower","lucky","lunch","lying","magic","major","maker","march","match","maybe","mayor","meant","media","metal","might","minor","minus","mixed","model","money","month","moral","motor","mount","mouse","mouth","movie","music","needs","never","newly","night","noise","north","noted","novel","nurse","occur","ocean","offer","often","order","other","ought","paint","panel","paper","party","peace","phase","phone","photo","piece","pilot","pitch","place","plain","plane","plant","plate","point","porch","pound","power","press","price","pride","prime","print","prior","prize","proof","proud","prove","queen","quick","quiet","quite","radio","raise","range","rapid","ratio","reach","ready","refer","right","rival","river","roger","roman","rough","round","route","royal","rural","scale","scene","scope","score","sense","serve","seven","shall","shape","share","sharp","sheet","shelf","shell","shift","shine","shirt","shock","shoot","short","shown","sides","sight","since","sixth","sixty","sized","skill","slate","sleep","slide","small","smart","smile","smith","smoke","solid","solve","sorry","sound","south","space","spare","speak","speed","spend","spent","split","spoke","sport","staff","stage","stake","stand","stare","start","state","steam","steel","stick","still","stock","stone","stood","store","storm","story","strip","stuck","study","stuff","style","sugar","suite","super","sweet","table","taken","taste","taxes","teach","teeth","thank","theft","their","theme","there","these","thick","thing","think","third","those","three","threw","throw","tight","times","tired","title","today","topic","total","touch","tough","tower","trace","track","trade","train","treat","trend","trial","tried","trips","truck","truly","trust","truth","twice","under","union","unity","until","upper","upset","urban","usage","usual","valid","value","video","virus","visit","vital","vocal","voice","waste","watch","water","wheel","where","which","while","white","whole","whose","woman","world","worry","worse","worst","worth","would","write","wrong","wrote","young","youth"]);

const {
  getWordleGuessBank,
  getWordleExtraAnswers,
} = require("./wordleGuessBanks") as typeof import("./wordleGuessBanks");

const WORDLE_LANGS = Object.freeze(["it", "en", "es", "fr", "de", "pt"]);

function normalizeWordleLang(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .slice(0, 2);
  if (WORDLE_LANGS.includes(v)) return v;
  /* site locales without a 5-letter bank → English (Latin keyboard) */
  if (v === "nl" || v === "sv" || v === "pl" || v === "tr" || v === "id" || v === "ro" || v === "vi") {
    return "en";
  }
  return "it";
}

function getWordleAnswers(lang) {
  const k = normalizeWordleLang(lang);
  if (k === "en") return WORDLE_EN;
  if (k === "it") return WORDLE_IT;
  const extra = getWordleExtraAnswers(k);
  if (extra && extra.length) return extra;
  return WORDLE_IT;
}

function getWordleGuesses(lang) {
  const k = normalizeWordleLang(lang);
  const bank = getWordleGuessBank(k);
  if (bank && bank.length) return bank;
  return Array.from(new Set([...WORDLE_IT, ...WORDLE_EN]));
}

export = {
  WORDLE_LANGS,
  normalizeWordleLang,
  getWordleAnswers,
  getWordleGuesses,
};
