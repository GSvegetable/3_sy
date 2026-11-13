/**
 * 3_sy — 双轨卡片空间（Web / Capacitor 版）
 *
 * 与 Android 版 `BlackWorkspaceScreen` 同一套数据、几何与交互：
 *   · 后轨（左）青瓷卡面、有限滚动 + 越界回弹；
 *   · 前轨（右）白色卡面、循环滚动、点击翻面；
 *   · 横滑切换三组轨道预设，过渡时有一道波纹扫过。
 */
import './style.css';
import { CARD_CONTENTS, PRESETS } from './data.js';
import { findBestMatch } from './search.js';
import { createLayout, clamp, mod } from './layout.js';
import { Scene } from './scene.js';
import { attachGestures } from './input.js';
import { hapticTick, hapticRelease, hapticReverse, watchTilt } from './effects.js';

const stage = document.querySelector('#stage');
const scene = new Scene(stage);
const searchToggle = document.querySelector('#searchToggle');
const searchInput = document.querySelector('#searchInput');
const statusLabel = document.querySelector('#statusLabel');

const state = {
  layout: null,
  presetIndex: 0,
  curve: PRESETS[0].curve,
  tiltBack: PRESETS[0].tilt,
  tiltFront: -PRESETS[0].tilt * 0.42,
  shift: PRESETS[0].shift,
  backOrder: CARD_CONTENTS.map((_, i) => i).filter((i) => i % 2 === 0),
  frontOrder: CARD_CONTENTS.map((_, i) => i).filter((i) => i % 2 === 1),
  backOffset: 0,
  frontOffset: 0,
  backTarget: 0,
  frontTarget: 0,
  backVelocity: 0,
  frontVelocity: 0,
  backSpring: 0,
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

/* ------------------------------------------------------------------ 度量 */

/** 左轨越界时按 sqrt 压缩溢出量（原生同款处理，避免硬性截断）。 */
function backRenderedOffset() {
  const layout = state.layout;
  if (!layout) return 0;
  const raw = state.backOffset;
  const over = raw < layout.backMin ? layout.backMin - raw : raw > layout.backMax ? raw - layout.backMax : 0;
  if (!over) return raw;
  const compressed = Math.min(Math.sqrt(over * 6), 120 * layout.u);
  return raw < layout.backMin ? layout.backMin - compressed : layout.backMax + compressed;
}

function measure() {
  const vw = stage.clientWidth;
  const vh = stage.clientHeight;
  const layout = createLayout(vw, vh);
  const frontHeight = Math.max(1, state.frontOrder.length * layout.step);
  layout.copies = Math.ceil(vh / frontHeight) + 1;
  layout.backMin = -layout.focusY + layout.cardH / 2;
  layout.backMax =
    (state.backOrder.length - 1) * layout.step - layout.focusY + layout.cardH / 2;
  layout.frontHeight = frontHeight;
  state.layout = layout;

  if (!state.initialized) {
    state.backOffset = state.backTarget = layout.backMin;
    state.frontOffset = state.frontTarget = layout.backMin;
    state.initialized = true;
  }
  scene.setLayout(layout);
  scene.syncOrders(state.backOrder, state.frontOrder);
}

/* ------------------------------------------------------------ 预设与转场 */

function presetValues(preset) {
  const u = state.layout ? state.layout.u : 1;
  return {
    curve: preset.curve,
    tiltBack: preset.tilt,
    tiltFront: -preset.tilt * 0.42,
    shift: preset.shift * u,
  };
}

function setPreset(next) {
  next = clamp(next, 0, PRESETS.length - 1);
  if (next === state.presetIndex || !state.layout) return;
  const to = presetValues(PRESETS[next]);
  state.anim = {
    from: {
      curve: state.curve,
      tiltBack: state.tiltBack,
      tiltFront: state.tiltFront,
      shift: state.shift,
    },
    to,
    start: performance.now(),
    duration: 760,
  };
  state.presetIndex = next;
  hapticReverse();

  // 波纹从焦点位置荡开
  const { padLeft, cardW, gap, focusY } = state.layout;
  const frontLeft = padLeft + cardW + gap;
  scene.startRipple(frontLeft + cardW / 2, focusY, PRESETS[next].curve);
  updateStatus();
}

function updateStatus() {
  if (!statusLabel) return;
  const preset = PRESETS[state.presetIndex];
  statusLabel.textContent = `${String(state.presetIndex + 1).padStart(2, '0')} · ${preset.label}`;
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

  if (onBack) {
    const bounded = clamp(target, state.layout.backMin, state.layout.backMax);
    state.searchMotion = { side: 0, start: state.backOffset, target: bounded, started: performance.now() };
  } else {
    const congruent = nearestCongruent(state.frontOffset, target, state.layout.frontHeight);
    state.searchMotion = { side: 1, start: state.frontOffset, target: congruent, started: performance.now() };
  }
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
    // 原生：青瓷轨（左）不响应翻面
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

function frame(now) {
  const dt = state.lastFrame ? Math.min(40, now - state.lastFrame) : 16.667;
  state.lastFrame = now;
  const fs = dt / 16.667;

  // 预设插值
  if (state.anim) {
    const t = clamp((now - state.anim.start) / state.anim.duration, 0, 1);
    const e = 1 - Math.exp(-7 * t) * Math.cos(10 * t);
    state.curve = state.anim.from.curve + (state.anim.to.curve - state.anim.from.curve) * e;
    state.tiltBack = state.anim.from.tiltBack + (state.anim.to.tiltBack - state.anim.from.tiltBack) * e;
    state.tiltFront =
      state.anim.from.tiltFront + (state.anim.to.tiltFront - state.anim.from.tiltFront) * e;
    state.shift = state.anim.from.shift + (state.anim.to.shift - state.anim.from.shift) * e;
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

  // 左轨越界回弹
  if (state.layout) {
    const bound = clamp(state.backOffset, state.layout.backMin, state.layout.backMax);
    const overflow = bound - state.backOffset;
    if (state.dragging !== 0 && Math.abs(overflow) > 0.5) {
      state.backSpring = (state.backSpring + overflow * 0.12 * fs) * Math.pow(0.72, fs);
      state.backOffset += state.backSpring * fs;
      state.backVelocity = 0;
      if (Math.abs(overflow) < 0.35 && Math.abs(state.backSpring) < 0.35) {
        state.backOffset = bound;
        state.backSpring = 0;
      }
    } else if (state.dragging === 0) {
      state.backSpring = 0;
    }
  }

  scene.stepFlips(fs);
  scene.apply({
    layout: state.layout,
    backOrder: state.backOrder,
    frontOrder: state.frontOrder,
    backOffset: backRenderedOffset(),
    frontOffset: state.frontOffset,
    backShift: state.shift,
    frontShift: state.shift,
    curve: state.curve,
    backTilt: state.tiltBack + state.sensorTilt * 5,
    frontTilt: state.tiltFront + state.sensorTilt * 5,
    backSpeed: state.backVelocity / 55,
    frontSpeed: state.frontVelocity / 55,
    backPointerY: state.backPointerY,
    frontPointerY: state.frontPointerY,
    pressedKey: state.pressedKey,
    highlightIndex: state.highlightIndex,
    highlightUntil: state.highlightUntil,
  });

  state.raf = requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ 启动 */

function resize() {
  measure();
  scene.apply(currentView());
}

function currentView() {
  return {
    layout: state.layout,
    backOrder: state.backOrder,
    frontOrder: state.frontOrder,
    backOffset: backRenderedOffset(),
    frontOffset: state.frontOffset,
    backShift: state.shift,
    frontShift: state.shift,
    curve: state.curve,
    backTilt: state.tiltBack,
    frontTilt: state.tiltFront,
    backSpeed: state.backVelocity / 55,
    frontSpeed: state.frontVelocity / 55,
    backPointerY: state.backPointerY,
    frontPointerY: state.frontPointerY,
    pressedKey: state.pressedKey,
    highlightIndex: state.highlightIndex,
    highlightUntil: state.highlightUntil,
  };
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
window.__three = { state, scene };

measure();
const initial = presetValues(PRESETS[0]);
state.curve = initial.curve;
state.tiltBack = initial.tiltBack;
state.tiltFront = initial.tiltFront;
state.shift = initial.shift;
updateStatus();
scene.apply(currentView());
state.raf = requestAnimationFrame(frame);
