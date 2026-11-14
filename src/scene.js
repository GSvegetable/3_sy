/**
 * 场景层：负责轨道 DOM 的构建、卡片几何的应用与双轨层级命中。
 *
 * 双轨结构（对照原生源码与参考视频）：
 *   后轨（左）= 青瓷玻璃卡面，偶数序号卡片，压在上层；
 *   前轨（右）= 白色卡面，奇数序号卡片，被左轨压住一部分；
 *   两条轨道的每个实体卡片都可独立翻面；
 *   两条轨道都循环滚动；整组放在一个 tilt-layer 里一起旋转（原生同样是整层 rotationY）。
 */
import { CARD_CONTENTS, CAMERA_DP } from './data.js';
import { cardGeometry, clamp } from './layout.js';

export class Scene {
  constructor(stage) {
    this.stage = stage;
    this.railBack = stage.querySelector('#railBack');
    this.railFront = stage.querySelector('#railFront');
    this.flips = new Map();
    this.cards = [];

    // 整组倾斜层：两条轨道一起旋转，背景幽灵字不参与
    this.layer = document.createElement('div');
    this.layer.className = 'tilt-layer';
    stage.insertBefore(this.layer, this.railBack);
    this.layer.append(this.railBack, this.railFront);
  }

  /** 两条轨道的左边界：后轨（青瓷）在左，前轨（白）叠在右侧（gap 为负，两轨交叠）。 */
  railLefts(layout = this.layout) {
    const shift = this.viewTrackShift || 0;
    const spacing = layout.cardW + layout.gap;
    return {
      back: layout.padLeft + spacing * shift,
      front: layout.padLeft + spacing * (1 - shift),
    };
  }

  /** 倾斜层对 x 坐标的影响（rotateY + perspective），供命中判定使用。 */
  projectX(x, view) {
    if (!view.tiltDeg) return x;
    const ox = view.tiltOriginX * view.layout.vw;
    const th = (view.tiltDeg * Math.PI) / 180;
    const dx = x - ox;
    const z = -dx * Math.sin(th);
    const d = CAMERA_DP * view.layout.u;
    return ox + (dx * Math.cos(th) * d) / Math.max(1, d - z);
  }

  /** 依据视口更新轨道容器的尺寸与位置。 */
  setLayout(layout) {
    this.layout = layout;
    const { cardW, cardH } = layout;
    const lefts = this.railLefts(layout);
    const place = (el, left) => {
      el.style.left = `${left}px`;
      el.style.width = `${cardW}px`;
      el.style.height = `${layout.vh}px`;
    };
    place(this.railFront, lefts.front);
    place(this.railBack, lefts.back);
    this.stage.style.setProperty('--card-w', `${cardW}px`);
    this.stage.style.setProperty('--card-h', `${cardH}px`);
    this.stage.style.setProperty('--card-radius', `${12 * layout.u}px`);
  }

  /** 循环轨道需要的副本数：副本总高度要盖住整个视口。 */
  copiesFor(count) {
    if (!this.layout) return 3;
    const height = Math.max(1, count * this.layout.step);
    return Math.ceil(this.layout.vh / height) + 1;
  }

