/** 手势：轨道纵向滚动、横向切换预设（跟手）、点击卡片翻面。 */
const SWIPE_DISTANCE_RATIO = 0.10;

export function attachGestures(stage, handlers) {
  const { getSide, isBlocked } = handlers;
  let gesture = null;

  const touchSlop = () => stage.getBoundingClientRect().width * 0.012 || 8;

  const finishCancelled = (pointerId) => {
    if (!gesture || gesture.id !== pointerId) return;
    if (gesture.dragging) handlers.onDragEnd(gesture.side);
    if (gesture.swiping) handlers.onSwipeCancel?.();
    gesture = null;
  };

  const onDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.isPrimary === false || isBlocked()) return;

    // 搜索框和按钮应保留自己的点击、输入行为，不参与舞台手势。
    if (event.target.closest?.('input, button, textarea, select, [contenteditable="true"]')) return;

    gesture = {
      id: event.pointerId,
      side: getSide(event.clientX),
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: performance.now(),
      dragging: false,
      swiping: false,
      card: event.target.closest?.('.card:not(.free)') || null,
    };

    // 指针离开舞台后仍接收 move/up，避免拖动状态卡死。
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      // 某些环境不支持指针捕获，继续使用普通事件流程。
    }
  };

  const onMove = (event) => {
    if (!gesture || gesture.id !== event.pointerId || isBlocked()) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    // 横向滑动：进入后一直保持横滑模式，状态跟着手指走（松手再决定是否切换）。
    if (
      !gesture.dragging &&
      (gesture.swiping || (Math.abs(dx) > touchSlop() && Math.abs(dx) > Math.abs(dy) * 1.25))
    ) {
      gesture.swiping = true;
      handlers.onSwipeMove?.(dx);
      event.preventDefault();
      return;
    }

    if (gesture.side < 0 || Math.abs(dy) <= Math.abs(dx) * 1.5) return;

    if (!gesture.dragging && Math.abs(dy) > touchSlop()) {
      gesture.dragging = true;
      handlers.onDragStart(gesture.side);
    }

    if (gesture.dragging) {
      const now = performance.now();
      const delta = event.clientY - gesture.lastY;
      const elapsed = Math.max(8, now - gesture.lastTime);
      handlers.onDragMove(gesture.side, delta, elapsed, event.clientY);
      gesture.lastY = event.clientY;
      gesture.lastTime = now;
      event.preventDefault();
    }
  };

  const onUp = (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;

    // pointercancel 不是用户完成的手势，不能继续判定为点击或切换。
    if (event.type === 'pointercancel') {
      finishCancelled(event.pointerId);
      return;
    }

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const elapsed = Math.max(1, performance.now() - gesture.lastTime);
    const threshold = Math.max(34, stage.getBoundingClientRect().width * SWIPE_DISTANCE_RATIO);
    const horizontal = !gesture.dragging && Math.abs(dx) > Math.abs(dy) * 1.25;
    const swipe = horizontal && (
      Math.abs(dx) >= threshold || (Math.abs(dx) >= 18 && Math.abs(dx) / elapsed >= 0.55)
    );

    if (gesture.dragging) {
      handlers.onDragEnd(gesture.side);
    } else if (swipe) {
      handlers.onPresetStep(dx > 0 ? 1 : -1);
    } else if (gesture.swiping) {
      // 没滑够距离：状态弹回原位。
      handlers.onSwipeCancel?.();
    } else if (gesture.card && Math.hypot(dx, dy) <= touchSlop() * 1.4) {
      handlers.onTap(
        Number(gesture.card.dataset.i),
        gesture.card.dataset.side === 'back' ? 0 : 1,
        Number(gesture.card.dataset.copy),
      );
    }

    gesture = null;
    try {
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    } catch {
      // 指针可能已由浏览器释放。
    }
  };

  const onLostPointerCapture = (event) => finishCancelled(event.pointerId);

  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('lostpointercapture', onLostPointerCapture);

  return {
    cancelHold() {
      if (gesture) finishCancelled(gesture.id);
    },
  };
}
