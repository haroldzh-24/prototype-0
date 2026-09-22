import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Action, Copy, DataRow, Panel } from '../ui/kit';
import { discoverCandidatePositions } from './positionDiscovery';
import { discoveryGeometryKey, preparePositionSource } from './positionSources';
import type { DiscoverySession, PositionSource } from './positionSources';
import type { StagePlan } from './model';
import { createRoutePlannerConfig } from './planner';
import type { PlannerContext, RouteStyle } from './planner';
import EditorSheet from '../editor/EditorSheet';
import PlannerResultCard from './PlannerResultCard';
import { copyPlannerRoute, generatePlannerCards, rulesets, rulesetMetadata } from './plannerUI';
import type { PlannerCard, PlannerRuleset } from './plannerUI';

const styles: Record<RouteStyle, string> = {
  MINIMUM_MOVEMENT_HARDER_SHOOTING: 'Minimum Movement / Harder Shooting',
  BALANCED: 'Balanced', MORE_MOVEMENT_EASIER_SHOOTING: 'More Movement / Easier Shooting', PERSONALIZED: 'Personalized',
};
type Status = 'Ready' | 'Generating' | 'Results' | 'No valid route' | 'Error';

export default function AutoPlannerPanel({ stage, plan, profile, onUse, preview, onPreview, onClose, discoverySession, onDiscovery, discoveryPreview, onDiscoveryPreview }: PlannerContext & { discoverySession: DiscoverySession | null; onDiscovery: (session: DiscoverySession) => void; discoveryPreview: boolean; onDiscoveryPreview: () => void; preview: PlannerCard | null; onPreview: (card: PlannerCard) => void; onClose: () => void; onUse: (plan: StagePlan) => void }) {
  const [source, setSource] = useState<PositionSource>('MANUAL');
  const [discoveryDetails, setDiscoveryDetails] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const prepared = preparePositionSource({ stage, plan, profile }, source, discoverySession);
  const [ruleset, setRuleset] = useState<PlannerRuleset>('CUSTOM');
  const [searchWarning, setSearchWarning] = useState(false);
  const [expansions, setExpansions] = useState<Record<string, { why: boolean; details: boolean }>>({});
  const [config, setConfig] = useState(createRoutePlannerConfig);
  const [status, setStatus] = useState<Status>('Ready');
  const [cards, setCards] = useState<PlannerCard[]>([]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PlannerCard | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setDiscovering(false); setExpansions({}); setSearchWarning(false); setStatus('Ready'); setCards([]); setMessage(''); setPending(null);
    return () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  }, [stage, plan, profile, config, ruleset, source, discoverySession]);
  const generating = status === 'Generating' || discovering;
  function discover() {
    if (timer.current !== null) return;
    setDiscovering(true); setCards([]); setPending(null); setSearchWarning(false); setMessage('');
    timer.current = setTimeout(() => {
      timer.current = null;
      try { onDiscovery({ geometryKey: discoveryGeometryKey(stage), result: discoverCandidatePositions(stage) }); }
      catch (error) { setStatus('Error'); setMessage(error instanceof Error ? error.message : 'Discovery failed. Try again or use manual positions.'); }
      finally { setDiscovering(false); }
    }, 50);
  }
  function generate() {
    if (timer.current !== null) return;
    if (!prepared.searchCount) { setCards([]); setPending(null); setStatus('No valid route'); setMessage('No useful positions in the selected source. Discover positions or add manual positions with visibility.'); return; }
    setExpansions({}); setSearchWarning(false); setStatus('Generating'); setCards([]); setMessage(''); setPending(null);
    // Let the generating state paint before the existing synchronous bounded search.
    timer.current = setTimeout(() => {
      timer.current = null;
      try {
        const result = generatePlannerCards(prepared.context, config, prepared.metadata);
        setSearchWarning(!!result.searchWarning); setCards(result.cards); setStatus(result.cards.length ? 'Results' : 'No valid route');
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
  return <EditorSheet title="AI PLAN" visible={!preview && !discoveryPreview} close={onClose}><Panel>
    <Copy>Position Source</Copy>
    {(['MANUAL', 'AUTO', 'COMBINED'] as const).map(value => <Action key={value} title={(source === value ? 'Selected: ' : '') + (value === 'COMBINED' ? 'AUTO + MANUAL' : value)} disabled={generating} onPress={() => setSource(value)} />)}
    <Copy>Manual positions use your visibility assignments. Auto positions use estimated visibility.</Copy>
    <DataRow label="Position Source" value={source === 'COMBINED' ? 'Combined' : source === 'AUTO' ? 'Auto' : 'Manual'} />
    <DataRow label="Manual Positions" value={prepared.manualCount} />
    <DataRow label="Auto Positions Found" value={prepared.autoCount} />
    <DataRow label="Positions Used for Search" value={prepared.searchCount} />
    <DataRow label="Scoring Targets" value={prepared.targetCount} />
    <DataRow label="Targets Covered by Selected Position Source" value={prepared.covered + ' / ' + prepared.targetCount} />
    {source !== 'MANUAL' && <>
      <Action title={discovering ? 'Discovering...' : 'DISCOVER POSITIONS'} disabled={generating} onPress={discover} />
      <Action title="PREVIEW AUTO POSITIONS" disabled={generating || !prepared.autoCount || !prepared.discovery} onPress={onDiscoveryPreview} />
      <Copy>Coarse discovery may miss useful positions. Legality uses modeled geometry only.</Copy>
      <Action title={discoveryDetails ? "Hide discovery details" : "Discovery details"} onPress={() => setDiscoveryDetails(!discoveryDetails)} />
      {discoveryDetails && prepared.discovery?.warnings.filter(w => w.code === 'MODELED_GEOMETRY_ONLY' || w.code === 'PROJECTED_PORTS').map(w => <Copy key={w.code}>{w.message}</Copy>)}
    </>}
    {prepared.warnings.filter(w => !w.startsWith('Coarse discovery') && !w.startsWith('Bounds and wall') && !w.startsWith('Port horizontal')).map((warning, i) => <Copy key={i}>{warning}</Copy>)}
    <DataRow label="Magazines" value={plan.loadout.magazines.length} />
    <Copy>Ruleset</Copy>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{rulesets.map(choice => <Action key={choice} title={(ruleset === choice ? 'Selected: ' : '') + rulesetMetadata(choice).label} disabled={generating} onPress={() => setRuleset(choice)} />)}</View>
    <Copy>{rulesetMetadata(ruleset).description}</Copy>
    <Copy>Route Style</Copy>
    {(Object.keys(styles) as RouteStyle[]).map(style => <Action key={style} title={`${config.style === style ? '✓ ' : ''}${styles[style]}`} disabled={generating} onPress={() => setConfig({ ...config, style })} />)}
    {config.style === 'PERSONALIZED' && <Copy>Personalized currently uses Balanced; shooting difficulty measurements are not available.</Copy>}
    <Copy>Backward Movement</Copy>
    {(['AVOID', 'LIMITED', 'ALLOWED'] as const).map(value => <Action key={value} title={`${config.movement.backwardMovement === value ? '✓ ' : ''}${value.charAt(0) + value.slice(1).toLowerCase()}`} disabled={generating} onPress={() => setConfig({ ...config, movement: { backwardMovement: value } })} />)}
    <Copy>Reload Strategy</Copy>
    {(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const).map(value => <Action key={value} title={`${config.reloadStrategy === value ? '✓ ' : ''}${value.charAt(0) + value.slice(1).toLowerCase()}`} disabled={generating} onPress={() => setConfig({ ...config, reloadStrategy: value })} />)}
    <Copy>{status}</Copy>
    {!!message && <Copy>{message}</Copy>}
    <Action title={generating ? 'Generating…' : 'GENERATE ROUTES'} disabled={generating || (source === 'AUTO' && !prepared.discovery)} onPress={generate} />
    {searchWarning && <><Copy>LIMITED SEARCH</Copy><Copy>The planner reached its current search limit. These are the best candidates evaluated, not a guaranteed global optimum.</Copy></>}
    {cards.map((card, index) => <PlannerResultCard key={card.id} card={card} index={index} styleLabel={styles[card.routeStyle]} expansion={expansions[card.id] ?? { why: false, details: false }} onExpand={value => setExpansions(current => ({ ...current, [card.id]: value }))} pending={pending?.id === card.id} onPreview={() => onPreview(card)} onUse={() => useRoute(card)} onConfirm={() => useRoute(card, true)} onCancel={() => setPending(null)} />)}
  </Panel></EditorSheet>;
}
