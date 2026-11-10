import { requireOptionalNativeModule } from 'expo-modules-core';
import { preserveFile, assetUri } from './assets';
import type { Alignment, DocumentAsset, PageImage, Quad } from './model';
import type { TextBox } from './briefing';
import { validCrop, validQuad } from './model';
import { recordDerivative } from './sessionFiles';

type Result = { uri: string; width: number; height: number; pageCount: number; corners?: Quad };
interface NativeDiagramImport {
  page(uri: string, pdf: boolean, page: number): Promise<Result>;
  align(uri: string, corners: Quad, rotation: number, crop: Alignment['crop']): Promise<Result>;
}
function native() {
  const module = requireOptionalNativeModule<NativeDiagramImport>('DiagramImport');
  if (!module) throw new Error('This needs the next version of the app on your iPhone to show PDF pages and straighten pictures. The original is kept for reference.');
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

/** Text the phone reads on a prepared page, or null when this version of the app can't read text. */
export async function recognizeText(page: PageImage): Promise<TextBox[] | null> {
  const module = requireOptionalNativeModule<{ recognizeText?(uri: string): Promise<TextBox[]> }>('DiagramImport');
  if (!module?.recognizeText) return null;
  const lines = await module.recognizeText(await assetUri(page.asset));
  const unit = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= -0.01 && n <= 1.01;
  return Array.isArray(lines) ? lines.filter(l => l && typeof l.text === 'string' && [l.x, l.y, l.width, l.height, l.confidence].every(unit)).slice(0, 500) : null;
}
