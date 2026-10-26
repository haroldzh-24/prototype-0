import * as DocumentPicker from 'expo-document-picker';
import { uuid } from 'expo-modules-core';
import type { DocumentAsset, Reconstruction } from './model';
import { assetValid } from './model';
import { DOCUMENT_PATH, unreferencedPaths } from './sessionFiles';

// Durable blobs, not session object URLs. Separate from SQLite stage payloads.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('stage-diagram-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function readBlob(asset: DocumentAsset): Promise<Blob> {
  if (!assetValid(asset)) throw new Error('Invalid document reference.');
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('assets').objectStore('assets').get(asset.path);
      request.onsuccess = () => request.result instanceof Blob ? resolve(request.result) : reject(new Error('The original document is missing from this browser. Reimport it; existing geometry is unchanged.'));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function storeBlob(blob: Blob, name: string): Promise<DocumentAsset> {
  if (!blob.size || blob.size > 50*1024*1024) throw new Error('Choose a nonempty document up to 50 MB.');
  const extension = blob.type === 'application/pdf' ? 'pdf' : name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? 'png';
  const asset = { path: `diagram-imports/${uuid.v4()}.${extension}`, name: name.slice(0,300), mime: blob.type || 'image/png', size: blob.size };
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('assets','readwrite'); transaction.objectStore('assets').add(blob, asset.path);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
  return asset;
}
/** Data URLs keep async component image references free of unreleased blob URLs. */
export async function assetUri(asset: DocumentAsset): Promise<string> {
  const blob = await readBlob(asset);
  return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}
export async function pickDocument(): Promise<{ asset: DocumentAsset; kind: Reconstruction['sourceKind'] } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf','image/*'], multiple: false, base64: false });
  if (result.canceled) return null;
  const item = result.assets[0];
  if (!item?.file) throw new Error('The browser did not provide a local file.');
  if (item.file.type !== 'application/pdf' && !item.file.type.startsWith('image/')) throw new Error('Choose a PDF or image.');
  return { asset: await storeBlob(item.file, item.name), kind: item.file.type === 'application/pdf' ? 'pdf' : 'image' };
}
/** The browser has no photo album: a picture file is chosen the same way as any document. */
export async function pickPhoto(): Promise<{ asset: DocumentAsset; kind: Reconstruction['sourceKind'] } | null> { return pickDocument(); }
export async function photographPaper(): Promise<{ asset: DocumentAsset; kind: 'paper-photo' } | null> {
  throw new Error('Use your phone camera to photograph the paper, then Import PDF or image. Direct capture is available in the rebuilt iPhone app.');
}
export async function openOriginal(asset: DocumentAsset): Promise<void> {
  const url = URL.createObjectURL(await readBlob(asset));
  try {
    const link = document.createElement('a'); link.href = url; link.download = asset.name; link.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** Deletes browser-stored document blobs that no saved draft references. Returns how many were removed. */
export async function deleteDocumentFiles(paths: readonly string[], inUse: ReadonlySet<string>): Promise<number> {
  const targets = unreferencedPaths(paths, inUse).filter(path => DOCUMENT_PATH.test(path));
  if (!targets.length) return 0;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('assets', 'readwrite');
      for (const path of targets) transaction.objectStore('assets').delete(path);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
  return targets.length;
}
