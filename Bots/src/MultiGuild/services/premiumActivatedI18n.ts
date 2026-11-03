const {
  DEFAULT_LANGUAGE,
  TENANT_LANGUAGES,
  normalizeTenantLanguage,
} = require("../../Vinili/Partner/i18n/tenantPartnershipI18n/languages") as typeof import("../../Vinili/Partner/i18n/tenantPartnershipI18n/languages");
const { resolveTenantLanguage } = require("../../Vinili/Partner/i18n/tenantPartnershipI18n/index") as typeof import("../../Vinili/Partner/i18n/tenantPartnershipI18n/index");

function merge(base?, patch?) {
  return { ...base, ...patch };
}

const PREMIUM_EN = Object.freeze({
  title: "__💎 Premium activated: {plan}__",
  thanks: "**Thanks!** You activated **Vinili Premium** on **{guild}**.",
  intro: "You can now customize the bot identity and premium messages from the dashboard.",
  fieldPlan: "Plan",
  fieldCredits: "Credits used",
  creditsValue: "**{spent}** credits\nBalance: **{left}**",
  creditsValueNoBalance: "**{spent}** credits",
  fieldExpires: "Expires",
  lifetime: "Lifetime (no expiry)",
  expiresUnavailable: "Expiry unavailable",
  fieldPerks: "What you unlock",
  perkAvatar: "Custom bot avatar for the server",
  perkBanner: "Custom bot banner",
  perkName: "Custom bot nickname",
  perkEmbed: "Custom partnership thank-you messages",
  perkDashboard: "Manage everything from the Premium dashboard",
  fieldStart: "Where to start",
  fieldStartBody:
    "Use the button below to open the server dashboard → customization / partnership.\nYou can change avatar, banner, nickname and premium messages anytime while Premium is active.",
  buttonDashboard: "Open dashboard",
  channelFallback: "I can't DM you — here's the Premium confirmation here.",
  duration1: "1 month",
  durationN: "{n} months",
  planName: "Customization",
  remindTitle7: "__⏳ Premium expires in 7 days__",
  remindTitle3: "__⏳ Premium expires in 3 days__",
  remindTitle1: "__⏳ Premium expires tomorrow__",
  remindThanks: "Heads up about **Vinili Premium** on **{guild}**.",
  remindIntro7: "Your subscription expires in about **a week**.",
  remindIntro3: "Your subscription expires in about **3 days**.",
  remindIntro1: "Your subscription expires **tomorrow**.",
  remindKeep: "Your customizations (avatar, banner, nickname, premium messages) stay saved — they unlock again when you renew.",
  remindCta: "Renew from the dashboard with credits before expiry so nothing gets interrupted.",
  remindChannelFallback: "I can't DM you — here's the Premium expiry reminder here.",
  buttonRenew: "Renew Premium",
});

const PREMIUM_IT = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium attivato: {plan}__",
    thanks: "**Grazie!** Hai attivato **Vinili Premium** su **{guild}**.",
    intro: "Da ora puoi personalizzare l’identità del bot e i messaggi premium dalla dashboard.",
    fieldPlan: "Piano",
    fieldCredits: "Crediti usati",
    creditsValue: "**{spent}** crediti\nSaldo: **{left}**",
    creditsValueNoBalance: "**{spent}** crediti",
    fieldExpires: "Scade",
    lifetime: "A vita (senza scadenza)",
    expiresUnavailable: "Scadenza non disponibile",
    fieldPerks: "Cosa sblocchi",
    perkAvatar: "Avatar del bot personalizzato sul server",
    perkBanner: "Banner del bot personalizzato",
    perkName: "Nome (nickname) del bot personalizzato",
    perkEmbed: "Messaggi di ringraziamento partnership personalizzati",
    perkDashboard: "Gestione dalla dashboard Premium",
    fieldStart: "Da dove inizi",
    fieldStartBody:
      "Usa il bottone sotto per aprire la dashboard del server → personalizzazione / partnership.\nPuoi cambiare avatar, banner, nickname e i messaggi premium quando vuoi, finché Premium è attivo.",
    buttonDashboard: "Apri dashboard",
    channelFallback: "Non riesco a scriverti in DM — ecco la conferma Premium qui.",
    duration1: "1 mese",
    durationN: "{n} mesi",
    planName: "Personalizzazione",
    remindTitle7: "__⏳ Premium in scadenza tra 7 giorni__",
    remindTitle3: "__⏳ Premium in scadenza tra 3 giorni__",
    remindTitle1: "__⏳ Premium scade domani__",
    remindThanks: "Promemoria su **Vinili Premium** per **{guild}**.",
    remindIntro7: "L’abbonamento scade tra circa **una settimana**.",
    remindIntro3: "L’abbonamento scade tra circa **3 giorni**.",
    remindIntro1: "L’abbonamento scade **domani**.",
    remindKeep:
      "Le personalizzazioni (avatar, banner, nickname, messaggi premium) restano salvate: alla riattivazione tornano disponibili.",
    remindCta: "Rinnova dalla dashboard con i crediti prima della scadenza, così non hai interruzioni.",
    remindChannelFallback: "Non riesco a scriverti in DM — ecco il promemoria scadenza Premium qui.",
    buttonRenew: "Rinnova Premium",
  }),
);

