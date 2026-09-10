import type { StageDocument, StageObject } from './model';
import { footprint } from './geometry';
import { activeFaceExtent } from './targetFace';

export type Point3 = { x: number; y: number; z: number };
export type Surface = { objectId: string; points: Point3[]; color: string; ground?: boolean };

/** Orthographic camera, 30-degree downward pitch; yaw rotates the ground axes. */
export function projectPoint(point: Point3, yaw = 45) {
  const r = yaw * Math.PI / 180;
  const across = point.x * Math.cos(r) - point.y * Math.sin(r);
  const away = point.x * Math.sin(r) + point.y * Math.cos(r);
  return { x: across, y: away * 0.5 - point.z * Math.sqrt(3) / 2,
    depth: away * Math.sqrt(3) / 2 + point.z * 0.5 };
}

/** Wall/target local X follows its length/width, local Z starts at bottom elevation. */
export function localToWorld(object: StageObject, x: number, y: number, z: number): Point3 {
  const r = object.rotation * Math.PI / 180;
  return { x: object.position.x + x * Math.cos(r) - y * Math.sin(r),
    y: object.position.y + x * Math.sin(r) + y * Math.cos(r), z: object.position.z + z };
}

/** Partition the wall at port boundaries. Empty cells are actual through-openings.
 * Only exposed cell faces are emitted, including jambs, sills and lintel undersides.
 * Union occupancy handles overlapping ports without filling either opening.
 */
export function wallSurfaces(wall: Extract<StageObject, { type: 'wall' }>): Surface[] {
  const { length, thickness, height } = wall.geometry;
  const xs = [...new Set([-length / 2, length / 2, ...wall.ports.flatMap(p => [p.offset - p.width / 2, p.offset + p.width / 2])])].sort((a,b) => a-b);
  const zs = [...new Set([0, height, ...wall.ports.flatMap(p => [p.sill, p.sill + p.height])])].sort((a,b) => a-b);
  const filled = xs.slice(1).map((x, i) => zs.slice(1).map((z, j) => !wall.ports.some(p =>
    (x + xs[i]) / 2 > p.offset - p.width / 2 && (x + xs[i]) / 2 < p.offset + p.width / 2 &&
    (z + zs[j]) / 2 > p.sill && (z + zs[j]) / 2 < p.sill + p.height)));
  const faces: Surface[] = [];
  const add = (points: number[][], color: string) => faces.push({ objectId: wall.id, color,
    points: points.map(([x,y,z]) => localToWorld(wall,x,y,z)) });
  const t = thickness / 2;
  for (let i=0;i<xs.length-1;i++) for (let j=0;j<zs.length-1;j++) {
    if (!filled[i][j]) continue;
    const a=xs[i], b=xs[i+1], c=zs[j], d=zs[j+1];
    add([[a,-t,c],[b,-t,c],[b,-t,d],[a,-t,d]], '#465346');
    add([[a,t,c],[b,t,c],[b,t,d],[a,t,d]], '#566450');
    if (!filled[i-1]?.[j]) add([[a,-t,c],[a,t,c],[a,t,d],[a,-t,d]], '#303d32');
    if (!filled[i+1]?.[j]) add([[b,-t,c],[b,t,c],[b,t,d],[b,-t,d]], '#3d4a3b');
    if (!filled[i]?.[j-1]) add([[a,-t,c],[b,-t,c],[b,t,c],[a,t,c]], '#253127');
    if (!filled[i]?.[j+1]) add([[a,-t,d],[b,-t,d],[b,t,d],[a,t,d]], '#738069');
  }
  return faces;
}

