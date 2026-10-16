import type { Crop, Point, Proposal } from './model';
import type { DiagramRecognizer, Raster, SymbolTemplate } from './recognition';

export const DETECTOR_ID = 'clean-geometry-v1';
export const MAX_RASTER_SIDE = 1024;
const MAX_COMPONENTS = 2000, MAX_PROPOSALS = 200, SIGNATURE = 16;
type Component = { x0:number; y0:number; x1:number; y1:number; count:number; pixels:number[]; signature:Uint8Array };
export type GeometryDiagnostics = { processedWidth:number; processedHeight:number; suppressedTextComponents:number; suppressedBorders:number; componentCount:number; grid?:{ xSpacing:number; ySpacing:number }; corners:Point[] };
export type GeometryResult = { proposals:Proposal[]; projection:'unknown'; warnings:string[]; diagnostics:GeometryDiagnostics };
export function stableHash(value:string):string {
  let hash=2166136261; for(let i=0;i<value.length;i++) hash=Math.imul(hash^value.charCodeAt(i),16777619);
  return (hash>>>0).toString(36);
}
function signature(mask:Uint8Array,w:number,c:Omit<Component,'signature'>) {
  const output=new Uint8Array(SIGNATURE*SIGNATURE),width=c.x1-c.x0+1,height=c.y1-c.y0+1;
  for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++)if(mask[y*w+x])output[Math.min(SIGNATURE-1,Math.floor((y-c.y0)*SIGNATURE/height))*SIGNATURE+Math.min(SIGNATURE-1,Math.floor((x-c.x0)*SIGNATURE/width))]=1;
  return output;
}
function similarity(a:Uint8Array,b:Uint8Array) { let union=0,intersection=0;for(let i=0;i<a.length;i++){if(a[i]||b[i])union++;if(a[i]&&b[i])intersection++;}return union?intersection/union:0; }
function regularPeaks(values:Uint32Array,span:number) {
  const peaks:number[]=[];
  for(let i=0;i<values.length;i++)if(values[i]>=span*.8){let end=i;while(end+1<values.length&&values[end+1]>=span*.8)end++;if(end-i<=2)peaks.push(Math.round((i+end)/2));i=end;}
  if(peaks.length<4)return [];
  const gaps=peaks.slice(1).map((p,i)=>p-peaks[i]),mean=gaps.reduce((s,n)=>s+n,0)/gaps.length;
  return mean>=8&&gaps.every(g=>Math.abs(g-mean)<=Math.max(2,mean*.12))?peaks:[];
}
export function createGeometryRecognizer(templates:readonly SymbolTemplate[]=[]):DiagramRecognizer {
  if(templates.length>16)throw new Error('Use at most 16 evaluated symbol templates.');
  for(const t of templates)if(!t.id||!t.application||!t.version||t.raster.width>64||t.raster.height>64||t.raster.width<1||t.raster.height<1||t.raster.rgba.length!==t.raster.width*t.raster.height*4)throw new Error('Templates need application/version provenance and a bounded raster.');
  return {id:DETECTOR_ID,templates,recognize:({raster,signal})=>detectGeometry(raster,signal,templates)};
}
/** Bounded local geometry heuristics. Confidence measures heuristic agreement, not real-world probability. */
export async function detectGeometry(raster:Raster,signal:AbortSignal,templates:readonly SymbolTemplate[]=[]):Promise<GeometryResult> {
  const started=Date.now(),w=raster.width,h=raster.height,n=w*h,unit=Math.max(w,h)/256;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<8||h<8||w>MAX_RASTER_SIDE||h>MAX_RASTER_SIDE||raster.rgba.length!==n*4)throw new Error('Use a decoded diagram raster between 8 and 1024 pixels per side.');
  const checkpoint=async()=>{if(signal.aborted)throw new Error('Recognition cancelled.');if(Date.now()-started>10000)throw new Error('Recognition took too long. Crop a simpler region or reconstruct manually.');await new Promise(resolve=>setTimeout(resolve,0));if(signal.aborted)throw new Error('Recognition cancelled.');};
  await checkpoint();
  const mask=new Uint8Array(n),gray=new Uint8Array(n),rows=new Uint32Array(h),cols=new Uint32Array(w);let dark=0;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){const i=y*w+x,j=i*4,alpha=raster.rgba[j+3]/255;const light=Math.round((.2126*raster.rgba[j]+.7152*raster.rgba[j+1]+.0722*raster.rgba[j+2])*alpha+255*(1-alpha));gray[i]=light;if(light<140){mask[i]=1;dark++;}if(light<235){rows[y]++;cols[x]++;}}
    if(y%64===0)await checkpoint();
  }
  const diagnostics:GeometryDiagnostics={processedWidth:w,processedHeight:h,suppressedTextComponents:0,suppressedBorders:0,componentCount:0,corners:[]};
  const warnings=['Prototype geometry only: classify unknown shapes, verify wall candidates, and reject text/decorations. No target icon determines scale.'];
  if(dark/n>.35)return {proposals:[],projection:'unknown',warnings:['The crop is too dark or dense for clean-diagram detection. Crop a clean top-down layout or reconstruct manually.'],diagnostics};
  const gx=regularPeaks(cols,h),gy=regularPeaks(rows,w);
  if(gx.length&&gy.length){diagnostics.grid={xSpacing:(gx.at(-1)!-gx[0])/(gx.length-1)/w,ySpacing:(gy.at(-1)!-gy[0])/(gy.length-1)/h};
    for(const x of gx){let tone=0;for(let y=0;y<h;y++)tone+=gray[y*w+x];if(tone/h>=140)continue;for(let y=0;y<h;y++)for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx>=0&&xx<w&&!(xx>1&&xx<w-2&&mask[y*w+xx-2]&&mask[y*w+xx+2]))mask[y*w+xx]=0;}}
    for(const y of gy){let tone=0;for(let x=0;x<w;x++)tone+=gray[y*w+x];if(tone/w>=140)continue;for(let x=0;x<w;x++)for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy>=0&&yy<h&&!(yy>1&&yy<h-2&&mask[(yy-2)*w+x]&&mask[(yy+2)*w+x]))mask[yy*w+x]=0;}}
    warnings.push('Regular grid candidate excluded from objects. Pixel spacing is not a real-world dimension; calibrate a known printed interval manually.');
  }
  const visited=new Uint8Array(n),queue=new Int32Array(n),components:Component[]=[];
  for(let seed=0;seed<n;seed++){
    if(!mask[seed]||visited[seed])continue;
    let head=0,tail=1,x0=w,y0=h,x1=0,y1=0;queue[0]=seed;visited[seed]=1;
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx>=0&&yy>=0&&xx<w&&yy<h&&mask[j]&&!visited[j]){visited[j]=1;queue[tail++]=j;}}
      if(head%8192===0)await checkpoint();
    }
    diagnostics.componentCount++;
    if(diagnostics.componentCount>MAX_COMPONENTS)throw new Error('Too many small components. Crop out briefing text/noise or reconstruct manually.');
    if(tail<10||Math.max(x1-x0,y1-y0)<10*unit)continue;
    if((x0<=1||y0<=1||x1>=w-2||y1>=h-2)&&((x1-x0)>w*.7||(y1-y0)>h*.7)){diagnostics.suppressedBorders++;continue;}
    const c={x0,y0,x1,y1,count:tail,pixels:Array.from(queue.subarray(0,tail))};components.push({...c,signature:signature(mask,w,c)});
    if(components.length%16===0)await checkpoint();
  }
  // Suppress small similarly sized glyph runs. This is not OCR, and isolated glyphs can still be false positives.
  const text=new Set<number>();
  for(let i=0;i<components.length;i++){
    if(i%64===0)await checkpoint();
    const c=components[i],ch=c.y1-c.y0+1;if(ch>24*unit||c.x1-c.x0+1>32*unit)continue;
    const neighbors:number[]=[];
    for(let j=0;j<components.length;j++){const b=components[j];if(Math.abs(b.y0-c.y0)<ch*.3&&Math.abs((b.y1-b.y0+1)-ch)<ch*.35&&Math.abs((b.x0+b.x1-c.x0-c.x1)/2)<ch*5)neighbors.push(j);}
    if(neighbors.length>=3)neighbors.forEach(j=>text.add(j));
  }
  diagnostics.suppressedTextComponents=text.size;
  const proposals:Proposal[]=[],shapes:Component[]=[];
  const bounds=(c:Component):Crop=>({x:c.x0/w,y:c.y0/h,width:(c.x1-c.x0+1)/w,height:(c.y1-c.y0+1)/h});
  const add=(c:Component,shape:'line'|'rectangle'|'circle'|'symbol',position:Point,end?:Point,rotation=0,wall=false)=>{
    const box=bounds(c),id=['dg',shape,c.x0,c.y0,c.x1,c.y1].join('-')+'-'+stableHash([shape,c.x0,c.y0,c.x1,c.y1,position.x.toFixed(5),position.y.toFixed(5),end?.x.toFixed(5),end?.y.toFixed(5)].join(':'));
    if(proposals.some(p=>p.id===id))return;
    const p:Proposal={id,type:wall?'wall':'unknown',position,...(end?{end}:{}),rotation,accepted:false,approximate:true,source:DETECTOR_ID,confidence:wall ? .65 : (shape==='circle'||shape==='rectangle' ? .7 : .45),extent:{width:box.width,height:box.height},notes:wall?'Solid elongated shape: possible wall. Verify wall/fault-line/decorative meaning.':'Unclassified '+shape+'. Geometry alone does not establish a target, prop, boundary or start.',recognition:{shape,bounds:box,sourceImage:{path:'diagram-imports/pending.png',page:1},scaleStatus:'uncalibrated'}};
    p.position={x:Math.max(0,Math.min(1,p.position.x)),y:Math.max(0,Math.min(1,p.position.y))};if(p.end)p.end={x:Math.max(0,Math.min(1,p.end.x)),y:Math.max(0,Math.min(1,p.end.y))};
    proposals.push(p);shapes.push(c);
    if(proposals.length>MAX_PROPOSALS)throw new Error('More than 200 candidates. Crop a smaller region or reconstruct manually.');
  };
  for(let ci=0;ci<components.length;ci++){
    if(text.has(ci))continue;
    if(ci%16===0)await checkpoint();
    const c=components[ci],cw=c.x1-c.x0+1,ch=c.y1-c.y0+1,fill=c.count/(cw*ch),cx=(c.x0+c.x1)/2,cy=(c.y0+c.y1)/2;
    let sx=0,sy=0;for(const i of c.pixels){sx+=i%w;sy+=Math.floor(i/w);}const mx=sx/c.count,my=sy/c.count;
    let xx=0,yy=0,xy=0;for(const i of c.pixels){const dx=i%w-mx,dy=Math.floor(i/w)-my;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
    const angle=.5*Math.atan2(2*xy,xx-yy),cos=Math.cos(angle),sin=Math.sin(angle);let lo=Infinity,hi=-Infinity,sideLo=Infinity,sideHi=-Infinity;
    for(const i of c.pixels){const dx=i%w-mx,dy=Math.floor(i/w)-my,t=dx*cos+dy*sin,s=-dx*sin+dy*cos;lo=Math.min(lo,t);hi=Math.max(hi,t);sideLo=Math.min(sideLo,s);sideHi=Math.max(sideHi,s);}
    const length=hi-lo+1,thickness=sideHi-sideLo+1;
    if(length>=24*unit&&length/thickness>=5&&thickness<=Math.max(w,h)*.08&&c.count/(length*thickness)>.4){const shift=(sideLo+sideHi)/2;
      add(c,'line',{x:(mx+lo*cos-shift*sin)/w,y:(my+lo*sin+shift*cos)/h},{x:(mx+hi*cos-shift*sin)/w,y:(my+hi*sin+shift*cos)/h},(angle*180/Math.PI+180)%180,thickness>=3*unit&&c.count/(length*thickness)>.65);continue;}
    const band=Math.max(1,Math.round(Math.min(cw,ch)*.08));let edge=0,interior=0,radial=0,top=0,bottom=0,left=0,right=0;const angular=new Uint8Array(16);
    for(const i of c.pixels){const x=i%w,y=Math.floor(i/w);if(x<c.x0+band||x>c.x1-band||y<c.y0+band||y>c.y1-band)edge++;else interior++;if(y<c.y0+band)top++;if(y>c.y1-band)bottom++;if(x<c.x0+band)left++;if(x>c.x1-band)right++;const r=Math.hypot((x-cx)/(cw/2),(y-cy)/(ch/2));radial+=Math.abs(r-1);if(r>.65)angular[Math.min(15,Math.floor((Math.atan2((y-cy)/ch,(x-cx)/cw)+Math.PI)/(2*Math.PI)*16))]=1;}
    const rectangular=cw>=12*unit&&ch>=12*unit&&Math.max(cw/ch,ch/cw)<5&&((edge/c.count>.8&&interior/c.count<.2&&top>=cw*.65&&bottom>=cw*.65&&left>=ch*.65&&right>=ch*.65)||fill>.92);
    if(rectangular){add(c,'rectangle',{x:cx/w,y:cy/h});continue;}
    const circular=angular.reduce((s,n)=>s+n,0)>=14&&Math.min(cw,ch)>=12*unit&&cw/ch>.8&&cw/ch<1.25&&(radial/c.count<.15||fill>.65&&fill<.83);
    if(circular){add(c,'circle',{x:cx/w,y:cy/h});continue;}
    // Split connected orthogonal boundary strokes into runs; filled bodies/symbols are kept whole.
    if(fill<.35){const runs:{orientation:'h'|'v';fixed:number;start:number;end:number;thickness:number}[]=[];
      for(const orientation of ['h','v'] as const){const outer0=orientation==='h'?c.y0:c.x0,outer1=orientation==='h'?c.y1:c.x1,inner0=orientation==='h'?c.x0:c.y0,inner1=orientation==='h'?c.x1:c.y1;
        for(let fixed=outer0;fixed<=outer1;fixed++)for(let start=inner0;start<=inner1;start++){
          const at=(t:number)=>mask[orientation==='h'?fixed*w+t:t*w+fixed];if(!at(start))continue;let end=start;while(end+1<=inner1&&at(end+1))end++;
          if(end-start>=24*unit){const old=runs.find(r=>r.orientation===orientation&&Math.abs(r.fixed-fixed)<=r.thickness+1&&Math.abs(r.start-start)<=3&&Math.abs(r.end-end)<=3);if(old)old.thickness++;else runs.push({orientation,fixed,start,end,thickness:1});}start=end;
        }
      }
      const long=runs.filter(r=>r.thickness<=Math.max(8*unit,Math.min(cw,ch)*.2));
      if(long.length>=2&&long.length<=12){for(const r of long){const fixed=r.fixed+(r.thickness-1)/2,part={...c,x0:r.orientation==='h'?r.start:Math.floor(fixed),x1:r.orientation==='h'?r.end:Math.ceil(fixed),y0:r.orientation==='h'?Math.floor(fixed):r.start,y1:r.orientation==='h'?Math.ceil(fixed):r.end};
          add(part,'line',{x:(r.orientation==='h'?r.start:fixed)/w,y:(r.orientation==='h'?fixed:r.start)/h},{x:(r.orientation==='h'?r.end:fixed)/w,y:(r.orientation==='h'?fixed:r.end)/h},r.orientation==='h'?0:90);
        }continue;}
    }
    if(cw>=12&&ch>=12)add(c,'symbol',{x:cx/w,y:cy/h});
    if(ci%16===0)await checkpoint();
  }
  // Repeated silhouettes are a group, not an inferred semantic class.
  for(let i=0;i<proposals.length;i++){
    if(i%16===0)await checkpoint();
    if(proposals[i].end||proposals[i].recognition?.groupId)continue;
    const group=proposals.map((p,j)=>({p,j})).filter(({p,j})=>!p.end&&Math.abs((shapes[i].x1-shapes[i].x0+1)/(shapes[i].y1-shapes[i].y0+1)-(shapes[j].x1-shapes[j].x0+1)/(shapes[j].y1-shapes[j].y0+1))<.15&&similarity(shapes[i].signature,shapes[j].signature)>.88);
    if(group.length>1){const id='repeat-'+stableHash(group.map(({p})=>p.id).sort().join(':'));for(const {p} of group){p.recognition!.groupId=id;p.notes+=' Repeated silhouette; all members still need classification.';}}
  }
  // Templates are explicitly supplied by a caller, never universal vendor icon assumptions.
  const templateMasks=templates.map(t=>{const mask=new Uint8Array(t.raster.width*t.raster.height);for(let i=0;i<mask.length;i++){const j=i*4;mask[i]=t.raster.rgba[j+3]>128&&(t.raster.rgba[j]+t.raster.rgba[j+1]+t.raster.rgba[j+2])/3<140?1:0;}const c={x0:0,y0:0,x1:t.raster.width-1,y1:t.raster.height-1,count:0,pixels:[]};return {t,mask:signature(mask,t.raster.width,c)};});
  proposals.forEach((p,i)=>{if(p.end||!templates.length)return;const matches=templateMasks.map(t=>({...t,score:similarity(shapes[i].signature,t.mask)})).sort((a,b)=>b.score-a.score);const best=matches[0];if(best.score>=.9&&(!matches[1]||best.score-matches[1].score>=.08)&&!['wall','faultLine'].includes(best.t.type)){p.type=best.t.type;p.recognition!.templateId=best.t.id;p.confidence=best.score;p.notes=`Template candidate ${best.t.application} / ${best.t.version} / ${best.t.id}. Verify symbol meaning. `+best.t.notes;}});
  const lines=proposals.filter(p=>p.end);
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++)for(const a of [lines[i].position,lines[i].end!])for(const b of [lines[j].position,lines[j].end!])if(Math.hypot((a.x-b.x)*w,(a.y-b.y)*h)<=4*unit){const point={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(!diagnostics.corners.some(p=>Math.hypot((p.x-point.x)*w,(p.y-point.y)*h)<4*unit))diagnostics.corners.push(point);}
  if(text.size)warnings.push('Suppressed probable text runs. Isolated glyphs, logos, legends and dimension arrows can still be false candidates; review or crop them out.');
  if(!proposals.length)warnings.push('No supported clean geometry found. Use manual overlays; this is not evidence that the stage is empty.');
  await checkpoint();
  return {proposals:proposals.sort((a,b)=>a.position.y-b.position.y||a.position.x-b.position.x||a.id.localeCompare(b.id)),projection:'unknown',warnings,diagnostics};
}