const PREMIUM_ES = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium activado: {plan}__",
    thanks: "**¡Gracias!** Has activado **Vinili Premium** en **{guild}**.",
    intro: "Ya puedes personalizar la identidad del bot y los mensajes premium desde el panel.",
    fieldPlan: "Plan",
    fieldCredits: "Créditos usados",
    creditsValue: "**{spent}** créditos\nSaldo: **{left}**",
    creditsValueNoBalance: "**{spent}** créditos",
    fieldExpires: "Caduca",
    lifetime: "De por vida (sin caducidad)",
    expiresUnavailable: "Caducidad no disponible",
    fieldPerks: "Qué desbloqueas",
    perkAvatar: "Avatar del bot personalizado en el servidor",
    perkBanner: "Banner del bot personalizado",
    perkName: "Apodo del bot personalizado",
    perkEmbed: "Mensajes de agradecimiento de partnership personalizados",
    perkDashboard: "Gestión desde el panel Premium",
    fieldStart: "Por dónde empezar",
    fieldStartBody:
      "Usa el botón de abajo para abrir el panel del servidor → personalización / partnership.\nPuedes cambiar avatar, banner, apodo y mensajes premium cuando quieras mientras Premium esté activo.",
    buttonDashboard: "Abrir panel",
    channelFallback: "No puedo enviarte un MD — aquí tienes la confirmación Premium.",
    duration1: "1 mes",
    durationN: "{n} meses",
    planName: "Personalización",
  }),
);

const PREMIUM_FR = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium activé : {plan}__",
    thanks: "**Merci !** Tu as activé **Vinili Premium** sur **{guild}**.",
    intro: "Tu peux maintenant personnaliser l’identité du bot et les messages premium depuis le tableau de bord.",
    fieldPlan: "Offre",
    fieldCredits: "Crédits utilisés",
    creditsValue: "**{spent}** crédits\nSolde : **{left}**",
    creditsValueNoBalance: "**{spent}** crédits",
    fieldExpires: "Expire",
    lifetime: "À vie (sans expiration)",
    expiresUnavailable: "Expiration indisponible",
    fieldPerks: "Ce que tu débloques",
    perkAvatar: "Avatar du bot personnalisé sur le serveur",
    perkBanner: "Bannière du bot personnalisée",
    perkName: "Pseudo du bot personnalisé",
    perkEmbed: "Messages de remerciement partnership personnalisés",
    perkDashboard: "Gestion depuis le tableau de bord Premium",
    fieldStart: "Par où commencer",
    fieldStartBody:
      "Utilise le bouton ci-dessous pour ouvrir le tableau de bord du serveur → personnalisation / partnership.\nTu peux changer avatar, bannière, pseudo et messages premium quand tu veux tant que Premium est actif.",
    buttonDashboard: "Ouvrir le tableau de bord",
    channelFallback: "Je ne peux pas t’écrire en MP — voici la confirmation Premium ici.",
    duration1: "1 mois",
    durationN: "{n} mois",
    planName: "Personnalisation",
  }),
);

