/**
 * 手势层。
 * 轨道拖拽 / 横滑切换预设由舞台统一接管（与原生根部手势一致），
 * 卡片的点击翻面与长按抽出由轨道容器单独处理。
 */

const SWIPE_CARD_RATIO = 1.5; // 横滑切换阈值 = 1.5 倍卡片宽
const LONG_PRESS_MS = 400;
const TAP_MAX_MS = 500;

export function attachGestures(stage, handlers) {
  const { cardWidth, getSide, isBlocked } = handlers;

  let gesture = null;
  let hold = null;

  const touchSlop = () => stage.getBoundingClientRect().width * 0.012 || 8;

  // ---------- 舞台：轨道拖拽 + 横滑切换 ----------
  const onDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (isBlocked()) return;
    gesture = {
      id: event.pointerId,
      side: getSide(event.clientX),
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: performance.now(),
      switched: false,
      dragging: false,
    };
  };

  const onMove = (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (isBlocked()) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (!gesture.switched && Math.abs(dx) > cardWidth() * SWIPE_CARD_RATIO && Math.abs(dx) > Math.abs(dy) * 1.5) {
      gesture.switched = true;
      handlers.onPresetStep(dx > 0 ? 1 : -1);
      event.preventDefault();
      return;
    }
    if (gesture.side < 0) return;
    if (Math.abs(dy) <= Math.abs(dx) * 1.5) return;

    if (!gesture.dragging && Math.abs(dy) > touchSlop()) {
      gesture.dragging = true;
      handlers.onDragStart(gesture.side);
    }
    if (gesture.dragging) {
      const now = performance.now();
      const delta = event.clientY - gesture.lastY;
      const dt = Math.max(8, now - gesture.lastTime);
      handlers.onDragMove(gesture.side, delta, dt, event.clientY);
      gesture.lastY = event.clientY;
      gesture.lastTime = now;
      event.preventDefault();
    }
  };

  const onUp = (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (gesture.dragging) handlers.onDragEnd(gesture.side);
    gesture = null;
  };

  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);

  // ---------- 卡片：点击翻面 + 长按抽出 ----------
  const onCardDown = (event) => {
    const el = event.target.closest && event.target.closest('.card');
    if (!el || el.classList.contains('free')) return;
    if (isBlocked()) return;
    const index = Number(el.dataset.i);
    const side = el.dataset.side === 'back' ? 0 : 1;
    hold = {
      id: event.pointerId,
      el,
      index,
      side,
      key: `${el.dataset.i}_${el.dataset.copy}`,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      moved: false,
      extracted: false,
    };
    handlers.onPress(hold.key, true);
    hold.timer = window.setTimeout(() => {
      if (!hold || hold.moved || hold.extracted) return;
      hold.extracted = true;
      handlers.onExtractStart(hold.index, hold.el);
    }, LONG_PRESS_MS);
  };

  const onCardMove = (event) => {
    if (!hold || hold.id !== event.pointerId) return;
    const dx = event.clientX - hold.startX;
    const dy = event.clientY - hold.startY;
    if (!hold.moved && Math.hypot(dx, dy) > touchSlop()) {
      hold.moved = true;
      window.clearTimeout(hold.timer);
      handlers.onPress(hold.key, false);
    }
    if (hold.extracted) {
      handlers.onExtractMove(event.clientX - hold.startX, event.clientY - hold.startY);
      event.preventDefault();
    }
  };

  const onCardUp = (event) => {
    if (!hold || hold.id !== event.pointerId) return;
    const elapsed = performance.now() - hold.startTime;
    window.clearTimeout(hold.timer);
    handlers.onPress(hold.key, false);

    if (hold.extracted) {
      handlers.onExtractEnd(event.clientX, event.clientY);
    } else if (!hold.moved && elapsed < TAP_MAX_MS) {
      handlers.onTap(hold.index, hold.side);
    }
    hold = null;
  };

  const onWindowMove = (event) => onCardMove(event);
  const onWindowUp = (event) => onCardUp(event);

  // 卡片手势挂在舞台上（事件委托），指针移动/抬起挂在 window 上，避免拖出卡片后丢事件
  stage.addEventListener('pointerdown', onCardDown);
  window.addEventListener('pointermove', onWindowMove, { passive: false });
  window.addEventListener('pointerup', onWindowUp);
  window.addEventListener('pointercancel', onWindowUp);

  return {
    cancelHold() {
      if (hold) {
        window.clearTimeout(hold.timer);
        hold = null;
      }
      gesture = null;
    },
  };
}
