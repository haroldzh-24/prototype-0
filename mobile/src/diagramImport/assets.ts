import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { uuid, requireOptionalNativeModule } from 'expo-modules-core';
import type { DocumentAsset, Reconstruction } from './model';
import { assetValid } from './model';
import { DOCUMENT_PATH, unreferencedPaths } from './sessionFiles';

export async function assetUri(asset: DocumentAsset) {
  if (!assetValid(asset)) throw new Error('Invalid document reference.');
  const file = new File(Paths.document, asset.path);
  if (!file.exists) throw new Error('The original document is missing. Import it again; existing stage geometry is unchanged.');
  return file.uri;
}
export async function preserveFile(uri: string, name: string, mime: string): Promise<DocumentAsset> {
  const source = new File(uri);
  if (!source.exists || source.size <= 0 || source.size > 50 * 1024 * 1024) throw new Error('Choose a nonempty document up to 50 MB.');
  const extension = mime === 'application/pdf' ? 'pdf' : name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? 'jpg';
  new Directory(Paths.document, 'diagram-imports').create({ idempotent: true, intermediates: true });
  const path = `diagram-imports/${uuid.v4()}.${extension}`, destination = new File(Paths.document, path);
  try { source.copy(destination); }
  catch (error) { if (destination.exists) destination.delete(); throw error; }
  // Native renders, camera photos and picker copies are temporary files the app created; remove them once preserved.
  try { if (!source.uri.startsWith(Paths.document.uri) && source.exists) source.delete(); } catch { /* best effort */ }
  return { path, name: name.slice(0, 300), mime, size: destination.size };
}
export async function pickDocument(): Promise<{ asset: DocumentAsset; kind: Reconstruction['sourceKind'] } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const item = result.assets[0];
  if (!item) throw new Error('No document was selected.');
  const mime = item.mimeType ?? (/\.pdf$/i.test(item.name) ? 'application/pdf' : 'image/jpeg');
  if (mime !== 'application/pdf' && !mime.startsWith('image/')) throw new Error('Choose a PDF or image.');
  return { asset: await preserveFile(item.uri, item.name, mime), kind: mime === 'application/pdf' ? 'pdf' : 'image' };
}
export async function photographPaper(): Promise<{ asset: DocumentAsset; kind: 'paper-photo' } | null> {
  const module = requireOptionalNativeModule<{ capture(): Promise<string | null> }>('DiagramImport');
  if (!module) throw new Error('Paper capture needs the rebuilt iPhone app. You can import an existing photograph with Import PDF or image.');
  const uri = await module.capture();
  if (!uri) return null;
  return { asset: await preserveFile(uri, 'Paper photograph.jpg', 'image/jpeg'), kind: 'paper-photo' };
}
export async function openOriginal(asset: DocumentAsset): Promise<void> {
  const module = requireOptionalNativeModule<{ openOriginal(uri: string): Promise<void> }>('DiagramImport');
  if (!module) throw new Error('Opening the preserved original needs the rebuilt iPhone app.');
  await module.openOriginal(await assetUri(asset));
}

/** Deletes app-owned document files that no saved draft references. Returns how many were removed. */
export async function deleteDocumentFiles(paths: readonly string[], inUse: ReadonlySet<string>): Promise<number> {
  let removed = 0;
  for (const path of unreferencedPaths(paths, inUse)) {
    if (!DOCUMENT_PATH.test(path)) continue;
    try { const file = new File(Paths.document, path); if (file.exists) { file.delete(); removed++; } } catch { /* best effort */ }
  }
  return removed;
}