const PREMIUM_DE = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium aktiviert: {plan}__",
    thanks: "**Danke!** Du hast **Vinili Premium** auf **{guild}** aktiviert.",
    intro: "Ab jetzt kannst du Bot-Identität und Premium-Nachrichten im Dashboard anpassen.",
    fieldPlan: "Plan",
    fieldCredits: "Verbrauchte Credits",
    creditsValue: "**{spent}** Credits\nGuthaben: **{left}**",
    creditsValueNoBalance: "**{spent}** Credits",
    fieldExpires: "Läuft ab",
    lifetime: "Lebenslang (kein Ablauf)",
    expiresUnavailable: "Ablaufdatum nicht verfügbar",
    fieldPerks: "Was du freischaltest",
    perkAvatar: "Benutzerdefinierter Bot-Avatar für den Server",
    perkBanner: "Benutzerdefiniertes Bot-Banner",
    perkName: "Benutzerdefinierter Bot-Spitzname",
    perkEmbed: "Benutzerdefinierte Partnership-Dankesnachrichten",
    perkDashboard: "Verwaltung über das Premium-Dashboard",
    fieldStart: "So startest du",
    fieldStartBody:
      "Nutze den Button unten, um das Server-Dashboard zu öffnen → Anpassung / Partnership.\nDu kannst Avatar, Banner, Spitzname und Premium-Nachrichten jederzeit ändern, solange Premium aktiv ist.",
    buttonDashboard: "Dashboard öffnen",
    channelFallback: "Ich kann dir keine DM senden — hier ist die Premium-Bestätigung.",
    duration1: "1 Monat",
    durationN: "{n} Monate",
    planName: "Anpassung",
  }),
);

const PREMIUM_PT = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium ativado: {plan}__",
    thanks: "**Obrigado!** Ativaste **Vinili Premium** em **{guild}**.",
    intro: "Agora podes personalizar a identidade do bot e as mensagens premium no painel.",
    fieldPlan: "Plano",
    fieldCredits: "Créditos usados",
    creditsValue: "**{spent}** créditos\nSaldo: **{left}**",
    creditsValueNoBalance: "**{spent}** créditos",
    fieldExpires: "Expira",
    lifetime: "Vitalício (sem validade)",
    expiresUnavailable: "Validade indisponível",
    fieldPerks: "O que desbloqueias",
    perkAvatar: "Avatar do bot personalizado no servidor",
    perkBanner: "Banner do bot personalizado",
    perkName: "Apelido do bot personalizado",
    perkEmbed: "Mensagens de agradecimento de partnership personalizadas",
    perkDashboard: "Gestão pelo painel Premium",
    fieldStart: "Por onde começar",
    fieldStartBody:
      "Usa o botão abaixo para abrir o painel do servidor → personalização / partnership.\nPodes mudar avatar, banner, apelido e mensagens premium quando quiseres enquanto o Premium estiver ativo.",
    buttonDashboard: "Abrir painel",
    channelFallback: "Não consigo enviar-te DM — aqui está a confirmação Premium.",
    duration1: "1 mês",
    durationN: "{n} meses",
    planName: "Personalização",
  }),
);

const PREMIUM_RU = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium активирован: {plan}__",
    thanks: "**Спасибо!** Ты активировал **Vinili Premium** на **{guild}**.",
    intro: "Теперь можно настроить образ бота и премиум-сообщения в панели управления.",
    fieldPlan: "План",
    fieldCredits: "Потрачено кредитов",
    creditsValue: "**{spent}** кредитов\nБаланс: **{left}**",
    creditsValueNoBalance: "**{spent}** кредитов",
    fieldExpires: "Истекает",
    lifetime: "Навсегда (без срока)",
    expiresUnavailable: "Срок недоступен",
    fieldPerks: "Что открывается",
    perkAvatar: "Свой аватар бота на сервере",
    perkBanner: "Свой баннер бота",
    perkName: "Свой никнейм бота",
    perkEmbed: "Свои сообщения благодарности за партнёрства",
    perkDashboard: "Управление в Premium-панели",
    fieldStart: "С чего начать",
    fieldStartBody:
      "Нажми кнопку ниже, чтобы открыть панель сервера → персонализация / партнёрства.\nМожно менять аватар, баннер, ник и премиум-сообщения в любое время, пока Premium активен.",
    buttonDashboard: "Открыть панель",
    channelFallback: "Не могу написать в ЛС — подтверждение Premium здесь.",
    duration1: "1 месяц",
    durationN: "{n} мес.",
    planName: "Персонализация",
  }),
);

