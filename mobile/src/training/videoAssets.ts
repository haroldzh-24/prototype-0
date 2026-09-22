import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import type { VideoSession } from './videoModel';

export function playbackUri(asset: VideoSession['asset']) {
  if (asset.storage !== 'DOCUMENTS' || !/^training-videos\/[a-z0-9-]+\.[a-z0-9]{1,8}$/i.test(asset.uri))
    throw new Error('This video reference is unavailable on this device. Relink the original recording.');
  return new File(Paths.document, asset.uri).uri;
}
export async function assetExists(uri: string) { return new File(Paths.document, uri).exists; }
export function discardVideoAsset(asset: VideoSession['asset']) {
  if (asset.storage !== 'DOCUMENTS' || !/^training-videos\/[a-z0-9-]+\.[a-z0-9]{1,8}$/i.test(asset.uri)) return;
  const file = new File(Paths.document, asset.uri);
  if (file.exists) file.delete();
}
export async function importVideoAsset(id: string): Promise<VideoSession['asset'] | null> {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Invalid video identifier.');
  const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const picked = result.assets[0];
  if (!picked) throw new Error('No local video file was provided.');
  const extension = picked.name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? '.mp4';
  const directory = new Directory(Paths.document, 'training-videos');
  directory.create({ idempotent: true, intermediates: true });
  const relative = `training-videos/${id}${extension}`;
  // Move the picker cache copy into durable app storage; retain only one app-owned file.
  const source = new File(picked.uri), destination = new File(Paths.document, relative);
  if (destination.exists) throw new Error('This imported video already exists. Try again.');
  try { source.move(destination); }
  catch (error) {
    try { if (destination.exists) destination.delete(); } catch { /* Report the original import failure. */ }
    try { if (source.uri.startsWith(Paths.cache.uri.replace(/\/+$/, '') + '/') && source.exists) source.delete(); } catch { /* Cache may already be gone. */ }
    throw error;
  }
  return { uri: relative, name: picked.name, storage: 'DOCUMENTS', size: picked.size };
}
