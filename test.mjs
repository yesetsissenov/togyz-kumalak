// Тесты движка тоғыз құмалақ: каждое правило проверяется отдельно.
import {
  initialState, cloneState, legalMoves, applyMove, illegalReason,
  checksum, TOTAL, WIN_COUNT,
} from './engine.js';
import { chooseMove } from './ai.js';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function mk(over = {}) {
  return { ...initialState(), ...over };
}

// --- 1. Начальная позиция
{
  const s = initialState();
  ok(checksum(s) === TOTAL, 'старт: 162 кумалака');
  ok(legalMoves(s).length === 9, 'старт: 9 легальных ходов');
  ok(s.turn === 0, 'старт: ходят белые');
}

// --- 2. Базовая раскладка: из лунки с 9 остаётся 1, раскладываются 8
{
  const { state } = applyMove(initialState(), 0);
  ok(state.pits[0] === 1, 'раскладка: в исходной лунке остался 1');
  for (let i = 1; i <= 8; i++) ok(state.pits[i] === 10, `раскладка: лунка ${i} = 10`);
  ok(state.pits[9] === 9, 'раскладка: до ряда соперника не дошло');
  ok(checksum(state) === TOTAL, 'раскладка: сумма 162');
  ok(state.turn === 1, 'раскладка: ход перешёл сопернику');
}

// --- 3. Одиночный кумалак переходит в следующую лунку
{
  const s = mk({ pits: (() => { const p = Array(18).fill(9); p[3] = 1; return p; })() });
  const { state } = applyMove(s, 3);
  ok(state.pits[3] === 0, 'один кумалак: исходная пуста');
  ok(state.pits[4] === 10, 'один кумалак: попал в следующую');
}

// --- 4. Захват по чётному (жұп) в лунке соперника
{
  // из лунки 8 (2 кумалака): один остаётся, один падает в лунку 9 (у соперника 9 → 10, чётно) → захват
  const p = Array(18).fill(9); p[8] = 2;
  const s = mk({ pits: p });
  const sum0 = checksum(s);
  const { state, steps } = applyMove(s, 8);
  ok(state.kazan[0] === 10, 'жұп: 10 кумалаков в казане');
  ok(state.pits[9] === 0, 'жұп: лунка соперника опустела');
  ok(steps.some(x => x.type === 'capture' && x.count === 10), 'жұп: событие capture');
  ok(checksum(state) === sum0, 'жұп: сумма сохранена');
}

// --- 5. Чётная лунка в СВОЁМ ряду не захватывается
{
  const p = Array(18).fill(9); p[0] = 2; p[1] = 9;
  const s = mk({ pits: p });
  const { state } = applyMove(s, 0); // последний в лунку 1 → 10, но это свой ряд
  ok(state.kazan[0] === 0, 'свой ряд: захвата нет');
  ok(state.pits[1] === 10, 'свой ряд: кумалаки остались');
}

// --- 6. Тұздық: лунка соперника стала ровно 3
{
  const p = Array(18).fill(9); p[8] = 2; p[9] = 2;
  const s = mk({ pits: p });
  const { state, steps } = applyMove(s, 8); // лунка 9: 2+1=3 → тұздық
  ok(state.tuzdyk[0] === 9, 'тұздық: создан в лунке 9');
  ok(state.kazan[0] === 3, 'тұздық: 3 кумалака в казан');
  ok(state.pits[9] === 0, 'тұздық: лунка пуста');
  ok(steps.some(x => x.type === 'tuzdyk-made'), 'тұздық: событие');
}

// --- 7. Тұздық НЕЛЬЗЯ в 9-й лунке соперника
{
  const p = Array(18).fill(0); p[16] = 2; p[17] = 2; p[0] = 5;
  const s = mk({ pits: p, turn: 1 });
  const { state, steps } = applyMove(s, 16); // последний в 17? нет: из 16 (2шт) один остаётся, один в 17 → 3
  ok(state.tuzdyk[1] === -1, '9-я лунка: тұздық не создан');
  // стоп: лунка 17 — это ряд игрока 1, свой ряд. Переделаем: игрок 0 ходит в лунку 17 соперника
  const p2 = Array(18).fill(0); p2[7] = 11; p2[17] = 2; p2[9] = 5;
  const s2 = mk({ pits: p2 });
  const { state: st2, steps: sp2 } = applyMove(s2, 7); // 10 кумалаков лягут в 8..17, последний в 17 → 3
  ok(st2.tuzdyk[0] === -1, '9-я лунка соперника: тұздық запрещён');
  ok(sp2.some(x => x.type === 'tuzdyk-denied' && x.why === 'ninth'), '9-я лунка: событие denied');
  ok(st2.pits[17] === 3, '9-я лунка: кумалаки остаются в лунке');
}

// --- 8. Второй тұздық за партию запрещён
{
  const p = Array(18).fill(9); p[8] = 2; p[9] = 2;
  const s = mk({ pits: p, tuzdyk: [12, -1] }); // у игрока 0 уже есть тұздық в лунке 12
  const { state } = applyMove(s, 8); // лунка 9 стала бы 3
  ok(state.tuzdyk[0] === 12, 'второй тұздық: не создан');
  ok(state.pits[9] === 3, 'второй тұздық: кумалаки остались в лунке');
}

