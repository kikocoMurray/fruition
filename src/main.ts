import './style.css';
import { strike, type Voice } from './audio';
import { getMerit, reset, subscribe, tap } from './counter';
import { angleFor, BEADS, buildBeads, STEP } from './mala';

/** 一輪的長度。108 顆佛珠、108 種煩惱。 */
const ROUND = BEADS;

const WALK_MS = 950;
const BOW_MS = 1100;
const EXIT_MS = 900;
const PAUSE_IN = 220;
const PAUSE_OUT = 180;

type Mode = 'muyu' | 'mala';
const MODE_KEY = 'muyu.mode';

const countEl = document.getElementById('count') as HTMLOutputElement;
const fx = document.getElementById('fx') as HTMLElement;
const resetBtn = document.getElementById('reset') as HTMLButtonElement;

const strikeEl = document.getElementById('strike') as HTMLElement;
const muyu = document.getElementById('muyu') as HTMLButtonElement;

const beadsEl = document.getElementById('beads') as HTMLElement;
const mala = document.getElementById('mala') as HTMLButtonElement;
const ring = document.getElementById('ring') as unknown as SVGGElement;
const thumb = document.getElementById('thumb') as unknown as SVGGElement;

const monk = document.getElementById('monk') as HTMLElement;
const bob = document.getElementById('bob') as HTMLElement;
const riteEl = document.getElementById('rite') as HTMLElement;
const torso = monk.querySelector('.monk__torso') as SVGGElement;
const head = monk.querySelector('.monk__head') as SVGGElement;
const shadow = monk.querySelector('.monk__shadow') as SVGEllipseElement;

const modeBtns: Record<Mode, HTMLButtonElement> = {
  muyu: document.getElementById('mode-muyu') as HTMLButtonElement,
  mala: document.getElementById('mode-mala') as HTMLButtonElement,
};
const views: Record<Mode, HTMLElement> = { muyu: strikeEl, mala: beadsEl };
const voices: Record<Mode, Voice> = { muyu: 'muyu', mala: 'bead' };

const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

let mode: Mode = readMode();

// 渲染只是把數字寫上去。讀取永遠同步、永遠不失敗——
// 有 loading 態的木魚就是壞掉的木魚。
function render(): void {
  countEl.textContent = String(getMerit());
  syncMala(true);
}

/* ---------------- 法器 ---------------- */

function readMode(): Mode {
  try {
    return sessionStorage.getItem(MODE_KEY) === 'mala' ? 'mala' : 'muyu';
  } catch {
    return 'muyu';
  }
}

function applyMode(): void {
  for (const key of ['muyu', 'mala'] as Mode[]) {
    views[key].hidden = key !== mode;
    modeBtns[key].setAttribute('aria-pressed', String(key === mode));
  }
}

function setMode(next: Mode): void {
  // 儀式進行中換法器會讓和尚站在錯的東西前面，等他走完再說
  if (inRite || next === mode) return;
  mode = next;
  try {
    sessionStorage.setItem(MODE_KEY, next);
  } catch {
    // 無痕模式：這一輪維持選擇即可
  }
  applyMode();
  syncMala(false);
}

for (const key of ['muyu', 'mala'] as Mode[]) {
  modeBtns[key].addEventListener('click', () => setMode(key));
}

/* ---------------- 敲擊 ---------------- */

// 綁 pointerdown 而不是 click：click 要等 touchend 才判定，樂器類的手感會慢半拍。
// 也不綁 touchstart：document 層預設 passive，preventDefault() 無效。
for (const el of [muyu, mala]) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    hit();
  });

  // <button> 的鍵盤操作原本會走 click，上面改綁 pointerdown 之後要自己補回來。
  el.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    hit();
  });
}

resetBtn.addEventListener('click', () => {
  if (inRite) return;
  reset();
});

let inRite = false;

function hit(): void {
  // 和尚在台上的時候不受理敲擊。平時完全自由，要多快有多快。
  if (inRite) return;

  // 聲音永遠在按下的那一刻響，不等動畫——樂器的即時性不能讓給演出。
  strike(voices[mode]);
  tap();

  if (!calm.matches) {
    if (mode === 'muyu') {
      bounce();
      ripple();
    } else {
      flick();
    }
    praise();
  }

  if (getMerit() >= ROUND) void rite();
}

/* ---------------- 念珠 ---------------- */

let shownAngle = angleFor(getMerit());
let ringAnim: Animation | null = null;

/**
 * 珠環轉到目前這一顆。
 *
 * 只有「前進一顆」才用動畫；歸零時是 -360 度跳回 0，若也用動畫就會整串倒轉回去，
 * 那跟「回到原點」的感覺剛好相反。
 */
