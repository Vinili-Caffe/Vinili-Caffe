// Sconto sui pacchetti di Donazioni e Sponsor. Per toglierlo: percent = 0.
// ends: solo testo ("fino al …"), lo sconto non si spegne da solo: così server e browser mostrano sempre lo stesso prezzo.

export const PROMO = {
  percent: 20,
  title: "Sconto del 20%",
  text: "Su tutti i pacchetti di donazioni e sponsor.",
  ends: null as string | null,
};

export const promoOn = () => PROMO.percent > 0;

/** Prezzo scontato, arrotondato al centesimo. */
export const promoPrice = (n: number) => (promoOn() ? Math.round(n * (100 - PROMO.percent)) / 100 : n);

export const promoEndsLabel = () =>
  PROMO.ends ? new Date(PROMO.ends).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long" }) : null;
