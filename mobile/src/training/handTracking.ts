/**
 * Hand tracking on every frame of one drill run (native `TrainingPose.extractHands`): both hands' key points and the
 * box around the person, between the beep and the last shot. Coordinates are normalized to the upright picture
 * (top-left origin). The drill scripts (drillScripts.ts) read this; nothing here interprets movement. Pure: the native
 * call is in extractHands.ts.
 */

export type HandPoint = { x: number; y: number; confidence: number };
export type Hand = { chirality: 'left' | 'right' | 'unknown'; confidence: number; joints: Partial<Record<'wrist' | 'thumbTip' | 'indexMCP' | 'indexTip' | 'middleMCP' | 'middleTip' | 'littleMCP', HandPoint>> };
export type PersonBox = { x: number; y: number; width: number; height: number; confidence: number };
export type HandFrame = { timestampMs: number; hands: Hand[]; person?: PersonBox };
export type HandTrack = { frames: HandFrame[]; width: number; height: number; fps: number; fromMs: number; toMs: number; warnings: string[]; nativeRevision: number };

const unit = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= -0.05 && n <= 1.05;
const point = (p: unknown): p is HandPoint => !!p && unit((p as HandPoint).x) && unit((p as HandPoint).y) && unit((p as HandPoint).confidence);
/** Keeps only well-formed frames, in time order; throws when nothing usable came back. */
export function validateHandTrack(raw: unknown): HandTrack {
  const t = raw as HandTrack;
  if (!t || !Array.isArray(t.frames) || ![t.width, t.height].every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(t.fromMs) || !Number.isFinite(t.toMs))
    throw new Error('Hand tracking returned no usable frames.');
  let last = -Infinity;
  const frames: HandFrame[] = [];
  for (const f of t.frames.slice(0, 2000)) {
    if (!f || !Number.isFinite(f.timestampMs) || f.timestampMs <= last || !Array.isArray(f.hands)) continue;
    last = f.timestampMs;
    const hands = f.hands.slice(0, 2).filter(h => h && ['left', 'right', 'unknown'].includes(h.chirality) && unit(h.confidence) && h.joints && typeof h.joints === 'object')
      .map(h => ({ chirality: h.chirality, confidence: h.confidence, joints: Object.fromEntries(Object.entries(h.joints).filter(([, p]) => point(p))) as Hand['joints'] }));
    const p = f.person;
    frames.push({ timestampMs: f.timestampMs, hands, ...(p && [p.x, p.y, p.width, p.height, p.confidence].every(unit) ? { person: p } : {}) });
  }
  if (frames.length < 3) throw new Error('Hand tracking returned too few frames.');
  return { frames, width: t.width, height: t.height, fps: Number.isFinite(t.fps) && t.fps > 0 ? t.fps : frames.length / Math.max(0.001, (frames[frames.length - 1].timestampMs - frames[0].timestampMs) / 1000),
    fromMs: t.fromMs, toMs: t.toMs, warnings: Array.isArray(t.warnings) ? t.warnings.filter(w => typeof w === 'string').slice(0, 10) : [], nativeRevision: Number(t.nativeRevision) || 0 };
}

/** The tracking file EXPORT TRACKING shares, so marks can be tuned on real runs off the phone. */
export function trackingExport(track: HandTrack, run: { drillId: string; beepMs: number; shotTimes: readonly number[]; side: 'left' | 'right'; choices?: Record<string, string> }): string {
  return JSON.stringify({ kind: 'psp-hand-tracking', version: 1, exportedAt: new Date().toISOString(), run, track });
}
