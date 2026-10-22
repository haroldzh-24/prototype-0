import { nudgeInside, project, strictlyInside } from '../routeSolver/traversability';
import type { NormalizedStage } from './normalizeStage';
import type { Point } from './types';

export type Candidate = { id: string; point: Point; source: 'start' | 'grid' | 'vertex' | 'nearest' };

/**
 * Candidate shooting positions, deterministic for a given stage:
 * - the start, when it is strictly inside a firing area;
 * - grid cell centres inside each firing area (spacing in inches);
 * - each area vertex stepped inward;
 * - for each target, the point of each area's boundary nearest the target, stepped inward.
 * Every candidate is strictly inside a firing area and traversable (inside the stage, clear of walls and stands).
 * When the grid would exceed the bound, its spacing is coarsened evenly; special points are always kept.
 */
export function candidatePositions(stage: NormalizedStage, spacing: number, maxCandidates: number, traversable: (p: Point) => boolean, clearance: number): { candidates: Candidate[]; truncated: boolean } {
  const special: Candidate[] = [], seen = new Set<string>();
  const add = (list: Candidate[], point: Point, source: Candidate['source']) => {
    const k = `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
    if (seen.has(k) || !traversable(point) || !stage.areas.some(a => strictlyInside(point, a.vertices))) return;
    seen.add(k); list.push({ id: '', point: { x: point.x, y: point.y }, source });
  };
  add(special, stage.start, 'start');
  const inset = [clearance + 1, clearance + 3, clearance + 6];
  for (const area of stage.areas) {
    const v = area.vertices, n = v.length;
    const cx = v.reduce((s, p) => s + p.x, 0) / n, cy = v.reduce((s, p) => s + p.y, 0) / n;
    for (const p of v) {
      // Step from the vertex toward the vertex centroid; keep the first step that lands strictly inside.
      const dx = cx - p.x, dy = cy - p.y, len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      for (const step of inset) { const q = { x: p.x + dx / len * Math.min(step, len / 2), y: p.y + dy / len * Math.min(step, len / 2) }; if (strictlyInside(q, v)) { add(special, q, 'vertex'); break; } }
    }
    for (const target of stage.targets) {
      let best: Point | null = null, bestD = Infinity;
      for (let i = 0; i < n; i++) { const q = project(target.center, v[i], v[(i + 1) % n]), d = Math.hypot(q.x - target.center.x, q.y - target.center.y); if (d < bestD) { bestD = d; best = q; } }
      if (best) { const q = strictlyInside(best, v) ? best : nudgeInside(best, v, inset); if (q) add(special, q, 'nearest'); }
    }
  }
  // Grid points: coarsen the spacing evenly (never below the requested spacing) until they fit the bound.
  const room = Math.max(0, maxCandidates - special.length);
  let step = spacing, truncated = false, grid: Candidate[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    grid = [];
    for (const area of stage.areas) {
      const v = area.vertices, xs = v.map(p => p.x), ys = v.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      for (let y = minY + step / 2; y < maxY; y += step) for (let x = minX + step / 2; x < maxX; x += step) add(grid, { x, y }, 'grid');
    }
    if (grid.length <= room) break;
    truncated = true;
    for (const c of grid) seen.delete(`${c.point.x.toFixed(6)},${c.point.y.toFixed(6)}`);
    step *= Math.sqrt(grid.length / Math.max(1, room)) * 1.02;
  }
  const kept = grid.length > room ? grid.slice(0, room) : grid;
  const candidates = [...special, ...kept].map((c, i) => ({ ...c, id: c.source === 'start' ? 'start' : `c${i}` }));
  return { candidates, truncated };
}