const PREMIUM_ZH = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 已激活 Premium：{plan}__",
    thanks: "**谢谢！**你已在 **{guild}** 激活 **Vinili Premium**。",
    intro: "现在可以从控制面板自定义机器人形象与 Premium 消息。",
    fieldPlan: "方案",
    fieldCredits: "已用积分",
    creditsValue: "**{spent}** 积分\n余额：**{left}**",
    creditsValueNoBalance: "**{spent}** 积分",
    fieldExpires: "到期",
    lifetime: "永久（无到期）",
    expiresUnavailable: "到期时间不可用",
    fieldPerks: "已解锁内容",
    perkAvatar: "服务器自定义机器人头像",
    perkBanner: "自定义机器人横幅",
    perkName: "自定义机器人昵称",
    perkEmbed: "自定义合作感谢消息",
    perkDashboard: "通过 Premium 控制面板管理",
    fieldStart: "如何开始",
    fieldStartBody:
      "点击下方按钮打开服务器控制面板 → 个性化 / 合作。\n只要 Premium 有效，可随时更改头像、横幅、昵称和 Premium 消息。",
    buttonDashboard: "打开控制面板",
    channelFallback: "无法私信你 — Premium 确认在这里。",
    duration1: "1 个月",
    durationN: "{n} 个月",
    planName: "个性化",
  }),
);

const PREMIUM_JA = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premiumを有効化：{plan}__",
    thanks: "**ありがとう！** **{guild}** で **Vinili Premium** を有効にしました。",
    intro: "ダッシュボードからボットの見た目とプレミアムメッセージをカスタマイズできます。",
    fieldPlan: "プラン",
    fieldCredits: "使用クレジット",
    creditsValue: "**{spent}** クレジット\n残高：**{left}**",
    creditsValueNoBalance: "**{spent}** クレジット",
    fieldExpires: "期限",
    lifetime: "無期限",
    expiresUnavailable: "期限情報なし",
    fieldPerks: "解放内容",
    perkAvatar: "サーバー用のカスタムボットアバター",
    perkBanner: "カスタムボットバナー",
    perkName: "カスタムボットニックネーム",
    perkEmbed: "カスタムパートナーシップお礼メッセージ",
    perkDashboard: "Premiumダッシュボードで管理",
    fieldStart: "はじめ方",
    fieldStartBody:
      "下のボタンからサーバーダッシュボード → カスタマイズ / パートナーシップ を開いてください。\nPremium有効中はいつでもアバター・バナー・ニックネーム・メッセージを変更できます。",
    buttonDashboard: "ダッシュボードを開く",
    channelFallback: "DMを送れません — Premium確認はこちらです。",
    duration1: "1か月",
    durationN: "{n}か月",
    planName: "カスタマイズ",
  }),
);

const PREMIUM_KO = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium 활성화: {plan}__",
    thanks: "**감사합니다!** **{guild}**에서 **Vinili Premium**을 활성화했습니다.",
    intro: "이제 대시보드에서 봇 모습과 프리미엄 메시지를 맞춤 설정할 수 있습니다.",
    fieldPlan: "플랜",
    fieldCredits: "사용한 크레딧",
    creditsValue: "**{spent}** 크레딧\n잔액: **{left}**",
    creditsValueNoBalance: "**{spent}** 크레딧",
    fieldExpires: "만료",
    lifetime: "평생 (만료 없음)",
    expiresUnavailable: "만료일 없음",
    fieldPerks: "해금 내용",
    perkAvatar: "서버용 맞춤 봇 아바타",
    perkBanner: "맞춤 봇 배너",
    perkName: "맞춤 봇 닉네임",
    perkEmbed: "맞춤 파트너십 감사 메시지",
    perkDashboard: "Premium 대시보드에서 관리",
    fieldStart: "시작하기",
    fieldStartBody:
      "아래 버튼으로 서버 대시보드 → 맞춤설정 / 파트너십을 여세요.\nPremium이 활성인 동안 아바타, 배너, 닉네임, 메시지를 언제든 바꿀 수 있습니다.",
    buttonDashboard: "대시보드 열기",
    channelFallback: "DM을 보낼 수 없습니다 — Premium 확인은 여기입니다.",
    duration1: "1개월",
    durationN: "{n}개월",
    planName: "맞춤설정",
  }),
);

