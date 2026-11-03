import { useState } from 'react';
import { activeRuleset, idpaOnHold, IDPA_ON_HOLD_NOTE, matchFamilies } from '../rules/rulesets';
import { TextInput, View } from 'react-native';
import { Action, Copy, Notice, ui } from '../ui/kit';
import { spacing as gaps } from '../ui/tokens';
import type { StageDocument } from '../stage/model';
import { inchesToYards, yardsToInches } from '../stage/measurements';
import { isEngageable } from './model';
import { defaultEngagementRules, safeDirectionMismatch, signedDegrees, validEngagementRules } from './engagements';
import { downrangeLabel, stageDownrange } from '../stage/orientation';
import type { EngagementRules, FiringArea } from './engagements';
import { SEP, shootingAreaTitle, targetNameWithType } from '../ui/words';

/** Stage-brief authoring. Coordinate pairs are physical yards, not screen pixels. */
export default function EngagementSettings({ stage, initial, family, onApply, onCancel }: { stage: StageDocument; initial?: EngagementRules; family?: EngagementRules['ruleset']; onApply: (rules: EngagementRules) => void; onCancel: () => void }) {
  const [section, setSection] = useState<'areas' | 'safety' | 'targets' | null>(null), [advanced, setAdvanced] = useState(false);
  const [rules, setRules] = useState(() => initial ?? defaultEngagementRules(stage, activeRuleset(family)));
  const [spacing, setSpacing] = useState(String(rules.sampleSpacingInches));
  const [direction, setDirection] = useState(String(rules.safeDirectionDegrees));
  const [angle, setAngle] = useState(String(rules.safeHalfAngleDegrees));
  const areaText = (area: FiringArea) => area.vertices.map(p => `${inchesToYards(p.x)}, ${inchesToYards(p.y)}`).join('\n');
  const [areas, setAreas] = useState(() => rules.firingAreas.map(a => ({ id: a.id, text: areaText(a) })));
  const [areaId, setAreaId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null), [error, setError] = useState('');
  const targets = stage.objects.filter(isEngageable);
  const procedure = targetId ? rules.targetProcedures[targetId] ?? {} : {};
  const updateProcedure = (change: Partial<typeof procedure>) => { if (targetId) setRules({ ...rules, targetProcedures: { ...rules.targetProcedures, [targetId]: { ...procedure, ...change } } }); };
  const toggle = (ids: string[] | undefined, id: string) => ids?.includes(id) ? ids.filter(x => x !== id) : [...(ids ?? []), id];
  const addArea = () => {
    let i = 1; while (areas.some(a => a.id === `area-${i}`)) i++;
    const area = { id: `area-${i}`, vertices: [{ x: 0, y: 0 }, { x: stage.stage.width, y: 0 }, { x: stage.stage.width, y: stage.stage.depth }, { x: 0, y: stage.stage.depth }] };
    setAreas([...areas, { id: area.id, text: areaText(area) }]);
    setAreaId(area.id);
  };
  return <View style={{ gap: 8, paddingHorizontal: gaps.lg }}>
    <Copy>RULESET</Copy>
    {idpaOnHold(rules.ruleset) && <Copy>{IDPA_ON_HOLD_NOTE}</Copy>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{matchFamilies.map(ruleset => <Action key={ruleset} title={`${rules.ruleset === ruleset ? '✓ ' : ''}${ruleset}`} onPress={() => setRules({ ...rules, ruleset })} />)}</View>
    <Copy>MOVEMENT</Copy>
    <Action title={'MOVING ENGAGEMENT' + SEP + (rules.allowMoving ? 'ON' : 'OFF')} onPress={() => setRules({ ...rules, allowMoving: !rules.allowMoving })} />
    <Action title={'TRAVEL OUTSIDE AREAS' + SEP + (rules.allowOutsideTravel ? 'ON' : 'OFF')} onPress={() => setRules({ ...rules, allowOutsideTravel: !rules.allowOutsideTravel })} />
    <Action title={'SHOOTING AREAS' + SEP + areas.length + ' >'} onPress={() => setSection(section === 'areas' ? null : 'areas')} />
    <Action title={'SAFE-ANGLE CHECK (SIMPLIFIED)' + SEP + direction + '° ± ' + angle + '° >'} onPress={() => setSection(section === 'safety' ? null : 'safety')} />
    <Action title={'TARGET PROCEDURES' + SEP + Object.keys(rules.targetProcedures).length + ' CUSTOMIZED >'} onPress={() => setSection(section === 'targets' ? null : 'targets')} />
    {section === 'safety' && <>
    <Notice>Simplified check: it compares the direction from each shooting spot to the target centre against this angle. It does not check muzzle direction while moving, reloading or drawing, and it is not proof of 180-degree rule compliance.</Notice>
    <Copy>Safe direction in degrees: 0 = right, 90 = down, -90 = up. Stage downrange is {downrangeLabel(stageDownrange(stage)).toLowerCase()} ({signedDegrees(stageDownrange(stage))}°).</Copy>
    {Number.isFinite(Number(direction)) && direction.trim() !== '' && safeDirectionMismatch(stage, { safeDirectionDegrees: Number(direction) }) && <Notice>This safe direction differs from the stage's downrange.</Notice>}
    <Action title="USE STAGE DOWNRANGE" onPress={() => setDirection(String(signedDegrees(stageDownrange(stage))))} />
    <TextInput accessibilityLabel="Safe direction degrees" style={ui.input} value={direction} onChangeText={setDirection} />
    <Copy>Safe half angle in degrees (90 means ±90° from downrange, the usual 180-degree limit).</Copy>
    <TextInput accessibilityLabel="Safe half angle degrees" style={ui.input} value={angle} onChangeText={setAngle} />
    </>}
    <Action title={advanced ? "ADVANCED <" : "ADVANCED >"} onPress={() => setAdvanced(!advanced)} />
    {advanced && <>
    <Copy>Sample spacing in physical inches (0.25–24).</Copy>
    <TextInput accessibilityLabel="Engagement sample spacing inches" style={ui.input} value={spacing} onChangeText={setSpacing} />
    </>}
    {section === 'areas' && <>
    <Copy>Easier: draw shooting areas on the stage with AREAS in the PLAN bar. Here you can enter points in boundary order, in yards. Areas exclude their boundary. Fault-line marks alone do not identify the legal side. The whole-stage button supplies a rectangle you can edit to follow your course boundaries.</Copy>
    {areas.map((a, areaIndex) => <View key={a.id} style={{ gap: 4 }}>
      <Action title={shootingAreaTitle(areaIndex).toUpperCase() + (areaId === a.id ? SEP + 'CLOSE' : ' >')} onPress={() => setAreaId(areaId === a.id ? null : a.id)} />
      {areaId === a.id && <>
      {a.text.split('\n').map((line, index) => {
        const parts = line.split(',');
        const update = (axis: number, value: string) => { const rows = a.text.split('\n'); const pair = [...parts]; pair[axis] = value; rows[index] = pair.join(','); setAreas(areas.map(row => row.id === a.id ? { ...row, text: rows.join('\n') } : row)); };
        return <View key={index} style={{ gap: 4 }}><Copy>POINT {index + 1}</Copy>
          {(['X', 'Y'] as const).map((axis, i) => <View key={axis} style={{ gap: 4 }}><Copy>{axis + ' (yd)'}</Copy><TextInput accessibilityLabel={shootingAreaTitle(areaIndex) + ' point ' + (index + 1) + ' ' + axis + ' yards'} keyboardType="decimal-pad" style={ui.input} value={(parts[i] ?? '').trim()} onChangeText={value => update(i, value)} /></View>)}
          <Action title="REMOVE POINT" disabled={a.text.split('\n').length <= 3} onPress={() => setAreas(areas.map(row => row.id === a.id ? { ...row, text: row.text.split('\n').filter((_, i) => i !== index).join('\n') } : row))} />
        </View>;
      })}
      <Action title="+ POINT" onPress={() => setAreas(areas.map(row => row.id === a.id ? { ...row, text: row.text + '\n0, 0' } : row))} />
      <Action title="REMOVE SHOOTING AREA" variant="destructive" onPress={() => { setAreas(areas.filter(row => row.id !== a.id)); setAreaId(null); }} />
      </>}
    </View>)}
    <Action title="ADD WHOLE-STAGE SHOOTING AREA" disabled={areas.length >= 32} onPress={addArea} />
    </>}
    {section === 'targets' && <>
    <Copy>Target procedures: restrict shooting areas, require a stationary engagement, or choose targets that must be completed first.{activeRuleset(rules.ruleset) === 'IDPA' ? " IDPA requires explicit areas for each target based on the brief's cover and exposure requirements." : ''}</Copy>
    <View style={{ gap: 4 }}>{targets.map(t => <Action key={t.id} title={`${targetId === t.id ? '✓ ' : ''}${targetNameWithType(stage, t.id).toUpperCase()}`} onPress={() => setTargetId(t.id)} />)}</View>
    {targetId && <>
      <Action title={'STATIONARY REQUIRED' + SEP + (procedure.stationaryOnly ? 'YES' : 'NO')} onPress={() => updateProcedure({ stationaryOnly: !procedure.stationaryOnly })} />
      <Copy>Allowed shooting areas {procedure.areaIds === undefined ? (activeRuleset(rules.ruleset) === 'IDPA' ? '(all of them; IDPA needs an explicit selection)' : '(all of them)') : procedure.areaIds.length ? '' : '(none)'}</Copy>
      {areas.map((a, index) => <Action key={a.id} title={`${procedure.areaIds?.includes(a.id) ? '✓ ' : ''}${shootingAreaTitle(index).toUpperCase()}`} onPress={() => updateProcedure({ areaIds: toggle(procedure.areaIds, a.id) })} />)}
      {activeRuleset(rules.ruleset) !== 'IDPA' && <Action title="ALLOW ALL SHOOTING AREAS" onPress={() => updateProcedure({ areaIds: undefined })} />}
      <Copy>Engage these targets first:</Copy>
      {targets.filter(t => t.id !== targetId).map(t => <Action key={t.id} title={`${procedure.afterTargetIds?.includes(t.id) ? 'FIRST ✓ ' : ''}${targetNameWithType(stage, t.id).toUpperCase()}`} onPress={() => updateProcedure({ afterTargetIds: toggle(procedure.afterTargetIds, t.id) })} />)}
    </>}
    </>}
    {!!error && <Notice tone="error">{error}</Notice>}
    <Action title="APPLY ROUTE SETTINGS" variant="primary" onPress={() => {
      const firingAreas = areas.map(a => ({ id: a.id, vertices: a.text.trim().split(/\n/).map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { x: parts.length === 2 && parts[0] ? yardsToInches(Number(parts[0])) : NaN, y: parts.length === 2 && parts[1] ? yardsToInches(Number(parts[1])) : NaN };
      }) }));
      const next = { ...rules, firingAreas, sampleSpacingInches: Number(spacing), safeDirectionDegrees: direction.trim() ? Number(direction) : NaN, safeHalfAngleDegrees: Number(angle) };
      if (!validEngagementRules(next)) { setError('Check the numeric settings and enter at least three X, Y corners for each area.'); return; }
      onApply(next);
    }} />
    <Action title="CANCEL SETTINGS" onPress={onCancel} />
  </View>;
}
