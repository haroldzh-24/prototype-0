import type { StageDocument } from '../stage/model';
import type { TargetFamily } from '../stage/targetFamily';
import type { EngagementRules, FiringArea } from '../planning/engagements';
import { isEngageable, targetLabel } from '../planning/model';
import { targetFace } from '../planning/v2/normalizeStage';
import type { TargetFace } from '../planning/v2/normalizeStage';
import { distanceToSegment } from '../planning/v2/coverage';
import { inside } from '../planning/routeSolver/traversability';
import { activeRuleset, idpaOnHold, IDPA_ON_HOLD_NOTE } from './rulesets';
import { exposure, isPaper, layered, stackOf } from '../stage/targetLayers';
import { targetPreset } from '../stage/targetPresets';

/**
 * Stage check: rule limits a stage design can be checked against from its geometry alone. Every finding names the
 * rule it comes from (rulebook editions and sources: docs/rules/). It reports what the geometry shows; it does not
 * replace the match director's or range officer's reading of the rules.
 *
 * - safety: firing as drawn could be a disqualification.
 * - rule: the design breaks a stage-design limit.
 * - info: a count or limit worth knowing.
 */
export type Severity = 'safety' | 'rule' | 'info';
export type Finding = { severity: Severity; code: string; message: string; rule: string; objectIds: string[] };

/** Required hits unless the stage brief says otherwise: 2 per paper target, 1 per steel (USPSA 9.5.1, PCSL 11.3.1). */
export function minimumRounds(doc: StageDocument): { paper: number; steel: number; rounds: number } {
  const scoring = doc.objects.filter(isEngageable);
  const paper = scoring.filter(o => o.type === 'cardboardTarget').length, steel = scoring.length - paper;
  return { paper, steel, rounds: paper * 2 + steel };
}

/** USPSA course type by round count (1.2.1): short 1-12, medium 13-20, long 21 or more. */
export function uspsaCourseType(rounds: number): 'short' | 'medium' | 'long' | null {
  if (rounds <= 0) return null;
  return rounds <= 12 ? 'short' : rounds <= 20 ? 'medium' : 'long';
}

/** Closest distance between a target face and a firing area (0 when the face touches or is inside the area). */
function faceToArea(face: TargetFace, area: FiringArea): number {
  const v = area.vertices;
  if (v.length < 3) return Infinity;
  if (inside(face.left, v) || inside(face.right, v)) return 0;
  let best = Infinity;
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length];
    best = Math.min(best, distanceToSegment(a, face.left, face.right), distanceToSegment(b, face.left, face.right),
      distanceToSegment(face.left, a, b), distanceToSegment(face.right, a, b));
    if (segmentsIntersect(face.left, face.right, a, b)) return 0;
  }
  return best;
}
function segmentsIntersect(p: { x: number; y: number }, q: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const o = (u: typeof p, v: typeof p, w: typeof p) => Math.sign((v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x));
  return o(p, q, a) !== o(p, q, b) && o(a, b, p) !== o(a, b, q);
}
const feet = (inches: number) => `${(inches / 12).toFixed(1).replace(/\.0$/, '')} ft`;
const yards = (inches: number) => `${(inches / 36).toFixed(1).replace(/\.0$/, '')} yd`;

