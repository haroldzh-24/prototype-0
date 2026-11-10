/** The native call behind hand tracking (handTracking.ts has the data and its checks). */
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { VideoSession } from './videoModel';
import { playbackUri } from './videoAssets';
import { runNativeAnalysis } from './nativeAnalysisJob';
import { validateHandTrack } from './handTracking';
import type { HandTrack } from './handTracking';

type HandExtractor = {
  prepare(job: string): void; cancel(job: string): void; release(job: string): void; progress(job: string): number;
  extractHands?(uri: string, job: string, fromMs: number, toMs: number, maxFrames: number, imageSize: number, minConfidence: number): Promise<unknown>;
};
/** True when this build of the app can track hands on every frame. */
export function handTrackingAvailable(): boolean {
  return typeof requireOptionalNativeModule<HandExtractor>('TrainingPose')?.extractHands === 'function';
}
/** Tracks the window of one run (a little before the beep to a little after the last shot), at most 30 s. */
export async function extractHands(session: VideoSession, fromMs: number, toMs: number, job: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<HandTrack> {
  const native = requireOptionalNativeModule<HandExtractor>('TrainingPose');
  if (!native?.extractHands) throw new Error('Tracking your hands needs the next iPhone build of the app.');
  const from = Math.max(0, fromMs), to = Math.min(from + 30000, Math.max(from + 100, toMs));
  const raw = await runNativeAnalysis(native, job, signal, () => native.extractHands!(playbackUri(session.asset), job, from, to, 1800, 640, 0.3), onProgress);
  return validateHandTrack(raw);
}

