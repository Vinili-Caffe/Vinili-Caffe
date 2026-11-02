const VAR_HELP_ITEM_DEFS = [
  [
    { token: "{guild}", key: "guildName", hintKey: "varHelp_h_guild" },
    { token: "{server}", key: "guildName", hintKey: "varHelp_h_server" },
    { token: "{guild.name}", key: "guildName", hintKey: "varHelp_h_guild_name" },
    { token: "{server.name}", key: "guildName", hintKey: "varHelp_h_server_name" },
    { token: "{guild.id}", key: "guildId", hintKey: "varHelp_h_guild_id" },
    { token: "{server.id}", key: "guildId", hintKey: "varHelp_h_server_id" },
    { token: "{guild.link}", key: "guildLink", hintKey: "varHelp_h_guild_link" },
    { token: "{server.link}", key: "guildLink", hintKey: "varHelp_h_server_link" },
  ],
  [
    { token: "{partner}", key: "partnerServerName", hintKey: "varHelp_h_partner" },
    { token: "{partner.name}", key: "partnerServerName", hintKey: "varHelp_h_partner_name" },
  ],
  [
    { token: "{user}", key: "userMention", hintKey: "varHelp_h_user" },
    { token: "{user.id}", key: "userId", hintKey: "varHelp_h_user_id" },
    { token: "{user.username}", key: "userUsername", hintKey: "varHelp_h_user_username" },
    { token: "{user.tag}", key: "userTag", hintKey: "varHelp_h_user_tag" },
    { token: "{user.points}", key: "userPoints", hintKey: "varHelp_h_user_points" },
    { token: "{user.partnerships.count}", key: "userPartnershipsCount", hintKey: "varHelp_h_user_partnerships_count" },
    { token: "{user.partnerships.week}", key: "userPartnershipsWeek", hintKey: "varHelp_h_user_partnerships_week" },
    { token: "{user.partnerships.day}", key: "userPartnershipsDay", hintKey: "varHelp_h_user_partnerships_day" },
  ],
  [
    { token: "{manager}", key: "managerMention", hintKey: "varHelp_h_manager" },
    { token: "{manager.id}", key: "managerId", hintKey: "varHelp_h_manager_id" },
    { token: "{manager.username}", key: "managerUsername", hintKey: "varHelp_h_manager_username" },
    { token: "{manager.tag}", key: "managerTag", hintKey: "varHelp_h_manager_tag" },
  ],
  [
    { token: "{user.avatar}", key: "userAvatar", hintKey: "varHelp_h_user_avatar" },
    { token: "{guild.icon}", key: "guildIcon", hintKey: "varHelp_h_guild_icon" },
    { token: "{server.icon}", key: "guildIcon", hintKey: "varHelp_h_server_icon" },
    { token: "{partner.icon}", key: "partnerIcon", hintKey: "varHelp_h_partner_icon" },
    { token: "{manager.avatar}", key: "managerAvatar", hintKey: "varHelp_h_manager_avatar" },
  ],
  [
    { token: "{ping}", key: "ping", hintKey: "varHelp_h_ping" },
    { token: "{pings}", key: "pings", hintKey: "varHelp_h_pings" },
    { token: "{timestamp}", key: "timestamp", hintKey: "varHelp_h_timestamp" },
    { token: "{points}", key: "userPoints", hintKey: "varHelp_h_points" },
  ],
];

const VAR_HELP_SECTION_KEYS = [
  "varHelp_sec_server",
  "varHelp_sec_partner",
  "varHelp_sec_user",
  "varHelp_sec_manager",
  "varHelp_sec_media",
  "varHelp_sec_ping",
];

