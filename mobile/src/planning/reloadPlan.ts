/**
 * Plan reloads around magazine capacity (roadmap C4). Walks the route with the route evaluator's ammunition rules:
 * when a position would run dry, it reloads on the leg (or at the position) since the last reload that hides the most
 * reload time behind movement and still carries you through to that position, using the fullest unused magazine.
 * It never invents magazines: with none left it stops and says so.
 */
import type { StageDocument } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import type { StagePlan } from './model';
import { evaluateRoute } from './route';
import type { StageRoute } from './route';

export type ReloadPlan = { route: StageRoute; added: number; complete: boolean; note: string };

export function planReloads(stage: StageDocument, plan: StagePlan, route: StageRoute, profile: ShooterPerformanceProfile | null): ReloadPlan {
  let current: StageRoute = { ...route, reloads: [] };
  const used = () => new Set([plan.loadout.startingMagazineId, ...current.reloads.map(r => r.magazineId)].filter(Boolean));
  let lastReload = -1, added = 0;
  for (let guard = 0; guard <= route.positions.length; guard++) {
    const evaluation = evaluateRoute(stage, plan, current, profile);
    const dry = evaluation.ammo.findIndex(a => !a.sufficient);
    if (dry < 0) return { route: current, added, complete: true,
      note: added ? `${added} reload${added === 1 ? '' : 's'} planned.` : 'No reload needed: the starting magazine covers the stage.' };
    const spare = plan.loadout.magazines.filter(m => !used().has(m.id) && m.startingRounds > 0).sort((a, b) => b.startingRounds - a.startingRounds)[0];
    if (!spare) return { route: current, added, complete: false,
      note: plan.loadout.magazines.length ? 'Not enough loaded magazines for the planned rounds: add one in Loadout or plan fewer rounds.' : 'Add magazines in Loadout to plan reloads.' };
    // Candidates: every position from just after the last reload up to the one that runs dry.
    let best: { route: StageRoute; overlap: number; index: number } | null = null;
    for (let j = lastReload + 1; j <= dry; j++) {
      const trial: StageRoute = { ...current, reloads: [...current.reloads, { positionId: route.positions[j].id, magazineId: spare.id, mode: 'moving' }] };
      const result = evaluateRoute(stage, plan, trial, profile);
      if (!result.ammo.slice(0, dry + 1).every(a => a.sufficient)) continue;
      const overlap = result.timing?.reloadDetails.find(r => r.positionId === route.positions[j].id)?.overlap ?? 0;
      // Most reload time hidden by the move; on a tie the later reload, which wastes fewer rounds.
      if (!best || overlap > best.overlap + 1e-9 || Math.abs(overlap - best.overlap) <= 1e-9) best = { route: trial, overlap, index: j };
    }
    if (!best) return { route: current, added, complete: false,
      note: `Even a full magazine doesn't carry ${route.positions[dry].label}: plan fewer rounds there or split it over two positions.` };
    current = best.route; lastReload = best.index; added++;
  }
  return { route: current, added, complete: false, note: 'Reloads could not be planned for this route.' };
}