export function objectSurfaces(object: StageObject): Surface[] {
  if (object.type === 'wall') return wallSurfaces(object);
  const face = (points: number[][], color: string, ground = false): Surface[] => [{ objectId: object.id, color, ground,
    points: points.map(([x,y,z]) => localToWorld(object,x,y,z)) }];
  if (object.type === 'start' || object.type === 'faultLine') {
    const { width, depth } = footprint(object);
    return face([[-width/2,-depth/2,0],[width/2,-depth/2,0],[width/2,depth/2,0],[-width/2,depth/2,0]], object.type === 'start' ? '#64734d' : '#b9a663', true);
  }
  if (object.type === 'cardboardTarget' || object.type === 'noShootTarget') {
    const f = activeFaceExtent(object);
    return face([[f.left,0,f.bottom],[f.right,0,f.bottom],[f.right,0,f.top],[f.left,0,f.top]], object.type === 'cardboardTarget' ? '#9d8255' : '#dce0d5');
  }
  const w = object.geometry.faceWidth, h = object.geometry.faceHeight;
  if (object.type === 'steelPlate') return face([[-w/2,0,0],[w/2,0,0],[w/2,0,h],[-w/2,0,h]], '#8aa4a0');
  // Representative upright popper contour, scaled only from stored width/overall height.
  // This is illustrative, not a certified contour or visibility/scoring geometry.
  return face([[-0.25,0],[0.25,0],[0.12,0.48],[0.4,0.62],[0.5,0.78],[0.35,0.94],[0,1],[-0.35,0.94],[-0.5,0.78],[-0.4,0.62],[-0.12,0.48]].map(([x,z]) => [x*w,0,z*h]), '#728e88');
}

/** Read-only snapshot of render surfaces, never another editable document. */
export function stageSurfaces(stage: StageDocument): Surface[] {
  return [{ objectId: '', color: '#202a21', ground: true, points: [
    {x:0,y:0,z:0},{x:stage.stage.width,y:0,z:0},{x:stage.stage.width,y:stage.stage.depth,z:0},{x:0,y:stage.stage.depth,z:0},
  ] }, ...stage.objects.flatMap(objectSurfaces)];
}

/** SVG uses only basic polygons/lines/text supported by the installed expo-image renderer. */
export function stageSvg(stage: StageDocument, yaw: number, zoom: number, selectedId: string | null): string {
  const surfaces = stageSurfaces(stage).map(surface => ({ ...surface, projected: surface.points.map(p => projectPoint(p,yaw)) }));
  const points = surfaces.flatMap(s => s.projected);
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const scale = Math.min(920 / Math.max(1,maxX-minX), 600 / Math.max(1,maxY-minY)) * zoom;
  const screen = (p: { x: number; y: number }) => ({ x: 480+(p.x-(minX+maxX)/2)*scale, y: 320+(p.y-(minY+maxY)/2)*scale });
  const xy = (p: {x:number;y:number}) => { const q=screen(p); return q.x.toFixed(3)+','+q.y.toFixed(3); };
  const polygon = (s: typeof surfaces[number]) => '<polygon points="'+s.projected.map(xy).join(' ')+'" fill="'+s.color+'" stroke="'+(s.objectId === selectedId ? '#60b5bc' : '#82907a')+'" stroke-width="'+(s.objectId === selectedId ? 2 : 0.45)+'" stroke-linejoin="round"/>';
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="#101611"/>'+polygon(surfaces[0]);
  // Five-foot grid provides a physical distance reference without excessive detail.
  for (const axis of ['x','y'] as const) {
    const end = axis === 'x' ? stage.stage.width : stage.stage.depth;
    for (let value=60;value<end;value+=60) {
      const a = axis === 'x' ? {x:value,y:0,z:0} : {x:0,y:value,z:0};
      const b = axis === 'x' ? {x:value,y:stage.stage.depth,z:0} : {x:stage.stage.width,y:value,z:0};
      svg += '<polyline points="'+xy(projectPoint(a,yaw))+' '+xy(projectPoint(b,yaw))+'" stroke="#394637" stroke-width="0.7"/>';
    }
  }
  const rest=surfaces.slice(1);
  // Painter ordering is deliberately basic; this is visualization, not visibility solving.
  rest.sort((a,b) => Number(!!b.ground)-Number(!!a.ground) ||
    a.projected.reduce((n,p)=>n+p.depth,0)/a.projected.length-b.projected.reduce((n,p)=>n+p.depth,0)/b.projected.length);
  for (const surface of rest) svg += polygon(surface);
  const start=stage.objects.find(o=>o.type==='start');
  if (start) { const p=screen(projectPoint(start.position,yaw)); svg+='<text x="'+p.x+'" y="'+p.y+'" text-anchor="middle" fill="#d3c084" font-size="12">START</text>'; }
  return svg+'</svg>';
}
