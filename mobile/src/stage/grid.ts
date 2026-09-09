import type { StageSize } from './coordinates';
export type GridLine = { axis: 'x' | 'y'; value: number; major: boolean };
/** Physical lines, never stage objects. Six-inch minors and twelve-inch majors. */
export function measurementGrid(stage: StageSize): GridLine[] {
  const lines: GridLine[] = [];
  for (const axis of ['x', 'y'] as const) {
    const end = axis === 'x' ? stage.width : stage.depth;
    for (let value = 0; value <= end; value += 6) lines.push({ axis, value, major: value % 12 === 0 });
  }
  return lines;
}
