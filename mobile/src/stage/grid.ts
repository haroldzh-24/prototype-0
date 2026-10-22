import type { StageSize } from './coordinates';
import { inchesToYards } from './measurements';

const YARD = 36;
/** Labels fall on whole yards, thinned to every k yards so neighbouring labels stay at least `minGapPx` apart. */
export function gridLabelStepInches(scale: number, minGapPx: number): number {
  if (!(scale > 0) || !(minGapPx > 0)) return YARD;
  return YARD * Math.max(1, Math.ceil(minGapPx / (YARD * scale)));
}
export const isGridLabel = (value: number, stepInches: number) => value > 0 && Math.abs(value % stepInches) < 1e-9;
export const gridLabel = (value: number) => `${Number(inchesToYards(value).toFixed(2))} yd`;
export type GridLine = { axis: 'x' | 'y'; value: number; major: boolean };
/** Physical lines, never stage objects. Six-inch minors and twelve-inch majors. */
export function measurementGrid(stage: StageSize): GridLine[] {
  const lines: GridLine[] = [];
  for (const axis of ['x', 'y'] as const) {
    const end = axis === 'x' ? stage.width : stage.depth;
    const step = Math.max(6, Math.ceil(end / 6000) * 6);
    for (let i = 0; i <= 1000 && i * step <= end; i++) {
      const value = i * step;
      lines.push({ axis, value, major: value % 12 === 0 });
    }
  }
  return lines;
}
