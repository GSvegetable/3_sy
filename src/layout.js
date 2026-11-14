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
  // 手机上 1dp ≈ 1css px；宽屏按平板的比例整体放大（参考视频约 1000dp × 675dp 的画面）。
  const u = vw < 620 ? 1 : clamp(Math.min(vw / 1000, vh / 675), 1, 1.7);

  const cardW = DP.CARD_W * u;
  const cardH = DP.CARD_H * u;
  const step = DP.STEP * u;
  const gap = DP.GAP * u;
  const groupW = cardW * 2 + gap;

  return {
    vw,
    vh,
    u,
    cardW,
    cardH,
    step,
    gap,
    groupW,
    // 与原生一致：固定 58dp 左边距，整组位置由 peak 决定
    padLeft: DP.PAD * u,
    focusY: vh * DP.FOCUS,
    maxDist: Math.max(vh / 2, 1),
  };
}

/**
 * 单张卡片在轨道上的位置。
 * 卡片沿半径 r 的圆弧排布：越靠近焦点越大，超出圆弧两端（|θ| > π）的卡片淡出。
 * 半径 = max(140dp / curve%, |peak|)，与原生一致。
 * arcDir = 1 时弧线向左弯，-1 时向右弯。
 */
export function cardGeometry(layout, params) {
  const { cardH, focusY, maxDist, u } = layout;
  const { baseY, curve, peak = 0, arcDir = 1, speed = 0, pointerY = null } = params;

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

  const curveAmount = curve / 100;
  const straight = curveAmount < 0.01;
  const radius = straight ? Infinity : Math.max((140 * u) / curveAmount, Math.abs(peak));
  const theta = straight ? 0 : s / radius;
  const thetaC = clamp(theta, -Math.PI, Math.PI);
  const dx = straight ? 0 : arcDir * -radius * (1 - Math.cos(thetaC));
  const cy = straight ? center + stretch : focusY + radius * Math.sin(thetaC);

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
