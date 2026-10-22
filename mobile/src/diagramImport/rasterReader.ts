import { requireOptionalNativeModule } from 'expo-modules-core';
import type { PageImage } from './model';
import type { Raster } from './recognition';
import { assetUri } from './assets';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Character code -> 6-bit value; 255 marks characters outside the alphabet. Built once. */
const LOOKUP = (() => { const table = new Uint8Array(128).fill(255); for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i; return table; })();
/**
 * Hermes-compatible decoder; no Buffer/atob/native image-processing dependency.
 * Uses a lookup table (O(1) per character) instead of searching the alphabet, which mattered for ~5.6 MB rasters.
 */
export function decodeRgba(base64:string,width:number,height:number):Uint8ClampedArray {
  if(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&(width<8||height<8))
    throw new Error('The aligned diagram is too small to analyze (under 8 pixels on a side). Widen the layout crop and try again.');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||width>1024||height>1024||typeof base64!=='string'||base64.length!==4*Math.ceil(width*height*4/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('Invalid bounded raster returned by the decoder.');
  const padding=(3-(width*height*4)%3)%3;
  if((base64.match(/=+$/)?.[0].length??0)!==padding)throw new Error('Invalid raster padding.');
  const out=new Uint8ClampedArray(width*height*4);let offset=0;
  const value=(i:number)=>{const code=base64.charCodeAt(i);return code===61?0:LOOKUP[code];}; // '=' padding decodes as 0
  for(let i=0;i<base64.length;i+=4){const a=value(i),b=value(i+1),c=value(i+2),d=value(i+3);out[offset++]=(a<<2)|(b>>4);if(offset<out.length)out[offset++]=((b&15)<<4)|(c>>2);if(offset<out.length)out[offset++]=((c&3)<<6)|d;}
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
