/**
 * 轨道几何。
 * 尺寸基准来自 Android 端 `BlackWorkspaceScreen.kt`：
 *   卡片 150×132dp、堆叠步距 72dp、轨道间距 -24dp、左边距 58dp、焦点 42% 屏高。
 */

/** 原生尺寸基准（dp） */
export const DP = {
  CARD_W: 150,
  CARD_H: 132,
  STEP: 72,
  GAP: -24,
  PAD: 58,
  FOCUS: 0.42,
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mod = (v, m) => ((v % m) + m) % m;

/** 依据视口计算整套轨道度量。 */
export function createLayout(vw, vh) {
  // 手机上 1dp ≈ 1css px；宽屏整体放大，避免卡片显得零碎。
  const u = vw < 620 ? 1 : clamp(Math.min(vw / 1100, vh / 780), 1, 1.35);

  const cardW = DP.CARD_W * u;
  const cardH = DP.CARD_H * u;
  const step = DP.STEP * u;
  const gap = DP.GAP * u;
  const groupW = cardW * 2 + gap;

  // 宽屏时把双轨组放在画面偏左的位置，给右侧的排版留出呼吸空间。
  const padLeft = Math.max(DP.PAD * u, (vw - groupW) / 2 - vw * 0.05);

  return {
    vw,
    vh,
    u,
    cardW,
    cardH,
    step,
    gap,
    groupW,
    padLeft,
    focusY: vh * DP.FOCUS,
    maxDist: Math.max(vh / 2, 1),
  };
}

/**
 * 单张卡片在轨道上的位置。
 * 卡片沿半径 r 的圆弧排布：越靠近焦点越大，超出圆弧两端（|θ| > π）的卡片淡出。
 * arcDir = 1 时弧线向左弯，-1 时向右弯。
 */
export function cardGeometry(layout, params) {
  const { cardH, focusY, maxDist, u } = layout;
  const { baseY, curve, arcDir = 1, speed = 0, pointerY = null } = params;

  const center = baseY + cardH / 2;
  const s0 = center - focusY;
  const norm = clamp(Math.abs(s0) / maxDist, 0, 1);
  const smooth = Math.cos((norm * Math.PI) / 2);
  const boost = 0.12 * smooth * smooth * smooth * smooth;

  // 拖拽时以指针为轴做拉伸位移（原生：speed × 70dp）
  const pointer = Number.isFinite(pointerY) ? pointerY : center;
  const stretchD = clamp((center - pointer) / maxDist, -1, 1);
  const stretch = speed * 70 * u * stretchD * Math.abs(stretchD);
  const s = s0 + stretch;

  const radius = curve < 1 ? Infinity : Math.max(260 * u, (140 * u) / (curve / 100));
  const theta = radius === Infinity ? 0 : s / radius;
  const thetaC = clamp(theta, -Math.PI, Math.PI);
  const dx = radius === Infinity ? 0 : arcDir * -radius * (1 - Math.cos(thetaC));
  const cy = radius === Infinity ? center + stretch : focusY + radius * Math.sin(thetaC);

  const out = Math.max(0, Math.abs(theta) - Math.PI);
  const alpha = out < 0.001 ? 1 : clamp(1 - out * 2, 0, 1);

  return {
    dx,
    y: cy - cardH / 2,
    scale: 0.75 + 0.32 * smooth + boost,
    alpha,
    smooth,
  };
}
