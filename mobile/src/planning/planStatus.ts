/**
 * What PLAN and ANALYZE say about a plan (UI cohesion plan, phase 3): REVIEW's per-target ✓ / ! marks read from the one
 * engagement model, where the times come from, what is still missing, and PLAN's three-line checklist. Pure functions;
 * the panels only show them.
 */
import type { StageDocument } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import { buildPersonalizedModel, factorLabels, timingFactors } from '../profile/personalizedPerformance';
import type { TimingFactor } from '../profile/model';
import { isEngageable } from './model';
import type { StagePlan } from './model';
import { evaluateRoute } from './route';
import type { RouteEvaluation, StageRoute } from './route';
import type { EngagementAnalysis } from './engagements';
import type { StageTimeEstimate } from './stageTime';
import type { StagePointsEstimate } from './expectedPoints';
import { migrateManualEngagements, targetAssignment } from './assignments';
import { withPlanDefaults } from './planDefaults';
import { positionName, SEP, targetName, targetNameWithType } from '../ui/words';
import { planWords } from './planWords';

// ---------------------------------------------------------------------------------------------------------------
// REVIEW's marks, from position.engagedTargetIds (what ANALYZE checks)

export type TargetMark = '✓' | '!';
export type ReviewedTarget = {
  targetId: string; name: string; mark: TargetMark;
  /** Index of the position that engages it (route order), or null when nothing does. */
  positionIndex: number | null; moving: boolean;
  /** Why the mark: "P2 · standing · passes the checks", "Not engaged", … */
  note: string;
};
export type TargetReview = {
  targets: ReviewedTarget[]; engaged: number; total: number;
  /** True when route rules exist, so engagements were checked for shooting area, safe angle and line of sight. */
  checked: boolean;
};
/**
 * Per target: ✓ engaged (and, with route rules, legal in the saved order), ! not engaged or failing the check.
 * Without route rules a ✓ means "assigned, not checked", as REVIEW's marks always meant.
 */
export function reviewTargets(stage: StageDocument, route: StageRoute | undefined, analysis?: EngagementAnalysis): TargetReview {
  const checked = !!route?.engagementRules && !!analysis;
  const covered = new Set(analysis?.coveredTargetIds ?? []);
  const targets = stage.objects.filter(isEngageable).map((t): ReviewedTarget => {
    const at = targetAssignment(route, t.id), name = targetNameWithType(stage, t.id);
    if (!at) return { targetId: t.id, name, mark: '!', positionIndex: null, moving: false, note: planWords.notEngaged };
    const where = at.moving ? `on the way to ${positionName(at.index)}` : `${positionName(at.index)}${SEP}standing`;
    if (!checked) return { targetId: t.id, name, mark: '✓', positionIndex: at.index, moving: at.moving, note: `${where}${SEP}not checked` };
    if (covered.has(t.id)) return { targetId: t.id, name, mark: '✓', positionIndex: at.index, moving: at.moving, note: `${where}${SEP}passes the checks` };
    const legal = (analysis!.alternatives.find(a => a.targetId === t.id)?.stationaryWaypointIds ?? [])
      .map(id => route!.positions.findIndex(p => p.id === id)).filter(i => i >= 0).map(positionName);
    return { targetId: t.id, name, mark: '!', positionIndex: at.index, moving: at.moving,
      note: `${where}${SEP}fails the checks there` + (legal.length ? `${SEP}legal standing from ${legal.join(', ')}` : '') };
  });
  return { targets, engaged: targets.filter(t => t.positionIndex !== null).length, total: targets.length, checked };
}

// ---------------------------------------------------------------------------------------------------------------
// Where the times come from (rule 7)

const contextWords = { LIVE_FIRE: 'live-fire', DRY_FIRE: 'dry-fire', PRESSURE_MATCH: 'match' } as const;
const list = (words: string[]) => words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
/** "Times from your live-fire numbers (split and transition); default draw, reload and movement times (not measured)." */
export function timeSource(profile: ShooterPerformanceProfile | null): string {
  if (!profile) return 'No times: your profile did not load.';
  const model = buildPersonalizedModel(profile), groups = new Map<string, string[]>(), generic: string[] = [];
  const add = (group: string, factor: TimingFactor) => groups.set(group, [...(groups.get(group) ?? []), factorLabels[factor].toLowerCase()]);
  for (const factor of timingFactors) {
    const status = model.factors[factor].status, context = profile.timingEvidence?.[factor]?.context;
    if (status === 'MEASURED') add(`your ${context ? contextWords[context] + ' ' : 'measured '}numbers`, factor);
    else if (status === 'MANUAL') add('your typed-in numbers', factor);
    else if (status === 'PROFILE_ESTIMATE') add('your profile numbers', factor);
    else generic.push(factorLabels[factor].toLowerCase());
  }
  if (!groups.size) return 'Default times: none of your numbers yet (log drills in Training).';
  return 'Times from ' + [...groups].map(([group, factors]) => `${group} (${list(factors)})`).join('; ')
    + (generic.length ? `; default ${list(generic)} time${generic.length === 1 ? '' : 's'} (not measured)` : '') + '.';
}

