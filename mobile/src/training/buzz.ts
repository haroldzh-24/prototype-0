import * as Haptics from 'expo-haptics';
import * as Device from 'expo-device';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { Pulse } from './practiceTimer';

/**
 * The phone side of the practice timer and buzz tests: haptic pulses, a clock, timeouts, keeping the screen awake.
 * Kept apart from `practiceTimer.ts` so the logic stays testable without native modules.
 *
 * iOS plays no haptics in Low Power Mode, with System Haptics turned off in Settings, or while the camera or dictation
 * is active, and does not report it, so the screens say what to check when you feel nothing.
 */

/** Milliseconds on a monotonic clock where the platform has one. Signal and tap times are both read from it. */
export function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

/** Run `fn` after `ms`; returns a function that cancels it. */
export function after(ms: number, fn: () => void): () => void {
  const id = setTimeout(fn, Math.max(0, ms));
  return () => clearTimeout(id);
}

/**
 * Play a pattern of haptic impacts. `sentAt` is when the first impact was requested, on `now()`: reaction times are
 * measured from it, so they include the phone's own delay in starting the buzz. A failure (no haptic engine) is
 * reported once through `onError`; it never throws.
 */
export function playPattern(pattern: readonly Pulse[], onError?: (message: string) => void): { sentAt: number; cancel: () => void } {
  let reported = false;
  const fire = (p: Pulse) => {
    try {
      Haptics.impactAsync(p.style === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light)
        .catch((e: unknown) => { if (!reported) { reported = true; onError?.(e instanceof Error ? e.message : String(e)); } });
    } catch (e) { if (!reported) { reported = true; onError?.(e instanceof Error ? e.message : String(e)); } }
  };
  const sentAt = now(), cancels: (() => void)[] = [];
  for (const p of pattern) { if (p.atMs <= 0) fire(p); else cancels.push(after(p.atMs, () => fire(p))); }
  return { sentAt, cancel: () => cancels.forEach(c => c()) };
}

/** Keep the screen from locking (a locked phone stops the timer) until the returned function is called. */
export function keepAwake(tag: string): () => void {
  activateKeepAwakeAsync(tag).catch(() => { /* the timer still runs while the screen is on */ });
  return () => { Promise.resolve(deactivateKeepAwake(tag)).catch(() => {}); };
}

/** Model and OS ("iPhone 15 Pro", "iOS 26.1"), for the results report. */
export function deviceInfo(): { model: string | null; os: string | null } {
  try { return { model: Device.modelName ?? null, os: Device.osVersion ? [Device.osName, Device.osVersion].filter(Boolean).join(' ') : null }; } catch { return { model: null, os: null }; }
}
