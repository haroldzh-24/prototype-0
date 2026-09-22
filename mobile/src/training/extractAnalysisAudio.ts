import { requireOptionalNativeModule } from 'expo-modules-core';
import { AUDIO_ANALYSIS_CONFIG, checkAudioCancelled } from './audioDetection';
import type { AnalysisAudio } from './audioDetection';
import { playbackUri } from './videoAssets';
import type { VideoSession } from './videoModel';
import { runNativeAnalysis } from './nativeAnalysisJob';

type AudioExtractor = {
  extract(uri: string, jobId: string, sampleRate: number, maxDurationMs: number): Promise<AnalysisAudio>;
  cancel(jobId: string): void;
  prepare(jobId: string): void; release(jobId: string): void; progress(jobId: string): number;
};
export async function extractAnalysisAudio(session: VideoSession, jobId: string, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<AnalysisAudio> {
  checkAudioCancelled(signal);
  const native = requireOptionalNativeModule<AudioExtractor>('TrainingAudio');
  if (!native) throw new Error('Local audio extraction unavailable. Install a rebuilt iOS development/device app with TrainingAudio. Manual editing remains available.');
  if (session.durationMs === 0) throw new Error('Cannot analyze zero-duration media.');
  const uri = playbackUri(session.asset);
  return runNativeAnalysis(native, jobId, signal, () => native.extract(uri, jobId,
    AUDIO_ANALYSIS_CONFIG.sampleRate, AUDIO_ANALYSIS_CONFIG.maxDurationMs), onProgress);
}
