import { requireOptionalNativeModule } from 'expo-modules-core';
import { POSE_ANALYSIS_CONFIG as C, validatePoseExtraction } from './poseModel';
import type { PoseExtraction } from './poseModel';
import type { VideoSession } from './videoModel';
import { playbackUri } from './videoAssets';
import { runNativeAnalysis } from './nativeAnalysisJob';

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
