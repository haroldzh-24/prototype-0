import { requireOptionalNativeModule } from 'expo-modules-core';
import { preserveFile, assetUri } from './assets';
import type { Alignment, DocumentAsset, PageImage, Quad } from './model';
import { validCrop, validQuad } from './model';
import { recordDerivative } from './sessionFiles';

type Result = { uri: string; width: number; height: number; pageCount: number; corners?: Quad };
interface NativeDiagramImport {
  page(uri: string, pdf: boolean, page: number): Promise<Result>;
  align(uri: string, corners: Quad, rotation: number, crop: Alignment['crop']): Promise<Result>;
}
function native() {
  const module = requireOptionalNativeModule<NativeDiagramImport>('DiagramImport');
  if (!module) throw new Error('PDF rendering and image alignment need a rebuilt iPhone development client. The original can still be saved for reference.');
  return module;
}
function validateResult(result: Result) {
  if (!result || typeof result.uri !== 'string' || ![result.width, result.height].every(n => Number.isFinite(n) && n > 0 && n <= 4096) || !Number.isInteger(result.pageCount) || result.pageCount < 1 || result.pageCount > 500) throw new Error('Document preparation returned an invalid image.');
}
export async function preparePage(source: DocumentAsset, page: number): Promise<{ page: PageImage; corners?: Quad }> {
  if (!Number.isInteger(page) || page < 1 || page > 500) throw new Error('Choose a valid PDF page.');
  const result = await native().page(await assetUri(source), source.mime === 'application/pdf', page);
  validateResult(result);
  if (page > result.pageCount) throw new Error('The selected PDF page does not exist.');
  const asset = await preserveFile(result.uri, 'Page.png', 'image/png'); recordDerivative(asset.path);
  return { page: { asset, width: result.width, height: result.height, page, pageCount: result.pageCount }, corners: result.corners };
}
export async function alignPage(page: PageImage, alignment: Alignment): Promise<PageImage> {
  if (!validQuad(alignment.corners) || !validCrop(alignment.crop) || ![0, 90, 180, 270].includes(alignment.rotation)) throw new Error('Set four non-crossing page corners and a crop inside the rotated page.');
  const result = await native().align(await assetUri(page.asset), alignment.corners, alignment.rotation, alignment.crop);
  validateResult(result);
  const asset = await preserveFile(result.uri, 'Aligned diagram.png', 'image/png'); recordDerivative(asset.path);
  return { ...page, asset, width: result.width, height: result.height };
}
