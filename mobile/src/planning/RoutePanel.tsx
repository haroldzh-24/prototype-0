import { View } from 'react-native';
import { useState } from 'react';
import { Action, Copy, Panel, DataRow } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import { engagementLabel } from './engagements';
import { targetLabel } from './model';
import { isEngageable } from './model';
import type { StagePlan } from './model';
import { toggleRouteTarget } from './route';
import type { TargetAssignmentMode, StageRoute } from './route';
import { formatYards } from '../stage/measurements';
import { reorderEngagement } from './engagements';

type Props = { onAssign?: (mode: TargetAssignmentMode) => void; section: 'assign' | 'reload'; stage: StageDocument; plan: StagePlan; route: StageRoute; selectedId: string | null; onChange: (route: StageRoute) => void };
export default function RoutePanel({ stage, plan, route, selectedId, onChange, onAssign, section }: Props) {
  const [assigning, setAssigning] = useState(false), [error, setError] = useState('');
  const selected = route.positions.find(p => p.id === selectedId);
  const targets = stage.objects.filter(isEngageable);
  const reload = route.reloads.find(r => r.positionId === selectedId);
  const reloadIndex = plan.loadout.magazines.findIndex(m => m.id === reload?.magazineId);
  const reloadLabel = !reload ? 'None' : reloadIndex < 0 ? 'Missing magazine' : plan.loadout.magazines[reloadIndex].label || 'Magazine ' + (reloadIndex + 1);
  const updateSelected = (change: Partial<NonNullable<typeof selected>>) => onChange({ ...route, positions: route.positions.map(p => p.id === selectedId ? { ...p, ...change } : p) });
  return <Panel>
    {selected && <>
      <Copy>WAYPOINT / {selected.label} / X {formatYards(selected.position.x)} / Y {formatYards(selected.position.y)}</Copy>

      {section === 'assign' && <>
      <Copy>ASSIGNED TARGETS</Copy>
      {selected.engagedTargetIds.map((id, index) => <View key={id} style={{ gap: 4 }}>
        <Copy>{engagementLabel(index)} {targetLabel(stage, id)}</Copy>
        <View style={{ flexDirection: 'row', gap: 6 }}>{([-1, 1] as const).map(direction => <Action key={direction} title={direction < 0 ? 'Earlier' : 'Later'} disabled={direction < 0 ? index === 0 : index === selected.engagedTargetIds.length - 1} onPress={() => { const next = reorderEngagement(stage, route, selected.id, id, direction); setError(next.error ?? ''); if (!next.error) onChange(next.route); }} />)}</View>
      </View>)}
      {!!selected.movingTargetIds?.length && <Copy>Moving assignments: {selected.movingTargetIds.map(id => targetLabel(stage, id)).join(', ')}. Tap a moving section on the canvas to edit its order.</Copy>}
      <DataRow label="Visible targets" value={selected.visibleTargetIds.length} />
      <Action title={assigning ? 'Done assigning' : '+ ASSIGN TARGET / VISIBILITY'} onPress={() => setAssigning(!assigning)} />
      {assigning && <>
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
      </>}
      {[...new Set([...selected.visibleTargetIds, ...selected.engagedTargetIds])].filter(id => !targets.some(t => t.id === id)).map(id => <Action key={id} title={`Remove missing target ${id}`} onPress={() => updateSelected({ visibleTargetIds: selected.visibleTargetIds.filter(t => t !== id), engagedTargetIds: selected.engagedTargetIds.filter(t => t !== id) })} />)}
      </>}
      {section === 'reload' && <>
      <Copy>RELOAD BEFORE ENGAGEMENT / {reloadLabel}</Copy>
      <Action title="No reload here" onPress={() => onChange({ ...route, reloads: route.reloads.filter(r => r.positionId !== selected.id) })} />
      {plan.loadout.magazines.map((m, index) => <Action key={m.id} title={`Reload: ${m.label || `Magazine ${index + 1}`} (${m.startingRounds} rounds)`} onPress={() => onChange({ ...route, reloads: [...route.reloads.filter(r => r.positionId !== selected.id), { positionId: selected.id, magazineId: m.id }] })} />)}
      </>}
    </>}
    {!!error && <Copy>{error}</Copy>}
  </Panel>;
}
