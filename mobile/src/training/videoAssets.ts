import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import type { VideoSession } from './videoModel';

export function playbackUri(asset: VideoSession['asset']) {
  return asset.storage === 'DOCUMENTS' ? new File(Paths.document, asset.uri).uri : asset.uri;
}
export async function assetExists(uri: string) { return new File(Paths.document, uri).exists; }
export function discardVideoAsset(asset: VideoSession['asset']) {
  if (asset.storage !== 'DOCUMENTS' || !/^training-videos\/[a-z0-9-]+\.[a-z0-9]{1,8}$/i.test(asset.uri)) return;
  const file = new File(Paths.document, asset.uri);
  if (file.exists) file.delete();
}
export async function importVideoAsset(id: string): Promise<VideoSession['asset'] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const picked = result.assets[0];
  const extension = picked.name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? '.mp4';
  const directory = new Directory(Paths.document, 'training-videos');
  directory.create({ idempotent: true, intermediates: true });
  const relative = `training-videos/${id}${extension}`;
  // Move the picker cache copy into durable app storage; retain only one app-owned file.
  new File(picked.uri).move(new File(Paths.document, relative));
  return { uri: relative, name: picked.name, storage: 'DOCUMENTS', size: picked.size };
}