  /**
   * 依据两条轨道的卡片顺序重建卡片元素。
   * 顺序变化（长按抽卡）或视口高度变化后调用，实体卡片翻面状态按轨道、副本与序号保留。
   */
  syncOrders(backOrder, frontOrder) {
    const copiesBack = this.copiesFor(backOrder.length);
    const copiesFront = this.copiesFor(frontOrder.length);
    const backKey = `${backOrder.join(',')}|${copiesBack}`;
    const frontKey = `${frontOrder.join(',')}|${copiesFront}`;
    if (backKey === this.backKey && frontKey === this.frontKey) return;
    this.backKey = backKey;
    this.frontKey = frontKey;

    // 顺序变化时记录旧卡片的屏幕位置，让空位由相邻卡片平滑补上。
    const previous = new Map(this.cards.map((rec) => [
      `${rec.side}:${rec.copy}:${rec.index}`,
      { transform: rec.el.style.transform },
    ]));
    this.railBack.innerHTML = '';
    this.railFront.innerHTML = '';
    this.cards = [];

    // 两条轨道都循环滚动，各自铺满副本
    const build = (order, side, rail, copies) => {
      for (let copy = -copies; copy <= copies; copy += 1) {
        order.forEach((index, row) => {
          const rec = this.createCard(index, side, copy, row);
          const old = previous.get(`${side}:${copy}:${index}`);
          if (old?.transform) {
            rec.el.style.transform = old.transform;
            rec.el.classList.add('is-reflowing');
          }
          rail.appendChild(rec.el);
          if (rec.el.classList.contains('is-reflowing')) void rec.el.offsetWidth;
          this.cards.push(rec);
        });
      }
    };
    build(backOrder, 'back', this.railBack, copiesBack);
    build(frontOrder, 'front', this.railFront, copiesFront);
    window.setTimeout(() => {
      this.cards.forEach((rec) => rec.el.classList.remove('is-reflowing'));
    }, 430);
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
    return { el, index, side, copy, row, card, flipKey: `${side}:${copy}:${index}` };
  }

  cardMarkup(card, side) {
    const body = `
      <span class="eyebrow">AI · ${card.tag}</span>
      <div class="copy">
        <h2>${card.title}</h2>
        <p>${card.subtitle}</p>
      </div>`;
    const frontClass = side === 'back' ? 'front porcelain' : 'front';
    const backClass = side === 'back' ? 'back porcelain-back' : 'back';
    return `<div class="inner">
      <div class="face ${frontClass}"><div class="cast"></div>${body}</div>
      <div class="face ${backClass}"><div class="cast"></div><span class="back-mark">${card.tag}</span></div>
    </div>`;
  }

  /** 翻转状态：0 → 正面，180 → 背面。 */
  flipState(index) {
    if (!this.flips.has(index)) {
      this.flips.set(index, { angle: 0, velocity: 0, elev: 0, elevVelocity: 0, target: 0 });
    }
    return this.flips.get(index);
  }