export function checkStage(doc: StageDocument, rules: EngagementRules | undefined, family: TargetFamily): Finding[] {
  const requested = rules?.ruleset ?? family, ruleset = activeRuleset(requested);
  const findings: Finding[] = [];
  if (idpaOnHold(requested) || idpaOnHold(family)) findings.push({ severity: 'info', code: 'IDPA_RULES_ON_HOLD', rule: '', objectIds: [], message: IDPA_ON_HOLD_NOTE });
  const { paper, steel, rounds } = minimumRounds(doc);
  const label = (id: string) => targetLabel(doc, id);
  const scoring = doc.objects.filter(isEngageable).map(o => ({ object: o, face: targetFace(o) })).filter((x): x is { object: typeof x.object; face: TargetFace } => !!x.face);
  const areas = rules?.firingAreas ?? [];

  // Round count and course type.
  if (ruleset === 'IDPA') {
    findings.push({ severity: 'info', code: 'ROUNDS', rule: 'IDPA 6.5.11', objectIds: [],
      message: `About ${rounds} rounds if each threat takes 2 hits and each steel 1 (the stage description sets the real count). IDPA strings are limited to 18 rounds.` });
    if (rounds > 18) findings.push({ severity: 'rule', code: 'IDPA_STRING_ROUNDS', rule: 'IDPA 6.5.11', objectIds: [],
      message: `At 2 hits per threat this stage needs ${rounds} rounds; split it into strings of at most 18.` });
  } else {
    const type = ruleset === 'USPSA' ? uspsaCourseType(rounds) : null;
    findings.push({ severity: 'info', code: 'ROUNDS', rule: ruleset === 'USPSA' ? 'USPSA 9.5.1, 1.2.1' : 'PCSL 11.3.1', objectIds: [],
      message: `Minimum ${rounds} rounds: ${paper} paper × 2 hits, ${steel} steel × 1` + (type ? ` · ${type} course.` : '.') });
    if (ruleset === 'USPSA' && rounds > 32) findings.push({ severity: 'info', code: 'USPSA_LONG_32', rule: 'USPSA 1.2.1.3', objectIds: [],
      message: `${rounds} rounds: long courses at Level III and above are limited to 32.` });
  }

  if (!areas.length) {
    findings.push({ severity: 'info', code: 'NO_AREAS', rule: '', objectIds: [], message: 'Add firing areas in Route settings to check distances from where competitors shoot.' });
  } else {
    // Steel distance from where competitors can stand (fault lines are part of the shooting area).
    const steelMin = { USPSA: 276, PCSL: 252, IDPA: 360 }[ruleset];
    for (const { object, face } of scoring.filter(s => s.face.kind === 'steel')) {
      const near = Math.min(...areas.map(a => faceToArea(face, a)));
      if (near < steelMin) {
        const rule = { USPSA: 'USPSA 10.5.16, 2.1.3', PCSL: 'PCSL 1.8.1-1.8.3', IDPA: 'IDPA 2.14' }[ruleset];
        const extra = ruleset === 'PCSL' ? ' Closer steel needs visual distance indicators noted in the stage brief.' : '';
        findings.push({ severity: 'safety', code: 'STEEL_DISTANCE', rule, objectIds: [object.id],
          message: `${label(object.id)} is ${feet(near)} from a firing area. Firing at steel closer than ${feet(steelMin)} is a disqualification.${extra}` });
      } else if (ruleset === 'USPSA' && near < 312) {
        findings.push({ severity: 'rule', code: 'STEEL_FAULT_LINE', rule: 'USPSA 2.1.3', objectIds: [object.id],
          message: `${label(object.id)} is ${feet(near)} from a firing area. Fault lines limiting the approach to steel must be at least 26 ft away.` });
      }
    }
    // Target distance limits.
    for (const { object, face } of scoring) {
      const near = Math.min(...areas.map(a => faceToArea(face, a)));
      if (ruleset === 'PCSL' && near > 1800) findings.push({ severity: 'rule', code: 'PCSL_MAX_DISTANCE', rule: 'PCSL 10.9.1', objectIds: [object.id],
        message: `${label(object.id)} is ${yards(near)} from the nearest firing area; pistol targets may be at most 50 yd.` });
      if (ruleset === 'IDPA' && near > 1080) findings.push({ severity: 'rule', code: 'IDPA_MAX_DISTANCE', rule: 'IDPA 6.5.3, 6.5.4', objectIds: [object.id],
        message: `${label(object.id)} is ${yards(near)} from the nearest firing area; targets may be at most 20 yd in scenario stages and 30 yd in standards.` });
      else if (ruleset === 'IDPA' && near > 720) findings.push({ severity: 'info', code: 'IDPA_SCENARIO_DISTANCE', rule: 'IDPA 6.5.3', objectIds: [object.id],
        message: `${label(object.id)} is ${yards(near)} away: allowed in standards stages only (scenario limit 20 yd).` });
    }
  }

  // USPSA freestyle: where and when targets are engaged may be specified only in some courses (1.1.5.1).
  const procedures = Object.entries(rules?.targetProcedures ?? {}).filter(([, p]) => p?.areaIds?.length || p?.afterTargetIds?.length);
  if (ruleset === 'USPSA' && procedures.length && rounds > 20) findings.push({ severity: 'rule', code: 'USPSA_FREESTYLE', rule: 'USPSA 1.1.5, 1.1.5.1', objectIds: procedures.map(([id]) => id),
    message: 'This is a long course: "engage from" and "engage after" procedures are allowed only in Level I short and medium courses, classifiers, standard exercises and speed shoots.' });

  findings.push(...layerFindings(doc, ruleset));
  if (ruleset === 'USPSA') findings.push(...uspsaTargetFindings(doc));
  if (ruleset === 'PCSL') findings.push(...pcslTargetFindings(doc));

  if (ruleset === 'IDPA') {
    const threats = paper, nonThreats = doc.objects.filter(o => o.type === 'noShootTarget').length;
    if (nonThreats > Math.ceil(threats / 2)) findings.push({ severity: 'rule', code: 'IDPA_NON_THREATS', rule: 'IDPA 6.5.15', objectIds: [],
      message: `${nonThreats} non-threats for ${threats} threats: at most 1 per 2 threats (rounded up) in a string.` });
    if (rounds > 0 && steel / rounds > 0.25) findings.push({ severity: 'rule', code: 'IDPA_STEEL_SHARE', rule: 'IDPA 6.5.7', objectIds: [],
      message: `Steel is ${Math.round(steel / rounds * 100)}% of the shots; at most 25% of a string may be steel.` });
  }
  return findings;
}

