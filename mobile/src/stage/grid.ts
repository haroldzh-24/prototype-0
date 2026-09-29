import type { StageSize } from './coordinates';
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
