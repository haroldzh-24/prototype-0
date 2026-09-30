import type { TargetObject } from './targetPlacement';
import { activeFaceExtent } from './targetFace';
/** Saved contour in face coordinates: X across, Z up. Ellipses use 48 display edges. */
export function presetFacePoints(item: TargetObject): [number, number][] {
  const shape = item.outline, w = item.geometry.faceWidth, h = item.geometry.faceHeight;
  const normalized = shape?.kind === 'polygon' ? shape.points : shape?.kind === 'ellipse'
    ? Array.from({ length: 48 }, (_,i) => [0.5+Math.cos(i*Math.PI/24)/2,0.5+Math.sin(i*Math.PI/24)/2] as const)
    : [[0,0],[1,0],[1,1],[0,1]];
  let points: [number,number][] = normalized.map(([x,y]) => [(x-.5)*w,(1-y)*h]);
  if (item.type !== 'cardboardTarget' && item.type !== 'noShootTarget') return points;
  const f = activeFaceExtent(item);
  for (const [axis,bound,sign] of [[0,f.left,1],[0,f.right,-1],[1,f.bottom,1],[1,f.top,-1]] as const) {
    const next: [number,number][] = [];
    for (let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length], insideA=(a[axis]-bound)*sign>=0,insideB=(b[axis]-bound)*sign>=0;
      if (insideA) next.push(a);
      if (insideA!==insideB) { const t=(bound-a[axis])/(b[axis]-a[axis]); next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]); }
    }
    points=next;
  }
  return points;
}