const PREMIUM_AR = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 تم تفعيل Premium: {plan}__",
    thanks: "**شكرًا!** لقد فعّلت **Vinili Premium** على **{guild}**.",
    intro: "يمكنك الآن تخصيص هوية البوت ورسائل Premium من لوحة التحكم.",
    fieldPlan: "الخطة",
    fieldCredits: "الرصيد المستخدم",
    creditsValue: "**{spent}** رصيد\nالمتبقي: **{left}**",
    creditsValueNoBalance: "**{spent}** رصيد",
    fieldExpires: "ينتهي",
    lifetime: "مدى الحياة (بدون انتهاء)",
    expiresUnavailable: "تاريخ الانتهاء غير متاح",
    fieldPerks: "ما تفتحه",
    perkAvatar: "صورة بوت مخصصة للسيرفر",
    perkBanner: "بانر بوت مخصص",
    perkName: "اسم مستعار مخصص للبوت",
    perkEmbed: "رسائل شكر شراكة مخصصة",
    perkDashboard: "الإدارة من لوحة Premium",
    fieldStart: "من أين تبدأ",
    fieldStartBody:
      "استخدم الزر أدناه لفتح لوحة السيرفر → التخصيص / الشراكات.\nيمكنك تغيير الصورة والبانر والاسم والرسائل في أي وقت طالما Premium نشط.",
    buttonDashboard: "فتح لوحة التحكم",
    channelFallback: "لا أستطيع مراسلتك في الخاص — تأكيد Premium هنا.",
    duration1: "شهر واحد",
    durationN: "{n} أشهر",
    planName: "تخصيص",
  }),
);

const PREMIUM_NL = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium geactiveerd: {plan}__",
    thanks: "**Bedankt!** Je hebt **Vinili Premium** geactiveerd op **{guild}**.",
    intro: "Je kunt nu de botidentiteit en premiumberichten aanpassen via het dashboard.",
    fieldPlan: "Abonnement",
    fieldCredits: "Gebruikte credits",
    creditsValue: "**{spent}** credits\nSaldo: **{left}**",
    creditsValueNoBalance: "**{spent}** credits",
    fieldExpires: "Verloopt",
    lifetime: "Levenslang (geen vervaldatum)",
    expiresUnavailable: "Vervaldatum niet beschikbaar",
    fieldPerks: "Wat je ontgrendelt",
    perkAvatar: "Aangepaste bot-avatar voor de server",
    perkBanner: "Aangepaste bot-banner",
    perkName: "Aangepaste bot-nickname",
    perkEmbed: "Aangepaste partnership-bedankberichten",
    perkDashboard: "Beheer via het Premium-dashboard",
    fieldStart: "Waar begin je",
    fieldStartBody:
      "Gebruik de knop hieronder om het serverdashboard te openen → personalisatie / partnership.\nJe kunt avatar, banner, nickname en premiumberichten altijd wijzigen zolang Premium actief is.",
    buttonDashboard: "Dashboard openen",
    channelFallback: "Ik kan je geen DM sturen — hier is de Premium-bevestiging.",
    duration1: "1 maand",
    durationN: "{n} maanden",
    planName: "Personalisatie",
  }),
);

const PREMIUM_PL = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium aktywowany: {plan}__",
    thanks: "**Dzięki!** Aktywowałeś **Vinili Premium** na **{guild}**.",
    intro: "Teraz możesz dostosować wygląd bota i wiadomości premium w panelu.",
    fieldPlan: "Plan",
    fieldCredits: "Użyte kredyty",
    creditsValue: "**{spent}** kredytów\nSaldo: **{left}**",
    creditsValueNoBalance: "**{spent}** kredytów",
    fieldExpires: "Wygasa",
    lifetime: "Na zawsze (bez terminu)",
    expiresUnavailable: "Termin niedostępny",
    fieldPerks: "Co odblokowujesz",
    perkAvatar: "Własny awatar bota na serwerze",
    perkBanner: "Własny baner bota",
    perkName: "Własny nick bota",
    perkEmbed: "Własne wiadomości podziękowań za partnerstwa",
    perkDashboard: "Zarządzanie w panelu Premium",
    fieldStart: "Od czego zacząć",
    fieldStartBody:
      "Użyj przycisku poniżej, aby otworzyć panel serwera → personalizacja / partnerstwa.\nMożesz zmieniać awatar, baner, nick i wiadomości premium kiedy chcesz, dopóki Premium jest aktywne.",
    buttonDashboard: "Otwórz panel",
    channelFallback: "Nie mogę napisać na PW — potwierdzenie Premium jest tutaj.",
    duration1: "1 miesiąc",
    durationN: "{n} mies.",
    planName: "Personalizacja",
  }),
);

