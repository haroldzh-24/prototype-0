import type { PoseExtraction } from './poseModel';
import type { VideoSession } from './videoModel';
export async function extractPose(_session: VideoSession, _job: string, _signal: AbortSignal, _onProgress: (fraction: number) => void): Promise<PoseExtraction> {
  throw new Error('Local pose extraction is available in the rebuilt iOS app. Browser manual annotation remains available.');
}