const VAR_HELP_EN = {
  varHelp_sec_server: "Server",
  varHelp_sec_partner: "Partner server",
  varHelp_sec_user: "User (partnership executor)",
  varHelp_sec_manager: "Manager",
  varHelp_sec_media: "Images and icons",
  varHelp_sec_ping: "Ping and more",
  varHelp_h_guild: "Name of the server where you publish the partnership.",
  varHelp_h_server: "Alias of {guild}.",
  varHelp_h_guild_name: "Text name of the server.",
  varHelp_h_server_name: "Alias of {guild.name}.",
  varHelp_h_guild_id: "Numeric ID of the server.",
  varHelp_h_server_id: "Alias of {guild.id}.",
  varHelp_h_guild_link: "Permanent invite of the partnership channel.",
  varHelp_h_server_link: "Alias of {guild.link}.",
  varHelp_h_partner: "Name of the server you partner with.",
  varHelp_h_partner_name: "Alias of {partner}.",
  varHelp_h_user: "Mention of the user who executed the partnership.",
  varHelp_h_user_id: "Discord ID of the user.",
  varHelp_h_user_username: "Display name of the user.",
  varHelp_h_user_tag: "Discord username of the user.",
  varHelp_h_user_points: "Total partner points of the user.",
  varHelp_h_user_partnerships_count: "Total number of partnerships completed.",
  varHelp_h_user_partnerships_week: "Partnerships completed in the last 7 days.",
  varHelp_h_user_partnerships_day: "Partnerships completed in the last 24 hours.",
  varHelp_h_manager: "Mention of the partnership manager.",
  varHelp_h_manager_id: "Manager ID, if present.",
  varHelp_h_manager_username: "Username of the manager.",
  varHelp_h_manager_tag: "Alias of the manager name.",
  varHelp_h_user_avatar: "Avatar URL of the user who ran the partnership.",
  varHelp_h_guild_icon: "Icon URL of your server.",
  varHelp_h_server_icon: "Alias of {guild.icon}.",
  varHelp_h_partner_icon: "Icon URL of the partner server.",
  varHelp_h_manager_avatar: "Avatar URL of the partnership manager.",
  varHelp_h_ping: "Main ping applied to the message (role, @here or @everyone).",
  varHelp_h_pings: "All pings applied together.",
  varHelp_h_timestamp: "Relative Discord timestamp of the partnership.",
  varHelp_h_points: "Alias of {user.points}.",
  varHelp_openHint:
    "Open **Variable list** from **Customizations** to see applied examples and explanations.",
};

const VAR_HELP_IT = {
  varHelp_sec_server: "Server",
  varHelp_sec_partner: "Server partner",
  varHelp_sec_user: "Utente (chi fa la partnership)",
  varHelp_sec_manager: "Manager",
  varHelp_sec_media: "Immagini e icone",
  varHelp_sec_ping: "Ping e altro",
  varHelp_h_guild: "Nome del server dove pubblichi la partnership.",
  varHelp_h_server: "Alias di {guild}.",
  varHelp_h_guild_name: "Nome testuale del server.",
  varHelp_h_server_name: "Alias di {guild.name}.",
  varHelp_h_guild_id: "ID numerico del server.",
  varHelp_h_server_id: "Alias di {guild.id}.",
  varHelp_h_guild_link: "Invito permanente del canale partnership.",
  varHelp_h_server_link: "Alias di {guild.link}.",
  varHelp_h_partner: "Nome del server con cui fai la partnership.",
  varHelp_h_partner_name: "Alias di {partner}.",
  varHelp_h_user: "Menzione dell'utente che ha eseguito la partner.",
  varHelp_h_user_id: "ID Discord dell'utente.",
  varHelp_h_user_username: "Nome visualizzato dell'utente.",
  varHelp_h_user_tag: "Username Discord dell'utente.",
  varHelp_h_user_points: "Punti/partner totali dell'utente.",
  varHelp_h_user_partnerships_count: "Numero totale di partnership effettuate.",
  varHelp_h_user_partnerships_week: "Partnership effettuate negli ultimi 7 giorni.",
  varHelp_h_user_partnerships_day: "Partnership effettuate nelle ultime 24 ore.",
  varHelp_h_manager: "Menzione del manager della partnership.",
  varHelp_h_manager_id: "ID del manager, se presente.",
  varHelp_h_manager_username: "Username del manager.",
  varHelp_h_manager_tag: "Alias del nome del manager.",
  varHelp_h_user_avatar: "URL avatar di chi ha eseguito la partnership.",
  varHelp_h_guild_icon: "URL icona del tuo server.",
  varHelp_h_server_icon: "Alias di {guild.icon}.",
  varHelp_h_partner_icon: "URL icona del server partner.",
  varHelp_h_manager_avatar: "URL avatar del manager della partnership.",
  varHelp_h_ping: "Ping principale applicato al messaggio (ruolo, @here o @everyone).",
  varHelp_h_pings: "Tutti i ping applicati insieme.",
  varHelp_h_timestamp: "Timestamp relativo Discord della partnership.",
  varHelp_h_points: "Alias di {user.points}.",
  varHelp_openHint:
    "Apri **Lista variabili** dal menu **Perzonalizzazioni** per vedere esempi applicati e spiegazioni.",
};

function mergeVarHelp(base?, patch?) {
  return { ...base, ...patch };
}

