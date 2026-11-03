import { Text, View } from 'react-native';
import { Action, Copy, DataRow, Notice, Segmented, ui } from '../ui/kit';
import EditorSheet from '../editor/EditorSheet';
import ExpectedHits from './ExpectedHits';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from './model';
import { assignRounds, isEngageable, setExpectation } from './model';
import type { StageRoute } from './route';
import { analyzeEngagements } from './engagements';
import { assignTarget, targetAssignment, unassignTarget } from './assignments';
import { defaultRounds, plannedRounds, roundsSourceText } from './planDefaults';
import { positionName, SEP, targetNameWithType } from '../ui/words';
import { planWords } from './planWords';

const NOT_ENGAGED = 'NOT ENGAGED';

/**
 * The target sheet in PLAN (UI cohesion plan, phase 3): one target's rounds, expected hits and the position that
 * engages it. Props in, changes out: rounds and expected hits through `onPlanChange`, "Engaged from" through
 * `onRouteChange` (assignTarget / unassignTarget, the same assignment AUTO-PLAN makes and ANALYZE checks).
 * `route` is the route PLAN shows (it may be an untouched draft).
 */
export default function TargetPlanSheet({ visible, close, stage, plan, route, targetId, onPlanChange, onRouteChange }: {
  visible: boolean; close: () => void;
  stage: StageDocument; plan: StagePlan; route: StageRoute; targetId: string;
  onPlanChange: (plan: StagePlan) => void; onRouteChange: (route: StageRoute) => void;
}) {
  const target = stage.objects.find(o => o.id === targetId);
  const title = target && isEngageable(target) ? targetNameWithType(stage, targetId) : 'Missing target';
  if (!target || !isEngageable(target)) return <EditorSheet title={title} visible={visible} close={close}><View style={{ padding: 16 }}><Copy>This target is no longer on the stage.</Copy></View></EditorSheet>;
  const rounds = plannedRounds(plan, target), at = targetAssignment(route, targetId);
  const setRounds = (n: number) => { const result = assignRounds(plan, stage, targetId, Math.max(0, n)); if (!result.error) onPlanChange(result.plan); };
  const useDefault = () => { const { [targetId]: _mine, ...rest } = plan.engagements; onPlanChange({ ...plan, engagements: rest }); };
  // With route rules, say where the target is legal standing; otherwise say it is not checked (rule 7).
  const legal = route.engagementRules && route.positions.length
    ? analyzeEngagements(stage, route).alternatives.find(a => a.targetId === targetId)?.stationaryWaypointIds.map(id => route.positions.findIndex(p => p.id === id)).filter(i => i >= 0).map(positionName) ?? []
    : null;
  const options = [...route.positions.map((_, i) => positionName(i)), NOT_ENGAGED];
  return <EditorSheet title={title} visible={visible} close={close}><View style={{ paddingHorizontal: 16, gap: 12 }}>
    <Text style={ui.eyebrow}>ROUNDS</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Action title="−" accessibilityLabel="Fewer rounds" disabled={rounds.rounds <= 0} onPress={() => setRounds(rounds.rounds - 1)} />
      <Text style={ui.statValue}>{rounds.rounds}</Text>
      <Action title="+" accessibilityLabel="More rounds" onPress={() => setRounds(rounds.rounds + 1)} />
    </View>
    <Copy>{roundsSourceText(plan, target)}</Copy>
    {rounds.source === 'yours' && rounds.rounds !== defaultRounds(target.type) && <Action title={`USE RULE DEFAULT (${defaultRounds(target.type)})`} onPress={useDefault} />}
    <ExpectedHits steel={target.type !== 'cardboardTarget'} value={plan.expectations?.[targetId]} onChange={change => onPlanChange(setExpectation(plan, targetId, change))} />
    <Text style={ui.eyebrow}>{planWords.engagedFrom.toUpperCase()}</Text>
    {route.positions.length ? <>
      <Segmented options={options} value={at ? positionName(at.index) : NOT_ENGAGED}
        onChange={value => onRouteChange(value === NOT_ENGAGED ? unassignTarget(route, targetId) : assignTarget(route, stage, route.positions[options.indexOf(value)].id, targetId))} />
      <DataRow label={planWords.engagedFrom} value={at ? positionName(at.index) + SEP + (at.moving ? 'on the way in' : 'standing') : planWords.notEngaged} />
      {legal === null ? <Copy>Not checked: draw a shooting area to check line of sight and safe angles.</Copy>
        : legal.length ? <Copy>{`Legal standing from ${legal.join(', ')} (shooting area, safe angle, line of sight).`}</Copy>
        : <Notice tone="warning">Not legal standing from any position on this route.</Notice>}
    </> : <Copy>No positions yet: plan a route in ROUTE, then pick the position that engages this target.</Copy>}
  </View></EditorSheet>;
}
