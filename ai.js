// ИИ для тоғыз құмалақ: три уровня сложности.
//  easy   — случайный легальный ход (с лёгким предпочтением захватов);
//  medium — минимакс на 2 полухода (свой ход + лучший ответ соперника);
//  hard   — альфа-бета на 6 полуходов с сортировкой ходов.
import { legalMoves, applyMove, cloneState, WIN_COUNT } from './engine.js';

// Оценка позиции с точки зрения игрока p
export function evaluate(s, p) {
  const o = 1 - p;
  if (s.over) {
    if (s.winner === p) return 100000;
    if (s.winner === o) return -100000;
    return 0;
  }
  let v = (s.kazan[p] - s.kazan[o]) * 16;
  // тұздық — постоянный источник дохода, тем ценнее, чем больше кумалаков в игре
  const inPlay = 162 - s.kazan[0] - s.kazan[1];
  if (s.tuzdyk[p] !== -1) v += 12 + inPlay * 0.18;
  if (s.tuzdyk[o] !== -1) v -= 12 + inPlay * 0.18;
  // материал в своём ряду — «боезапас» для будущих ходов
  let mine = 0, theirs = 0;
  for (let i = 0; i < 9; i++) mine += s.pits[i + p * 9];
  for (let i = 0; i < 9; i++) theirs += s.pits[i + o * 9];
  v += (mine - theirs) * 0.4;
  return v;
}

function negamax(s, depth, alpha, beta) {
  if (s.over || depth === 0) return evaluate(s, s.turn);
  const moves = orderedMoves(s);
  let best = -Infinity;
  for (const m of moves) {
    const { state } = applyMove(s, m);
    // ход передаётся сопернику → знак меняется
    const v = -negamax(state, depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Сортировка ходов: сначала те, что сразу дают прирост казана (захват/тұздық)
function orderedMoves(s) {
  const moves = legalMoves(s);
  const scored = moves.map(m => {
    const { state } = applyMove(s, m);
    return { m, gain: state.kazan[s.turn] - s.kazan[s.turn] };
  });
  scored.sort((a, b) => b.gain - a.gain);
  return scored.map(x => x.m);
}

export function chooseMove(s, level) {
  const moves = legalMoves(s);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  if (level === 'easy') {
    // случайно, но в 40% случаев берёт очевидный захват, если он есть
    if (Math.random() < 0.4) {
      let best = null, bestGain = 0;
      for (const m of moves) {
        const { state } = applyMove(s, m);
        const gain = state.kazan[s.turn] - s.kazan[s.turn];
        if (gain > bestGain) { bestGain = gain; best = m; }
      }
      if (best !== null) return best;
    }
    return moves[(Math.random() * moves.length) | 0];
  }

  const depth = level === 'medium' ? 2 : 6;
  let bestMove = moves[0], bestVal = -Infinity;
  for (const m of orderedMoves(s)) {
    const { state } = applyMove(s, m);
    const v = -negamax(state, depth - 1, -Infinity, Infinity);
    if (v > bestVal) { bestVal = v; bestMove = m; }
  }
  return bestMove;
}