function syncMala(animate: boolean): void {
  const target = angleFor(getMerit());
  ring.style.transform = `rotate(${target}deg)`;
  ringAnim?.cancel();

  if (animate && Math.abs(target - shownAngle) <= STEP * 1.5) {
    ringAnim = ring.animate(
      [
        { transform: `rotate(${shownAngle}deg)` },
        { transform: `rotate(${target}deg)` },
      ],
      { duration: 170, easing: 'cubic-bezier(.2,.85,.3,1)' },
    );
  }

  shownAngle = target;
}

let thumbAnim: Animation | null = null;

/** 拇指往上一撥。 */
function flick(): void {
  thumbAnim?.cancel();
  thumbAnim = thumb.animate(
    [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-16deg)', offset: 0.34 },
      { transform: 'rotate(0deg)' },
    ],
    { duration: 250, easing: 'cubic-bezier(.25,.85,.35,1)' },
  );
}

/* ---------------- 108 的儀式 ---------------- */

/**
 * 儀式的總預算，超過就強制收場。
 *
 * 擋輸入的設計只有一種失敗模式，而且是致命的：動畫的 finished 沒有 settle，
 * inRite 就永遠是 true，法器從此敲不動。分頁切到背景會讓 WAAPI 停止推進、
 * 動畫被取消會 reject、元素被抽換則兩者都不會發生。這段儀式有三秒多、
 * 橫跨六個動畫，暴露面比單次敲擊大得多，所以這道保險不是防禦性冗餘。
 */
const RITE_MS = WALK_MS + PAUSE_IN + BOW_MS + PAUSE_OUT + EXIT_MS;
const RITE_GUARD_MS = RITE_MS + 1500;

/** 每開始一場儀式就 +1。收場後任何遲到的動畫步驟都會認出自己已經過期。 */
let riteToken = 0;

async function rite(): Promise<void> {
  inRite = true;
  const instrument = mode === 'muyu' ? muyu : mala;
  instrument.setAttribute('aria-disabled', 'true');

  const stage = views[mode];
  const token = ++riteToken;
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    clearTimeout(guard);
    riteToken++;

    // 取消所有 fill:forwards，元素就會落回 CSS 的靜止狀態：
    // 和尚透明、圓滿透明、法器全亮。不必手動清 inline style。
    for (const el of [monk, bob, riteEl, stage, torso, head, shadow]) {
      for (const a of el.getAnimations()) a.cancel();
    }

    reset();
    inRite = false;
    instrument.removeAttribute('aria-disabled');
  };

  const guard = window.setTimeout(close, RITE_GUARD_MS);

  await perform(token, stage);
  close();
}

async function perform(token: number, stage: HTMLElement): Promise<void> {
  const alive = (): boolean => token === riteToken;

  if (calm.matches) {
    void anim(monk, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
    void anim(stage, [{ opacity: 1 }, { opacity: 0.22 }], { duration: 400 });
    void anim(riteEl, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 400,
      delay: 300,
    });
    await pause(RITE_MS - 800);
    if (!alive()) return;
    await anim(monk, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    return;
  }

  // 一、走出來
  void anim(stage, [{ opacity: 1 }, { opacity: 0.22 }], { duration: WALK_MS });
  step(WALK_MS, 4);
  await anim(
    monk,
    [
      { transform: 'translateX(-78%)', opacity: 0 },
      { transform: 'translateX(-40%)', opacity: 1, offset: 0.38 },
      { transform: 'translateX(0)', opacity: 1 },
    ],
    { duration: WALK_MS, easing: 'cubic-bezier(.28,.66,.4,1)' },
  );
  if (!alive()) return;

  await pause(PAUSE_IN);
  if (!alive()) return;

  // 二、鞠躬
  await bow();
  if (!alive()) return;

  await pause(PAUSE_OUT);
  if (!alive()) return;

  // 三、走出去
  void anim(stage, [{ opacity: 0.22 }, { opacity: 1 }], { duration: EXIT_MS });
  void anim(riteEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 });
  step(EXIT_MS, 3);
  await anim(
    monk,
    [
      { transform: 'translateX(0)', opacity: 1 },
      { transform: 'translateX(42%)', opacity: 1, offset: 0.55 },
      { transform: 'translateX(80%)', opacity: 0 },
    ],
    { duration: EXIT_MS, easing: 'cubic-bezier(.4,.16,.7,1)' },
  );
}

