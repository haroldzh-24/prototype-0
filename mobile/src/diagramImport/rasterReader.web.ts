import type { PageImage } from './model';
import type { Raster } from './recognition';
import { assetUri } from './assets.web';
export async function readRaster(page:PageImage,signal:AbortSignal):Promise<Raster> {
  if(signal.aborted)throw new Error('Recognition cancelled.');
  const image=new Image();image.src=await assetUri(page.asset);await image.decode();
  if(signal.aborted)throw new Error('Recognition cancelled.');
  if(image.naturalWidth!==page.width||image.naturalHeight!==page.height)throw new Error('The saved raster no longer matches this page. Prepare it again.');
  const factor=Math.min(1,1024/Math.max(page.width,page.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(page.width*factor));canvas.height=Math.max(1,Math.round(page.height*factor));
  const context=canvas.getContext('2d');if(!context)throw new Error('This browser cannot decode the diagram. Manual reconstruction is available.');
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
  if(signal.aborted)throw new Error('Recognition cancelled.');
  return {width:canvas.width,height:canvas.height,rgba};
}
