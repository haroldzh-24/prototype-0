import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { meaningfulRoute } from '../editor/routePresentation';
import { isEngageable } from './model';
import { analyzeEngagements } from './engagements';
import { Action, Copy, DataRow, Panel, Loading, Notice } from '../ui/kit';
import { buildPersonalizedModel } from '../profile/personalizedPerformance';
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

export default function AutoPlannerPanel({ stage, plan, profile, onUse, preview, onPreview, onClose, discoverySession, onDiscovery, discoveryPreview, onDiscoveryPreview, onConfigure }: PlannerContext & { onConfigure: (section: 'loadout' | 'targets' | 'rules' | 'geometry' | 'start') => void; discoverySession: DiscoverySession | null; onDiscovery: (session: DiscoverySession) => void; discoveryPreview: boolean; onDiscoveryPreview: () => void; preview: PlannerCard | null; onPreview: (card: PlannerCard) => void; onClose: () => void; onUse: (plan: StagePlan) => void }) {
  const [advanced, setAdvanced] = useState(false), [alternatives, setAlternatives] = useState(false);
  const [source, setSource] = useState<PositionSource>('AUTO');
  const [discoveryDetails, setDiscoveryDetails] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const personalizedModel = buildPersonalizedModel(profile);
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
  }, [stage, plan, profile, config, ruleset, source]);
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
    setAlternatives(false); setExpansions({}); setSearchWarning(false); setStatus('Generating'); setCards([]); setMessage(''); setPending(null);
    // Let the generating state paint before the existing synchronous bounded search.
    timer.current = setTimeout(() => {
      timer.current = null;
      try {
        let search = prepared;
        if (source !== 'MANUAL' && !prepared.discovery) {
          const session = { geometryKey: discoveryGeometryKey(stage), result: discoverCandidatePositions(stage) };
          onDiscovery(session);
          search = preparePositionSource({ stage, plan, profile }, source, session);
        }
        if (!search.searchCount) { setStatus('No valid route'); setMessage('No useful waypoints found. Check the stage or add manual waypoints with visibility.'); return; }
        const result = generatePlannerCards(search.context, config, search.metadata);
        setSearchWarning(!!result.searchWarning); setCards(result.cards); setStatus(result.cards.length ? 'Results' : 'No valid route');
        setMessage(result.cards.length ? '' : result.message ?? 'No valid route found. Check waypoints, visibility, planned rounds and loadout.');
      } catch (error) {
        setStatus('Error'); setMessage(error instanceof Error ? error.message : 'Unable to generate routes. Try again.');
      }
    }, 50);
  }
  function useRoute(card: PlannerCard, confirmed = false) {
    const next = copyPlannerRoute(plan, card.route, confirmed || !meaningfulRoute(plan.route));
    if (!next) { setPending(card); return; }
    onUse(next);
  }
  return <EditorSheet title="PLAN ROUTE" visible={!preview && !discoveryPreview} close={onClose}><Panel>
    {!cards.length && <>
    <Copy>GOAL</Copy><Copy>{plan.route?.engagementRules ? 'Minimum movement / Fewest required waypoints' : styles[config.style]}</Copy>
    {(['READY', 'NEEDS SETUP'] as const).map(group => <View key={group} style={{ gap: 6 }}><Copy>{group}</Copy>{[
      { label: 'Stage geometry', ready: stage.objects.length > 0, section: 'geometry' as const },
      { label: 'Start', ready: stage.objects.some(o => o.type === 'start'), section: 'start' as const },
      { label: 'Target rounds', ready: stage.objects.filter(isEngageable).length > 0 && stage.objects.filter(isEngageable).every(o => (plan.engagements[o.id] ?? 0) > 0), section: 'targets' as const },
      { label: 'Loadout', ready: plan.loadout.magazines.length > 0, section: 'loadout' as const },
      { label: 'Stage rules', ready: !!plan.route?.engagementRules, section: 'rules' as const },
    ].filter(item => item.ready === (group === 'READY')).map(item => <Action key={item.label} title={(item.ready ? '\u2713 ' : '! ') + item.label} onPress={() => onConfigure(item.section)} />)}</View>)}
    <Action title="CONFIGURE" onPress={() => onConfigure('rules')} />

    {generating ? <Loading label="Planning route…" /> : <Copy>{status}</Copy>}
    {!!message && <><Notice tone="error">Route could not be generated. Review your setup.</Notice><Action title="REVIEW SETUP" onPress={() => onConfigure('rules')} /><Action title={discoveryDetails ? 'Hide details' : 'Details'} variant="quiet" onPress={() => setDiscoveryDetails(!discoveryDetails)} />{discoveryDetails && <Copy>{message}</Copy>}</>}
    <Action variant="primary" title={generating ? 'Generating…' : 'GENERATE ROUTE'} disabled={generating} onPress={generate} />
    <Action title={advanced ? 'ADVANCED <' : 'ADVANCED >'} onPress={() => setAdvanced(!advanced)} />
    {advanced && <>
    {source !== 'MANUAL' && <Action title={discovering ? 'Discovering...' : prepared.discovery ? 'REFRESH WAYPOINTS' : 'DISCOVER WAYPOINTS'} disabled={generating} onPress={discover} />}
    <Copy>Waypoint source</Copy>
    {(['MANUAL', 'AUTO', 'COMBINED'] as const).map(value => <Action key={value} title={(source === value ? 'Selected: ' : '') + (value === 'COMBINED' ? 'AUTO + MANUAL' : value)} disabled={generating} onPress={() => setSource(value)} />)}
    <Copy>Manual waypoints use your visibility assignments. Auto waypoints use estimated visibility.</Copy>
    <DataRow label="Waypoint source" value={source === 'COMBINED' ? 'Combined' : source === 'AUTO' ? 'Auto' : 'Manual'} />
    <DataRow label="Manual waypoints" value={prepared.manualCount} />
    <DataRow label="Auto waypoints found" value={prepared.autoCount} />
    <DataRow label="Waypoints used for search" value={prepared.searchCount} />
    <DataRow label="Scoring Targets" value={prepared.targetCount} />
    <DataRow label="Targets Covered by Selected Waypoint source" value={prepared.covered + ' / ' + prepared.targetCount} />
    {source !== 'MANUAL' && <>
      <Action title="PREVIEW AUTO WAYPOINTS" disabled={generating || !prepared.autoCount || !prepared.discovery} onPress={onDiscoveryPreview} />
      <Copy>Coarse discovery may miss useful waypoints. Legality uses modeled geometry only.</Copy>
      <Action title={discoveryDetails ? "Hide discovery details" : "Discovery details"} onPress={() => setDiscoveryDetails(!discoveryDetails)} />
      {discoveryDetails && prepared.discovery?.warnings.filter(w => w.code === 'MODELED_GEOMETRY_ONLY' || w.code === 'PROJECTED_PORTS').map(w => <Copy key={w.code}>{w.message}</Copy>)}
    </>}
    {prepared.warnings.filter(w => !w.startsWith('Coarse discovery') && !w.startsWith('Bounds and wall') && !w.startsWith('Port horizontal')).map((warning, i) => <Copy key={i}>{warning}</Copy>)}
    <DataRow label="Magazines" value={plan.loadout.magazines.length} />
    <Copy>Ruleset</Copy>
    {plan.route?.engagementRules ? <Copy>{plan.route.engagementRules.ruleset}: geometry-first engagement planning uses the firing areas, safe angles and procedures saved in Route Settings. Minimum movement, then fewer required positions.</Copy> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{rulesets.map(choice => <Action key={choice} title={(ruleset === choice ? 'Selected: ' : '') + rulesetMetadata(choice).label} disabled={generating} onPress={() => setRuleset(choice)} />)}</View>
      <Copy>{rulesetMetadata(ruleset).description}</Copy>
    </>}
    {plan.route?.engagementRules ? <Copy>Route style, backward preference, reload strategy and personalization are unavailable in geometry-first planning.</Copy> : <>
    <Copy>Route Style</Copy>
    {(Object.keys(styles) as RouteStyle[]).map(style => <Action key={style} title={`${config.style === style ? '✓ ' : ''}${styles[style]}`} disabled={generating} onPress={() => setConfig({ ...config, style })} />)}
    {config.style === 'PERSONALIZED' && <>
      <Copy>PERSONALIZED MODEL</Copy>
      <DataRow label="Confidence" value={personalizedModel.confidence} />
      <Copy>Using: {personalizedModel.using.join(', ') || 'No personalized data'}</Copy>
      <Copy>Fallback: {personalizedModel.fallback.join(', ') || 'None within measured difficulty range'}</Copy>
      <Copy>Manual or unverified estimates have low confidence. Confidence may decrease outside recorded difficulty values.</Copy>
      {!personalizedModel.usable && <Copy>No useful personalized data. Balanced fallback will be used.</Copy>}
      {personalizedModel.warnings.map(w => <Copy key={w}>{w}</Copy>)}
    </>}
    <Copy>Backward Movement</Copy>
    {(['AVOID', 'LIMITED', 'ALLOWED'] as const).map(value => <Action key={value} title={`${config.movement.backwardMovement === value ? '✓ ' : ''}${value.charAt(0) + value.slice(1).toLowerCase()}`} disabled={generating} onPress={() => setConfig({ ...config, movement: { backwardMovement: value } })} />)}
    <Copy>Reload Strategy</Copy>
    {(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const).map(value => <Action key={value} title={`${config.reloadStrategy === value ? '✓ ' : ''}${value.charAt(0) + value.slice(1).toLowerCase()}`} disabled={generating} onPress={() => setConfig({ ...config, reloadStrategy: value })} />)}
    </>}
    </>}
    </>}
    {searchWarning && <><Copy>LIMITED SEARCH</Copy><Copy>Planning limit reached. Other routes may be possible.</Copy></>}
    {cards[0] && !alternatives && <>
      <Copy>ROUTE FOUND</Copy>
      <DataRow label="Movement" value={(cards[0].movementDistance / 36).toFixed(1) + ' yd'} />
      <DataRow label="Waypoints" value={cards[0].route.positions.length} />
      <DataRow label="Stationary" value={cards[0].positions} />
      <DataRow label="Moving" value={cards[0].movingSegments ?? 'Unverified'} />
      <DataRow label="Targets" value={(cards[0].route.engagementRules ? analyzeEngagements(stage, cards[0].route).coveredTargetIds.length : new Set(cards[0].route.positions.flatMap(p => p.engagedTargetIds)).size) + ' / ' + stage.objects.filter(isEngageable).length} />
      {pending ? <><Copy>Replace your existing route?</Copy><Action title="Keep route" onPress={() => setPending(null)} /><Action variant="primary" title="Confirm replacement" onPress={() => useRoute(pending, true)} /></> : <Action variant="primary" title="USE ROUTE" onPress={() => useRoute(cards[0])} />}
      <Action title="VIEW ON STAGE" onPress={() => onPreview(cards[0])} />
    </>}
    {!!cards.length && <Action title={alternatives ? 'Hide alternatives' : 'COMPARE ALTERNATIVES'} onPress={() => setAlternatives(!alternatives)} />}
    {!!cards.length && <Action title="PLAN AGAIN" onPress={() => { setCards([]); setAlternatives(false); setPending(null); setStatus('Ready'); }} />}
    {alternatives && cards.map((card, index) => <PlannerResultCard key={card.id} card={card} index={index} styleLabel={styles[card.routeStyle]} expansion={expansions[card.id] ?? { why: false, details: false }} onExpand={value => setExpansions(current => ({ ...current, [card.id]: value }))} pending={pending?.id === card.id} onPreview={() => onPreview(card)} onUse={() => useRoute(card)} onConfirm={() => useRoute(card, true)} onCancel={() => setPending(null)} />)}
  </Panel></EditorSheet>;
}
