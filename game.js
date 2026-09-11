// Тоғыз құмалақ — интерфейс. Вся логика правил — в engine.js (протестирован),
// UI лишь визуализирует шаги и никогда не трогает счёт сам.
import {
  initialState, cloneState, legalMoves, applyMove, illegalReason, ordinal,
} from './engine.js';
import { chooseMove } from './ai.js';

const $ = (id) => document.getElementById(id);

const ui = {
  s: initialState(),
  human: 0,            // за кого играет человек (0 = белые/нижний ряд)
  level: 'medium',
  busy: false,         // идёт анимация или думает ИИ
  history: [],         // состояния перед каждым ходом человека (для отмены)
  pitEls: [],          // DOM лунок по индексу 0..17
};

// ---------- построение доски
function buildBoard() {
  const rowMe = $('row-me'), rowAi = $('row-ai');
  rowMe.innerHTML = ''; rowAi.innerHTML = '';
  ui.pitEls = Array(18);
  // нижний ряд: лунки человека слева направо
  for (let o = 0; o < 9; o++) {
    const pit = ui.human * 9 + o;
    rowMe.appendChild(makePitEl(pit, o + 1));
  }
  // верхний ряд: лунки ИИ справа налево — поток против часовой стрелки
  const aiSide = 1 - ui.human;
  for (let o = 8; o >= 0; o--) {
    const pit = aiSide * 9 + o;
    rowAi.appendChild(makePitEl(pit, o + 1));
  }
}
function makePitEl(pit, label) {
  const el = document.createElement('div');
  el.className = 'pit';
  el.dataset.pit = pit;
  el.innerHTML = `<span class="idx">${label}</span><div class="dots"></div><div class="cnt"></div>`;
  el.addEventListener('click', () => onPitClick(pit));
  ui.pitEls[pit] = el;
  return el;
}

// ---------- отрисовка состояния
function render(s = ui.s) {
  for (let pit = 0; pit < 18; pit++) {
    const el = ui.pitEls[pit];
    const n = s.pits[pit];
    const isTuzMine = s.tuzdyk[ui.human] === pit;
    const isTuzAi = s.tuzdyk[1 - ui.human] === pit;
    const dots = el.querySelector('.dots');
    const cnt = el.querySelector('.cnt');
    if (isTuzMine || isTuzAi) {
      dots.innerHTML = '<span class="tuz-star">⭐</span>';
      cnt.textContent = 'тұздық';
    } else {
      dots.innerHTML = '<span class="dot"></span>'.repeat(Math.min(n, 12));
      cnt.textContent = n;
    }
    el.classList.toggle('tuz-mine', isTuzMine);
    el.classList.toggle('tuz-ai', isTuzAi);
    const legal = !ui.busy && !s.over && s.turn === ui.human && ownerIs(pit, ui.human) && n > 0;
    el.classList.toggle('legal', legal);
  }
  renderKazan($('kazan-me'), s.kazan[ui.human]);
  renderKazan($('kazan-ai'), s.kazan[1 - ui.human]);
  $('dot-me').classList.toggle('active', !s.over && s.turn === ui.human);
  $('dot-ai').classList.toggle('active', !s.over && s.turn !== ui.human);
  $('undo-btn').disabled = ui.busy || ui.history.length === 0 || s.over || s.turn !== ui.human;
  $('hint-btn').disabled = ui.busy || s.over || s.turn !== ui.human;
}
const ownerIs = (pit, p) => (pit < 9 ? 0 : 1) === p;
function renderKazan(el, n) {
  el.querySelector('.k-cnt span').textContent = n;
  el.querySelector('.k-fill').style.width = `${Math.min(100, (n / 162) * 100)}%`;
}
function kazanGain(who) {
  const el = who === ui.human ? $('kazan-me') : $('kazan-ai');
  el.classList.remove('gain'); void el.offsetWidth; el.classList.add('gain');
}

// ---------- сообщения и журнал
function say(html) { $('message').innerHTML = html; }
function logLine(html, cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.innerHTML = html;
  $('log').prepend(d);
}
// «в 4-й лунке соперника» — предложный падеж для сообщений журнала
const pitLoc = (pit, mover) =>
  `${ordinal(pit) + 1}-й лунке ${ownerIs(pit, mover) ? 'своего ряда' : 'соперника'}`;