/** Where the expected points come from: "Points from your hit numbers (2 targets) and your planned hits (1 target)." */
export function pointsSource(points: StagePointsEstimate): string {
  const n = (source: TargetSource, steel = false) => points.targets.filter(t => t.source === source && (!steel || t.kind === 'steel')).length;
  const parts = [n('YOUR_NUMBERS') ? `your hit numbers (${count(n('YOUR_NUMBERS'), 'target')})` : '', n('PLANNED') ? `your planned hits (${count(n('PLANNED'), 'target')})` : ''].filter(Boolean);
  const steel = n('NONE', true);
  return (parts.length ? 'Points from ' + list(parts) : 'No hit numbers or planned hits yet')
    + (steel ? `; ${count(steel, 'steel target')} at 5 points (steel scores when it falls)` : '') + '.';
}
type TargetSource = StagePointsEstimate['targets'][number]['source'];

// ---------------------------------------------------------------------------------------------------------------
// What ANALYZE still needs (the answer's "what's missing")

/**
 * Short lines, most important first, from what the evaluation actually knows: targets not engaged or failing the
 * check, rounds you set to zero, reloads the ammunition needs, and why there is no time or hit factor.
 * `plan` is the plan with defaults (withPlanDefaults), `route` the one ANALYZE shows.
 */
