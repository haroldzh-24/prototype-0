import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';
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
/** Move a picked file into durable app storage, retaining only one app-owned copy. */
function adoptPickedVideo(id: string, pickedUri: string, name: string, size: number | undefined): VideoSession['asset'] {
  const extension = name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? '.mp4';
  const directory = new Directory(Paths.document, 'training-videos');
  directory.create({ idempotent: true, intermediates: true });
  const relative = `training-videos/${id}${extension}`;
  const source = new File(pickedUri), destination = new File(Paths.document, relative);
  if (destination.exists) throw new Error('This imported video already exists. Try again.');
  try { source.move(destination); }
  catch (error) {
    try { if (destination.exists) destination.delete(); } catch { /* Report the original import failure. */ }
    try { if (!source.uri.startsWith(Paths.document.uri) && source.exists) source.delete(); } catch { /* Temporary copy may already be gone. */ }
    throw error;
  }
  return { uri: relative, name, storage: 'DOCUMENTS', size: size ?? destination.size };
}
/**
 * `files` uses the document picker (Files/iCloud). `photos` uses the system photo picker, which runs out of process and
 * needs no photo library permission; it is iOS-only and needs a client built with the TrainingMedia module.
 */
export async function importVideoAsset(id: string, from: 'files' | 'photos' = 'files'): Promise<VideoSession['asset'] | null> {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Invalid video identifier.');
  if (from === 'photos') {
    const module = requireOptionalNativeModule<{ pickVideo(): Promise<{ uri: string; name: string; size: number } | null> }>('TrainingMedia');
    if (!module) throw new Error('Importing from Photos needs the rebuilt iPhone app. Use Files for now.');
    const picked = await module.pickVideo();
    if (!picked) return null;
    return adoptPickedVideo(id, picked.uri, picked.name || 'Video.mov', picked.size || undefined);
  }
  const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const picked = result.assets[0];
  if (!picked) throw new Error('No local video file was provided.');
  return adoptPickedVideo(id, picked.uri, picked.name, picked.size);
}
