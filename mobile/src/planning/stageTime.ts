/**
 * Stage time from your numbers (roadmap C4). Builds on the route evaluator (moves timed by your move fit, draw,
 * reload overlap and ammunition) and replaces its single split and transition with:
 * - splits by the target's distance (your split curve; partly covered targets use your partial-target curve),
 * - transitions by how far the gun swings between consecutive targets (your swing fit; steel uses your time per plate),
 * - steel makeup shots from your steel miss rate (or the miss risk you planned for that plate).
 * Anything without data falls back to the profile's single value, and every part says where its time came from.
 * Each target counts once, at the first position that engages it, as in the evaluator. The route evaluator itself
 * is unchanged, so saved video comparisons still re-check against it.
 */
import type { StageDocument } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import { buildPersonalizedModel, estimateShootingCost } from '../profile/personalizedPerformance';
import type { PersonalizedModel } from '../profile/personalizedPerformance';
import { curveAt, SNAP_YARDS, swingBetween, transitionAt, validEngagementModel } from '../profile/engagementModel';
import { hitRatesAt, validHitModel } from '../profile/hitModel';
import { validMovementModel } from '../profile/movementModel';
import { inchesToYards } from '../stage/measurements';
import { isEngageable, targetLabel } from './model';
import type { StagePlan } from './model';
import { evaluateRoute } from './route';
import type { RouteEvaluation, StageRoute } from './route';
import { classifyTarget, targetCenter, validExpectations } from './expectedPoints';

