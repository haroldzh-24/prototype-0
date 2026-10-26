/**
 * Stage time from your numbers (roadmap C4). Builds on the route evaluator (moves timed by your move fit, draw,
 * reload overlap and ammunition) and replaces its single average split and transition with:
 * - splits by the target's distance (your split curve; partly covered targets use your partial-target curve),
 * - transitions by how far the gun swings between consecutive targets (your swing fit; steel uses your time per plate),
 * - steel makeup shots from your steel miss rate (or the miss risk you planned for that plate).
 * Anything without data falls back to the profile's single value, and every part says where its time came from.
 * The route evaluator itself is unchanged, so saved video comparisons still re-check against it.
 */
import type { StageDocument } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import { buildPersonalizedModel, estimateShootingCost } from '../profile/personalizedPerformance';
import { curveAt, swingBetween, transitionAt, validEngagementModel } from '../profile/engagementModel';
import { hitRatesAt, validHitModel } from '../profile/hitModel';
import { inchesToYards } from '../stage/measurements';
import { isEngageable, targetLabel } from './model';
import type { StagePlan } from './model';
import { evaluateRoute } from './route';
import type { StageRoute } from './route';
import { classifyTarget, targetCenter, validExpectations } from './expectedPoints';

export type SplitSource = 'CURVE' | 'PARTIAL_CURVE' | 'AVERAGE';
export type TransitionSource = 'SWING_FIT' | 'STEEL_PER_PLATE' | 'AVERAGE';
export type TargetTime = {
  targetId: string; label: string; kind: 'paper' | 'partial' | 'steel'; yards: number; rounds: number;
  splits: number; secondsPerSplit: number; splitSource: SplitSource;
  /** Into this target from the previous one at the same position (none for the first). */
  transition: { seconds: number; degrees: number; source: TransitionSource; beyondData: boolean } | null;
  makeups: number; makeupSeconds: number;
  seconds: number;
};
export type PositionTime = { positionId: string; label: string; arrival: number; reload: number; targets: TargetTime[]; seconds: number };
export type StageTimeEstimate =
  | { available: false; reason: string }
  | { available: true; total: number; movement: number; draw: number; splits: number; transitions: number; makeups: number; reloads: number;
      positions: PositionTime[]; sources: string[] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function estimateStageTime(stage: StageDocument, plan: StagePlan, route: StageRoute, profile: ShooterPerformanceProfile | null): StageTimeEstimate {
  if (!profile) return { available: false, reason: 'Load your profile to estimate the time.' };
  const base = evaluateRoute(stage, plan, route, profile);
  if (!base.timing) return { available: false, reason: route.positions.some(p => p.movingTargetIds?.length)
    ? 'Engaging on the move is not timed yet.' : 'Timing needs a valid profile and route.' };
  const model = buildPersonalizedModel(profile), engage = validEngagementModel(profile.engagementModel), hits = validHitModel(profile.hitModel);
  const expectations = validExpectations(plan.expectations) ?? {};
  const targets = new Map(stage.objects.filter(isEngageable).map(t => [t.id, t]));
  const count = { curve: 0, partial: 0, average: 0, fit: 0, steel: 0, plain: 0, beyond: 0, partialFallback: 0 };
  const positions: PositionTime[] = route.positions.map(p => {
    const arrival = base.segments.find(s => s.toId === p.id)?.seconds ?? 0;
    const reload = base.timing!.reloadDetails.find(r => r.positionId === p.id)?.additionalPenalty ?? 0;
    let previous: { x: number; y: number } | null = null;
    const list: TargetTime[] = [];
    for (const id of p.engagedTargetIds) {
      const t = targets.get(id), rounds = plan.engagements[id];
      if (!t || !Number.isSafeInteger(rounds) || rounds <= 0) continue;
      const center = targetCenter(t), yards = inchesToYards(Math.hypot(center.x - p.position.x, center.y - p.position.y));
      const { kind } = classifyTarget(stage, t);
      // Splits at this distance: your partial-target curve, your split curve, or the profile's single value.
      const partial = kind === 'partial' ? curveAt(engage?.partialSplits, yards) : null;
      // Within half a yard of your closest or farthest logged distance counts as that distance (4.9 yd is your 5 yd).
      const ends = model.curve.length ? [model.curve[0].difficulty, model.curve[model.curve.length - 1].difficulty] : [];
      const lookup = ends.find(e => Math.abs(e - yards) <= 0.5) ?? yards;
      const curve = estimateShootingCost(model, lookup);
      let secondsPerSplit: number, splitSource: SplitSource;
      if (partial) { secondsPerSplit = partial.seconds; splitSource = 'PARTIAL_CURVE'; count.partial++; }
      else if (curve.status !== 'FALLBACK') { secondsPerSplit = curve.secondsPerSplit; splitSource = 'CURVE'; count.curve++; if (kind === 'partial') count.partialFallback++; }
      else { secondsPerSplit = profile.averageSplitTime; splitSource = 'AVERAGE'; count.average++; }
      // Into this target: steel per plate at its distance, your swing fit, or the profile's single transition.
      let transition: TargetTime['transition'] = null;
      if (previous) {
        const degrees = swingBetween(p.position, previous, center), plate = kind === 'steel' ? curveAt(engage?.steelPlates, yards) : null;
        const swing = transitionAt(engage?.transitions, degrees);
        if (plate) { transition = { seconds: plate.seconds, degrees, source: 'STEEL_PER_PLATE', beyondData: false }; count.steel++; }
        else if (swing) { transition = { seconds: swing.seconds, degrees, source: 'SWING_FIT', beyondData: swing.beyondData }; count.fit++; if (swing.beyondData) count.beyond++; }
        else { transition = { seconds: profile.transitionTime, degrees, source: 'AVERAGE', beyondData: false }; count.plain++; }
      }
      // Steel that doesn't fall needs another shot: expected makeups from your miss rate (or the risk you planned).
      const missRisk = kind === 'steel' ? expectations[id]?.missRisk ?? hitRatesAt(hits?.steel, yards)?.rates.miss : undefined;
      const makeups = missRisk !== undefined && missRisk < 1 ? missRisk / (1 - missRisk) : 0;
      const splits = rounds - 1, makeupSeconds = makeups * secondsPerSplit;
      list.push({ targetId: id, label: targetLabel(stage, id), kind, yards, rounds, splits, secondsPerSplit, splitSource, transition, makeups, makeupSeconds,
        seconds: splits * secondsPerSplit + (transition?.seconds ?? 0) + makeupSeconds });
      previous = center;
    }
    return { positionId: p.id, label: p.label, arrival, reload, targets: list, seconds: arrival + reload + list.reduce((s, t) => s + t.seconds, 0) };
  });
  const all = positions.flatMap(p => p.targets);
  const splits = all.reduce((s, t) => s + t.splits * t.secondsPerSplit, 0), transitions = all.reduce((s, t) => s + (t.transition?.seconds ?? 0), 0);
  const makeups = all.reduce((s, t) => s + t.makeupSeconds, 0);
  const { movement, draw, reloads } = base.timing;
  const sources = [
    count.curve || count.partial ? `Splits: your split curve for ${plural(count.curve, 'target')}` + (count.partial ? `, your partial-target curve for ${count.partial}` : '') + '.' : '',
    count.partialFallback ? `${plural(count.partialFallback, 'partly covered target')} without partial-target runs at that distance ${count.partialFallback === 1 ? 'uses' : 'use'} your full-target splits (likely quick).` : '',
    count.average ? `${plural(count.average, 'target')} outside your logged split distances ${count.average === 1 ? 'uses' : 'use'} your single split value.` : '',
    count.fit ? `Transitions: your swing fit for ${count.fit}` + (count.beyond ? ` (${count.beyond} wider than any swing you logged)` : '') + '.' : '',
    count.steel ? `Steel: your time per plate for ${plural(count.steel, 'transition')}.` : '',
    count.plain ? `${plural(count.plain, 'transition')} ${count.plain === 1 ? 'uses' : 'use'} your single transition value.` : '',
    all.some(t => t.makeups > 0) ? 'Steel makeups from your steel miss rate or the miss risk you planned.' : '',
    'The first shot at each position is in the move time (measured last shot to first shot); the first shot of the stage is in the draw.',
  ].filter(Boolean);
  return { available: true, total: movement + draw + splits + transitions + makeups + reloads, movement, draw, splits, transitions, makeups, reloads, positions, sources };
}