const VAR_HELP_LOCALES = {
  en: VAR_HELP_EN,
  it: mergeVarHelp(VAR_HELP_EN, VAR_HELP_IT),
  sv: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_server: "Server",
    varHelp_sec_partner: "Partnerserver",
    varHelp_sec_user: "Användare (partnership)",
    varHelp_sec_manager: "Manager",
    varHelp_sec_ping: "Ping m.m.",
    varHelp_h_guild: "Namn på servern där du publicerar partnership.",
    varHelp_h_server: "Alias för {guild}.",
    varHelp_h_guild_name: "Textnamn på servern.",
    varHelp_h_server_name: "Alias för {guild.name}.",
    varHelp_h_guild_id: "Numeriskt ID för servern.",
    varHelp_h_server_id: "Alias för {guild.id}.",
    varHelp_h_guild_link: "Permanent inbjudan till partnership-kanalen.",
    varHelp_h_server_link: "Alias för {guild.link}.",
    varHelp_h_partner: "Namn på servern du gör partnership med.",
    varHelp_h_partner_name: "Alias för {partner}.",
    varHelp_h_user: "Mention av användaren som körde partnership.",
    varHelp_h_user_id: "Discord-ID för användaren.",
    varHelp_h_user_username: "Visningsnamn för användaren.",
    varHelp_h_user_tag: "Discord-användarnamn.",
    varHelp_h_user_points: "Totala partnerpoäng för användaren.",
    varHelp_h_user_partnerships_count: "Totalt antal genomförda partnerships.",
    varHelp_h_user_partnerships_week: "Partnerships senaste 7 dagarna.",
    varHelp_h_user_partnerships_day: "Partnerships senaste 24 timmarna.",
    varHelp_h_manager: "Mention av partnership-manager.",
    varHelp_h_manager_id: "Manager-ID, om tillgängligt.",
    varHelp_h_manager_username: "Användarnamn för managern.",
    varHelp_h_manager_tag: "Alias för manager-namnet.",
    varHelp_h_ping: "Huvudping på meddelandet (roll, @here eller @everyone).",
    varHelp_h_pings: "Alla ping tillämpade tillsammans.",
    varHelp_h_timestamp: "Relativ Discord-tidsstämpel för partnership.",
    varHelp_h_points: "Alias för {user.points}.",
    varHelp_openHint:
      "Öppna **Variabellista** från **Anpassningar** för att se exempel och förklaringar.",
  }),
  es: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_partner: "Servidor partner",
    varHelp_sec_user: "Usuario (quien hace la partnership)",
    varHelp_sec_ping: "Ping y más",
    varHelp_openHint:
      "Abre **Lista de variables** en **Personalizaciones** para ver ejemplos y explicaciones.",
  }),
  fr: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_partner: "Serveur partenaire",
    varHelp_sec_user: "Utilisateur (auteur de la partnership)",
    varHelp_sec_ping: "Ping et plus",
    varHelp_openHint:
      "Ouvrez **Liste des variables** dans **Personnalisations** pour voir exemples et explications.",
  }),
  de: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_partner: "Partner-Server",
    varHelp_sec_user: "Benutzer (Partnership-Ausführer)",
    varHelp_sec_ping: "Ping und mehr",
    varHelp_openHint:
      "Öffne **Variablenliste** unter **Anpassungen** für Beispiele und Erklärungen.",
  }),
  pt: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_partner: "Servidor parceiro",
    varHelp_sec_user: "Usuário (quem faz a partnership)",
    varHelp_sec_ping: "Ping e mais",
    varHelp_openHint:
      "Abra **Lista de variáveis** em **Personalizações** para ver exemplos e explicações.",
  }),
  ru: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_server: "Сервер",
    varHelp_sec_partner: "Сервер-партнёр",
    varHelp_sec_user: "Пользователь (исполнитель partnership)",
    varHelp_sec_manager: "Менеджер",
    varHelp_sec_ping: "Пинг и прочее",
    varHelp_openHint:
      "Откройте **Список переменных** в **Настройках** для примеров и пояснений.",
  }),
  zh: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_server: "服务器",
    varHelp_sec_partner: "伙伴服务器",
    varHelp_sec_user: "用户（执行 partnership 的人）",
    varHelp_sec_manager: "管理员",
    varHelp_sec_ping: "Ping 等",
    varHelp_openHint: "在**自定义**中打开**变量列表**查看示例和说明。",
  }),
  ja: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_server: "サーバー",
    varHelp_sec_partner: "パートナーサーバー",
    varHelp_sec_user: "ユーザー（partnership 実行者）",
    varHelp_sec_manager: "マネージャー",
    varHelp_sec_ping: "Ping など",
    varHelp_openHint: "**カスタマイズ**の**変数リスト**で例と説明を確認できます。",
  }),
  ko: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_server: "서버",
    varHelp_sec_partner: "파트너 서버",
    varHelp_sec_user: "사용자 (partnership 실행자)",
    varHelp_sec_manager: "매니저",
    varHelp_sec_ping: "Ping 등",
    varHelp_openHint: "**사용자 지정**의 **변수 목록**에서 예시와 설명을 확인하세요.",
  }),
  ar: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_server: "الخادم",
    varHelp_sec_partner: "خادم الشريك",
    varHelp_sec_user: "المستخدم (منفّذ partnership)",
    varHelp_sec_manager: "المدير",
    varHelp_sec_ping: "Ping والمزيد",
    varHelp_openHint: "افتح **قائمة المتغيرات** من **التخصيصات** لرؤية الأمثلة والشرح.",
  }),
  nl: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_partner: "Partnerserver",
    varHelp_sec_user: "Gebruiker (partnership-uitvoerder)",
    varHelp_sec_ping: "Ping en meer",
    varHelp_openHint:
      "Open **Variabelenlijst** via **Aanpassingen** voor voorbeelden en uitleg.",
  }),
  pl: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_partner: "Serwer partnera",
    varHelp_sec_user: "Użytkownik (wykonawca partnership)",
    varHelp_sec_ping: "Ping i więcej",
    varHelp_openHint:
      "Otwórz **Listę zmiennych** w **Personalizacji**, aby zobaczyć przykłady i opisy.",
  }),
  tr: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_partner: "Partner sunucu",
    varHelp_sec_user: "Kullanıcı (partnership yapan)",
    varHelp_sec_ping: "Ping ve daha fazlası",
    varHelp_openHint:
      "Örnekler ve açıklamalar için **Özelleştirmeler**'den **Değişken listesi**'ni açın.",
  }),
  hi: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_server: "सर्वर",
    varHelp_sec_partner: "पार्टनर सर्वर",
    varHelp_sec_user: "उपयोगकर्ता (partnership करने वाला)",
    varHelp_sec_manager: "मैनेजर",
    varHelp_sec_ping: "Ping और अन्य",
    varHelp_openHint: "**कस्टमाइज़ेशन** में **वेरिएबल सूची** खोलें।",
  }),
  id: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_partner: "Server partner",
    varHelp_sec_user: "Pengguna (pelaksana partnership)",
    varHelp_sec_ping: "Ping dan lainnya",
    varHelp_openHint:
      "Buka **Daftar variabel** dari **Kustomisasi** untuk contoh dan penjelasan.",
  }),
  uk: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_server: "Сервер",
    varHelp_sec_partner: "Сервер-партнер",
    varHelp_sec_user: "Користувач (виконавець partnership)",
    varHelp_sec_manager: "Менеджер",
    varHelp_sec_ping: "Пінг та інше",
    varHelp_openHint:
      "Відкрийте **Список змінних** у **Налаштуваннях** для прикладів і пояснень.",
  }),
  vi: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_server: "Máy chủ",
    varHelp_sec_partner: "Máy chủ đối tác",
    varHelp_sec_user: "Người dùng (thực hiện partnership)",
    varHelp_sec_manager: "Quản lý",
    varHelp_sec_ping: "Ping và khác",
    varHelp_openHint:
      "Mở **Danh sách biến** từ **Tùy chỉnh** để xem ví dụ và giải thích.",
  }),
  ro: mergeVarHelp(VAR_HELP_EN, {
    varHelp_sec_partner: "Server partener",
    varHelp_sec_user: "Utilizator (executor partnership)",
    varHelp_sec_ping: "Ping și altele",
    varHelp_openHint:
      "Deschide **Lista variabilelor** din **Personalizări** pentru exemple și explicații.",
  }),
};

function applyVarHelpPacks(uiPacks?) {
  for (const [code, patch] of Object.entries(VAR_HELP_LOCALES)) {
    if (!uiPacks[code]) continue;
    uiPacks[code] = { ...uiPacks[code], ...patch };
  }
}

function buildLocalizedVariableHelpSections(tFn?) {
  return VAR_HELP_ITEM_DEFS.map((items?, sectionIndex?) => ({
    title: tFn(VAR_HELP_SECTION_KEYS[sectionIndex]),
    items: items.map((item?) => ({
      token: item.token,
      key: item.key,
      hint: tFn(item.hintKey),
    })),
  }));
}

export = {
  applyVarHelpPacks,
  buildLocalizedVariableHelpSections,
};