const PREMIUM_TR = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium etkin: {plan}__",
    thanks: "**Teşekkürler!** **{guild}** sunucusunda **Vinili Premium**’u etkinleştirdin.",
    intro: "Artık panodan bot kimliğini ve premium mesajları özelleştirebilirsin.",
    fieldPlan: "Plan",
    fieldCredits: "Kullanılan kredi",
    creditsValue: "**{spent}** kredi\nBakiye: **{left}**",
    creditsValueNoBalance: "**{spent}** kredi",
    fieldExpires: "Bitiş",
    lifetime: "Ömür boyu (süresiz)",
    expiresUnavailable: "Bitiş tarihi yok",
    fieldPerks: "Neler açılır",
    perkAvatar: "Sunucu için özel bot avatarı",
    perkBanner: "Özel bot banner’ı",
    perkName: "Özel bot takma adı",
    perkEmbed: "Özel partnership teşekkür mesajları",
    perkDashboard: "Premium panelinden yönetim",
    fieldStart: "Nasıl başlanır",
    fieldStartBody:
      "Sunucu panosunu açmak için aşağıdaki düğmeyi kullan → özelleştirme / partnership.\nPremium aktifken avatar, banner, takma ad ve mesajları istediğin zaman değiştirebilirsin.",
    buttonDashboard: "Panoyu aç",
    channelFallback: "DM atamıyorum — Premium onayı burada.",
    duration1: "1 ay",
    durationN: "{n} ay",
    planName: "Özelleştirme",
  }),
);

const PREMIUM_HI = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium सक्रिय: {plan}__",
    thanks: "**धन्यवाद!** आपने **{guild}** पर **Vinili Premium** सक्रिय किया है।",
    intro: "अब आप डैशबोर्ड से बॉट पहचान और प्रीमियम संदेश कस्टमाइज़ कर सकते हैं।",
    fieldPlan: "प्लान",
    fieldCredits: "इस्तेमाल क्रेडिट",
    creditsValue: "**{spent}** क्रेडिट\nशेष: **{left}**",
    creditsValueNoBalance: "**{spent}** क्रेडिट",
    fieldExpires: "समाप्ति",
    lifetime: "आजीवन (कोई समाप्ति नहीं)",
    expiresUnavailable: "समाप्ति उपलब्ध नहीं",
    fieldPerks: "क्या अनलॉक होता है",
    perkAvatar: "सर्वर के लिए कस्टम बॉट अवतार",
    perkBanner: "कस्टम बॉट बैनर",
    perkName: "कस्टम बॉट निकनेम",
    perkEmbed: "कस्टम पार्टनरशिप धन्यवाद संदेश",
    perkDashboard: "Premium डैशबोर्ड से प्रबंधन",
    fieldStart: "कहाँ से शुरू करें",
    fieldStartBody:
      "नीचे बटन से सर्वर डैशबोर्ड खोलें → कस्टमाइज़ेशन / पार्टनरशिप।\nPremium सक्रिय रहते अवतार, बैनर, निकनेम और संदेश कभी भी बदल सकते हैं।",
    buttonDashboard: "डैशबोर्ड खोलें",
    channelFallback: "DM नहीं भेज सकता — Premium पुष्टि यहाँ है।",
    duration1: "1 महीना",
    durationN: "{n} महीने",
    planName: "कस्टमाइज़ेशन",
  }),
);

const PREMIUM_ID = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium diaktifkan: {plan}__",
    thanks: "**Terima kasih!** Kamu mengaktifkan **Vinili Premium** di **{guild}**.",
    intro: "Sekarang kamu bisa menyesuaikan identitas bot dan pesan premium dari dasbor.",
    fieldPlan: "Paket",
    fieldCredits: "Kredit dipakai",
    creditsValue: "**{spent}** kredit\nSaldo: **{left}**",
    creditsValueNoBalance: "**{spent}** kredit",
    fieldExpires: "Berakhir",
    lifetime: "Seumur hidup (tanpa masa habis)",
    expiresUnavailable: "Tanggal berakhir tidak tersedia",
    fieldPerks: "Yang terbuka",
    perkAvatar: "Avatar bot kustom untuk server",
    perkBanner: "Banner bot kustom",
    perkName: "Nickname bot kustom",
    perkEmbed: "Pesan terima kasih partnership kustom",
    perkDashboard: "Kelola lewat dasbor Premium",
    fieldStart: "Mulai dari mana",
    fieldStartBody:
      "Gunakan tombol di bawah untuk membuka dasbor server → kustomisasi / partnership.\nKamu bisa ubah avatar, banner, nickname, dan pesan premium kapan saja selama Premium aktif.",
    buttonDashboard: "Buka dasbor",
    channelFallback: "Tidak bisa DM — konfirmasi Premium ada di sini.",
    duration1: "1 bulan",
    durationN: "{n} bulan",
    planName: "Kustomisasi",
  }),
);