export function whatsMissing(input: { stage: StageDocument; plan: StagePlan; route: StageRoute; evaluation: RouteEvaluation;
  review: TargetReview; time?: StageTimeEstimate; points?: StagePointsEstimate }): string[] {
  const { stage, plan, route, evaluation, review, time, points } = input, out: string[] = [];
  if (!route.positions.length) return ['No route yet: plan one in ROUTE'];
  if (!stage.objects.some(o => o.type === 'start')) out.push('Start position missing (BUILD)');
  const name = (id: string) => { const t = stage.objects.find(o => o.id === id); return t ? targetName(stage, t) : id; };
  const unengaged = review.targets.filter(t => t.positionIndex === null).map(t => name(t.targetId));
  if (unengaged.length) out.push(`${list(unengaged)} not engaged`);
  for (const t of review.targets) if (t.mark === '!' && t.positionIndex !== null) out.push(`${name(t.targetId)} fails the checks at ${positionName(t.positionIndex)}`);
  const zero = review.targets.filter(t => t.positionIndex !== null && !(plan.engagements[t.targetId] > 0)).map(t => name(t.targetId));
  if (zero.length) out.push(`No rounds planned for ${list(zero)}`);
  const blocked = evaluation.engagementAnalysis?.segments.filter(s => !s.traversable).map(s => route.positions.findIndex(p => p.id === s.id)).filter(i => i >= 0) ?? [];
  for (const i of blocked) out.push(`Path to ${positionName(i)} is blocked or leaves the allowed travel`);
  if (!plan.loadout.magazines.length && !plan.loadout.chamberLoaded) out.push('No loadout: add magazines in Loadout');
  else evaluation.ammo.forEach((a, i) => {
    if (a.sufficient) return;
    const reload = route.reloads.some(r => r.positionId === a.positionId);
    out.push(reload ? `${positionName(i)} needs ${a.required} rounds; ${a.available} loaded after the reload` : `No reload planned for ${positionName(i)} (needs ${a.required} rounds, ${a.available} left)`);
  });
  if (!review.checked) out.push('Engagements not checked for line of sight and safe angles: draw a shooting area (AREAS)');
  if (time && !time.available) out.push(time.reason.replace(/\.$/, ''));
  // Targets not engaged are already listed; they have no distance to estimate hits at.
  const none = points?.targets.filter(t => t.expectedPoints === null && targetAssignment(route, t.targetId)).map(t => name(t.targetId)) ?? [];
  if (none.length) out.push(`No hit estimate for ${list(none)}: set EXPECTED HITS, or log runs with counted hits`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// PLAN's checklist: 1 Shooting areas → 2 Route → 3 Targets and reloads, then ANALYZE

export type ChecklistKey = 'areas' | 'route' | 'targets';
export type ChecklistLine = {
  key: ChecklistKey; step: 1 | 2 | 3; title: string; done: boolean;
  /** "✓ · 2 areas", "3 positions", or what is missing ("Draw at least one shooting area"). */
  status: string;
};
export type PlanChecklistState = {
  lines: [ChecklistLine, ChecklistLine, ChecklistLine];
  /** For the PLAN step badge: targets planned x / y. */
  targets: { planned: number; total: number };
  analyze: { ready: boolean; note: string };
};
const count = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const done = (text: string) => '✓' + SEP + text;
/**
 * The three lines of PLAN's checklist and whether ANALYZE has something to analyze. Reads the route the same way
 * ANALYZE does (saved ENGAGE arrows folded in, rule-default rounds, profile loadout). Pass `evaluation` when the
 * caller already evaluated `withPlanDefaults(...).plan` on this route.
 */
export function planChecklist(stage: StageDocument, plan: StagePlan, profile: ShooterPerformanceProfile | null, evaluation?: RouteEvaluation): PlanChecklistState {
  const route = plan.route && migrateManualEngagements(stage, plan.route);
  const areas = route?.engagementRules?.firingAreas.length ?? 0;
  const areasLine: ChecklistLine = { key: 'areas', step: 1, title: planWords.checklist.areas, done: areas > 0, status: areas ? done(count(areas, 'area')) : 'Draw at least one shooting area' };
  const positions = route?.positions.length ?? 0, start = stage.objects.some(o => o.type === 'start');
  const effective = withPlanDefaults(stage, plan, profile).plan;
  const result = route && positions ? evaluation ?? evaluateRoute(stage, effective, route, profile) : null;
  const blocked = result?.engagementAnalysis?.segments.findIndex(s => !s.traversable) ?? -1;
  const blockedAt = blocked >= 0 && route ? route.positions.findIndex(p => p.id === result!.engagementAnalysis!.segments[blocked].id) : -1;
  const routeLine: ChecklistLine = { key: 'route', step: 2, title: planWords.checklist.route, done: positions > 0 && start && blockedAt < 0,
    status: !positions ? 'Plan a route: AUTO-PLAN, or draw it by hand' : !start ? `${count(positions, 'position')}${SEP}place the start (BUILD)`
      : blockedAt >= 0 ? `${count(positions, 'position')}${SEP}path to ${positionName(blockedAt)} is blocked` : done(count(positions, 'position')) };
  const scoring = stage.objects.filter(isEngageable);
  const planned = scoring.filter(t => !!targetAssignment(route, t.id) && effective.engagements[t.id] > 0).length;
  const reloads = route?.reloads.filter(r => route.positions.some(p => p.id === r.positionId)).length ?? 0;
  const short = result?.ammo.findIndex(a => !a.sufficient) ?? -1;
  const missing = !scoring.length ? 'no scoring targets on the stage'
    : planned < scoring.length ? `${scoring.length - planned} to engage`
    : short >= 0 ? (route!.reloads.some(r => r.positionId === result!.ammo[short].positionId) ? `${positionName(short)} runs short` : `no reload planned for ${positionName(short)}`) : '';
  // "no reload planned for P2" already says there are none, so "no reloads" isn't repeated before it.
  const reloadText = reloads ? count(reloads, 'reload') : missing.startsWith('no reload') ? '' : 'no reloads';
  const targetsText = `${planned}/${scoring.length} targets planned` + (reloadText ? SEP + reloadText : '');
  const targetsLine: ChecklistLine = { key: 'targets', step: 3, title: planWords.checklist.targets, done: !missing,
    status: missing ? `${targetsText}${SEP}${missing}` : done(targetsText) };
  const ready = positions > 0 && planned > 0;
  return { lines: [areasLine, routeLine, targetsLine], targets: { planned, total: scoring.length },
    analyze: { ready, note: !positions ? 'Plan a route first' : !planned ? 'Engage a target first' : [areasLine, routeLine, targetsLine].every(l => l.done) ? 'Ready' : 'Ready; some steps are open' } };
}
