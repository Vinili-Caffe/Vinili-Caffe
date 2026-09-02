const { randomInt } = require("node:crypto");
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["spades", "hearts", "diamonds", "clubs"];
const SUIT_SYMBOL = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
const SUIT_COLOR = { spades: "#0f172a", hearts: "#b91c1c", diamonds: "#b91c1c", clubs: "#0f172a" };
const DEFAULT_SHOE_DECKS = 6;

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, code: `${rank}${suit[0].toUpperCase()}` });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function freshShoe(deckCount = DEFAULT_SHOE_DECKS) {
  const n = Math.max(1, Math.min(8, Math.floor(Number(deckCount) || DEFAULT_SHOE_DECKS)));
  const decks = [];
  for (let i = 0; i < n; i += 1) decks.push(...buildDeck());
  return shuffleDeck(decks);
}

function drawCard(shoe) {
  if (!shoe?.length) return { card: null, shoe: freshShoe() };
  return { card: shoe[0], shoe: shoe.slice(1) };
}

function rankValue(rank) {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return Math.max(2, Math.min(10, Number(rank) || 0));
}

function handValue(hand) {
  const cards = Array.isArray(hand) ? hand : [];
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const r = String(card?.rank || "");
    if (r === "A") aces += 1;
    total += rankValue(r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 && total <= 21 };
}

function isNaturalBlackjack(hand) {
  const cards = Array.isArray(hand) ? hand : [];
  return cards.length === 2 && handValue(cards).total === 21;
}

function dealerShouldHit(hand) {
  const value = handValue(hand);
  if (value.total < 17) return true;
  return Boolean(value.soft && value.total === 17);
}

function cardLabel(card) {
  if (!card) return "?";
  const sym = SUIT_SYMBOL[card.suit] || "";
  return `${card.rank}${sym}`;
}

function handLabel(hand, hideSecond = false) {
  const cards = Array.isArray(hand) ? hand : [];
  if (!cards.length) return "—";
  if (hideSecond && cards.length >= 2) {
    return `${cardLabel(cards[0])} 🂠`;
  }
  return cards.map((c) => cardLabel(c)).join(" ");
}

function compareOutcome(playerHand, dealerHand) {
  const p = handValue(playerHand);
  const d = handValue(dealerHand);
  const pBj = isNaturalBlackjack(playerHand);
  const dBj = isNaturalBlackjack(dealerHand);
  if (pBj && dBj) return { outcome: "push", playerBj: true, dealerBj: true };
  if (pBj) return { outcome: "blackjack", playerBj: true, dealerBj: false };
  if (dBj) return { outcome: "lose", playerBj: false, dealerBj: true };
  if (p.total > 21) return { outcome: "lose", bust: true };
  if (d.total > 21) return { outcome: "win", dealerBust: true };
  if (p.total > d.total) return { outcome: "win" };
  if (p.total < d.total) return { outcome: "lose" };
  return { outcome: "push" };
}

function payoutMultiplier(outcome, cfg) {
  const winPayout = Math.max(1, Number(cfg?.blackjack?.winPayout) || 2);
    const bjPayout = Math.max(winPayout, Number(cfg?.blackjack?.blackjackPayout) || 2.2);
  if (outcome === "blackjack") return bjPayout;
  if (outcome === "win") return winPayout;
  if (outcome === "push") return 1;
  return 0;
}

module.exports = {
  DEFAULT_SHOE_DECKS,
  SUIT_COLOR,
  SUIT_SYMBOL,
  cardLabel,
  compareOutcome,
  dealerShouldHit,
  drawCard,
  freshShoe,
  handLabel,
  handValue,
  isNaturalBlackjack,
  payoutMultiplier,
};
