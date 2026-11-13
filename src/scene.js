/**
 * 场景层：负责轨道 DOM 的构建、卡片几何的应用，以及预设切换时的波纹转场。
 *
 * 双轨结构与原生一致：
 *   后轨（左）= 青瓷卡面，不支持翻面，有限滚动 + 越界回弹；
 *   前轨（右）= 白色卡面，点击翻面，循环滚动。
 */
import { CARD_CONTENTS } from './data.js';
import { cardGeometry, clamp } from './layout.js';

const RIPPLE_DURATION = 1300;
const RIPPLE_SPREAD = 1.35;

export class Scene {
  constructor(stage) {
    this.stage = stage;
    this.railBack = stage.querySelector('#railBack');
    this.railFront = stage.querySelector('#railFront');
    this.rippleRing = stage.querySelector('#rippleRing');
    this.flips = new Map();
    this.cards = [];
    this.ripple = null;
  }

  /** 依据视口更新轨道容器的尺寸与位置。 */
  setLayout(layout) {
    this.layout = layout;
    const { cardW, cardH, padLeft } = layout;
    const place = (el, left) => {
      el.style.left = `${left}px`;
      el.style.width = `${cardW}px`;
      el.style.height = `${layout.vh}px`;
    };
    place(this.railBack, padLeft);
    place(this.railFront, padLeft + cardW + layout.gap);
    this.stage.style.setProperty('--card-w', `${cardW}px`);
    this.stage.style.setProperty('--card-h', `${cardH}px`);
    this.stage.style.setProperty('--card-radius', `${12 * layout.u}px`);
  }

  /**
   * 依据两条轨道的卡片顺序重建卡片元素。
   * 顺序变化（长按抽卡）后调用，翻面状态按卡片序号保留。
   */
  syncOrders(backOrder, frontOrder) {
    const backKey = backOrder.join(',');
    const frontKey = frontOrder.join(',');
    if (backKey === this.backKey && frontKey === this.frontKey) return;
    this.backKey = backKey;
    this.frontKey = frontKey;

    this.railBack.innerHTML = '';
    this.railFront.innerHTML = '';
    this.cards = [];

    backOrder.forEach((index, row) => {
      const rec = this.createCard(index, 'back', 0, row);
      this.railBack.appendChild(rec.el);
      this.cards.push(rec);
    });

    // 前轨需要多份副本才能循环滚动
    const copies = this.layout ? this.layout.copies : 3;
    for (let copy = -copies; copy <= copies; copy += 1) {
      frontOrder.forEach((index, row) => {
        const rec = this.createCard(index, 'front', copy, row);
        this.railFront.appendChild(rec.el);
        this.cards.push(rec);
      });
    }
  }

  createCard(index, side, copy, row) {
    const card = CARD_CONTENTS[index];
    const el = document.createElement('article');
    el.className = `card ${side === 'back' ? 'porcelain' : 'normal'}`;
    el.dataset.i = String(index);
    el.dataset.copy = String(copy);
    el.dataset.side = side;
    el.dataset.row = String(row);
    el.innerHTML = this.cardMarkup(card, side);
    return { el, index, side, copy, row, card };
  }

  cardMarkup(card, side) {
    const body = `
      <span class="eyebrow">AI · ${card.tag}</span>
      <div class="copy">
        <h2>${card.title}</h2>
        <p>${card.subtitle}</p>
      </div>`;
    if (side === 'back') {
      return `<div class="inner"><div class="face porcelain"><div class="cast"></div>${body}</div></div>`;
    }
    return `<div class="inner">
      <div class="face front"><div class="cast"></div>${body}</div>
      <div class="face back"><div class="cast"></div><span class="back-mark">${card.tag}</span></div>
    </div>`;
  }

  /**
   * 长按抽出的卡片：脱离轨道，跟随手指，落点不在任何轨道上时悬浮在场景里。
   */
  addFreeCard(index, rect, sourceEl) {
    const el = document.createElement('article');
    el.className = 'card normal free';
    el.dataset.i = String(index);
    el.dataset.copy = '0';
    el.dataset.side = 'front';
    el.innerHTML = this.cardMarkup(CARD_CONTENTS[index], 'front');

    // 继承原卡的缩放，避免抽出瞬间的尺寸跳变
    let scale = 1;
    try {
      const matrix = new DOMMatrixReadOnly(window.getComputedStyle(sourceEl).transform);
      if (matrix && Number.isFinite(matrix.a) && matrix.a > 0) scale = matrix.a;
    } catch {
      /* 浏览器不支持时保持 1 */
    }

    // 舞台带 perspective，是 fixed 元素的包含块，所以换算成舞台内坐标
    const stageRect = this.stage.getBoundingClientRect();
    el.style.left = `${rect.left - stageRect.left}px`;
    el.style.top = `${rect.top - stageRect.top}px`;
    el.style.transform = `scale(${scale})`;
    this.stage.appendChild(el);
    return { el, index, scale };
  }

