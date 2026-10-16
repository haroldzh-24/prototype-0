import type { PageImage, Proposal } from './model';
import { validProposal, imagePoint } from './model';

export function mergeDetections(existing:Proposal[],detected:Proposal[]) {
  const ids=new Set(existing.map(p=>p.id)),additions=detected.filter(p=>{if(ids.has(p.id))return false;ids.add(p.id);return true;});
  if(existing.length+additions.length>1000)throw new Error('Too many overlays. Crop a smaller layout.');
  // User corrections, rejections and accepted IDs always win over reruns.
  return [...existing,...additions];
}
export function acceptSelection(proposals:Proposal[],selectedIds:readonly string[],accepted:boolean) {
  const selected=new Set(selectedIds);
  const chosen=proposals.filter(p=>selected.has(p.id));
  if(!chosen.length)throw new Error('Select at least one overlay for the batch.');
  if(accepted&&chosen.some(p=>!validProposal(p)||['unknown','prop','port'].includes(p.type)))throw new Error('Classify each selected shape before accepting it. Unsupported props and ports need manual editor mapping.');
  return proposals.map(p=>selected.has(p.id)?{...p,accepted}:p);
}
export function editSegmentOverlay(p:Proposal,image:Pick<PageImage,'width'|'height'>,edit:{rotation?:number;lengthPixels?:number}):Proposal {
  if(!p.end)throw new Error('This overlay has no segment endpoints.');
  const dx=(p.end.x-p.position.x)*image.width,dy=(p.end.y-p.position.y)*image.height;
  const length=edit.lengthPixels??Math.hypot(dx,dy),rotation=edit.rotation??Math.atan2(dy,dx)*180/Math.PI;
  if(!Number.isFinite(length)||length<1||!Number.isFinite(rotation))throw new Error('Use a finite angle and segment length of at least one image pixel.');
  const end={x:p.position.x+Math.cos(rotation*Math.PI/180)*length/image.width,y:p.position.y+Math.sin(rotation*Math.PI/180)*length/image.height};
  if(!imagePoint(end))throw new Error('That segment would leave the diagram. Move its start or use a shorter length.');
  return {...p,end,rotation:(rotation%360+360)%360};
}
