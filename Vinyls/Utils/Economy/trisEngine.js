const { randomInt } = require("node:crypto");
const EMPTY = "";
const PLAYER = "X";
const BOT = "O";
const WIN_LINES = [ [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6] ];

function emptyBoard() {
  return Array(9).fill(EMPTY);
}

function cloneBoard(board) {
  return Array.isArray(board) ? board.map((c) => c || EMPTY) : emptyBoard();
}

function boardWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every((cell) => cell)) return "draw";
  return null;
}

function availableMoves(board) {
  const out = [];
  for (let i = 0; i < 9; i += 1) {
    if (!board[i]) out.push(i);
  }
  return out;
}

function scoreTerminal(board, botMark) {
  const w = boardWinner(board);
  if (w === botMark) return 10;
  if (w === PLAYER) return -10;
  if (w === "draw") return 0;
  return null;
}

function minimax(board, maximizing, botMark, playerMark) {
  const terminal = scoreTerminal(board, botMark);
  if (terminal !== null) return terminal;
  const moves = availableMoves(board);
  if (!moves.length) return 0;
  if (maximizing) {
    let best = -Infinity;
    for (const idx of moves) {
      board[idx] = botMark;
      best = Math.max(best, minimax(board, false, botMark, playerMark));
      board[idx] = EMPTY;
    }
    return best;
  }
  let best = Infinity;
  for (const idx of moves) {
    board[idx] = playerMark;
    best = Math.min(best, minimax(board, true, botMark, playerMark));
    board[idx] = EMPTY;
  }
  return best;
}

function pickBestMove(board, botMark, playerMark) {
  const moves = availableMoves(board);
  if (!moves.length) return -1;
  let bestScore = -Infinity;
  let bestMoves = [];
  for (const idx of moves) {
    board[idx] = botMark;
    const score = minimax(board, false, botMark, playerMark);
    board[idx] = EMPTY;
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [idx];
    } else if (score === bestScore) {
      bestMoves.push(idx);
    }
  }
  return bestMoves[randomInt(0, bestMoves.length)];
}

function pickBotMove(board, randomPct = 0.35) {
  const moves = availableMoves(board);
  if (!moves.length) return -1;
  const pct = Math.max(0, Math.min(1, Number(randomPct) || 0));
  if (pct > 0 && randomInt(1, 101) <= Math.floor(pct * 100)) {
    return moves[randomInt(0, moves.length)];
  }
  return pickBestMove(board, BOT, PLAYER);
}

function applyPlayerMove(board, index) {
  return applyMarkMove(board, index, PLAYER);
}

function applyMarkMove(board, index, mark) {
  const m = mark === BOT ? BOT : PLAYER;
  const idx = Math.floor(Number(index));
  if (!Number.isFinite(idx) || idx < 0 || idx > 8) return { ok: false, message: "Casella non valida." };
  if (board[idx]) return { ok: false, message: "Casella già occupata." };
  const next = cloneBoard(board);
  next[idx] = m;
  return { ok: true, board: next, index: idx, mark: m };
}

function markForChallenger() {
  return PLAYER;
}

function markForOpponent() {
  return BOT;
}

function cellLabel(cell) {
  if (cell === PLAYER) return "X";
  if (cell === BOT) return "O";
  return "·";
}

function outcomeLabel(outcome) {
  if (outcome === "win") return "Vittoria";
  if (outcome === "draw") return "Pareggio";
  if (outcome === "loss") return "Sconfitta";
  return "";
}

module.exports = { BOT, EMPTY, PLAYER, applyMarkMove, applyPlayerMove, availableMoves, boardWinner, cellLabel, cloneBoard, emptyBoard, markForChallenger, markForOpponent, outcomeLabel, pickBotMove };