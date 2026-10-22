import { requireOptionalNativeModule } from 'expo-modules-core';
import { AUDIO_ANALYSIS_CONFIG, checkAudioCancelled } from './audioDetection';
import type { AnalysisAudio } from './audioDetection';
import { playbackUri } from './videoAssets';
import type { VideoSession } from './videoModel';
import { runNativeAnalysis } from './nativeAnalysisJob';
import { pcm16ToFloat32 } from '../utils/base64';

/** Newer native builds send `pcm16` (base64 16-bit PCM) instead of a large `samples` number array. */
type NativeAudio = Omit<AnalysisAudio, 'samples'> & { samples?: number[]; pcm16?: string };
type AudioExtractor = {
  extract(uri: string, jobId: string, sampleRate: number, maxDurationMs: number): Promise<NativeAudio>;
  cancel(jobId: string): void;
  prepare(jobId: string): void; release(jobId: string): void; progress(jobId: string): number;
};
export async function extractAnalysisAudio(session: VideoSession, jobId: string, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<AnalysisAudio> {
  checkAudioCancelled(signal);
  const native = requireOptionalNativeModule<AudioExtractor>('TrainingAudio');
  if (!native) throw new Error('Local audio extraction unavailable. Install a rebuilt iOS development/device app with TrainingAudio. Manual editing remains available.');
  if (session.durationMs === 0) throw new Error('Cannot analyze zero-duration media.');
  const uri = playbackUri(session.asset);
  const result = await runNativeAnalysis(native, jobId, signal, () => native.extract(uri, jobId,
    AUDIO_ANALYSIS_CONFIG.sampleRate, AUDIO_ANALYSIS_CONFIG.maxDurationMs), onProgress);
  return nativeAudioToAnalysis(result);
}
/** Accepts both the compact PCM form and the older number-array form. */
export function nativeAudioToAnalysis(result: NativeAudio): AnalysisAudio {
  const { pcm16, samples, ...rest } = result;
  return { ...rest, samples: typeof pcm16 === 'string' ? pcm16ToFloat32(pcm16) : samples ?? [] };
}
