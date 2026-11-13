import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

let lastTickAt = 0;
const native = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};
const fallbackVibrate = (pattern) => {
  if (!native() && typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
};

export async function hapticTick(speed = 0.5) {
  const now = Date.now();
  if (now - lastTickAt < 75) return;
  lastTickAt = now;
  const s = Math.max(0, Math.min(1, speed));
  if (native()) {
    try { await Haptics.impact({ style: ImpactStyle.Light }); return; } catch {}
  }
  fallbackVibrate(7 + Math.round(s * 5));
}

export async function hapticRelease(speed = 0.5) {
  const s = Math.max(0, Math.min(1, speed));
  if (native()) {
    try { await Haptics.impact({ style: s > 0.65 ? ImpactStyle.Heavy : ImpactStyle.Medium }); return; } catch {}
  }
  fallbackVibrate([0, 16 + Math.round(s * 8)]);
}

export async function hapticReverse() {
  if (native()) {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); return; } catch {}
  }
  fallbackVibrate([0, 8, 34, 7]);
}

// Browser approximation of the Android RuntimeShader ripple + champagne frost.
export function playGlassTransition(stage, direction = 0) {
  if (!stage) return;
  stage.querySelector('.glass-ripple')?.remove();
  const layer = document.createElement('div');
  layer.className = 'glass-ripple';
  layer.dataset.direction = String(direction);
  stage.append(layer);
  requestAnimationFrame(() => layer.classList.add('active'));
  window.setTimeout(() => {
    layer.classList.remove('active');
    window.setTimeout(() => layer.remove(), 900);
  }, 620);
}