// --- 9. Симметричный тұздық запрещён
{
  // тұздық соперника в лунке 2 (ordinal 2 в ряду игрока 0);
  // игрок 0 пытается сделать тұздық в лунке 11 (ordinal 2 в ряду игрока 1)
  const p = Array(18).fill(9); p[10] = 0; p[8] = 4; p[11] = 2;
  p[2] = 0; // лунка тұздық соперника всегда пуста
  const s = mk({ pits: p, tuzdyk: [-1, 2] });
  // из лунки 8 (4 шт): 1 остаётся, 3 раскладываются в 9,10,11; последний в 11 → 3
  const { state, steps } = applyMove(s, 8);
  ok(state.tuzdyk[0] === -1, 'симметрия: тұздық не создан');
  ok(steps.some(x => x.type === 'tuzdyk-denied' && x.why === 'symmetric'), 'симметрия: событие denied');
}

// --- 10. Кумалак, попавший в тұздық, уходит в казан владельца
{
  // лунка 16 = 8, чтобы последний кумалак сделал её нечётной (без попутного захвата)
  const p = Array(18).fill(9); p[9] = 0; p[16] = 8;
  const s = mk({ pits: p, tuzdyk: [9, -1] }); // тұздық игрока 0 в лунке 9
  const sum0 = checksum(s);
  const { state, steps } = applyMove(s, 8); // из лунки 8: 8 кумалаков в 9..16
  ok(state.kazan[0] === 1, 'тұздық-поглощение: кумалак в казане владельца');
  ok(state.pits[9] === 0, 'тұздық-поглощение: лунка осталась пустой');
  ok(steps.some(x => x.type === 'tuzdyk-absorb'), 'тұздық-поглощение: событие');
  ok(checksum(state) === sum0, 'тұздық-поглощение: сумма сохранена');
}

// --- 11. Захват НЕ срабатывает, если последний кумалак ушёл в тұздық
{
  // тұздық игрока 1 в лунке 5 (ряд игрока 0). Игрок 1 ходит так, чтобы последний попал в тұздық.
  const p = Array(18).fill(9); p[5] = 0; p[13] = 10;
  const s = mk({ pits: p, tuzdyk: [-1, 5], turn: 1 });
  // из 13 (10 шт): 1 остаётся, 9 в 14,15,16,17,0,1,2,3,4? нет — 9 кумалаков: 14..17,0..4 — последний в 4. Хм.
  // Сделаем из 14 (10 шт): 9 в 15,16,17,0,1,2,3,4,5 — последний в 5 = тұздық
  const p2 = Array(18).fill(9); p2[5] = 0; p2[14] = 10;
  const s2 = mk({ pits: p2, tuzdyk: [-1, 5], turn: 1 });
  const { state } = applyMove(s2, 14);
  ok(state.kazan[1] === 1, 'последний в тұздық: только 1 кумалак в казан');
  ok(state.pits[4] === 10, 'последний в тұздық: предыдущая лунка не тронута');
}

// --- 12. Ход из пустой лунки и из чужой лунки — запрещены
{
  const p = Array(18).fill(9); p[4] = 0;
  const s = mk({ pits: p });
  ok(illegalReason(s, 4) !== null, 'пустая лунка: причина есть');
  ok(illegalReason(s, 12) !== null, 'чужая лунка: причина есть');
  let threw = false;
  try { applyMove(s, 4); } catch { threw = true; }
  ok(threw, 'пустая лунка: applyMove бросает');
}

// --- 13. Победа при 82
{
  const p = Array(18).fill(0); p[8] = 2; p[9] = 9;
  const s = mk({ pits: p, kazan: [72, 79] });
  // из 8: один остаётся, один в 9 → 10, чётно → захват 10 → казан 82
  const { state } = applyMove(s, 8);
  ok(state.kazan[0] === 82, 'победа: казан 82');
  ok(state.over && state.winner === 0, 'победа: партия окончена, победили белые');
}

// --- 14. Атсырау: у соперника нет ходов — оставшиеся кумалаки достаются ходившему
{
  // после хода игрока 0 у игрока 1 всё пусто
  const p = Array(18).fill(0); p[0] = 3; p[1] = 2;
  const s = mk({ pits: p, kazan: [80, 77] });
  const { state, steps } = applyMove(s, 0); // 1 остаётся в 0, кладём в 1,2 → у игрока 1 пусто
  ok(steps.some(x => x.type === 'sweep'), 'атсырау: событие sweep');
  ok(state.over, 'атсырау: партия окончена');
  ok(state.kazan[0] + state.kazan[1] === TOTAL, 'атсырау: все 162 кумалака распределены');
  ok(state.winner === 0, 'атсырау: победил игрок 0');
}

// --- 15. Инвариант суммы на случайных партиях + партия всегда заканчивается
{
  for (let g = 0; g < 200; g++) {
    let s = initialState();
    let guard = 0;
    while (!s.over && guard++ < 2000) {
      const moves = legalMoves(s);
      const m = moves[(Math.random() * moves.length) | 0];
      s = applyMove(s, m).state;
      if (checksum(s) !== TOTAL) { ok(false, `рандом-партия ${g}: сумма нарушена на ходу ${guard}`); break; }
    }
    if (!s.over) ok(false, `рандом-партия ${g}: не закончилась за 2000 ходов`);
  }
  ok(true, 'рандом-партии: 200 сыграно с инвариантом 162');
}

// --- 16. ИИ: все уровни возвращают легальные ходы; hard обыгрывает easy
{
  let hardWins = 0, games = 6;
  for (let g = 0; g < games; g++) {
    let s = initialState();
    const hardSide = g % 2; // hard играет то белыми, то чёрными
    let guard = 0;
    while (!s.over && guard++ < 2000) {
      const level = s.turn === hardSide ? 'hard' : 'easy';
      const m = chooseMove(s, level);
      ok(legalMoves(s).includes(m), 'ИИ: ход легален');
      s = applyMove(s, m).state;
    }
    if (s.winner === hardSide) hardWins++;
  }
  ok(hardWins >= 5, `ИИ: hard выигрывает у easy (${hardWins}/${games})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
