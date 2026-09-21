import { colors } from '../ui/tokens';
import { TextInput, View } from 'react-native';
import { useState } from 'react';
import { Action, Copy, Panel, Stat, DataRow, ui } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import { targetLabel } from './model';
import type { ShooterPerformanceProfile } from '../profile/model';
import { isEngageable } from './model';
import type { StagePlan } from './model';
import { toggleRouteTarget, evaluateRoute, reorderPosition } from './route';
import type { TargetAssignmentMode, StageRoute } from './route';

type Props = { onAssign?: (mode: TargetAssignmentMode) => void; section?: 'summary' | 'assign' | 'reload'; stage: StageDocument; plan: StagePlan; route: StageRoute; profile: ShooterPerformanceProfile | null; selectedId: string | null; select: (id: string) => void; onChange: (route: StageRoute) => void };
export default function RoutePanel({ stage, plan, route, profile, selectedId, select, onChange, onAssign, section = 'summary' }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const result = evaluateRoute(stage, plan, route, profile), selected = route.positions.find(p => p.id === selectedId);
  const targets = stage.objects.filter(isEngageable);
  const reload = route.reloads.find(r => r.positionId === selectedId);
  const reloadIndex = plan.loadout.magazines.findIndex(m => m.id === reload?.magazineId);
  const reloadLabel = !reload ? 'None' : reloadIndex < 0 ? 'Missing magazine' : plan.loadout.magazines[reloadIndex].label || 'Magazine ' + (reloadIndex + 1);
  const updateSelected = (change: Partial<NonNullable<typeof selected>>) => onChange({ ...route, positions: route.positions.map(p => p.id === selectedId ? { ...p, ...change } : p) });
  return <Panel>
    {section === 'summary' && <>
    <View style={ui.statGroup}>
      <Stat value={result.timing ? result.timing.total.toFixed(2) : '--'} unit="s" label={result.warnings.length ? 'Provisional time' : 'Est. time'} />
      <Stat value={result.startingRounds} label="Starting rounds" />
      <Stat value={route.positions.length} label="Positions" />
    </View>
    <TextInput accessibilityLabel="Route name" style={ui.input} value={route.name} maxLength={100} onChangeText={name => onChange({ ...route, name })} />
    <Copy>START → {route.positions.map(p => p.label).join(' → ') || 'Add a position'}</Copy>
    <DataRow label="Distance" value={(result.distance / 12).toFixed(1) + " ft"} />
    <DataRow label="Magazine changes" value={result.magazineChanges} />
    {route.positions.map((p, index) => {
      const state = result.ammo[index], segment = result.segments.find(s => s.toId === p.id);
      return <View key={p.id} style={{ gap: 6, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
        <Action title={`${index + 1}. ${p.label}${selectedId === p.id ? ' • selected' : ''}`} onPress={() => select(p.id)} />
        <Copy>Visible: {p.visibleTargetIds.map(id => targetLabel(stage, id)).join(', ') || 'None'} / Engaged: {p.engagedTargetIds.map(id => targetLabel(stage, id)).join(', ') || 'None'}</Copy>
        <Copy>{segment ? `${(segment.distance / 12).toFixed(1)} ft movement | ` : ''}{state.available} available → {state.required} required → {state.remaining} remaining{state.sufficient ? '' : ' / INSUFFICIENT'}</Copy>
        <View style={{ flexDirection: 'row', gap: 6 }}><Action title="Earlier" disabled={index === 0} onPress={() => onChange(reorderPosition(route, p.id, -1))} /><Action title="Later" disabled={index === route.positions.length - 1} onPress={() => onChange(reorderPosition(route, p.id, 1))} /></View>
      </View>;
    })}
    </>}
    {selected && section !== 'summary' && <>
      <Copy>POSITION / {selected.label} / X {selected.position.x.toFixed(1)} IN / Y {selected.position.y.toFixed(1)} IN</Copy>
      <TextInput accessibilityLabel="Position label" style={ui.input} value={selected.label} maxLength={30} onChangeText={label => updateSelected({ label })} />
      {section === 'assign' && <>
      <Copy>Mark visibility manually; “Engage here” moves the intended engagement to this position. Target rounds are edited in Loadout / Planning.</Copy>
      {onAssign && <View style={{ gap: 8 }}><Action title="Visible targets / tap on stage" onPress={() => onAssign('visible')} /><Action title="Engaged targets / tap on stage" onPress={() => onAssign('engaged')} /></View>}
      {targets.map(t => {
        const visible = selected.visibleTargetIds.includes(t.id), here = selected.engagedTargetIds.includes(t.id);
        const owner = route.positions.find(p => p.engagedTargetIds.includes(t.id));
        return <View key={t.id} style={{ gap: 6 }}>
          <Copy>{targetLabel(stage, t.id)} / {plan.engagements[t.id] ?? 0} rounds / Engage: {owner?.label ?? 'unassigned'}</Copy>
          <Action title={visible ? 'Visible ✓ (remove)' : 'Mark visible'} onPress={() => onChange(toggleRouteTarget(route, stage, selected.id, t.id, 'visible'))} />
          <Action title={here ? 'Clear engagement' : 'Engage here'} onPress={() => onChange(toggleRouteTarget(route, stage, selected.id, t.id, 'engaged'))} />
        </View>;
      })}
      {[...new Set([...selected.visibleTargetIds, ...selected.engagedTargetIds])].filter(id => !targets.some(t => t.id === id)).map(id => <Action key={id} title={`Remove missing target ${id}`} onPress={() => updateSelected({ visibleTargetIds: selected.visibleTargetIds.filter(t => t !== id), engagedTargetIds: selected.engagedTargetIds.filter(t => t !== id) })} />)}
      </>}
      {section === 'reload' && <>
      <Copy>RELOAD BEFORE ENGAGEMENT / {reloadLabel}</Copy>
      <Action title="No reload here" onPress={() => onChange({ ...route, reloads: route.reloads.filter(r => r.positionId !== selected.id) })} />
      {plan.loadout.magazines.map((m, index) => <Action key={m.id} title={`Reload: ${m.label || `Magazine ${index + 1}`} (${m.startingRounds} rounds)`} onPress={() => onChange({ ...route, reloads: [...route.reloads.filter(r => r.positionId !== selected.id), { positionId: selected.id, magazineId: m.id }] })} />)}
      </>}
      <View style={{ borderTopWidth: 1, borderColor: colors.danger, paddingTop: 16, marginTop: 16, gap: 8 }}>
        {confirmDelete === selected.id ? <>
          <Copy>Delete {selected.label} and its reload assignment?</Copy>
          <Action title="Cancel" onPress={() => setConfirmDelete(null)} />
          <Action title="Confirm delete position" onPress={() => { onChange({ ...route, positions: route.positions.filter(p => p.id !== selected.id), reloads: route.reloads.filter(r => r.positionId !== selected.id) }); setConfirmDelete(null); }} />
        </> : <Action title="Delete position" onPress={() => setConfirmDelete(selected.id)} />}
      </View>
    </>}
    {section === 'summary' && <>
    {result.warnings.map((warning, index) => <Copy key={index}>WARNING: {warning}</Copy>)}
    {result.timing && <>
      <Copy>{result.warnings.length ? 'Incomplete plan / provisional estimate' : 'Timing breakdown'}</Copy>
      <DataRow label="Movement" value={result.timing.movement.toFixed(2) + ' s'} />
      <DataRow label="Draw" value={result.timing.draw.toFixed(2) + ' s'} />
      <DataRow label="Splits" value={result.timing.splits.toFixed(2) + ' s'} />
      <DataRow label="Transitions" value={result.timing.transitions.toFixed(2) + ' s'} />
      <DataRow label="Reloads" value={result.timing.reloads.toFixed(2) + ' s'} />
    </>}
    <Copy>Estimates use your saved shooter profile. Straight-line movement does not validate walls or fault lines. Reloads occur before engagement; discarded magazines cannot be reused. Timing adds movement and reload time, with no overlap or automatic visibility calculation.</Copy>
    </>}
  </Panel>;
}