const PREMIUM_UK = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium активовано: {plan}__",
    thanks: "**Дякуємо!** Ти активував **Vinili Premium** на **{guild}**.",
    intro: "Тепер можна налаштувати вигляд бота та преміум-повідомлення в панелі.",
    fieldPlan: "План",
    fieldCredits: "Витрачені кредити",
    creditsValue: "**{spent}** кредитів\nБаланс: **{left}**",
    creditsValueNoBalance: "**{spent}** кредитів",
    fieldExpires: "Закінчується",
    lifetime: "Назавжди (без терміну)",
    expiresUnavailable: "Термін недоступний",
    fieldPerks: "Що відкривається",
    perkAvatar: "Власний аватар бота на сервері",
    perkBanner: "Власний банер бота",
    perkName: "Власний нікнейм бота",
    perkEmbed: "Власні повідомлення подяки за партнерства",
    perkDashboard: "Керування в Premium-панелі",
    fieldStart: "З чого почати",
    fieldStartBody:
      "Натисни кнопку нижче, щоб відкрити панель сервера → персоналізація / партнерства.\nМожна змінювати аватар, банер, нік і повідомлення будь-коли, поки Premium активний.",
    buttonDashboard: "Відкрити панель",
    channelFallback: "Не можу написати в ПП — підтвердження Premium тут.",
    duration1: "1 місяць",
    durationN: "{n} міс.",
    planName: "Персоналізація",
  }),
);

const PREMIUM_VI = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Đã kích hoạt Premium: {plan}__",
    thanks: "**Cảm ơn!** Bạn đã kích hoạt **Vinili Premium** trên **{guild}**.",
    intro: "Giờ bạn có thể tùy chỉnh hình ảnh bot và tin nhắn premium từ bảng điều khiển.",
    fieldPlan: "Gói",
    fieldCredits: "Tín dụng đã dùng",
    creditsValue: "**{spent}** tín dụng\nSố dư: **{left}**",
    creditsValueNoBalance: "**{spent}** tín dụng",
    fieldExpires: "Hết hạn",
    lifetime: "Vĩnh viễn (không hết hạn)",
    expiresUnavailable: "Không có ngày hết hạn",
    fieldPerks: "Nội dung mở khóa",
    perkAvatar: "Avatar bot tùy chỉnh cho máy chủ",
    perkBanner: "Banner bot tùy chỉnh",
    perkName: "Biệt danh bot tùy chỉnh",
    perkEmbed: "Tin nhắn cảm ơn partnership tùy chỉnh",
    perkDashboard: "Quản lý từ bảng Premium",
    fieldStart: "Bắt đầu từ đâu",
    fieldStartBody:
      "Dùng nút bên dưới để mở bảng máy chủ → tùy chỉnh / partnership.\nBạn có thể đổi avatar, banner, biệt danh và tin nhắn bất cứ lúc nào khi Premium còn hiệu lực.",
    buttonDashboard: "Mở bảng điều khiển",
    channelFallback: "Không gửi được DM — xác nhận Premium ở đây.",
    duration1: "1 tháng",
    durationN: "{n} tháng",
    planName: "Tùy chỉnh",
  }),
);

const PREMIUM_RO = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium activat: {plan}__",
    thanks: "**Mulțumim!** Ai activat **Vinili Premium** pe **{guild}**.",
    intro: "Acum poți personaliza identitatea botului și mesajele premium din panou.",
    fieldPlan: "Plan",
    fieldCredits: "Credite folosite",
    creditsValue: "**{spent}** credite\nSold: **{left}**",
    creditsValueNoBalance: "**{spent}** credite",
    fieldExpires: "Expiră",
    lifetime: "Pe viață (fără expirare)",
    expiresUnavailable: "Expirare indisponibilă",
    fieldPerks: "Ce deblochezi",
    perkAvatar: "Avatar bot personalizat pe server",
    perkBanner: "Banner bot personalizat",
    perkName: "Nickname bot personalizat",
    perkEmbed: "Mesaje de mulțumire partnership personalizate",
    perkDashboard: "Gestionare din panoul Premium",
    fieldStart: "De unde începi",
    fieldStartBody:
      "Folosește butonul de mai jos pentru a deschide panoul serverului → personalizare / partnership.\nPoți schimba avatar, banner, nickname și mesaje oricând cât timp Premium e activ.",
    buttonDashboard: "Deschide panoul",
    channelFallback: "Nu pot scrie în DM — confirmarea Premium e aici.",
    duration1: "1 lună",
    durationN: "{n} luni",
    planName: "Personalizare",
  }),
);

