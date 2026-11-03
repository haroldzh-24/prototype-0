import { View } from 'react-native';
import { useState } from 'react';
import { Action, Copy, Panel, DataRow, Notice } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import { engagementLabel } from './engagements';
import { targetLabel } from './model';
import { isEngageable } from './model';
import type { StagePlan } from './model';
import { toggleRouteTarget } from './route';
import type { TargetAssignmentMode, StageRoute } from './route';
import { reorderEngagement } from './engagements';
import { positionTitle, SEP, targetNameWithType } from '../ui/words';

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
      <Copy>{positionTitle(route.positions.indexOf(selected)).toUpperCase()}</Copy>

      {section === 'assign' && <>
      <Copy>{'TARGETS' + SEP + 'engagement order'}</Copy>
      {selected.engagedTargetIds.map((id, index) => <View key={id} style={{ gap: 4 }}>
        <Copy>{engagementLabel(index) + '. ' + targetNameWithType(stage, id)}</Copy>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{([-1, 1] as const).map(direction => <Action key={direction} title={direction < 0 ? 'EARLIER' : 'LATER'} disabled={direction < 0 ? index === 0 : index === selected.engagedTargetIds.length - 1} onPress={() => { const next = reorderEngagement(stage, route, selected.id, id, direction); setError(next.error ?? ''); if (!next.error) onChange(next.route); }} />)}</View>
      </View>)}
      {!!selected.movingTargetIds?.length && <Copy>Moving targets are assigned along the next route segment. Tap its moving window to inspect the firing order.</Copy>}
      <DataRow label="Visible targets" value={selected.visibleTargetIds.length} />
      <Action title={assigning ? 'DONE ASSIGNING' : '+ ASSIGN TARGET'} onPress={() => setAssigning(!assigning)} />
      {assigning && <>
      <Copy>Visible means this position can see a target. Engaged means it is assigned here. Removing visibility also clears its engagement here.</Copy>
      {onAssign && <View style={{ gap: 8 }}><Action title={'VISIBLE TARGETS' + SEP + 'TAP ON STAGE'} onPress={() => onAssign('visible')} /><Action title={'ENGAGED TARGETS' + SEP + 'TAP ON STAGE'} onPress={() => onAssign('engaged')} /></View>}
      {targets.map(t => {
        const visible = selected.visibleTargetIds.includes(t.id), here = selected.engagedTargetIds.includes(t.id);
        const owner = route.positions.find(p => p.engagedTargetIds.includes(t.id));
        return <View key={t.id} style={{ gap: 6 }}>
          <Copy>{[targetNameWithType(stage, t.id), `${plan.engagements[t.id] ?? 0} rounds`, `engage: ${owner?.label ?? 'unassigned'}`].join(SEP)}</Copy>
          <Action title={visible ? 'VISIBLE ✓ (REMOVE)' : 'MARK VISIBLE'} onPress={() => { if (visible && (here || selected.movingTargetIds?.includes(t.id))) setError(`${targetLabel(stage, t.id)}: visibility removed; engagement cleared at this position.`); onChange(toggleRouteTarget(route, stage, selected.id, t.id, 'visible')); }} />
          <Action title={here ? 'CLEAR ENGAGEMENT' : 'ENGAGE HERE'} onPress={() => onChange(toggleRouteTarget(route, stage, selected.id, t.id, 'engaged'))} />
        </View>;
      })}
      </>}
      {[...new Set([...selected.visibleTargetIds, ...selected.engagedTargetIds])].filter(id => !targets.some(t => t.id === id)).map(id => <Action key={id} title="REMOVE MISSING TARGET" onPress={() => updateSelected({ visibleTargetIds: selected.visibleTargetIds.filter(t => t !== id), engagedTargetIds: selected.engagedTargetIds.filter(t => t !== id) })} />)}
      </>}
      {section === 'reload' && <>
      <Copy>{'RELOAD BEFORE ENGAGEMENT' + SEP + reloadLabel}</Copy>
      {!plan.loadout.magazines.length && <Copy>No magazines. Add a magazine in Route tools → Loadout.</Copy>}
      <Action title="NO RELOAD HERE" onPress={() => onChange({ ...route, reloads: route.reloads.filter(r => r.positionId !== selected.id) })} />
      {plan.loadout.magazines.map((m, index) => <Action key={m.id} title={`RELOAD: ${(m.label || `Magazine ${index + 1}`).toUpperCase()} (${m.startingRounds} ROUNDS)`} onPress={() => onChange({ ...route, reloads: [...route.reloads.filter(r => r.positionId !== selected.id), { positionId: selected.id, magazineId: m.id }] })} />)}
      </>}
    </>}
    {!selected && <Copy>Select a position on the stage to edit its targets or reload.</Copy>}
    {!!error && <Notice tone="warning">{error}</Notice>}
  </Panel>;
}
