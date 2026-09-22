import * as DocumentPicker from 'expo-document-picker';
import type { VideoSession } from './videoModel';

const currentAssets = new Set<string>();
export const playbackUri = (asset: VideoSession['asset']) => asset.uri;
export async function assetExists(uri: string) { return currentAssets.has(uri); }
export function discardVideoAsset(asset: VideoSession['asset']) {
  if (currentAssets.delete(asset.uri)) URL.revokeObjectURL(asset.uri);
}
export async function importVideoAsset(_id: string): Promise<VideoSession['asset'] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', multiple: false, base64: false });
  if (result.canceled) return null;
  const picked = result.assets[0];
  if (!picked.file) throw new Error('This browser did not provide a local video file.');
  const uri = URL.createObjectURL(picked.file);
  currentAssets.add(uri);
  return { uri, name: picked.name, storage: 'BROWSER_SESSION', size: picked.size };
}
