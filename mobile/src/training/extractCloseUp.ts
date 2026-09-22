import { requireOptionalNativeModule } from 'expo-modules-core';
import type { CloseExtraction, CloseSelection } from './closeUp';
import type { VideoSession } from './videoModel';
import { playbackUri } from './videoAssets';
import { runNativeAnalysis } from './nativeAnalysisJob';
import { visionRegion } from './closeUp';
type Native = { prepare(job: string): void; cancel(job: string): void; release(job: string): void; progress(job: string): number;
  extract(uri: string, job: string, startMs: number, region: CloseSelection['region']): Promise<CloseExtraction> };
export async function extractCloseUp(session: VideoSession, selection: CloseSelection, job: string, signal: AbortSignal, progress: (n: number) => void): Promise<CloseExtraction> {
  if (signal.aborted) throw new Error('Close-up analysis cancelled.');
  const native = requireOptionalNativeModule<Native>('TrainingCloseUp');
  if (!native) throw new Error('Local close-up analysis requires the rebuilt iOS app. Manual editing remains available.');
  const uri = playbackUri(session.asset);
  if (!selection || !Number.isFinite(selection.timestampMs) || selection.timestampMs < 0)
    throw new Error('Select a valid region and frame before analyzing.');
  // Clamp floating-point edge noise accepted by validRegion to Vision's strict unit rectangle.
  const region = visionRegion(selection.region);
  return runNativeAnalysis(native, job, signal, () => native.extract(uri, job, selection.timestampMs, region), progress);
}
