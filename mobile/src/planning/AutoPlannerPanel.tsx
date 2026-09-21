import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Action, Copy, DataRow, Panel } from '../ui/kit';
import { isEngageable } from './model';
import type { StagePlan } from './model';
import { createRoutePlannerConfig } from './planner';
import type { PlannerContext, RouteStyle } from './planner';
import { copyPlannerRoute, generatePlannerCards } from './plannerUI';
import type { PlannerCard } from './plannerUI';

const styles: Record<RouteStyle, string> = {
  MINIMUM_MOVEMENT_HARDER_SHOOTING: 'Minimum Movement / Harder Shooting',
  BALANCED: 'Balanced', MORE_MOVEMENT_EASIER_SHOOTING: 'More Movement / Easier Shooting', PERSONALIZED: 'Personalized',
};
type Status = 'Ready' | 'Generating' | 'Results' | 'No valid route' | 'Error';

export default function AutoPlannerPanel({ stage, plan, profile, onUse }: PlannerContext & { onUse: (plan: StagePlan) => void }) {
  const [config, setConfig] = useState(createRoutePlannerConfig);
  const [status, setStatus] = useState<Status>('Ready');
  const [cards, setCards] = useState<PlannerCard[]>([]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PlannerCard | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setStatus('Ready'); setCards([]); setMessage(''); setPending(null);
    return () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  }, [stage, plan, profile, config]);
  const targets = stage.objects.filter(isEngageable);
  const positions = plan.route?.positions ?? [];
  const covered = targets.filter(t => positions.some(p => p.visibleTargetIds.includes(t.id))).length;
  const generating = status === 'Generating';
  function generate() {
    if (timer.current !== null) return;
    setStatus('Generating'); setCards([]); setMessage(''); setPending(null);
    // Let the generating state paint before the existing synchronous bounded search.
    timer.current = setTimeout(() => {
      timer.current = null;
      try {
        const result = generatePlannerCards({ stage, plan, profile }, config);
        setCards(result.cards); setStatus(result.cards.length ? 'Results' : 'No valid route');
        setMessage(result.cards.length ? '' : result.message ?? 'No valid route found. Check positions, visibility, planned rounds and loadout.');
      } catch (error) {
        setStatus('Error'); setMessage(error instanceof Error ? error.message : 'Unable to generate routes. Try again.');
      }
    }, 50);
  }
  function useRoute(card: PlannerCard, confirmed = false) {
    const next = copyPlannerRoute(plan, card.route, confirmed);
    if (!next) { setPending(card); return; }
    onUse(next);
  }
  return <Panel>
    <Copy>Place candidate positions in Route mode, mark visible targets under Targets, and set planned rounds and magazines under Plan.</Copy>
    <DataRow label="Candidate positions" value={positions.length} />
    <DataRow label="Scoring targets" value={targets.length} />
    <DataRow label="Targets with visibility data" value={`${covered} / ${targets.length}`} />
    <DataRow label="Magazines" value={plan.loadout.magazines.length} />
    <Copy>Route Style</Copy>
    {(Object.keys(styles) as RouteStyle[]).map(style => <Action key={style} title={`${config.style === style ? '✓ ' : ''}${styles[style]}`} disabled={generating} onPress={() => setConfig({ ...config, style })} />)}
    {config.style === 'PERSONALIZED' && <Copy>Personalized currently uses Balanced; shooting difficulty measurements are not available.</Copy>}
    <Copy>Backward Movement</Copy>
    {(['AVOID', 'LIMITED', 'ALLOWED'] as const).map(value => <Action key={value} title={`${config.movement.backwardMovement === value ? '✓ ' : ''}${value.charAt(0) + value.slice(1).toLowerCase()}`} disabled={generating} onPress={() => setConfig({ ...config, movement: { backwardMovement: value } })} />)}
    <Copy>Reload Strategy</Copy>
    {(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const).map(value => <Action key={value} title={`${config.reloadStrategy === value ? '✓ ' : ''}${value.charAt(0) + value.slice(1).toLowerCase()}`} disabled={generating} onPress={() => setConfig({ ...config, reloadStrategy: value })} />)}
    <Copy>{status}</Copy>
    {!!message && <Copy>{message}</Copy>}
    <Action title={generating ? 'Generating…' : 'GENERATE ROUTES'} disabled={generating} onPress={generate} />
    {cards.map((card, index) => <View key={card.id} style={{ gap: 8 }}>
      <Copy>Route {index + 1}</Copy>
      <DataRow label="Estimated time" value={card.estimatedTime === null ? 'Unavailable' : `${card.estimatedTime.toFixed(2)} s`} />
      <DataRow label="Movement distance" value={`${(card.movementDistance / 12).toFixed(1)} ft`} />
      <DataRow label="Positions" value={card.positions} />
      <DataRow label="Reloads" value={card.reloads} />
      <DataRow label="Rounds remaining (loaded)" value={card.roundsRemaining} />
      <DataRow label="Route style" value={styles[card.routeStyle]} />
      {card.personalizedFallback && <Copy>Personalized fell back to Balanced.</Copy>}
      {pending?.id === card.id ? <>
        <Copy>Replace the existing manual route with this route?</Copy>
        <Action title="Cancel" onPress={() => setPending(null)} />
        <Action title="Confirm replacement" onPress={() => useRoute(card, true)} />
      </> : <Action title="USE THIS ROUTE" onPress={() => useRoute(card)} />}
    </View>)}
  </Panel>;
}