// ---------- клик по лунке
function onPitClick(pit) {
  if (ui.busy || ui.s.over) return;
  if (ui.s.turn !== ui.human) { say('<span class="warn">Сейчас ходит компьютер.</span>'); return; }
  const reason = illegalReason(ui.s, pit);
  if (reason) { say(`<span class="warn">${reason}</span>`); return; }
  ui.history.push(cloneState(ui.s));
  playMove(pit, ui.human);
}

// ---------- выполнение хода с анимацией
function playMove(pit, mover) {
  const { state, steps } = applyMove(ui.s, pit);
  ui.busy = true;
  render(ui.s);
  const visual = cloneState(ui.s);
  const who = mover === ui.human ? 'Вы' : 'Компьютер';
  const whoCls = mover === ui.human ? 'me' : 'ai';
  let delay = 0;
  const STEP = 170;
  const acts = [];

  for (const st of steps) {
    if (st.type === 'pick') {
      acts.push(() => {
        visual.pits[st.pit] = st.left;
        updatePit(visual, st.pit, 'sow-flash');
        say(`${who}: ${ordinal(st.pit) + 1}-я лунка, взято ${st.taken}`);
      });
    } else if (st.type === 'sow') {
      acts.push(() => { visual.pits[st.pit]++; updatePit(visual, st.pit, 'sow-flash'); });
    } else if (st.type === 'tuzdyk-absorb') {
      acts.push(() => {
        visual.kazan[st.owner]++;
        renderKazan(st.owner === ui.human ? $('kazan-me') : $('kazan-ai'), visual.kazan[st.owner]);
        kazanGain(st.owner);
        updatePit(visual, st.pit, 'cap-flash');
      });
    } else if (st.type === 'capture') {
      acts.push(() => {
        visual.kazan[st.by] += st.count;
        visual.pits[st.pit] = 0;
        updatePit(visual, st.pit, 'cap-flash');
        renderKazan(st.by === ui.human ? $('kazan-me') : $('kazan-ai'), visual.kazan[st.by]);
        kazanGain(st.by);
        logLine(`<b class="${whoCls}">${who}</b>: жұп! В ${pitLoc(st.pit, mover)} стало чётно — <span class="ev">+${st.count} в казан</span>`);
      });
    } else if (st.type === 'tuzdyk-made') {
      acts.push(() => {
        visual.tuzdyk[st.by] = st.pit;
        visual.kazan[st.by] += 3;
        visual.pits[st.pit] = 0;
        updatePit(visual, st.pit, 'cap-flash');
        renderKazan(st.by === ui.human ? $('kazan-me') : $('kazan-ai'), visual.kazan[st.by]);
        kazanGain(st.by);
        logLine(`<b class="${whoCls}">${who}</b>: <span class="ev">⭐ тұздық</span> в ${pitLoc(st.pit, mover)} — 3 в казан, теперь всё, что туда попадёт, тоже`);
      });
    } else if (st.type === 'tuzdyk-denied') {
      acts.push(() => {
        logLine(`<b class="${whoCls}">${who}</b>: в лунке стало 3, но тұздық запрещён (${st.why === 'ninth' ? 'это 9-я лунка' : 'симметрична тұздық соперника'}) — кумалаки остаются`);
      });
    } else if (st.type === 'sweep') {
      acts.push(() => {
        logLine(`<span class="ev">Атсырау!</span> У соперника нет ходов — <b class="${whoCls}">${who === 'Вы' ? 'вы забираете' : 'компьютер забирает'}</b> оставшиеся ${st.count} кумалаков`);
      });
    }
  }

  acts.forEach((fn, i) => setTimeout(fn, i * STEP));
  delay = acts.length * STEP + 220;

  setTimeout(() => {
    ui.s = state;
    ui.busy = false;
    markLastMove(pit);
    render();
    logMoveHeader(mover, pit, steps);
    afterMove();
  }, delay);
}

function updatePit(visual, pit, flashCls) {
  const el = ui.pitEls[pit];
  const n = visual.pits[pit];
  const isTuz = visual.tuzdyk[0] === pit || visual.tuzdyk[1] === pit;
  if (!isTuz) {
    el.querySelector('.dots').innerHTML = '<span class="dot"></span>'.repeat(Math.min(n, 12));
    el.querySelector('.cnt').textContent = n;
  }
  if (flashCls) { el.classList.remove(flashCls); void el.offsetWidth; el.classList.add(flashCls); }
}

