import { requireOptionalNativeModule } from 'expo-modules-core';
import { POSE_ANALYSIS_CONFIG as C, validatePoseExtraction } from './poseModel';
import type { PoseExtraction } from './poseModel';
import type { VideoSession } from './videoModel';
import { playbackUri } from './videoAssets';
import { runNativeAnalysis } from './nativeAnalysisJob';
import { phaseFps } from './movementPhases';

type PoseExtractor = {
  prepare(job: string): void; cancel(job: string): void; release(job: string): void; progress(job: string): number;
  extract(uri: string, job: string, fps: number, maxMs: number, maxSamples: number, imageSize: number, minConfidence: number): Promise<PoseExtraction>;
};
export async function extractPose(session: VideoSession, job: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<PoseExtraction> {
  if (signal.aborted) throw new Error('Movement analysis cancelled.');
  const native = requireOptionalNativeModule<PoseExtractor>('TrainingPose');
  if (!native) throw new Error('Local pose extraction unavailable. Rebuild the iOS app with TrainingPose. Manual editing remains available.');
  const uri = playbackUri(session.asset);
  const result = await runNativeAnalysis(native, job, signal,
    () => native.extract(uri, job, C.fps, C.maxDurationMs, C.maxSamples, C.maxImageSize, C.minJointConfidence), onProgress);
  return validatePoseExtraction(result);
}

/**
 * Frames from the start of the video to `endMs` at the highest rate the 600-frame cap allows (at most 60 a second),
 * for the movement breakdown of one run (movementPhases.ts). Builds before native revision 2 allow only 10 a second.
 */
export async function extractPoseUntil(session: VideoSession, endMs: number, job: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<PoseExtraction> {
  if (signal.aborted) throw new Error('Movement analysis cancelled.');
  const native = requireOptionalNativeModule<PoseExtractor>('TrainingPose');
  if (!native) throw new Error('Local pose extraction unavailable. Rebuild the iOS app with TrainingPose. Manual editing remains available.');
  const uri = playbackUri(session.asset), limit = Math.min(C.maxDurationMs, Math.max(1, Math.ceil(endMs)));
  const result = await runNativeAnalysis(native, job, signal,
    () => native.extract(uri, job, phaseFps(limit), limit, C.maxSamples, C.maxImageSize, C.minJointConfidence), onProgress);
  return validatePoseExtraction(result);
}
