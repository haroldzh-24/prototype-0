import type { AnalysisAudio } from './audioDetection';
import type { VideoSession } from './videoModel';

export async function extractAnalysisAudio(_session: VideoSession, _jobId: string, _signal?: AbortSignal, _onProgress?: (fraction: number) => void): Promise<AnalysisAudio> {
  throw new Error('Reading a video’s sound works in the iPhone app, not in the browser.');
}
