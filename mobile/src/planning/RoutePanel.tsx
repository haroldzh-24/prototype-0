import { TextInput, View } from 'react-native';
import { uuid } from 'expo-modules-core';
import { Action, Copy, Panel, ui } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import { objectLabel } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import { isEngageable } from './model';
import type { StagePlan } from './model';
import { engageAt, evaluateRoute, reorderPosition } from './route';
import type { StageRoute } from './route';

type Props = { stage: StageDocument; plan: StagePlan; route: StageRoute; profile: ShooterPerformanceProfile | null; selectedId: string | null; select: (id: string) => void; onChange: (route: StageRoute) => void };
export default function RoutePanel({ stage, plan, route, profile, selectedId, select, onChange }: Props) {
  const result = evaluateRoute(stage, plan, route, profile), selected = route.positions.find(p => p.id === selectedId);
  const targets = stage.objects.filter(isEngageable);
  const updateSelected = (change: Partial<NonNullable<typeof selected>>) => onChange({ ...route, positions: route.positions.map(p => p.id === selectedId ? { ...p, ...change } : p) });
  return <Panel>
    <Copy>MANUAL ROUTE / {route.positions.length} POSITIONS</Copy>
    <TextInput accessibilityLabel="Route name" style={ui.input} value={route.name} maxLength={100} onChangeText={name => onChange({ ...route, name })} />
    <Action title="+ Shooting position" onPress={() => {
      const id = 'position-' + uuid.v4();
      let number = 1;
      while (route.positions.some(p => p.label === `P${number}`)) number++;
      onChange({ ...route, positions: [...route.positions, { id, label: `P${number}`, position: { space: 'stage', x: stage.stage.width / 2, y: stage.stage.depth / 2, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] }] }); select(id);
    }} />
    <Copy>START → {route.positions.map(p => p.label).join(' → ') || 'Add a position'}</Copy>
    <Copy>Total distance: {(result.distance / 12).toFixed(1)} ft | Starting rounds: {result.startingRounds} | Magazine changes: {result.magazineChanges}</Copy>
    {route.positions.map((p, index) => {
      const state = result.ammo[index], segment = result.segments.find(s => s.toId === p.id);
      return <View key={p.id} style={{ gap: 6 }}>
        <Action title={`${index + 1}. ${p.label}${selectedId === p.id ? ' • selected' : ''}`} onPress={() => select(p.id)} />
        <Copy>{segment ? `${(segment.distance / 12).toFixed(1)} ft movement | ` : ''}{state.available} available → {state.required} required → {state.remaining} remaining{state.sufficient ? '' : ' / INSUFFICIENT'}</Copy>
        <View style={{ flexDirection: 'row', gap: 6 }}><Action title="Earlier" disabled={index === 0} onPress={() => onChange(reorderPosition(route, p.id, -1))} /><Action title="Later" disabled={index === route.positions.length - 1} onPress={() => onChange(reorderPosition(route, p.id, 1))} /></View>
      </View>;
    })}
    {selected && <>
      <Copy>POSITION / {selected.label} / X {selected.position.x.toFixed(1)} IN / Y {selected.position.y.toFixed(1)} IN</Copy>
      <TextInput accessibilityLabel="Position label" style={ui.input} value={selected.label} maxLength={30} onChangeText={label => updateSelected({ label })} />
      <Copy>Mark visibility manually; “Engage here” moves the intended engagement to this position. Target rounds are edited in Loadout / Planning.</Copy>
      {targets.map((t, index) => {
        const visible = selected.visibleTargetIds.includes(t.id), here = selected.engagedTargetIds.includes(t.id);
        const owner = route.positions.find(p => p.engagedTargetIds.includes(t.id));
        return <View key={t.id} style={{ gap: 6 }}>
          <Copy>Target {index + 1} / {objectLabel(t.type)} / {t.id} / {plan.engagements[t.id] ?? 0} rounds / Engage: {owner?.label ?? 'unassigned'}</Copy>
          <Action title={visible ? 'Visible ✓ (remove)' : 'Mark visible'} onPress={() => updateSelected({ visibleTargetIds: visible ? selected.visibleTargetIds.filter(id => id !== t.id) : [...selected.visibleTargetIds, t.id], engagedTargetIds: visible ? selected.engagedTargetIds.filter(id => id !== t.id) : selected.engagedTargetIds })} />
          <Action title={here ? 'Clear engagement' : 'Engage here'} onPress={() => here ? updateSelected({ engagedTargetIds: selected.engagedTargetIds.filter(id => id !== t.id) }) : onChange(engageAt(route, selected.id, t.id))} />
        </View>;
      })}
      {[...new Set([...selected.visibleTargetIds, ...selected.engagedTargetIds])].filter(id => !targets.some(t => t.id === id)).map(id => <Action key={id} title={`Remove missing target ${id}`} onPress={() => updateSelected({ visibleTargetIds: selected.visibleTargetIds.filter(t => t !== id), engagedTargetIds: selected.engagedTargetIds.filter(t => t !== id) })} />)}
      <Copy>RELOAD BEFORE ENGAGEMENT / {route.reloads.find(r => r.positionId === selected.id)?.magazineId ?? 'None'}</Copy>
      <Action title="No reload here" onPress={() => onChange({ ...route, reloads: route.reloads.filter(r => r.positionId !== selected.id) })} />
      {plan.loadout.magazines.map((m, index) => <Action key={m.id} title={`Reload: ${m.label || `Magazine ${index + 1}`} (${m.startingRounds} rounds)`} onPress={() => onChange({ ...route, reloads: [...route.reloads.filter(r => r.positionId !== selected.id), { positionId: selected.id, magazineId: m.id }] })} />)}
      <Action title="Delete position" onPress={() => onChange({ ...route, positions: route.positions.filter(p => p.id !== selected.id), reloads: route.reloads.filter(r => r.positionId !== selected.id) })} />
    </>}
    {result.warnings.map((warning, index) => <Copy key={index}>WARNING: {warning}</Copy>)}
    {result.timing && <>
      <Copy>{result.warnings.length ? 'INCOMPLETE PLAN / provisional estimate' : 'Estimated route time'}: {result.timing.total.toFixed(2)} s</Copy>
      <Copy>Movement {result.timing.movement.toFixed(2)} · Draw {result.timing.draw.toFixed(2)} · Splits {result.timing.splits.toFixed(2)} · Transitions {result.timing.transitions.toFixed(2)} · Reloads {result.timing.reloads.toFixed(2)} seconds.</Copy>
    </>}
    <Copy>Estimates use your saved shooter profile. Straight-line movement does not validate walls or fault lines. Reloads occur before engagement; discarded magazines cannot be reused. Timing adds movement and reload time, with no overlap or automatic visibility calculation.</Copy>
  </Panel>;
}
