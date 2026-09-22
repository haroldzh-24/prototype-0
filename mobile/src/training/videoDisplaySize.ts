import { requireOptionalNativeModule } from 'expo-modules-core';
import { playbackUri } from './videoAssets';
import type { VideoSession } from './videoModel';

/** expo-video's iOS track size is naturalSize, which can be unrotated. Vision uses displayed pixels. */
export async function videoDisplaySize(session: VideoSession): Promise<{ width: number; height: number } | null> {
  try {
    const native = requireOptionalNativeModule<{ displaySize?(uri: string): Promise<{ width: number; height: number }> }>('TrainingPose');
    const size = await native?.displaySize?.(playbackUri(session.asset));
    return size && [size.width, size.height].every(n => Number.isFinite(n) && n > 0) ? size : null;
  } catch { return null; }
}
