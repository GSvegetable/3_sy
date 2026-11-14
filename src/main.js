/**
 * 3_sy — 双轨卡片空间（Web / Capacitor 版）
 *
 * 按参考视频实现：
 *   · 前轨（左）白色卡面、后轨（右）青瓷卡面，两条轨道都循环滚动；
 *   · 前轨点击翻面，青瓷轨不翻面；
 *   · 三个状态（底部三个小点）：整组推到左侧之外 / 贴左 / 贴右，
 *     横滑或点小点切换，位置、曲率、倾角一起走弹簧过冲，同时有一道波纹扫过；
 *   · 底部「倾斜」滑条显示并可手动覆盖当前倾角读数。
 */
import './style.css';
import './states.css';
import { CARD_CONTENTS, PRESETS, INITIAL_PRESET, TILT_TO_DEG } from './data.js';
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

/** 后轨（右）= 奇数序号卡片，前轨（左）= 偶数序号卡片。 */
const state = {
  layout: null,
  presetIndex: INITIAL_PRESET,
  curve: PRESETS[INITIAL_PRESET].curve,
  tilt: PRESETS[INITIAL_PRESET].tilt, // 「倾斜」读数（原生单位）
  tiltLocked: false, // 用户拖过滑条后，转场不再覆盖倾角，直到下一次切换状态
  shift: 0,
  backOrder: CARD_CONTENTS.map((_, i) => i).filter((i) => i % 2 === 1),
  frontOrder: CARD_CONTENTS.map((_, i) => i).filter((i) => i % 2 === 0),
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
  anim: null,
  sensorTilt: 0,
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

/** 整组双轨的横向位移：让整组中心落到该状态对应的位置。 */
function presetShift(preset) {
  const layout = state.layout;
  if (!layout) return 0;
  const { vw, u, groupW, padLeft } = layout;
  const half = groupW * 0.54; // 焦点处卡片被放大，整组视觉半宽略大于几何半宽
  let center;
  if (preset.anchor === 'out-left') {
    center = 0;
  } else if (preset.anchor === 'left') {
    center = Math.max(8 * u, vw * 0.012) + half;
  } else {
    center = vw - Math.max(24 * u, vw * 0.035) - half;
  }
  return center - (padLeft + groupW / 2);
}

function presetValues(preset) {
  return { curve: preset.curve, tilt: preset.tilt, shift: presetShift(preset) };
}

function setPreset(next) {
  next = clamp(next, 0, PRESETS.length - 1);
  if (next === state.presetIndex || !state.layout) return;
  const to = presetValues(PRESETS[next]);
  state.anim = {
    from: { curve: state.curve, tilt: state.tilt, shift: state.shift },
    to,
    start: performance.now(),
    duration: 760,
  };
  state.tiltLocked = false;
  state.presetIndex = next;
  hapticReverse();

  // 波纹从目标位置的焦点荡开
  const { padLeft, groupW, focusY } = state.layout;
  scene.startRipple(padLeft + groupW / 2 + to.shift, focusY, PRESETS[next].curve);
  updateStatus();
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
    // 青瓷轨（右）不响应翻面
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

/** 当前状态 → 场景视图。白色前轨取全量倾角，青瓷后轨取 -0.42 倍。 */
function buildView() {
  const frontDeg = state.tilt * TILT_TO_DEG + state.sensorTilt * 5;
  const backDeg = -state.tilt * TILT_TO_DEG * 0.42 + state.sensorTilt * 5;
  return {
    layout: state.layout,
    backOrder: state.backOrder,
    frontOrder: state.frontOrder,
    backOffset: state.backOffset,
    frontOffset: state.frontOffset,
    backShift: state.shift,
    frontShift: state.shift,
    curve: state.curve,
    backTilt: backDeg,
    frontTilt: frontDeg,
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

  // 状态切换：位置 / 曲率 / 倾角一起走弹簧过冲
  if (state.anim) {
    const { from, to } = state.anim;
    const t = clamp((now - state.anim.start) / state.anim.duration, 0, 1);
    const e = 1 - Math.exp(-7 * t) * Math.cos(10 * t);
    state.curve = from.curve + (to.curve - from.curve) * e;
    state.shift = from.shift + (to.shift - from.shift) * e;
    if (!state.tiltLocked) state.tilt = from.tilt + (to.tilt - from.tilt) * e;
    if (t >= 1) state.anim = null;
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
  // 视口变了：静止状态下重新贴到对应位置
  if (!state.anim) state.shift = presetShift(PRESETS[state.presetIndex]);
  scene.apply(buildView());
}

watchTilt((tilt) => {
  state.sensorTilt = tilt;
});

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
const initial = presetValues(PRESETS[INITIAL_PRESET]);
state.curve = initial.curve;
state.tilt = initial.tilt;
state.shift = initial.shift;
updateStatus();
syncTiltUi();
scene.apply(buildView());
state.raf = requestAnimationFrame(frame);
