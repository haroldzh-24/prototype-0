import type { Point, Quad } from './model';
import { validQuad } from './model';

/** Destination unit square -> source quadrilateral; inverse sampling avoids holes. */
export function quadMapping(q: Quad): (p: Point) => Point {
  if (!validQuad(q)) throw new Error('Invalid page quadrilateral.');
  const [a,b,c,d] = q, dx1 = b.x-c.x, dx2 = d.x-c.x, dx3 = a.x-b.x+c.x-d.x;
  const dy1 = b.y-c.y, dy2 = d.y-c.y, dy3 = a.y-b.y+c.y-d.y;
  const det = dx1*dy2-dx2*dy1;
  if (Math.abs(det) < 1e-10) throw new Error('Page corners are too close together.');
  const g = (dx3*dy2-dx2*dy3)/det, h = (dx1*dy3-dx3*dy1)/det;
  return p => {
    const divisor = g*p.x+h*p.y+1;
    return { x: ((b.x-a.x+g*b.x)*p.x+(d.x-a.x+h*d.x)*p.y+a.x)/divisor,
      y: ((b.y-a.y+g*b.y)*p.x+(d.y-a.y+h*d.y)*p.y+a.y)/divisor };
  };
}
