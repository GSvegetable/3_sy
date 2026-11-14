/**
 * 手势层。
 * 轨道拖拽 / 横滑切换预设由舞台统一接管（与原生根部手势一致），
 * 卡片的点击翻面与长按抽出由轨道容器单独处理。
 */

const SWIPE_DISTANCE_RATIO = 0.10; // 横滑距离阈值：约为屏幕宽度的 10%
const LONG_PRESS_MS = 400;
const TAP_MAX_MS = 500;

export function attachGestures(stage, handlers) {
  const { getSide, isBlocked } = handlers;

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
      lastX: event.clientX,
      lastTime: performance.now(),
      horizontal: false,
      dragging: false,
    };
  };

  const onMove = (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (isBlocked()) return;
    // 长按已进入抽卡待命后，舞台不再把同一次移动识别成轨道滚动。
    if (hold && hold.id === event.pointerId && hold.longPressed) {
      event.preventDefault();
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    // 横向手势先只识别方向，等手指松开再切换，避免拖动过程中突然跳状态。
    if (Math.abs(dx) > touchSlop() && Math.abs(dx) > Math.abs(dy) * 1.25) {
      gesture.horizontal = true;
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
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const elapsed = Math.max(1, performance.now() - gesture.lastTime);
    const threshold = Math.max(34, stage.getBoundingClientRect().width * SWIPE_DISTANCE_RATIO);
    const horizontal = !gesture.dragging && Math.abs(dx) > Math.abs(dy) * 1.25;
    const deliberateSwipe =
      horizontal &&
      (Math.abs(dx) >= threshold || (Math.abs(dx) >= 18 && Math.abs(dx) / elapsed >= 0.55));

    if (gesture.dragging) {
      handlers.onDragEnd(gesture.side);
    } else if (deliberateSwipe) {
      if (hold && hold.id === event.pointerId) {
        hold.moved = true;
        window.clearTimeout(hold.timer);
        handlers.onPress(hold.key, false);
      }
      handlers.onPresetStep(dx > 0 ? 1 : -1);
    }
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
      copy: Number(el.dataset.copy),
      key: `${el.dataset.i}_${el.dataset.copy}`,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      moved: false,
      longPressed: false,
      extracted: false,
    };
    // 长按只进入待抽出状态；手指真正开始移动后才把卡片从轨道中取出。
    hold.timer = window.setTimeout(() => {
      if (!hold || hold.moved || hold.extracted) return;
      hold.longPressed = true;
    }, LONG_PRESS_MS);
  };

  const onCardMove = (event) => {
    if (!hold || hold.id !== event.pointerId) return;
    const dx = event.clientX - hold.startX;
    const dy = event.clientY - hold.startY;
    const distance = Math.hypot(dx, dy);
    if (!hold.moved && distance > touchSlop()) {
      hold.moved = true;
      window.clearTimeout(hold.timer);
      if (hold.longPressed) {
        hold.extracted = true;
        handlers.onExtractStart(hold.index, hold.el, hold.side, hold.copy);
      }
    }
    if (hold.extracted) {
      handlers.onExtractMove(dx, dy);
      event.preventDefault();
    }
  };

  const onCardUp = (event) => {
    if (!hold || hold.id !== event.pointerId) return;
    const elapsed = performance.now() - hold.startTime;
    window.clearTimeout(hold.timer);
    if (hold.extracted) {
      handlers.onExtractEnd(event.clientX, event.clientY);
    } else if (!hold.moved && elapsed < TAP_MAX_MS) {
      handlers.onTap(hold.index, hold.side, hold.copy);
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
