// Sponsor (da WebSite/sponsor/index.html)

export const SPONSOR_PAYPAL = "https://www.paypal.com/paypalme/viniliecaffeit";

export const REQUIREMENTS = ["Rispettare le [[regole|/regole/]]", "Non avere il server in blacklist"];

export const CHANNEL = {
  title: "Canale testuale privato",
  badge: "Il più scelto",
  text: "Un canale tutto tuo nel server per pubblicizzare il tuo progetto.",
  durations: [
    { days: 7, ping1: 5, ping2: 8 },
    { days: 14, ping1: 9, ping2: 12 },
    { days: 30, ping1: 17, ping2: 19 },
  ],
};

export const WEBSITE = {
  title: "Sito web",
  badge: "Novità",
  text: "Il tuo progetto in vetrina sul sito, con un annuncio nel server.",
  durations: [
    { days: 7, price: 7 },
    { days: 14, price: 12 },
    { days: 30, price: 18 },
  ],
};

export const EVENTS = {
  title: "Eventi",
  badge: "Novità",
  text: "Un messaggio promozionale studiato su misura, letto durante le nostre attività con la community.",
  price: 2.5,
};

export const EXTRA_PING = 5;

export const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });
