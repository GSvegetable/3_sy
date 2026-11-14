/**
 * 3_sy — 双轨卡片空间（Web / Capacitor 版）
 *
 * 按参考视频实现：
 *   · 左轨青瓷磨砂卡（偶数序号，不翻面，压在上层），右轨白卡（奇数序号，点击翻面），两轨都循环滚动；
 *   · 三个状态（底部三个小点）的 peak / curve / tilt 与原生预设一致，
 *     横滑或点小点切换，三个量各走一条弹簧（阻尼 0.82、刚度 200，与原生一致），同时有一道波纹扫过；
 *   · 倾斜作用在整组上：rotateY = 读数 × 0.48°，旋转原点随读数左右移动；
 *   · 底部「倾斜」滑条显示并可手动覆盖当前倾角读数。
 */
import './style.css';
import './states.css';
import { CARD_CONTENTS, PRESETS, INITIAL_PRESET, TILT_ROT, TILT_ORIGIN } from './data.js';
import { findBestMatch } from './search.js';
import { createLayout, clamp } from './layout.js';
import { Scene } from './scene.js';
import { attachGestures } from './input.js';
import { hapticTick, hapticRelease, hapticReverse, watchTilt } from './effects.js';

const stage = document.querySelector('#stage');
const scene = new Scene(stage);
const searchToggle = document.querySelector('#searchToggle');
const searchInput = document.querySelector('#searchInput');
const statusLabel = document.querySelector('#statusLabel');

/** 后轨（左，青瓷）= 偶数序号卡片，前轨（右，白）= 奇数序号卡片。 */
const state = {
  layout: null,
  presetIndex: INITIAL_PRESET,
  // 三个弹簧量：x 当前值，v 速度；peak 单位 dp，tilt 为原生读数
  peak: PRESETS[INITIAL_PRESET].peak,
  peakV: 0,
  curve: PRESETS[INITIAL_PRESET].curve,
  curveV: 0,
  tilt: PRESETS[INITIAL_PRESET].tilt,
  tiltV: 0,
  tiltLocked: false, // 用户拖过滑条后，倾角弹簧不再追预设，直到下一次切换状态
  backOrder: CARD_CONTENTS.map((_, i) => i).filter((i) => i % 2 === 0),
  frontOrder: CARD_CONTENTS.map((_, i) => i).filter((i) => i % 2 === 1),
  backOffset: 0,
  frontOffset: 0,
  backTarget: 0,
  frontTarget: 0,
  backVelocity: 0,
  frontVelocity: 0,
  backDeltaLow: 0,
  frontDeltaLow: 0,
  prevBack: 0,
  prevFront: 0,
  dragging: -1,
  backPointerY: NaN,
  frontPointerY: NaN,
  pressedKey: null,
  highlightIndex: -1,
  highlightUntil: 0,
  searchMotion: null,
  free: null,
  lastStepBack: 0,
  lastStepFront: 0,
  lastFrame: 0,
  raf: 0,
};

/* ------------------------------------------------------- 状态点与倾斜滑条 */

const dots = document.createElement('div');
dots.className = 'state-dots';
const dotEls = PRESETS.map((preset, i) => {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = 'state-dot';
  dot.setAttribute('aria-label', `状态 ${i + 1} · ${preset.label}`);
  dot.addEventListener('click', () => setPreset(i));
  dots.appendChild(dot);
  return dot;
});

const tiltBar = document.createElement('div');
tiltBar.className = 'tilt-bar';
tiltBar.innerHTML = `
  <span class="tilt-label">倾斜</span>
  <input class="tilt-range" type="range" min="-100" max="100" step="1" value="0" aria-label="倾斜">
  <span class="tilt-value">0</span>`;
const tiltRange = tiltBar.querySelector('.tilt-range');
const tiltValue = tiltBar.querySelector('.tilt-value');

// 小点和滑条里的操作不能被舞台当成轨道拖拽 / 横滑切换
for (const el of [dots, tiltBar]) {
  el.addEventListener('pointerdown', (event) => event.stopPropagation());
  stage.appendChild(el);
}

tiltRange.addEventListener('input', () => {
  state.tilt = Number(tiltRange.value);
  state.tiltLocked = true;
});

let shownTilt = NaN;
function syncTiltUi() {
  const value = Math.round(state.tilt);
  if (value === shownTilt) return;
  shownTilt = value;
  tiltValue.textContent = String(value);
  tiltRange.value = String(clamp(value, -100, 100));
  tiltRange.style.setProperty('--pct', `${(clamp(value, -100, 100) + 100) / 2}%`);
}

/* ------------------------------------------------------------------ 度量 */

function measure() {
  const vw = stage.clientWidth;
  const vh = stage.clientHeight;
  const layout = createLayout(vw, vh);
  layout.frontHeight = Math.max(1, state.frontOrder.length * layout.step);
  layout.backHeight = Math.max(1, state.backOrder.length * layout.step);
  state.layout = layout;

  if (!state.initialized) {
    // 两条轨道都从第一张卡片落在焦点上开始
    const start = -layout.focusY + layout.cardH / 2;
    state.backOffset = state.backTarget = start;
    state.frontOffset = state.frontTarget = start;
    state.prevBack = state.prevFront = start;
    state.initialized = true;
  }
  scene.setLayout(layout);
  scene.syncOrders(state.backOrder, state.frontOrder);
}

/* ------------------------------------------------------------ 预设与转场 */

/**
 * peak（dp）→ 整组横向偏移（px）。原生 peak 以 dp 为单位，两条轨道同时偏移；
 * 视口太窄（手机竖屏）时夹紧，保证整组不会完全移出屏幕。
 */
function peakPx(peak) {
  const L = state.layout;
  const min = -(L.padLeft + L.groupW * 0.85);
  const max = Math.max(min + 1, L.vw - L.padLeft - L.groupW * 0.85 - L.vw * 0.02);
  return clamp(peak * L.u, min, max);
}

function setPreset(next) {
  next = clamp(next, 0, PRESETS.length - 1);
  if (next === state.presetIndex || !state.layout) return;
  state.presetIndex = next;
  state.tiltLocked = false;
  hapticReverse();

  // 波纹从目标位置的整组中心荡开
  const { padLeft, groupW, focusY } = state.layout;
  scene.startRipple(padLeft + groupW / 2 + peakPx(PRESETS[next].peak), focusY, PRESETS[next].curve);
  updateStatus();
}

/** 原生 spring(dampingRatio = 0.82, stiffness = StiffnessLow = 200)。 */
const SPRING_K = 200;
const SPRING_C = 2 * 0.82 * Math.sqrt(SPRING_K);
function springStep(x, v, target, dt) {
  let t = dt;
  while (t > 0) {
    const h = Math.min(t, 0.004);
    v += (-SPRING_K * (x - target) - SPRING_C * v) * h;
    x += v * h;
    t -= h;
  }
  return [x, v];
}

function updateStatus() {
  const preset = PRESETS[state.presetIndex];
  if (statusLabel) {
    statusLabel.textContent = `${String(state.presetIndex + 1).padStart(2, '0')} · ${preset.label}`;
  }
  dotEls.forEach((dot, i) => dot.classList.toggle('active', i === state.presetIndex));
}

/* ------------------------------------------------------------------ 搜索 */

function nearestCongruent(current, target, period) {
  return target + Math.round((current - target) / period) * period;
}

function runSearch(raw) {
  const match = findBestMatch(raw);
  if (!match) {
    state.highlightIndex = -1;
    return;
  }
  const index = match.index;
  const onBack = state.backOrder.includes(index);
  const order = onBack ? state.backOrder : state.frontOrder;
  const row = order.indexOf(index);
  if (row < 0) return;

  const { step, focusY, cardH } = state.layout;
  const target = row * step - focusY + cardH / 2;

  // 两条轨道都是循环的：取与当前位置最近的那一圈
  const period = onBack ? state.layout.backHeight : state.layout.frontHeight;
  const current = onBack ? state.backOffset : state.frontOffset;
  state.searchMotion = {
    side: onBack ? 0 : 1,
    start: current,
    target: nearestCongruent(current, target, period),
    started: performance.now(),
  };
  state.highlightIndex = index;
  state.highlightUntil = performance.now() + 1600;
}

if (searchToggle && searchInput) {
  searchToggle.addEventListener('click', () => {
    const open = searchInput.classList.toggle('open');
    searchToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      state.highlightIndex = -1;
    }
  });
  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    const value = searchInput.value;
    searchTimer = window.setTimeout(() => runSearch(value), 200);
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      searchInput.value = '';
      searchInput.classList.remove('open');
      searchToggle.setAttribute('aria-expanded', 'false');
      state.highlightIndex = -1;
      searchInput.blur();
    }
    if (event.key === 'Enter') {
      window.clearTimeout(searchTimer);
      runSearch(searchInput.value);
      searchInput.blur();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.search-dock')) {
      searchInput.classList.remove('open');
      searchToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ------------------------------------------------------------------ 手势 */

function sideAt(clientX) {
  return scene.pickSide(clientX);
}

attachGestures(stage, {
  cardWidth: () => (state.layout ? state.layout.cardW : 150),
  getSide: (x) => sideAt(x),
  isBlocked: () => Boolean(state.free),
  onPresetStep: (dir) => setPreset(state.presetIndex + dir),
  onDragStart: (side) => {
    state.dragging = side;
    if (side === 0) {
      state.backTarget = state.backOffset;
      state.backVelocity = 0;
      state.backPointerY = NaN;
    } else {
      state.frontTarget = state.frontOffset;
      state.frontVelocity = 0;
      state.frontPointerY = NaN;
    }
  },
  onDragMove: (side, delta, dt, clientY) => {
    if (side === 0) {
      state.backTarget -= delta;
      state.backPointerY = clientY;
    } else {
      state.frontTarget -= delta;
      state.frontPointerY = clientY;
    }
  },
  onDragEnd: (side) => {
    if (side === 0) {
      state.dragging = -1;
      state.backPointerY = NaN;
      hapticRelease(clamp(Math.abs(state.backVelocity) / 55, 0, 1));
    } else {
      state.dragging = -1;
      state.frontPointerY = NaN;
      hapticRelease(clamp(Math.abs(state.frontVelocity) / 55, 0, 1));
    }
  },
  onTap: (index, side) => {
    // 青瓷轨（左）不响应翻面
    if (side === 0) return;
    const flipped = scene.toggleFlip(index);
    hapticTick(0.65);
    if (flipped) {
      state.highlightIndex = index;
      state.highlightUntil = performance.now() + 900;
    }
  },
  onPress: (key, pressed) => {
    state.pressedKey = pressed ? key : null;
  },
  onExtractStart: (index, el) => {
    const rect = el.getBoundingClientRect();
    const side = el.dataset.side === 'back' ? 0 : 1;
    const order = side === 0 ? state.backOrder : state.frontOrder;
    const at = order.indexOf(index);
    if (at >= 0) order.splice(at, 1);
    measure();
    state.free = scene.addFreeCard(index, rect, el);
    hapticTick(1);
  },
  onExtractMove: (dx, dy) => {
    if (state.free) scene.moveFreeCard(state.free, dx, dy);
  },
  onExtractEnd: (clientX) => {
    if (!state.free) return;
    const side = sideAt(clientX);
    const index = state.free.index;
    scene.removeFreeCard(state.free);
    state.free = null;
    if (side === 0) {
      state.backOrder.push(index);
    } else if (side === 1) {
      state.frontOrder.push(index);
    }
    measure();
  },
});

/* -------------------------------------------------------------- 滚轮/触摸 */

stage.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const side = sideAt(event.clientX);
    if (side < 0) return;
    if (side === 0) {
      state.backOffset += event.deltaY;
      state.backTarget = state.backOffset;
    } else {
      state.frontOffset += event.deltaY;
      state.frontTarget = state.frontOffset;
    }
  },
  { passive: false },
);

/* ------------------------------------------------------------------ 主循环 */

/** 当前状态 → 场景视图。倾斜按原生公式作用在整组上。 */
function buildView() {
  const shift = state.layout ? peakPx(state.peak) : 0;
  return {
    layout: state.layout,
    backOrder: state.backOrder,
    frontOrder: state.frontOrder,
    backOffset: state.backOffset,
    frontOffset: state.frontOffset,
    backShift: shift,
    frontShift: shift,
    curve: state.curve,
    tiltDeg: state.tilt * TILT_ROT,
    tiltOriginX: clamp(0.5 - state.tilt * TILT_ORIGIN, 0, 1),
    backSpeed: state.backVelocity / 55,
    frontSpeed: state.frontVelocity / 55,
    backPointerY: state.backPointerY,
    frontPointerY: state.frontPointerY,
    pressedKey: state.pressedKey,
    highlightIndex: state.highlightIndex,
    highlightUntil: state.highlightUntil,
  };
}

function frame(now) {
  const dt = state.lastFrame ? Math.min(40, now - state.lastFrame) : 16.667;
  state.lastFrame = now;
  const fs = dt / 16.667;

  // 状态切换：peak / curve / tilt 各走一条弹簧追预设目标
  const target = PRESETS[state.presetIndex];
  const sec = dt / 1000;
  [state.peak, state.peakV] = springStep(state.peak, state.peakV, target.peak, sec);
  [state.curve, state.curveV] = springStep(state.curve, state.curveV, target.curve, sec);
  if (!state.tiltLocked) {
    [state.tilt, state.tiltV] = springStep(state.tilt, state.tiltV, target.tilt, sec);
  }

  // 搜索定位
  if (state.searchMotion) {
    const t = clamp((now - state.searchMotion.started) / 600, 0, 1);
    const e = 1 - Math.pow(1 - t, 3);
    const value = state.searchMotion.start + (state.searchMotion.target - state.searchMotion.start) * e;
    if (state.searchMotion.side === 0) {
      state.backOffset = value;
      state.backTarget = value;
      state.backVelocity = 0;
    } else {
      state.frontOffset = value;
      state.frontTarget = value;
      state.frontVelocity = 0;
    }
    if (t >= 1) state.searchMotion = null;
  }

  // 轨道偏移：拖拽时追随目标，松开后惯性衰减
  if (state.dragging === 0) {
    state.backOffset += (state.backTarget - state.backOffset) * 0.95;
  } else {
    state.backOffset += state.backVelocity * fs;
    state.backVelocity *= Math.pow(0.96, fs);
    if (Math.abs(state.backVelocity) < 0.15) state.backVelocity = 0;
  }
  if (state.dragging === 1) {
    state.frontOffset += (state.frontTarget - state.frontOffset) * 0.95;
  } else {
    state.frontOffset += state.frontVelocity * fs;
    state.frontVelocity *= Math.pow(0.96, fs);
    if (Math.abs(state.frontVelocity) < 0.15) state.frontVelocity = 0;
  }

  // 位移低通 + 速度混合（与原生一致）
  const rawBack = state.backOffset - state.prevBack;
  const rawFront = state.frontOffset - state.prevFront;
  state.prevBack = state.backOffset;
  state.prevFront = state.frontOffset;
  state.backDeltaLow = state.backDeltaLow * 0.55 + rawBack * 0.45;
  state.frontDeltaLow = state.frontDeltaLow * 0.55 + rawFront * 0.45;
  if (state.dragging === 0) state.backVelocity = state.backVelocity * 0.35 + state.backDeltaLow * 0.65;
  if (state.dragging === 1) state.frontVelocity = state.frontVelocity * 0.35 + state.frontDeltaLow * 0.65;

  // 逐卡步进触觉
  const step = state.layout.step;
  const backStep = Math.trunc(state.backOffset / step);
  if (backStep !== state.lastStepBack) {
    hapticTick(clamp(Math.abs(state.backVelocity) / 55, 0, 1));
    state.lastStepBack = backStep;
  }
  const frontStep = Math.trunc(state.frontOffset / step);
  if (frontStep !== state.lastStepFront) {
    hapticTick(clamp(Math.abs(state.frontVelocity) / 55, 0, 1));
    state.lastStepFront = frontStep;
  }

  scene.stepFlips(fs);
  scene.apply(buildView());
  syncTiltUi();

  state.raf = requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ 启动 */

function resize() {
  measure();
  scene.apply(buildView());
}

// 原生里重力传感器只调高光强度，网页端没有对应的高光层，这里不使用
watchTilt(() => {});

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(state.raf);
    state.lastFrame = 0;
  } else {
    state.raf = requestAnimationFrame(frame);
  }
});

// 调试入口：便于在浏览器控制台检查运行时状态
window.__three = { state, scene, setPreset };

measure();
updateStatus();
syncTiltUi();
scene.apply(buildView());
state.raf = requestAnimationFrame(frame);
