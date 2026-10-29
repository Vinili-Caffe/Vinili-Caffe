const PLACEHOLDER_UI_LOCALES = {
  en: {
    ph_default: "Default",
    ph_url: "https://...",
    ph_embedTitle: "**PARTNERSHIP DONE**",
    ph_embedDescription: "{user} made a **partnership** with {partner}!",
    ph_timestamp: "true",
    ph_pingDelay: "5m",
    ph_null: "null",
  },
  it: {
    ph_default: "Predefinito",
    ph_url: "https://...",
    ph_embedTitle: "**PARTNER EFFETTUATA**",
    ph_embedDescription: "{user} ha fatto una **partnership** con {partner}!",
    ph_timestamp: "true",
    ph_pingDelay: "5m",
    ph_null: "null",
  },
  es: {
    ph_default: "Predeterminado",
    ph_embedTitle: "**PARTNERSHIP HECHA**",
    ph_embedDescription: "¡{user} hizo una **partnership** con {partner}!",
  },
  fr: {
    ph_default: "Par défaut",
    ph_embedTitle: "**PARTNERSHIP FAITE**",
    ph_embedDescription: "{user} a fait une **partnership** avec {partner} !",
  },
  de: {
    ph_default: "Standard",
    ph_embedTitle: "**PARTNERSHIP ERLEDIGT**",
    ph_embedDescription: "{user} hat eine **Partnership** mit {partner} gemacht!",
  },
  pt: {
    ph_default: "Padrão",
    ph_embedTitle: "**PARTNERSHIP FEITA**",
    ph_embedDescription: "{user} fez uma **partnership** com {partner}!",
  },
  ru: {
    ph_default: "По умолчанию",
    ph_embedTitle: "**PARTNERSHIP ВЫПОЛНЕНА**",
    ph_embedDescription: "{user} заключил **partnership** с {partner}!",
  },
  zh: {
    ph_default: "默认",
    ph_embedTitle: "**PARTNERSHIP 完成**",
    ph_embedDescription: "{user} 与 {partner} 完成了 **partnership**！",
  },
  ja: {
    ph_default: "デフォルト",
    ph_embedTitle: "**PARTNERSHIP 完了**",
    ph_embedDescription: "{user} が {partner} と **partnership** をしました！",
  },
  ko: {
    ph_default: "기본값",
    ph_embedTitle: "**PARTNERSHIP 완료**",
    ph_embedDescription: "{user}님이 {partner}와 **partnership**을 했습니다!",
  },
  ar: {
    ph_default: "افتراضي",
    ph_embedTitle: "**تمت PARTNERSHIP**",
    ph_embedDescription: "{user} أجرى **partnership** مع {partner}!",
  },
  nl: {
    ph_default: "Standaard",
    ph_embedTitle: "**PARTNERSHIP VOLTOOID**",
    ph_embedDescription: "{user} heeft een **partnership** met {partner} gemaakt!",
  },
  pl: {
    ph_default: "Domyślny",
    ph_embedTitle: "**PARTNERSHIP ZROBIONA**",
    ph_embedDescription: "{user} zrobił **partnership** z {partner}!",
  },
  tr: {
    ph_default: "Varsayılan",
    ph_embedTitle: "**PARTNERSHIP TAMAM**",
    ph_embedDescription: "{user}, {partner} ile **partnership** yaptı!",
  },
  hi: {
    ph_default: "डिफ़ॉल्ट",
    ph_embedTitle: "**PARTNERSHIP पूर्ण**",
    ph_embedDescription: "{user} ने {partner} के साथ **partnership** की!",
  },
  id: {
    ph_default: "Default",
    ph_embedTitle: "**PARTNERSHIP SELESAI**",
    ph_embedDescription: "{user} melakukan **partnership** dengan {partner}!",
  },
  uk: {
    ph_default: "За замовчуванням",
    ph_embedTitle: "**PARTNERSHIP ВИКОНАНО**",
    ph_embedDescription: "{user} уклав **partnership** з {partner}!",
  },
  vi: {
    ph_default: "Mặc định",
    ph_embedTitle: "**PARTNERSHIP HOÀN TẤT**",
    ph_embedDescription: "{user} đã **partnership** với {partner}!",
  },
  ro: {
    ph_default: "Implicit",
    ph_embedTitle: "**PARTNERSHIP FINALIZATĂ**",
    ph_embedDescription: "{user} a făcut **partnership** cu {partner}!",
  },
  sv: {
    ph_default: "Standard",
    ph_embedTitle: "**PARTNERSHIP KLAR**",
    ph_embedDescription: "{user} gjorde en **partnership** med {partner}!",
  },
};

function applyButtonUiPacks(uiPacks?) {
  const en = PLACEHOLDER_UI_LOCALES.en;
  for (const [code, patch] of Object.entries(PLACEHOLDER_UI_LOCALES)) {
    if (!uiPacks[code]) continue;
    uiPacks[code] = { ...uiPacks[code], ...en, ...patch };
  }
}

export = { PLACEHOLDER_UI_LOCALES, applyButtonUiPacks };
