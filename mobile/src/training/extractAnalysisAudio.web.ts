import type { AnalysisAudio } from './audioDetection';
import type { VideoSession } from './videoModel';

export async function extractAnalysisAudio(_session: VideoSession, _jobId: string, _signal?: AbortSignal, _onProgress?: (fraction: number) => void): Promise<AnalysisAudio> {
  throw new Error('Local audio extraction is currently available in the rebuilt iOS app. Browser manual annotation remains available.');
}
