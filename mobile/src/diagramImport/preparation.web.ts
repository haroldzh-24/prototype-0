import type { Alignment, DocumentAsset, PageImage } from './model';
import { fullQuad, validCrop, validQuad } from './model';
import { assetUri, storeBlob } from './assets.web';
import { quadMapping } from './warp';
import { recordDerivative } from './sessionFiles';

async function image(asset: DocumentAsset) {
  const element = new Image(); element.src = await assetUri(asset); await element.decode();
  if (!element.naturalWidth || !element.naturalHeight || element.naturalWidth*element.naturalHeight > 80_000_000) throw new Error('This image is too large to prepare. Export a smaller diagram.');
  return element;
}
function canvas(w: number, h: number) {
  const element = document.createElement('canvas'); element.width = Math.max(1,Math.round(w)); element.height = Math.max(1,Math.round(h));
  const context = element.getContext('2d'); if (!context) throw new Error('Image preparation is unavailable in this browser.');
  return { element, context };
}
async function saved(element: HTMLCanvasElement, page: number, pageCount: number): Promise<PageImage> {
  const blob = await new Promise<Blob>((resolve,reject) => element.toBlob(b => b ? resolve(b) : reject(new Error('Could not save the image.')), 'image/png'));
  const asset = await storeBlob(blob,'Diagram.png'); recordDerivative(asset.path);
  return { asset, width: element.width, height: element.height, page, pageCount };
}
export async function preparePage(source: DocumentAsset, page: number) {
  if (source.mime === 'application/pdf') throw new Error('PDF page rendering currently needs the rebuilt iPhone app. Import a PNG/JPEG page export here, or save this PDF as a reference.');
  if (page !== 1) throw new Error('An image has only one page.');
  const input = await image(source), factor = Math.min(1,2048/Math.max(input.naturalWidth,input.naturalHeight));
  const {element,context} = canvas(input.naturalWidth*factor,input.naturalHeight*factor); context.drawImage(input,0,0,element.width,element.height);
  return { page: await saved(element,1,1), corners: fullQuad() };
}
export async function alignPage(page: PageImage, alignment: Alignment): Promise<PageImage> {
  if (!validQuad(alignment.corners) || !validCrop(alignment.crop) || ![0,90,180,270].includes(alignment.rotation)) throw new Error('Set valid page corners, rotation and diagram crop.');
  const input = await image(page.asset), source = canvas(page.width,page.height); source.context.drawImage(input,0,0,page.width,page.height);
  const pixels = source.context.getImageData(0,0,page.width,page.height), q = alignment.corners;
  const distance = (a: typeof q[0],b: typeof q[0]) => Math.hypot((a.x-b.x)*page.width,(a.y-b.y)*page.height);
  const width = Math.max(1,Math.round((distance(q[0],q[1])+distance(q[3],q[2]))/2)), height = Math.max(1,Math.round((distance(q[0],q[3])+distance(q[1],q[2]))/2));
  const factor = Math.min(1,2048/Math.max(width,height)), warped = canvas(width*factor,height*factor);
  const output = warped.context.createImageData(warped.element.width,warped.element.height), map = quadMapping(q);
  for (let y=0;y<warped.element.height;y++) {
    for (let x=0;x<warped.element.width;x++) {
      const p=map({x:(x+.5)/warped.element.width,y:(y+.5)/warped.element.height}), sx=Math.max(0,Math.min(page.width-1,Math.floor(p.x*page.width))),sy=Math.max(0,Math.min(page.height-1,Math.floor(p.y*page.height)));
      const from=(sy*page.width+sx)*4,to=(y*warped.element.width+x)*4;output.data.set(pixels.data.subarray(from,from+4),to);
    }
    if (y%64===0) await new Promise(resolve=>setTimeout(resolve,0)); // Keep large manual corrections interruptible by the UI.
  }
  warped.context.putImageData(output,0,0);
  const swap=alignment.rotation===90||alignment.rotation===270,rotated=canvas(swap?warped.element.height:warped.element.width,swap?warped.element.width:warped.element.height);
  rotated.context.translate(rotated.element.width/2,rotated.element.height/2);rotated.context.rotate(alignment.rotation*Math.PI/180);rotated.context.drawImage(warped.element,-warped.element.width/2,-warped.element.height/2);
  const c=alignment.crop,result=canvas(c.width*rotated.element.width,c.height*rotated.element.height);
  result.context.drawImage(rotated.element,c.x*rotated.element.width,c.y*rotated.element.height,c.width*rotated.element.width,c.height*rotated.element.height,0,0,result.element.width,result.element.height);
  return saved(result.element,page.page,page.pageCount);
}
