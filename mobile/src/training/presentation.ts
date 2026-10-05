import type { TrainingContext } from './observations';
import type { StartingType } from './model';
import { plannedElements } from './executionComparison';
import type { ExecutionComparison, MappingKind } from './executionComparison';

export const contextLabels: Record<TrainingContext, string> = {
  DRY_FIRE: 'Dry Fire', LIVE_FIRE: 'Live Fire', PRESSURE_MATCH: 'Pressure / Match',
};
export const startLabels: Record<StartingType, string> = {
  competitionHolster: 'Competition Holster', retentionHolster: 'Level II / III Holster',
  appendix: 'Appendix', lowReady: 'Low Ready', highReady: 'High Ready', surrender: 'Surrender',
};
export function metricValue(value: number | null | undefined, unit: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} ${unit}` : '—';
}

/** Presentation only: persisted mapping IDs and comparison calculations stay intact. */
export function labeledPlanElements(comparison: ExecutionComparison, kind: MappingKind) {
  return plannedElements(comparison, kind).map(element => {
    if (kind !== 'MOVEMENT') return element;
    const route = comparison.snapshot?.plan.route;
    const segment = comparison.snapshot?.evaluation.segments.find(s => s.toId === element.id);
    if (!route || !segment) return element;
    const label = (id: string) => { const index = route.positions.findIndex(p => p.id === id); return index < 0 ? 'Start' : `Waypoint ${index + 1} · ${route.positions[index].label}`; };
    return { ...element, label: `${label(segment.fromId)} → ${label(segment.toId)}` };
  });
}
