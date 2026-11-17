import type { StageDocument } from '../stage/model';
import type { StageRoute } from './route';
import { positionName, targetName } from '../ui/words';

/**
 * The plan as one sentence per position, for VoiceOver on views it can't read (the 3D view, the plan canvas):
 * "Route, 3 positions. P1: T1, T2, then reload. On the way to P2: T3. P2: T4. …"
 * Positions are in route order; targets by their T-names; moving engagements on the way in.
 */
export function routeAsWords(stage: Pick<StageDocument, 'objects'>, route: Pick<StageRoute, 'positions' | 'reloads'> | null | undefined): string {
  if (!route?.positions.length) return 'No route planned yet.';
  const name = (id: string) => { const o = stage.objects.find(x => x.id === id); return o ? targetName(stage, o) || 'a target' : 'a removed target'; };
  const parts = route.positions.map((p, i) => {
    const moving = p.movingTargetIds?.length ? `On the way to ${positionName(i)}: ${p.movingTargetIds.map(name).join(', ')}. ` : '';
    const reload = route.reloads.some(r => r.positionId === p.id) ? ', then reload' : '';
    const shots = p.engagedTargetIds.length ? p.engagedTargetIds.map(name).join(', ') : 'no targets';
    return `${moving}${positionName(i)}: ${shots}${reload}.`;
  });
  return `Route, ${route.positions.length} position${route.positions.length === 1 ? '' : 's'}. ${parts.join(' ')}`;
}
