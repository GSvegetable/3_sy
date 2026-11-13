/**
 * 触觉反馈与设备姿态。
 * 原生端走 `HapticEngine`，Web 端在 Capacitor 环境用 Haptics 插件，
 * 浏览器里退回到 navigator.vibrate。
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

let lastTickAt = 0;

const native = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const fallbackVibrate = (pattern) => {
  if (!native() && typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* 忽略：部分浏览器禁用振动 */
    }
  }
};

export async function hapticTick(speed = 0.5) {
  const now = Date.now();
  if (now - lastTickAt < 75) return;
  lastTickAt = now;
  const s = Math.max(0, Math.min(1, speed));
  if (native()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    } catch {
      /* 回落到振动 */
    }
  }
  fallbackVibrate(7 + Math.round(s * 5));
}

export async function hapticRelease(speed = 0.5) {
  const s = Math.max(0, Math.min(1, speed));
  if (native()) {
    try {
      await Haptics.impact({ style: s > 0.65 ? ImpactStyle.Heavy : ImpactStyle.Medium });
      return;
    } catch {
      /* 回落到振动 */
    }
  }
  fallbackVibrate([0, 16 + Math.round(s * 8)]);
}

export async function hapticReverse() {
  if (native()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
      return;
    } catch {
      /* 回落到振动 */
    }
  }
  fallbackVibrate([0, 8, 34, 7]);
}

/**
 * 监听设备重力方向，返回一个 [-1, 1] 的横向倾角。
 * 对应原生端的 TYPE_GRAVITY 传感器。
 */
export function watchTilt(onTilt) {
  const handler = (event) => {
    if (typeof event.gamma === 'number') {
      onTilt(Math.max(-1, Math.min(1, event.gamma / 45)));
    }
  };
  window.addEventListener('deviceorientation', handler, { passive: true });
  return () => window.removeEventListener('deviceorientation', handler);
}
