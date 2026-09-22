import { requireOptionalNativeModule } from 'expo-modules-core';
import { POSE_ANALYSIS_CONFIG as C, validatePoseExtraction } from './poseModel';
import type { PoseExtraction } from './poseModel';
import type { VideoSession } from './videoModel';
import { playbackUri } from './videoAssets';

type PoseExtractor = {
  prepare(job: string): void; cancel(job: string): void; progress(job: string): number;
  extract(uri: string, job: string, fps: number, maxMs: number, maxSamples: number, imageSize: number, minConfidence: number): Promise<PoseExtraction>;
};
export async function extractPose(session: VideoSession, job: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<PoseExtraction> {
  if (signal.aborted) throw new Error('Movement analysis cancelled.');
  const native = requireOptionalNativeModule<PoseExtractor>('TrainingPose');
  if (!native) throw new Error('Local pose extraction unavailable. Rebuild the iOS app with TrainingPose. Manual editing remains available.');
  const uri = playbackUri(session.asset);
  native.prepare(job);
  const cancel = () => native.cancel(job);
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setInterval(() => {
    if (signal.aborted) return;
    try { onProgress(native.progress(job)); } catch { /* Progress is optional; extraction owns failure reporting. */ }
  }, 500);
  try {
    const result = await native.extract(uri, job, C.fps, C.maxDurationMs, C.maxSamples, C.maxImageSize, C.minJointConfidence);
    if (signal.aborted) throw new Error('Movement analysis cancelled.');
    return validatePoseExtraction(result);
  } finally { clearInterval(timer); signal.removeEventListener('abort', cancel); }
}