/** 快速下俯、停住、緩緩起身。頭比腰多低一點且慢半拍，身體才不像一塊板子。 */
async function bow(): Promise<void> {
  void anim(
    head,
    [
      { transform: 'rotate(0deg)', easing: 'cubic-bezier(.3,.85,.45,1)' },
      { transform: 'rotate(12deg)', offset: 0.28, easing: 'linear' },
      {
        transform: 'rotate(10.5deg)',
        offset: 0.66,
        easing: 'cubic-bezier(.35,0,.25,1)',
      },
      { transform: 'rotate(0deg)' },
    ],
    { duration: BOW_MS },
  );

  void anim(
    shadow,
    [
      { transform: 'scale(1)', opacity: 0.5 },
      { transform: 'scale(.88)', opacity: 0.36, offset: 0.26 },
      { transform: 'scale(.88)', opacity: 0.36, offset: 0.64 },
      { transform: 'scale(1)', opacity: 0.5 },
    ],
    { duration: BOW_MS, easing: 'ease-in-out' },
  );

  // 「圓滿」在他低到最深的時候浮出來
  void anim(
    riteEl,
    [
      { opacity: 0, transform: 'translateY(0.4rem)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 460, delay: 280, easing: 'ease-out' },
  );

  await anim(
    torso,
    [
      { transform: 'rotate(0deg)', easing: 'cubic-bezier(.3,.85,.4,1)' },
      { transform: 'rotate(30deg)', offset: 0.22, easing: 'linear' },
      {
        transform: 'rotate(28.5deg)',
        offset: 0.62,
        easing: 'cubic-bezier(.35,0,.25,1)',
      },
      { transform: 'rotate(0deg)' },
    ],
    { duration: BOW_MS },
  );
}

/** 走路的上下起伏。一步一個週期。 */
function step(total: number, steps: number): void {
  running.get(bob)?.cancel();
  const a = bob.animate(
    [
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(-3.5%) rotate(-1.4deg)', offset: 0.5 },
      { transform: 'translateY(0) rotate(0deg)' },
    ],
    { duration: total / steps, iterations: steps, easing: 'ease-in-out' },
  );
  running.set(bob, a);
}

/* ---------------- 每一下的回饋 ---------------- */

let press: Animation | null = null;

function bounce(): void {
  press?.cancel();
  press = muyu.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(0.955)', offset: 0.28 },
      { transform: 'scale(1)' },
    ],
    { duration: 240, easing: 'cubic-bezier(.22,.9,.28,1)' },
  );
}

function ripple(): void {
  const ringEl = document.createElement('div');
  ringEl.className = 'ring';
  fx.append(ringEl);
  play(
    ringEl,
    [
      { transform: 'scale(.88)', opacity: 0.5 },
      { transform: 'scale(1.32)', opacity: 0 },
    ],
    { duration: 620, easing: 'cubic-bezier(.16,.8,.3,1)' },
  );
}

function praise(): void {
  const label = document.createElement('span');
  label.className = 'rise';
  label.textContent = '功德 +1';
  fx.append(label);

  // 連敲時如果每個標籤都走同一條線，看起來會像卡住
  const dx = (Math.random() - 0.5) * 4;
  play(
    label,
    [
      { transform: `translate(${dx}rem, 0)`, opacity: 0 },
      { transform: `translate(${dx}rem, -0.5rem)`, opacity: 1, offset: 0.16 },
      { transform: `translate(${dx}rem, -3.4rem)`, opacity: 0 },
    ],
    { duration: 1100, easing: 'cubic-bezier(.25,.6,.3,1)' },
  );
}

function play(
  el: HTMLElement,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): void {
  el.animate(frames, options).finished
    .then(() => el.remove())
    .catch(() => el.remove());
}

/* ---------------- 動畫小工具 ---------------- */

const running = new WeakMap<Element, Animation>();

/**
 * 同一個元素只留一個動畫，並且永遠 resolve——被取消也算結束。
 * 儀式靠 token 判斷自己有沒有過期，不靠 reject 來中斷流程。
 */
function anim(
  el: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): Promise<void> {
  running.get(el)?.cancel();
  const a = el.animate(frames, { fill: 'forwards', ...options });
  running.set(el, a);
  return a.finished.then(
    () => undefined,
    () => undefined,
  );
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------------- 起手 ---------------- */

// 這些呼叫必須留在檔案最後。
// 上面用到的 shownAngle、ringAnim 都是 let，在各自的宣告執行前處於 TDZ，
// 提早呼叫 render() 會整個模組初始化失敗，連事件都綁不上。
buildBeads(ring);

// 儀式演到一半重新載入的話，計數會停在 108 而儀式已經沒了。
// 與其留一個永遠不會被消化的狀態，不如安靜地開始新的一輪。
if (getMerit() >= ROUND) reset();

subscribe(render);
applyMode();
render();
syncMala(false);