const PREMIUM_SV = Object.freeze(
  merge(PREMIUM_EN, {
    title: "__💎 Premium aktiverat: {plan}__",
    thanks: "**Tack!** Du har aktiverat **Vinili Premium** på **{guild}**.",
    intro: "Nu kan du anpassa botens utseende och premiummeddelanden från instrumentpanelen.",
    fieldPlan: "Plan",
    fieldCredits: "Använda krediter",
    creditsValue: "**{spent}** krediter\nSaldo: **{left}**",
    creditsValueNoBalance: "**{spent}** krediter",
    fieldExpires: "Går ut",
    lifetime: "Livstid (ingen utgång)",
    expiresUnavailable: "Utgångsdatum saknas",
    fieldPerks: "Vad du låser upp",
    perkAvatar: "Anpassad bot-avatar för servern",
    perkBanner: "Anpassad bot-banner",
    perkName: "Anpassat bot-smeknamn",
    perkEmbed: "Anpassade partnership-tackmeddelanden",
    perkDashboard: "Hantera via Premium-panelen",
    fieldStart: "Var du börjar",
    fieldStartBody:
      "Använd knappen nedan för att öppna serverpanelen → anpassning / partnership.\nDu kan byta avatar, banner, smeknamn och meddelanden när som helst medan Premium är aktivt.",
    buttonDashboard: "Öppna panel",
    channelFallback: "Kan inte DM:a dig — Premium-bekräftelsen finns här.",
    duration1: "1 månad",
    durationN: "{n} månader",
    planName: "Anpassning",
  }),
);

const PREMIUM_PACKS = Object.freeze({
  en: PREMIUM_EN,
  it: PREMIUM_IT,
  es: PREMIUM_ES,
  fr: PREMIUM_FR,
  de: PREMIUM_DE,
  pt: PREMIUM_PT,
  ru: PREMIUM_RU,
  zh: PREMIUM_ZH,
  ja: PREMIUM_JA,
  ko: PREMIUM_KO,
  ar: PREMIUM_AR,
  nl: PREMIUM_NL,
  pl: PREMIUM_PL,
  tr: PREMIUM_TR,
  hi: PREMIUM_HI,
  id: PREMIUM_ID,
  uk: PREMIUM_UK,
  vi: PREMIUM_VI,
  ro: PREMIUM_RO,
  sv: PREMIUM_SV,
});

function interpolate(text?, vars: Record<string, any> = {}) {
  let out = String(text ?? "");
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

function tPremium(lang?, key?, vars: Record<string, any> = {}) {
  const code = normalizeTenantLanguage(lang);
  const text =
    PREMIUM_PACKS[code]?.[key] ??
    PREMIUM_PACKS.en?.[key] ??
    PREMIUM_PACKS[DEFAULT_LANGUAGE]?.[key] ??
    key;
  return interpolate(text, vars);
}

function formatPremiumDuration(lang?, months?) {
  const n = Math.max(1, Math.floor(Number(months) || 1));
  if (n === 1) return tPremium(lang, "duration1");
  return tPremium(lang, "durationN", { n });
}

function listPremiumPerkLines(lang?) {
  return [
    tPremium(lang, "perkAvatar"),
    tPremium(lang, "perkBanner"),
    tPremium(lang, "perkName"),
    tPremium(lang, "perkEmbed"),
    tPremium(lang, "perkDashboard"),
  ];
}

async function resolvePremiumNotifyLanguage(client?, guild?, userId?) {
  const uid = String(userId || "").trim();
  const gid = String(guild?.id || "").trim();
  let discordLocale = null;
  try {
    const cached = client?.users?.cache?.get?.(uid);
    if (cached?.locale) discordLocale = cached.locale;
  } catch (_) {}
  return resolveTenantLanguage(gid, uid, {
    client,
    discordLocale,
    guildPreferredLocale: guild?.preferredLocale || null,
  });
}

export = {
  TENANT_LANGUAGES,
  tPremium,
  formatPremiumDuration,
  listPremiumPerkLines,
  resolvePremiumNotifyLanguage,
  normalizeTenantLanguage,
};
