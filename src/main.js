/**
 * 3_sy — 双轨卡片空间（Web / Capacitor 版）
 *
 * 按参考视频实现：
 *   · 左轨青瓷磨砂卡（偶数序号，不翻面，压在上层），右轨白卡（奇数序号，点击翻面），两轨都循环滚动；
 *   · 三个状态（底部三个小点）的 peak / curve / tilt 与原生预设一致，
 *     横滑切换，三个量使用统一的柔和缓动，保持整组运动一致；
 *   · 倾斜作用在整组上：rotateY = 读数 × 0.48°，旋转原点随读数左右移动；
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
  transition: null,
  // 三个状态量：peak 单位 dp，tilt 为原生读数
  peak: PRESETS[INITIAL_PRESET].peak,
  peakV: 0,
  curve: PRESETS[INITIAL_PRESET].curve,
  curveV: 0,
  tilt: PRESETS[INITIAL_PRESET].tilt,
  tiltV: 0,
  trackShift: 0,
  trackShiftV: 0,
  trackWhipY: 0,
  arcDirection: 1,
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

/* ------------------------------------------------------- 状态切换：仅通过横向甩动 */

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

  const target = PRESETS[next];
  // 从当前画面与当前速度接续目标，避免切换时重置运动。
  const enteringRight = next === 2 && state.presetIndex !== 2;
  const leavingRight = state.presetIndex === 2 && next !== 2;
  state.transition = { to: target };
  // 第三个预设使用双轨交错甩位，并同步反转弧向；两轨全程保持可见。
  if (enteringRight || leavingRight) {
    state.trackMotion = { target: enteringRight ? 1 : 0 };
  }
  state.presetIndex = next;
  hapticReverse();

  // 状态切换只保留轨道本身的空间运动，不再叠加光圈或波纹。
  updateStatus();
}

/**
 * 柔和阻尼动力学：降低整体加速度，并为透视倾斜留出更长的收束时间。
 * 半隐式积分并限制子步长，避免高刷新率/掉帧时的数值抖动。
 */
function springStep(value, velocity, target, deltaSeconds, stiffness = 170, damping = 25) {
  let remaining = Math.max(0, deltaSeconds);
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120);
    const acceleration = (target - value) * stiffness - velocity * damping;
    velocity += acceleration * dt;
    value += velocity * dt;
    remaining -= dt;
  }
  return { value, velocity };
}

function updateStatus() {
  const preset = PRESETS[state.presetIndex];
  if (statusLabel) {
    statusLabel.textContent = `${String(state.presetIndex + 1).padStart(2, '0')} · ${preset.label}`;
  }
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
  onTap: (index, side, copy) => {
    const flipped = scene.toggleFlip(index, side, copy);
    hapticTick(0.65);
    if (flipped) {
      state.highlightIndex = index;
      state.highlightUntil = performance.now() + 900;
    }
  },
  onPress: (key, pressed) => {
    state.pressedKey = pressed ? key : null;
  },
  onExtractStart: (index, el, side) => {
    const rect = el.getBoundingClientRect();
    // 先从仍在轨道中的原卡复制当前视觉状态，再移除原位置。
    state.free = scene.addFreeCard(index, rect, el, side, Number(el.dataset.copy));
    const order = side === 0 ? state.backOrder : state.frontOrder;
    const at = order.indexOf(index);
    if (at >= 0) order.splice(at, 1);
    // 将剩余轨道整体居中半个卡距：空位上下两侧的卡片各移动半格，向中间合拢。
    const halfStep = state.layout.step * 0.5;
    if (side === 0) {
      state.backOffset -= halfStep;
      state.backTarget -= halfStep;
      state.prevBack -= halfStep;
    } else {
      state.frontOffset -= halfStep;
      state.frontTarget -= halfStep;
      state.prevFront -= halfStep;
    }
    measure();
    hapticTick(1);
  },
  onExtractMove: (dx, dy) => {
    if (state.free) scene.moveFreeCard(state.free, dx, dy);
  },
  onExtractEnd: (clientX) => {
    if (!state.free) return;
    const destination = sideAt(clientX);
    const index = state.free.index;
    const side = destination < 0 ? state.free.side : destination;
    scene.removeFreeCard(state.free);
    state.free = null;
    if (side === 0) {
      state.backOrder.push(index);
    } else {
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
    trackShift: state.trackShift || 0,
    trackWhipY: state.trackWhipY || 0,
    arcDirection: state.arcDirection || 1,
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

  // 状态参数使用连续弹簧：快速连续横滑时继承上一段运动速度。
  if (state.transition) {
    const target = state.transition.to;
    const seconds = dt / 1000;
    let p = springStep(state.peak, state.peakV, target.peak, seconds, 58, 16);
    let c = springStep(state.curve, state.curveV, target.curve, seconds, 54, 15);
    let r = springStep(state.tilt, state.tiltV, target.tilt, seconds, 34, 12.5);
    state.peak = p.value; state.peakV = p.velocity;
    state.curve = c.value; state.curveV = c.velocity;
    state.tilt = r.value; state.tiltV = r.velocity;

    if (
      Math.abs(target.peak - state.peak) < 0.08 && Math.abs(state.peakV) < 0.45 &&
      Math.abs(target.curve - state.curve) < 0.015 && Math.abs(state.curveV) < 0.08 &&
      Math.abs(target.tilt - state.tilt) < 0.02 && Math.abs(state.tiltV) < 0.08
    ) {
      state.peak = target.peak; state.peakV = 0;
      state.curve = target.curve; state.curveV = 0;
      state.tilt = target.tilt; state.tiltV = 0;
      state.transition = null;
    }
  }

  // 第三个状态的双轨换位由同一弹簧驱动；弧线方向跟随轨道位置，
  // 纵向甩动直接取换位速度，因此起落与横向运动自然关联。
  if (state.trackMotion) {
    const motion = springStep(state.trackShift, state.trackShiftV, state.trackMotion.target, dt / 1000, 48, 14);
    state.trackShift = motion.value;
    state.trackShiftV = motion.velocity;
    state.arcDirection = 1 - 2 * state.trackShift;
    const whipLimit = 12 * state.layout.u;
    state.trackWhipY = clamp(-state.trackShiftV * 1.25 * state.layout.u, -whipLimit, whipLimit);

    if (Math.abs(state.trackMotion.target - state.trackShift) < 0.001 && Math.abs(state.trackShiftV) < 0.006) {
      state.trackShift = state.trackMotion.target;
      state.trackShiftV = 0;
      state.arcDirection = 1 - 2 * state.trackShift;
      state.trackWhipY = 0;
      state.trackMotion = null;
    }
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
scene.apply(buildView());
state.raf = requestAnimationFrame(frame);