export type SplitSource = 'CURVE' | 'PARTIAL_CURVE' | 'SINGLE';
export type TransitionSource = 'SWING_FIT' | 'STEEL_PER_PLATE' | 'SINGLE';
export type TargetTime = {
  targetId: string; label: string; kind: 'paper' | 'partial' | 'steel'; yards: number; rounds: number;
  splits: number; secondsPerSplit: number; splitSource: SplitSource;
  /** Into this target from the previous one at the same position (none for the first). */
  transition: { seconds: number; degrees: number; source: TransitionSource; outside: 'WIDER' | 'NARROWER' | null } | null;
  makeups: number; makeupSeconds: number;
  seconds: number;
};
export type PositionTime = { positionId: string; label: string; arrival: number; reload: number; targets: TargetTime[]; seconds: number };
export type StageTimeEstimate =
  | { available: false; reason: string }
  | { available: true; total: number; movement: number; draw: number; splits: number; transitions: number; makeups: number; reloads: number;
      positions: PositionTime[]; sources: string[] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const verb = (n: number, one: string, many: string) => n === 1 ? one : many;
/** How the profile's single value is backed: measured, typed in, or the generic default. */
function singleValue(model: PersonalizedModel, factor: 'averageSplitTime' | 'transitionTime', noun: string) {
  const status = model.factors[factor].status;
  return status === 'MEASURED' ? `your measured average ${noun}` : status === 'MANUAL' ? `your typed-in ${noun}`
    : status === 'PROFILE_ESTIMATE' ? `your profile ${noun}` : `the generic ${noun} (${model.timingProfile[factor].toFixed(2)} s, not measured)`;
}

export function estimateStageTime(stage: StageDocument, plan: StagePlan, route: StageRoute, profile: ShooterPerformanceProfile | null,
  evaluation?: RouteEvaluation): StageTimeEstimate {
  if (!profile) return { available: false, reason: 'Load your profile to estimate the time.' };
  const base = evaluation ?? evaluateRoute(stage, plan, route, profile);
  if (!base.timing) return { available: false, reason: route.positions.some(p => p.movingTargetIds?.length)
    ? 'Engaging on the move is not timed yet.' : 'Timing needs a valid profile and route.' };
  const model = buildPersonalizedModel(profile), engage = validEngagementModel(profile.engagementModel), hits = validHitModel(profile.hitModel);
  const expectations = validExpectations(plan.expectations) ?? {};
  const targets = new Map(stage.objects.filter(isEngageable).map(t => [t.id, t]));
  const ends = model.curve.length ? [model.curve[0].difficulty, model.curve[model.curve.length - 1].difficulty] : [];
  const count = { curve: 0, partial: 0, single: 0, partialFallback: 0, fit: 0, steel: 0, plain: 0, wider: 0, narrower: 0, nearestSteel: 0, makeups: 0 };
  const engaged = new Set<string>();
  const positions: PositionTime[] = route.positions.map(p => {
    const arrival = base.segments.find(s => s.toId === p.id)?.seconds ?? 0;
    const reload = base.timing!.reloadDetails.find(r => r.positionId === p.id)?.additionalPenalty ?? 0;
    let previous: { x: number; y: number } | null = null;
    const list: TargetTime[] = [];
    for (const id of p.engagedTargetIds) {
      const t = targets.get(id), rounds = plan.engagements[id];
      if (!t || engaged.has(id) || !Number.isSafeInteger(rounds) || rounds <= 0) continue;
      engaged.add(id);
      const center = targetCenter(t), yards = inchesToYards(Math.hypot(center.x - p.position.x, center.y - p.position.y));
      const { kind } = classifyTarget(stage, t);
      // Splits at this distance: your partial-target curve, your split curve, or the profile's single value.
      const partial = kind === 'partial' ? curveAt(engage?.partialSplits, yards) : null;
      const lookup = ends.find(e => Math.abs(e - yards) <= SNAP_YARDS) ?? yards, curve = estimateShootingCost(model, lookup);
      let secondsPerSplit: number, splitSource: SplitSource;
      if (partial) { secondsPerSplit = partial.seconds; splitSource = 'PARTIAL_CURVE'; count.partial++; }
      else if (curve.status !== 'FALLBACK') { secondsPerSplit = curve.secondsPerSplit; splitSource = 'CURVE'; count.curve++; if (kind === 'partial') count.partialFallback++; }
      else { secondsPerSplit = profile.averageSplitTime; splitSource = 'SINGLE'; count.single++; }
      // Into this target: steel per plate at its distance, your swing fit, or the profile's single transition.
      let transition: TargetTime['transition'] = null;
      if (previous) {
        const degrees = swingBetween(p.position, previous, center), plate = kind === 'steel' ? curveAt(engage?.steelPlates, yards) : null;
        const swing = transitionAt(engage?.transitions, degrees);
        if (plate) { transition = { seconds: plate.seconds, degrees, source: 'STEEL_PER_PLATE', outside: null }; count.steel++; }
        else if (swing) {
          transition = { seconds: swing.seconds, degrees, source: 'SWING_FIT', outside: swing.outside }; count.fit++;
          if (swing.outside === 'WIDER') count.wider++;
          if (swing.outside === 'NARROWER') count.narrower++;
        } else { transition = { seconds: profile.transitionTime, degrees, source: 'SINGLE', outside: null }; count.plain++; }
      }
      // Steel that doesn't fall needs another shot: expected makeups from your miss rate (or the risk you planned).
      let missRisk: number | undefined;
      if (kind === 'steel') {
        const measured = hitRatesAt(hits?.steel, yards);
        missRisk = expectations[id]?.missRisk ?? measured?.rates.miss;
        if (expectations[id]?.missRisk === undefined && measured?.source === 'NEAREST') count.nearestSteel++;
      }
      const makeups = missRisk !== undefined && missRisk < 1 ? missRisk / (1 - missRisk) : 0;
      if (makeups > 0) count.makeups++;
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
  const fit = engage?.transitions;
  const sources = [
    count.curve ? `Splits: your split curve for ${plural(count.curve, 'target')}.` : '',
    count.partial ? `Splits: your partial-target curve for ${plural(count.partial, 'target')}.` : '',
    count.partialFallback ? `${plural(count.partialFallback, 'partly covered target')} without partial-target runs at that distance ${verb(count.partialFallback, 'uses', 'use')} your full-target splits (likely quick).` : '',
    count.single ? `${plural(count.single, 'target')} ${model.curve.length ? 'outside your logged split distances ' : ''}${verb(count.single, 'uses', 'use')} ${singleValue(model, 'averageSplitTime', 'split')}${model.curve.length ? '' : ' (log distance-ladder runs for splits by distance)'}.` : '',
    count.fit ? `Transitions: your swing fit for ${count.fit}` + (fit?.method === 'AVERAGE' ? ` (${fit.reason === 'NO_TREND' ? 'wider swings were not slower in your runs, so one average time' : 'all your runs at one swing size, so one average time'})` : '') + '.' : '',
    count.wider ? `${plural(count.wider, 'transition')} ${verb(count.wider, 'is', 'are')} wider than any swing you logged; ${verb(count.wider, 'its', 'their')} time extends your runs.` : '',
    count.narrower ? `${plural(count.narrower, 'transition')} ${verb(count.narrower, 'is', 'are')} narrower than any swing you logged (targets stacked or in line); ${verb(count.narrower, 'its', 'their')} time extends your runs.` : '',
    count.steel ? `Steel: your time per plate for ${plural(count.steel, 'transition')}.` : '',
    count.plain ? `${plural(count.plain, 'transition')} ${verb(count.plain, 'uses', 'use')} ${singleValue(model, 'transitionTime', 'transition')}.` : '',
    count.makeups ? `Steel makeups for ${plural(count.makeups, 'plate')} from your steel miss rate or the miss risk you planned` + (count.nearestSteel ? `; ${count.nearestSteel} ${verb(count.nearestSteel, 'uses', 'use')} the miss rate from your nearest logged steel distance` : '') + '.' : '',
    validMovementModel(profile.movementModel)
      ? 'Moves use your move runs, timed last shot to first shot, so the first shot at each position is inside the move; the first shot of the stage is in the draw.'
      : 'Moves use your average speed only: the time to settle and fire the first shot after a move is not included (log sprint and shuffle runs).',
  ].filter(Boolean);
  return { available: true, total: movement + draw + splits + transitions + makeups + reloads, movement, draw, splits, transitions, makeups, reloads, positions, sources };
}
