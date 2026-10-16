import { requireOptionalNativeModule } from 'expo-modules-core';
import type { PageImage } from './model';
import type { Raster } from './recognition';
import { assetUri } from './assets';

/** Hermes-compatible decoder; no Buffer/atob/native image-processing dependency. */
export function decodeRgba(base64:string,width:number,height:number):Uint8ClampedArray {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||width>1024||height>1024||typeof base64!=='string'||base64.length!==4*Math.ceil(width*height*4/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('Invalid bounded raster returned by the decoder.');
  const padding=(3-(width*height*4)%3)%3;
  if((base64.match(/=+$/)?.[0].length??0)!==padding)throw new Error('Invalid raster padding.');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',out=new Uint8ClampedArray(width*height*4);let offset=0;
  for(let i=0;i<base64.length;i+=4){const a=alphabet.indexOf(base64[i]),b=alphabet.indexOf(base64[i+1]),c=alphabet.indexOf(base64[i+2]),d=alphabet.indexOf(base64[i+3]);out[offset++]=(a<<2)|(b>>4);if(offset<out.length)out[offset++]=((b&15)<<4)|(Math.max(0,c)>>2);if(offset<out.length)out[offset++]=((Math.max(0,c)&3)<<6)|Math.max(0,d);}
  return out;
}
export async function readRaster(page:PageImage,signal:AbortSignal):Promise<Raster> {
  if(signal.aborted)throw new Error('Recognition cancelled.');
  const native=requireOptionalNativeModule<{pixels(uri:string):Promise<{width:number;height:number;rgba:string}>}>('DiagramImport');
  if(!native?.pixels)throw new Error('Automatic detection needs a rebuilt iPhone client with raster decoding. Manual reconstruction is still available.');
  const result=await native.pixels(await assetUri(page.asset));
  if(signal.aborted)throw new Error('Recognition cancelled.');
  return {width:result.width,height:result.height,rgba:decodeRgba(result.rgba,result.width,result.height)};
}
