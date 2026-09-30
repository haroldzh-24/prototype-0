import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Action, Copy, ui } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import { isEngageable, targetLabel } from './model';
import { defaultEngagementRules, validEngagementRules } from './engagements';
import type { EngagementRules, FiringArea } from './engagements';

/** Stage-brief authoring. Coordinate pairs are physical yards, not screen pixels. */
export default function EngagementSettings({ stage, initial, onApply, onCancel }: { stage: StageDocument; initial?: EngagementRules; onApply: (rules: EngagementRules) => void; onCancel: () => void }) {
  const [rules, setRules] = useState(() => initial ?? defaultEngagementRules());
  const [spacing, setSpacing] = useState(String(rules.sampleSpacingInches));
  const [direction, setDirection] = useState(String(rules.safeDirectionDegrees));
  const [angle, setAngle] = useState(String(rules.safeHalfAngleDegrees));
  const areaText = (area: FiringArea) => area.vertices.map(p => `${p.x / 36}, ${p.y / 36}`).join('\n');
  const [areas, setAreas] = useState(() => rules.firingAreas.map(a => ({ id: a.id, text: areaText(a) })));
  const [targetId, setTargetId] = useState<string | null>(null), [error, setError] = useState('');
  const targets = stage.objects.filter(isEngageable);
  const procedure = targetId ? rules.targetProcedures[targetId] ?? {} : {};
  const updateProcedure = (change: Partial<typeof procedure>) => { if (targetId) setRules({ ...rules, targetProcedures: { ...rules.targetProcedures, [targetId]: { ...procedure, ...change } } }); };
  const toggle = (ids: string[] | undefined, id: string) => ids?.includes(id) ? ids.filter(x => x !== id) : [...(ids ?? []), id];
  const addArea = () => {
    let i = 1; while (areas.some(a => a.id === `area-${i}`)) i++;
    const area = { id: `area-${i}`, vertices: [{ x: 0, y: 0 }, { x: stage.stage.width, y: 0 }, { x: stage.stage.width, y: stage.stage.depth }, { x: 0, y: stage.stage.depth }] };
    setAreas([...areas, { id: area.id, text: areaText(area) }]);
  };
  return <View style={{ gap: 8 }}>
    <Copy>Airsoft stage brief</Copy>
    <View style={{ flexDirection: 'row', gap: 6 }}>{(['USPSA', 'PCSL', 'IDPA'] as const).map(ruleset => <Action key={ruleset} title={`${rules.ruleset === ruleset ? 'Selected: ' : ''}${ruleset}`} onPress={() => setRules({ ...rules, ruleset })} />)}</View>
    <Action title={`Moving engagement: ${rules.allowMoving ? 'allowed' : 'not allowed'}`} onPress={() => setRules({ ...rules, allowMoving: !rules.allowMoving })} />
    <Action title={`Travel outside firing areas: ${rules.allowOutsideTravel ? 'allowed' : 'not allowed'}`} onPress={() => setRules({ ...rules, allowOutsideTravel: !rules.allowOutsideTravel })} />
    <Copy>Safe direction in degrees: 0 = right, 90 = down, -90 = up.</Copy>
    <TextInput accessibilityLabel="Safe direction degrees" style={ui.input} value={direction} onChangeText={setDirection} />
    <Copy>Safe half angle in degrees (90 gives a 180-degree limit).</Copy>
    <TextInput accessibilityLabel="Safe half angle degrees" style={ui.input} value={angle} onChangeText={setAngle} />
    <Copy>Sample spacing in physical inches (0.25–24).</Copy>
    <TextInput accessibilityLabel="Engagement sample spacing inches" style={ui.input} value={spacing} onChangeText={setSpacing} />
    <Copy>Firing areas: list polygon corners as X, Y in yards, one corner per line. Areas exclude their boundary. Fault-line marks alone do not identify the legal side. The whole-stage button supplies a rectangle you can edit to follow your course boundaries.</Copy>
    {areas.map(a => <View key={a.id} style={{ gap: 4 }}>
      <Copy>Firing area {a.id}</Copy>
      <TextInput accessibilityLabel={`Firing area ${a.id} corners in yards`} multiline style={[ui.input, { minHeight: 110, textAlignVertical: 'top' }]} value={a.text} onChangeText={text => setAreas(areas.map(row => row.id === a.id ? { ...row, text } : row))} />
      <Action title={`Remove ${a.id}`} onPress={() => setAreas(areas.filter(row => row.id !== a.id))} />
    </View>)}
    <Action title="Add whole-stage firing area" disabled={areas.length >= 32} onPress={addArea} />
    <Copy>Target procedures: restrict firing areas, require a stationary engagement, or choose targets that must be completed first. IDPA requires explicit areas for each target based on the brief's cover and exposure requirements.</Copy>
    <View style={{ gap: 4 }}>{targets.map(t => <Action key={t.id} title={`${targetId === t.id ? 'Selected: ' : ''}${targetLabel(stage, t.id)}`} onPress={() => setTargetId(t.id)} />)}</View>
    {targetId && <>
      <Action title={`Stationary required: ${procedure.stationaryOnly ? 'yes' : 'no'}`} onPress={() => updateProcedure({ stationaryOnly: !procedure.stationaryOnly })} />
      <Copy>Allowed areas {procedure.areaIds === undefined ? '(all configured areas; IDPA needs an explicit selection)' : procedure.areaIds.length ? '' : '(none)'}</Copy>
      {areas.map(a => <Action key={a.id} title={`${procedure.areaIds?.includes(a.id) ? 'Selected: ' : ''}${a.id}`} onPress={() => updateProcedure({ areaIds: toggle(procedure.areaIds, a.id) })} />)}
      {rules.ruleset !== 'IDPA' && <Action title="Allow all configured areas" onPress={() => updateProcedure({ areaIds: undefined })} />}
      <Copy>Engage these targets first:</Copy>
      {targets.filter(t => t.id !== targetId).map(t => <Action key={t.id} title={`${procedure.afterTargetIds?.includes(t.id) ? 'Required first: ' : ''}${targetLabel(stage, t.id)}`} onPress={() => updateProcedure({ afterTargetIds: toggle(procedure.afterTargetIds, t.id) })} />)}
    </>}
    {!!error && <Copy>{error}</Copy>}
    <Action title="Apply engagement settings" onPress={() => {
      const firingAreas = areas.map(a => ({ id: a.id, vertices: a.text.trim().split(/\n/).map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { x: parts.length === 2 && parts[0] ? Number(parts[0]) * 36 : NaN, y: parts.length === 2 && parts[1] ? Number(parts[1]) * 36 : NaN };
      }) }));
      const next = { ...rules, firingAreas, sampleSpacingInches: Number(spacing), safeDirectionDegrees: direction.trim() ? Number(direction) : NaN, safeHalfAngleDegrees: Number(angle) };
      if (!validEngagementRules(next)) { setError('Check the numeric settings and enter at least three X, Y corners for each area.'); return; }
      onApply(next);
    }} />
    <Action title="Cancel settings" onPress={onCancel} />
  </View>;
}