  toggleFlip(index, side, copy) {
    const state = this.flipState(`${side === 0 ? 'back' : 'front'}:${copy}:${index}`);
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

  /**
   * 把当前状态落到 DOM 上。
   * view: { layout, backOrder, frontOrder, backOffset, frontOffset, backShift,
   *         frontShift, curve, tiltDeg, tiltOriginX, backSpeed, frontSpeed,
   *         backPointerY, frontPointerY, highlightIndex, highlightUntil }
   */
  apply(view) {
    const { layout } = view;
    if (!layout) return;

    const backHeight = Math.max(1, view.backOrder.length * layout.step);
    const frontHeight = Math.max(1, view.frontOrder.length * layout.step);
    const backWrapped = ((view.backOffset % backHeight) + backHeight) % backHeight;
    const frontWrapped = ((view.frontOffset % frontHeight) + frontHeight) % frontHeight;
    const backShift = view.backShift || 0;
    const frontShift = view.frontShift || 0;

    // 轨道整体位移（peak）；倾角作用在整层上
    this.viewTrackShift = Number.isFinite(view.trackShift) ? view.trackShift : 0;
    const lefts = this.railLefts(layout);
    this.railBack.style.left = `${lefts.back}px`;
    this.railFront.style.left = `${lefts.front}px`;
    this.railBack.style.transform = `translate3d(${backShift}px, 0, 0)`;
    this.railFront.style.transform = `translate3d(${frontShift}px, ${view.trackWhipY || 0}px, 0)`;
    this.layer.style.transformOrigin = `${(view.tiltOriginX * 100).toFixed(2)}% 50%`;
    this.layer.style.transform = view.tiltDeg
      ? `perspective(${CAMERA_DP * layout.u}px) rotateY(${view.tiltDeg}deg)`
      : 'none';


    for (const rec of this.cards) {
      const isBack = rec.side === 'back';
      const order = isBack ? view.backOrder : view.frontOrder;
      const row = order.indexOf(rec.index);
      const el = rec.el;
      if (row < 0) {
        el.style.visibility = 'hidden';
        rec.hidden = true;
        rec.sx = NaN;
        continue;
      }

      const height = isBack ? backHeight : frontHeight;
      const wrapped = isBack ? backWrapped : frontWrapped;
      const baseY = row * layout.step - wrapped + rec.copy * height;

      const g = cardGeometry(layout, {
        baseY,
        curve: view.curve,
        peak: isBack ? backShift : frontShift,
        // 两条轨道同向弯曲，保持恒定叠压关系（与原生单弧心一致）
        arcDir: view.arcDirection || 1,
        speed: isBack ? view.backSpeed : view.frontSpeed,
        pointerY: isBack ? view.backPointerY : view.frontPointerY,
      });

      // 视口外的副本直接跳过（按线性位置裁剪，与原生一致，避免弧线末端甩出屏幕）
      const cull = layout.cardH * 1.5;
      if (baseY > layout.vh + cull || baseY + layout.cardH < -cull) {
        el.style.visibility = 'hidden';
        rec.hidden = true;
        rec.sx = NaN;
        continue;
      }
      el.style.visibility = 'visible';
      rec.hidden = false;

      const state = this.flipState(rec.flipKey);
      const angle = state.angle;
      const elev = state.elev;
      const arch = Math.sin(clamp(angle / 180, 0, 1) * Math.PI) * 12 * layout.u;
      const lift = elev * 26 * layout.u + arch;
      const highlight =
        view.highlightIndex === rec.index && performance.now() < view.highlightUntil ? 1 : 0;

      const x = g.dx;
      const y = g.y - lift - highlight * 8 * layout.u;
      // 记录屏幕中心，供命中判定使用：要计入轨道整体位移，
      // 且卡片被弧线推开后基准坐标不再准确。
      const trackY = !isBack ? (view.trackWhipY || 0) : 0;
      const originX = (isBack ? lefts.back + backShift : lefts.front + frontShift) + x + layout.cardW / 2;
      const originY = y + trackY + layout.cardH / 2;
      rec.sx = this.projectX(originX, view);
      rec.sy = originY;
      const scale = g.scale * (1 + elev * 0.12) * (isBack ? 1.06 : 0.96);

      el.style.transform = `translate3d(${x}px, ${y + trackY}px, 0) scale(${scale})`;
      el.style.setProperty('--card-alpha', String(g.alpha));
      el.style.zIndex = String(Math.round(baseZ(rec, g.smooth) + elev * 100 + highlight * 1000));

      const inner = el.firstElementChild;
      if (inner) {
        inner.style.transform = `perspective(${1920 * layout.u}px) rotateY(-8deg) rotateX(${angle}deg)`;
      }
      el.classList.toggle('is-highlighted', highlight === 1);

    }

  }

  /**
   * 按实际渲染位置判断指针落在哪条轨道：0 = 后轨（左），1 = 前轨（右），-1 = 都不在。
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
    const halfCard = this.layout.cardW * 0.52;
    // 两轨实际重叠的区域由视觉上层的青瓷大轨优先接管，不再按“离哪个中心更近”误判给底层小轨。
    if (back <= halfCard && front <= halfCard) return 0;
    const nearest = Math.min(back, front);
    if (!Number.isFinite(nearest) || nearest > this.layout.cardW * 1.3) return -1;
    return back <= front ? 0 : 1;
  }

}

/** 层级：轨道内按距离焦点的远近排序，上方的卡片压住下方的卡片，副本越靠前越靠下。 */
function baseZ(rec, smooth) {
  return -rec.copy * 1000 + (100 - rec.row) * 100 + smooth * 20;
}