/** USPSA target rules that follow from which targets a stage uses (USPSA 4.2.1, 4.3.1.4). */
function uspsaTargetFindings(doc: StageDocument): Finding[] {
  const findings: Finding[] = [];
  const targets = doc.objects.filter(o => o.type === 'cardboardTarget' || o.type === 'noShootTarget' || o.type === 'steelPlate' || o.type === 'steelPopper');
  const typeOf = (o: (typeof targets)[number]) => (o.presetId ? targetPreset(o.presetId)?.cardboardType : undefined);
  const uspsa = targets.filter(o => typeOf(o) === 'USPSA'), ipsc = targets.filter(o => typeOf(o) === 'IPSC');
  if (uspsa.length && ipsc.length) {
    const fewer = uspsa.length <= ipsc.length ? uspsa : ipsc;
    findings.push({ severity: 'rule', code: 'USPSA_TARGET_MIX', rule: 'USPSA 4.2.1', objectIds: fewer.map(o => o.id),
      message: `This stage mixes USPSA and IPSC cardboard (${uspsa.length} USPSA, ${ipsc.length} IPSC, no-shoots included). The two types must not be used together in one stage.` });
  }
  const scoring = targets.filter(isEngageable), plates = scoring.filter(o => o.type === 'steelPlate');
  if (plates.length) {
    if (plates.length === scoring.length) findings.push({ severity: 'rule', code: 'USPSA_PLATES_ONLY', rule: 'USPSA 4.3.1.4', objectIds: plates.map(o => o.id),
      message: 'Metal plates must not be the only targets: add at least one cardboard target or popper.' });
    findings.push({ severity: 'info', code: 'USPSA_PLATE_LEVEL', rule: 'USPSA 4.3.1.4', objectIds: plates.map(o => o.id),
      message: `${plates.length} metal plate${plates.length === 1 ? '' : 's'}: plates are allowed at Level I and II matches only.` });
  }
  return findings;
}

