// Тоғыз құмалақ — движок правил.
// Чистые функции без DOM: state → state. Правила официальные, соблюдаются жёстко:
//  * ход только из своей непустой лунки (отау);
//  * если кумалаков >1 — один остаётся в исходной лунке, остальные раскладываются
//    против часовой стрелки; если ровно 1 — он переходит в следующую лунку;
//  * казан не участвует в раскладке;
//  * кумалак, попавший в тұздық, немедленно уходит в казан владельца тұздық;
//  * захват (жұп): последний кумалак сделал лунку СОПЕРНИКА чётной — всё в казан;
//  * тұздық: последний кумалак сделал лунку соперника ровно 3 → лунка становится
//    тұздық, три кумалака уходят в казан. Ограничения: один тұздық за партию,
//    нельзя в 9-й лунке соперника, нельзя в лунке, симметричной тұздық соперника;
//  * атсырау: если у игрока на его ходу нет кумалаков — соперник забирает все
//    оставшиеся на доске кумалаки в свой казан, партия окончена;
//  * победа — 82+ кумалака в казане; 81:81 — ничья.
//
// Индексация: лунки 0–8 — игрок 0 (белые, ходят первыми), 9–17 — игрок 1.
// Раскладка идёт по кольцу 0→1→…→17→0 (против часовой стрелки).

export const TOTAL = 162;
export const WIN_COUNT = 82;

export function initialState() {
  return {
    pits: Array(18).fill(9),
    kazan: [0, 0],
    tuzdyk: [-1, -1],   // индекс лунки-тұздық каждого игрока (в ряду соперника) или -1
    turn: 0,
    over: false,
    winner: null,        // 0 | 1 | 'draw' | null
    moveNo: 1,
  };
}

export function cloneState(s) {
  return {
    pits: s.pits.slice(),
    kazan: s.kazan.slice(),
    tuzdyk: s.tuzdyk.slice(),
    turn: s.turn,
    over: s.over,
    winner: s.winner,
    moveNo: s.moveNo,
  };
}

export const rowStart = (p) => p * 9;
export const ordinal = (pit) => pit % 9;          // номер лунки в своём ряду, 0–8
export const ownerOf = (pit) => (pit < 9 ? 0 : 1);
export const ninthPitOf = (p) => rowStart(p) + 8; // девятая лунка игрока p

export function legalMoves(s) {
  if (s.over) return [];
  const start = rowStart(s.turn);
  const moves = [];
  for (let i = start; i < start + 9; i++) if (s.pits[i] > 0) moves.push(i);
  return moves;
}

// Почему ход из этой лунки невозможен (для подсказок в UI)
export function illegalReason(s, pit) {
  if (s.over) return 'Партия окончена.';
  if (ownerOf(pit) !== s.turn) return 'Это лунка соперника — ходить можно только из своих.';
  if (pit === s.tuzdyk[1 - s.turn]) return 'Это тұздық соперника: кумалаки сюда не задерживаются, лунка всегда пуста.';
  if (s.pits[pit] === 0) return 'Лунка пуста — ходить из неё нельзя.';
  return null;
}

// Применить ход. Возвращает { state, steps } — steps описывают каждый шаг
// (для анимации и журнала). Бросает Error на нелегальный ход.
export function applyMove(s, src) {
  const reason = illegalReason(s, src);
  if (reason) throw new Error(reason);

  const st = cloneState(s);
  const me = st.turn, opp = 1 - me;
  const steps = [];
  const n = st.pits[src];

  let sowCount;
  if (n === 1) {
    st.pits[src] = 0;
    sowCount = 1;
  } else {
    st.pits[src] = 1; // один кумалак остаётся в исходной лунке
    sowCount = n - 1;
  }
  steps.push({ type: 'pick', pit: src, taken: n, left: st.pits[src] });

  let pos = src;
  let lastTarget = -1; // лунка последнего кумалака; -2 если он ушёл в тұздық
  for (let k = 0; k < sowCount; k++) {
    pos = (pos + 1) % 18;
    const isLast = k === sowCount - 1;
    // кумалак, попавший в тұздық, немедленно уходит в казан владельца
    const tuzOwner = pos === st.tuzdyk[0] ? 0 : pos === st.tuzdyk[1] ? 1 : -1;
    if (tuzOwner !== -1) {
      st.kazan[tuzOwner]++;
      steps.push({ type: 'tuzdyk-absorb', pit: pos, owner: tuzOwner });
      if (isLast) lastTarget = -2;
      continue;
    }
    st.pits[pos]++;
    steps.push({ type: 'sow', pit: pos, nowHas: st.pits[pos] });
    if (isLast) lastTarget = pos;
  }

  // Захваты возможны только в ряду соперника
  if (lastTarget >= 0 && ownerOf(lastTarget) === opp) {
    const cnt = st.pits[lastTarget];
    if (cnt % 2 === 0) {
      st.kazan[me] += cnt;
      st.pits[lastTarget] = 0;
      steps.push({ type: 'capture', pit: lastTarget, count: cnt, by: me });
    } else if (cnt === 3 && st.tuzdyk[me] === -1) {
      const blockedNinth = lastTarget === ninthPitOf(opp);
      const blockedSym = st.tuzdyk[opp] !== -1 && ordinal(st.tuzdyk[opp]) === ordinal(lastTarget);
      if (!blockedNinth && !blockedSym) {
        st.tuzdyk[me] = lastTarget;
        st.kazan[me] += 3;
        st.pits[lastTarget] = 0;
        steps.push({ type: 'tuzdyk-made', pit: lastTarget, by: me });
      } else {
        steps.push({
          type: 'tuzdyk-denied', pit: lastTarget, by: me,
          why: blockedNinth ? 'ninth' : 'symmetric',
        });
      }
    }
  }

  st.turn = opp;
  st.moveNo++;
  finalize(st, steps, me);
  return { state: st, steps };
}

// Проверка конца партии; me — игрок, только что сделавший ход
function finalize(st, steps, me) {
  if (st.kazan[0] >= WIN_COUNT) { st.over = true; st.winner = 0; steps.push({ type: 'win', winner: 0 }); return; }
  if (st.kazan[1] >= WIN_COUNT) { st.over = true; st.winner = 1; steps.push({ type: 'win', winner: 1 }); return; }
  if (st.kazan[0] === 81 && st.kazan[1] === 81) { st.over = true; st.winner = 'draw'; steps.push({ type: 'draw' }); return; }

  // атсырау: игроку, чей сейчас ход, нечем ходить
  if (legalMoves(st).length === 0) {
    let rest = 0;
    for (let i = 0; i < 18; i++) { rest += st.pits[i]; st.pits[i] = 0; }
    st.kazan[me] += rest;
    steps.push({ type: 'sweep', count: rest, by: me });
    st.over = true;
    if (st.kazan[0] > st.kazan[1]) st.winner = 0;
    else if (st.kazan[1] > st.kazan[0]) st.winner = 1;
    else st.winner = 'draw';
    steps.push(st.winner === 'draw' ? { type: 'draw' } : { type: 'win', winner: st.winner });
  }
}

// Инвариант: кумалаков всегда ровно 162 (для самопроверки движка)
export function checksum(s) {
  return s.pits.reduce((a, b) => a + b, 0) + s.kazan[0] + s.kazan[1];
}
