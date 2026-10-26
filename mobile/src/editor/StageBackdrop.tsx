import { Image } from 'expo-image';
import type { ViewportTransform } from '@/stage/coordinates';
import { stageToViewport } from '@/stage/coordinates';

/** A calibrated stage drawing under the plan (stage inches), for tracing over. */
export type Backdrop = { uri: string; left: number; top: number; width: number; height: number; opacity: number };

export default function StageBackdrop({ backdrop, transform }: { backdrop: Backdrop; transform: ViewportTransform }) {
  const at = stageToViewport({ space: 'stage', x: backdrop.left, y: backdrop.top, z: 0 }, transform);
  return <Image pointerEvents="none" accessibilityLabel="Stage drawing underneath" source={{ uri: backdrop.uri }} contentFit="fill" transition={0}
    style={{ position: 'absolute', left: at.x, top: at.y, width: backdrop.width * transform.scale, height: backdrop.height * transform.scale, opacity: backdrop.opacity }} />;
}
