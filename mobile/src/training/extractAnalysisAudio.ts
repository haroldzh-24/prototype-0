import { requireOptionalNativeModule } from 'expo-modules-core';
import { AUDIO_ANALYSIS_CONFIG, checkAudioCancelled } from './audioDetection';
import type { AnalysisAudio } from './audioDetection';
import { playbackUri } from './videoAssets';
import type { VideoSession } from './videoModel';

type AudioExtractor = {
  extract(uri: string, jobId: string, sampleRate: number, maxDurationMs: number): Promise<AnalysisAudio>;
  cancel(jobId: string): void;
};
export async function extractAnalysisAudio(session: VideoSession, jobId: string, signal?: AbortSignal): Promise<AnalysisAudio> {
  checkAudioCancelled(signal);
  const native = requireOptionalNativeModule<AudioExtractor>('TrainingAudio');
  if (!native) throw new Error('Local audio extraction unavailable. Install a rebuilt iOS development/device app with TrainingAudio. Manual editing remains available.');
  if (session.durationMs === 0) throw new Error('Cannot analyze zero-duration media.');
  const cancel = () => native.cancel(jobId);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const audio = await native.extract(playbackUri(session.asset), jobId, AUDIO_ANALYSIS_CONFIG.sampleRate, AUDIO_ANALYSIS_CONFIG.maxDurationMs);
    checkAudioCancelled(signal);
    return audio;
  } finally { signal?.removeEventListener('abort', cancel); }
}
