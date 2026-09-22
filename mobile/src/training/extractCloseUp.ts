import { requireOptionalNativeModule } from 'expo-modules-core';
import type { CloseExtraction, CloseSelection } from './closeUp';
import type { VideoSession } from './videoModel';
import { playbackUri } from './videoAssets';
type Native = { prepare(job: string): void; cancel(job: string): void; progress(job: string): number;
  extract(uri: string, job: string, startMs: number, region: CloseSelection['region']): Promise<CloseExtraction> };
export async function extractCloseUp(session: VideoSession, selection: CloseSelection, job: string, signal: AbortSignal, progress: (n: number) => void): Promise<CloseExtraction> {
  if (signal.aborted) throw new Error('Close-up analysis cancelled.');
  const native = requireOptionalNativeModule<Native>('TrainingCloseUp');
  if (!native) throw new Error('Local close-up analysis requires the rebuilt iOS app. Manual editing remains available.');
  native.prepare(job);
  const cancel = () => native.cancel(job); signal.addEventListener('abort', cancel, { once: true });
  const timer = setInterval(() => { try { if (!signal.aborted) progress(native.progress(job)); } catch { /* Optional progress. */ } }, 500);
  try {
    const result = await native.extract(playbackUri(session.asset), job, selection.timestampMs, selection.region);
    if (signal.aborted) throw new Error('Close-up analysis cancelled.');
    return result;
  } finally { clearInterval(timer); signal.removeEventListener('abort', cancel); }
}