  moveFreeCard(rec, dx, dy) {
    rec.el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${rec.scale})`;
  }

  removeFreeCard(rec) {
    rec.el.remove();
  }

  /** 翻转状态：0 → 正面，180 → 背面。 */
  flipState(index) {
    if (!this.flips.has(index)) {
      this.flips.set(index, { angle: 0, velocity: 0, elev: 0, elevVelocity: 0, target: 0 });
    }
    return this.flips.get(index);
  }

  toggleFlip(index) {
    const state = this.flipState(index);
    state.target = state.target === 180 ? 0 : 180;
    return state.target === 180;
  }

  /** 推进所有翻面弹簧。 */
  stepFlips(dtScale) {
    for (const state of this.flips.values()) {
      const fs = Math.max(0.1, dtScale);
      state.velocity = (state.velocity + (state.target - state.angle) * 0.035 * fs) * Math.pow(0.82, fs);
      state.angle += state.velocity * fs;
      state.elevVelocity =
        (state.elevVelocity + (state.target / 180 - state.elev) * 0.055 * fs) * Math.pow(0.78, fs);
      state.elev = clamp(state.elev + state.elevVelocity * fs, 0, 1);
      if (Math.abs(state.target - state.angle) < 0.08 && Math.abs(state.velocity) < 0.08) {
        state.angle = state.target;
        state.velocity = 0;
      }
      if (Math.abs(state.target / 180 - state.elev) < 0.001 && Math.abs(state.elevVelocity) < 0.001) {
        state.elev = state.target / 180;
        state.elevVelocity = 0;
      }
    }
  }

  /** 开始一次波纹转场（预设切换时调用）。 */
  startRipple(cx, cy, direction) {
    this.ripple = { start: performance.now(), cx, cy, direction };
    if (this.rippleRing) {
      this.rippleRing.style.left = `${cx}px`;
      this.rippleRing.style.top = `${cy}px`;
    }
  }

  /**
   * 把当前状态落到 DOM 上。
   * view: { layout, backOrder, frontOrder, backOffset, frontOffset, backShift,
   *         frontShift, curve, backTilt, frontTilt, backSpeed, frontSpeed,
   *         backPointerY, frontPointerY, pressedKey, highlightIndex, highlightUntil }
   */
  apply(view) {
    const { layout } = view;
    if (!layout) return;

    const backHeight = Math.max(1, view.backOrder.length * layout.step);
    const frontHeight = Math.max(1, view.frontOrder.length * layout.step);
    const backShift = view.backShift || 0;
    const frontShift = view.frontShift || 0;

    // 轨道整体位移 + 倾角
    this.railBack.style.transform = `translate3d(${backShift}px, 0, 0) rotateY(${view.backTilt}deg)`;
    this.railFront.style.transform = `translate3d(${frontShift}px, 0, 0) rotateY(${view.frontTilt}deg)`;

    const rippleState = this.rippleState();
    const railLeft = layout.padLeft;
    const frontLeft = layout.padLeft + layout.cardW + layout.gap;

    for (const rec of this.cards) {
      const isBack = rec.side === 'back';
      const order = isBack ? view.backOrder : view.frontOrder;
      const row = order.indexOf(rec.index);
      const el = rec.el;
      if (row < 0) {
        el.style.opacity = '0';
        continue;
      }

      let baseY;
      if (isBack) {
        baseY = row * layout.step - view.backOffset;
      } else {
        const wrapped = ((view.frontOffset % frontHeight) + frontHeight) % frontHeight;
        baseY = row * layout.step - wrapped + rec.copy * frontHeight;
      }

      const g = cardGeometry(layout, {
        baseY,
        curve: view.curve,
        // 两条轨道同向弯曲，保持恒定叠压关系（与原生单弧心一致）
        arcDir: 1,
        speed: isBack ? view.backSpeed : view.frontSpeed,
        pointerY: isBack ? view.backPointerY : view.frontPointerY,
      });

      // 视口外的副本直接跳过（按线性位置裁剪，与原生一致，避免弧线末端甩出屏幕）
      const cull = layout.cardH * 1.5;
      if (baseY > layout.vh + cull || baseY + layout.cardH < -cull) {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        rec.hidden = true;
        rec.sx = NaN;
        continue;
      }
      el.style.visibility = 'visible';
      rec.hidden = false;

      const state = isBack ? null : this.flipState(rec.index);
      const angle = state ? state.angle : 0;
      const elev = state ? state.elev : 0;
      const arch = Math.sin(clamp(angle / 180, 0, 1) * Math.PI) * 12 * layout.u;
      const lift = elev * 26 * layout.u + arch;

      const pressed = view.pressedKey === `${rec.index}_${rec.copy}`;
      const pressScale = pressed ? 0.97 : 1;
      const highlight =
        view.highlightIndex === rec.index && performance.now() < view.highlightUntil ? 1 : 0;

      const x = g.dx;
      const y = g.y - lift - highlight * 8 * layout.u;
      // 记录屏幕中心，供命中判定使用（卡片被弧线推开时基准坐标不再准确）
      rec.sx = (isBack ? railLeft : frontLeft) + x + layout.cardW / 2;
      rec.sy = y + layout.cardH / 2;
      const scale = g.scale * (1 + elev * 0.12) * pressScale * (isBack ? 1.04 : 1);

      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      el.style.opacity = String(g.alpha * (highlight ? 1 : 1));
      el.style.zIndex = String(Math.round(baseZ(rec, g.smooth) + elev * 100 + highlight * 1000));

      const inner = el.firstElementChild;
      if (inner) {
        inner.style.transform = isBack ? '' : `rotateX(${angle}deg) rotateY(-5deg)`;
      }
      el.classList.toggle('is-highlighted', highlight === 1);

      // 波纹：光带扫过卡片时，靠近波前的部分提亮
      if (rippleState) {
        const originX = (isBack ? railLeft : frontLeft) + x + layout.cardW / 2;
        const originY = y + layout.cardH / 2;
        const dist = Math.hypot(originX - rippleState.cx, originY - rippleState.cy);
        const band = Math.exp(-(((dist - rippleState.radius) / (70 * layout.u)) ** 2));
        const glow = band * rippleState.strength;
        el.style.setProperty('--glow', glow.toFixed(3));
        el.style.setProperty('--glow-x', `${(rippleState.cx - originX + layout.cardW / 2).toFixed(1)}px`);
        el.style.setProperty('--glow-y', `${(rippleState.cy - originY + layout.cardH / 2).toFixed(1)}px`);
      } else if (rec.glowApplied) {
        el.style.setProperty('--glow', '0');
        rec.glowApplied = false;
      }
      if (rippleState) rec.glowApplied = true;
    }

    if (rippleState && this.rippleRing) {
      const k = rippleState.radius / 26;
      this.rippleRing.style.transform = `translate(-50%, -50%) scale(${k})`;
      this.rippleRing.style.opacity = String(rippleState.ringAlpha);
    } else if (this.rippleRing) {
      this.rippleRing.style.opacity = '0';
    }
  }

  /**
   * 按实际渲染位置判断指针落在哪条轨道：0 = 后轨，1 = 前轨，-1 = 都不在。
   */
  pickSide(clientX) {
    let back = Infinity;
    let front = Infinity;
    for (const rec of this.cards) {
      if (!Number.isFinite(rec.sx) || rec.hidden) continue;
      const distance = Math.abs(clientX - rec.sx);
      if (rec.side === 'back') back = Math.min(back, distance);
      else front = Math.min(front, distance);
    }
    const nearest = Math.min(back, front);
    if (!Number.isFinite(nearest) || nearest > this.layout.cardW * 1.3) return -1;
    return back <= front ? 0 : 1;
  }

  rippleState() {
    if (!this.ripple) return null;
    const elapsed = performance.now() - this.ripple.start;
    const t = clamp(elapsed / RIPPLE_DURATION, 0, 1);
    if (t >= 1) {
      this.ripple = null;
      return null;
    }
    const layout = this.layout;
    const spread = Math.max(layout.vw, layout.vh) * RIPPLE_SPREAD;
    const ease = 1 - (1 - t) * (1 - t);
    const radius = 40 * layout.u + this.ripple.direction * 0 + spread * ease;
    const strength =
      t < 0.08 ? t / 0.08 : t < 0.7 ? 1 : clamp((1 - t) / 0.3, 0, 1);
    return {
      cx: this.ripple.cx,
      cy: this.ripple.cy,
      radius,
      strength,
      ringAlpha: strength * 0.85,
    };
  }
}

/** 层级：轨道内按距离焦点的远近排序，副本越靠前越靠下。 */
function baseZ(rec, smooth) {
  if (rec.side === 'back') {
    return 10000 + (100 - rec.row) * 100 + smooth * 20;
  }
  return (-rec.copy) * 1000 + (100 - rec.row) * 100 + smooth * 20;
}
