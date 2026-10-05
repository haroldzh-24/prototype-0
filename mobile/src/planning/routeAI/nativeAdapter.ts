import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { RouteAIAdapter, Availability } from './types';
import { unavailableAdapter } from './adapter';
type Bridge = { getAvailability(): Promise<Availability>; createSession(id:string,instructions:string):Promise<void>; interpret(id:string,request:string):Promise<string>; format(id:string,result:string):Promise<string>; resetSession(id:string):Promise<void>; cancelGeneration?(id:string):Promise<void> };
export function productionAdapter(): RouteAIAdapter {
  if(Platform.OS!=='ios')return unavailableAdapter;
  let native:Bridge|null;
  try{native=requireOptionalNativeModule<Bridge>('RouteAI');}catch(error){return {...unavailableAdapter,async getAvailability(){throw error;}};}
  if(!native)return unavailableAdapter;
  return {cancelGeneration:id=>native.cancelGeneration?.(id)??native.resetSession(id),getAvailability:()=>native.getAvailability(),createSession:(id,i)=>native.createSession(id,i),resetSession:id=>native.resetSession(id),
    interpret:async(id,r)=>JSON.parse(await native.interpret(id,JSON.stringify(r))),format:(id,r)=>native.format(id,JSON.stringify(r))};
}