let lastMovePit = -1;
function markLastMove(pit) {
  if (lastMovePit >= 0) ui.pitEls[lastMovePit]?.classList.remove('last-move');
  lastMovePit = pit;
  ui.pitEls[pit].classList.add('last-move');
}
function logMoveHeader(mover, pit, steps) {
  const who = mover === ui.human ? 'Вы' : 'Компьютер';
  const cls = mover === ui.human ? 'me' : 'ai';
  const picked = steps.find(s => s.type === 'pick');
  logLine(`${ui.s.moveNo - 1}. <b class="${cls}">${who}</b>: ход из ${ordinal(pit) + 1}-й лунки (${picked.taken} кумалак.)`);
}

// ---------- после хода: конец партии или очередь ИИ
function afterMove() {
  if (ui.s.over) { showResult(); return; }
  if (ui.s.turn !== ui.human) {
    say('Компьютер думает…');
    $('ai-think').textContent = '⏳';
    // даём кадру отрисоваться, потом считаем
    setTimeout(() => {
      const move = chooseMove(ui.s, ui.level);
      $('ai-think').textContent = '';
      playMove(move, 1 - ui.human);
    }, 350);
  } else {
    say('Ваш ход — выберите подсвеченную лунку.');
  }
}

function showResult() {
  const w = ui.s.winner;
  const meWin = w === ui.human;
  $('result-title').textContent = w === 'draw' ? 'ТЕҢ · НИЧЬЯ 81:81' : meWin ? '🏆 ЖЕҢІС · ПОБЕДА!' : 'ҰТЫЛЫС · Поражение';
  $('result-stats').textContent = `Ваш казан: ${ui.s.kazan[ui.human]} · Казан соперника: ${ui.s.kazan[1 - ui.human]}`;
  logLine(`<span class="ev">— Партия окончена: ${w === 'draw' ? 'ничья' : meWin ? 'победа' : 'победа компьютера'} (${ui.s.kazan[0]}:${ui.s.kazan[1]}) —</span>`);
  setTimeout(() => $('result-overlay').classList.remove('hidden'), 500);
}

// ---------- управление
function newGame() {
  ui.level = $('level').value;
  ui.human = +$('first').value === 0 ? 0 : 1; // кто первый: белые = игрок 0
  // человек всегда снизу; если первым ходит компьютер, человек играет за игрока 1
  ui.s = initialState();
  ui.history = [];
  ui.busy = false;
  lastMovePit = -1;
  buildBoard();
  $('log').innerHTML = '';
  $('result-overlay').classList.add('hidden');
  logLine(`<span class="ev">— Новая партия · сложность: ${$('level').selectedOptions[0].text} —</span>`);
  render();
  afterMoveStart();
}
function afterMoveStart() {
  if (ui.s.turn !== ui.human) {
    say('Компьютер ходит первым…');
    setTimeout(() => playMove(chooseMove(ui.s, ui.level), 1 - ui.human), 600);
  } else {
    say('Ваш ход — выберите подсвеченную лунку.');
  }
}

$('new-game').addEventListener('click', newGame);
$('rules-btn').addEventListener('click', () => $('rules-overlay').classList.remove('hidden'));
$('rules-close').addEventListener('click', () => {
  $('rules-overlay').classList.add('hidden');
  localStorage.setItem('tk-rules-seen', '1');
});
$('result-again').addEventListener('click', newGame);
$('result-close').addEventListener('click', () => $('result-overlay').classList.add('hidden'));

$('hint-btn').addEventListener('click', () => {
  if (ui.busy || ui.s.over || ui.s.turn !== ui.human) return;
  const m = chooseMove(ui.s, 'hard');
  const el = ui.pitEls[m];
  el.classList.remove('hint'); void el.offsetWidth; el.classList.add('hint');
  say(`Совет: сходите из ${ordinal(m) + 1}-й лунки.`);
});

$('undo-btn').addEventListener('click', () => {
  if (ui.busy || ui.history.length === 0 || ui.s.turn !== ui.human) return;
  ui.s = ui.history.pop();
  lastMovePit = -1;
  ui.pitEls.forEach(el => el.classList.remove('last-move'));
  render();
  say('Ход отменён (ваш ход и ответ компьютера).');
  logLine('<span class="ev">— отмена хода —</span>');
});

// ---------- запуск
buildBoard();
render();
if (!localStorage.getItem('tk-rules-seen')) $('rules-overlay').classList.remove('hidden');
say('Нажмите «Жаңа ойын», чтобы начать, или изучите правила.');
newGame();