/** Targets with layers (hostage no-shoots, doubles) or painted hard cover: what is left to shoot at. */
function layerFindings(doc: StageDocument, ruleset: string): Finding[] {
  const findings: Finding[] = [];
  for (const o of doc.objects) {
    if (!isPaper(o) || o.type !== 'cardboardTarget' || !layered(doc, o)) continue;
    const open = exposure(doc, o).fraction, name = targetLabel(doc, o.id);
    if (open < 0.02) findings.push({ severity: 'rule', code: 'TARGET_COVERED', rule: '', objectIds: [o.id],
      message: `${name} has no scoring area showing: hard cover or faces in front of it cover all of it.` });
    else if (open < 0.999) findings.push({ severity: 'info', code: 'TARGET_PARTLY_COVERED', rule: '', objectIds: [o.id],
      message: `${name}: about ${Math.round(open * 100)}% of the face is open scoring area.` });
    // USPSA 4.2.1.1: half-size targets keep at least half of the lower A-zone visible, and never go on full-size no-shoots.
    if (ruleset === 'USPSA' && o.presetId === 'uspsa-half-chl-v1') {
      const stack = stackOf(doc, o);
      const fullNoShoot = stack ? doc.objects.some(n => n.type === 'noShootTarget' && stackOf(doc, n) === stack && n.presetId !== 'uspsa-half-chl-v1' && n.geometry.faceHeight > o.geometry.faceHeight + 1) : false;
      if (fullNoShoot) findings.push({ severity: 'rule', code: 'USPSA_HALF_ON_FULL_NO_SHOOT', rule: 'USPSA 4.2.1.1', objectIds: [o.id],
        message: `${name} is a half-size target stacked with a full-size no-shoot; half-size targets may not be mounted on full-size no-shoots.` });
      if (open < 0.999) findings.push({ severity: 'info', code: 'USPSA_HALF_A_ZONE', rule: 'USPSA 4.2.1.1', objectIds: [o.id],
        message: `${name} is a partly covered half-size target: at least half of its lower A-zone must stay visible. Check it on the target (A-zone positions are not in the app).` });
    }
  }
  return findings;
}

/** PCSL target-type mixing (9.2.1.1, 9.2.1.4, 9.2.2.1). */
function pcslTargetFindings(doc: StageDocument): Finding[] {
  const findings: Finding[] = [];
  const using = (preset: string) => doc.objects.filter(o => (o.type === 'cardboardTarget' || o.type === 'noShootTarget') && o.presetId === preset);
  const practical = using('pcsl-practical-2025-v1'), competition = using('pcsl-competition-2025-v1'), kZone = using('pcsl-k-zone-legacy-v1');
  if (practical.length && competition.length) findings.push({ severity: 'rule', code: 'PCSL_PRACTICAL_COMPETITION', rule: 'PCSL 9.2.2.1', objectIds: (practical.length <= competition.length ? practical : competition).map(o => o.id),
    message: `This stage uses both Practical (${practical.length}) and Competition (${competition.length}) full-size targets; they may not both be used for the same firearm on one stage. Mini Practical targets are fine with either.` });
  if (kZone.length && practical.length) findings.push({ severity: 'rule', code: 'PCSL_KZONE_PRACTICAL', rule: 'PCSL 9.2.1.1', objectIds: kZone.map(o => o.id),
    message: 'K-Zone targets may not be used in the same match as Practical full-size targets.' });
  else if (kZone.length) findings.push({ severity: 'info', code: 'PCSL_KZONE_LEVEL', rule: 'PCSL 9.2.1.4, 10.1.4.1', objectIds: kZone.map(o => o.id),
    message: 'K-Zone targets: Level 1 matches only, outside classifier stages.' });
  return findings;
}
