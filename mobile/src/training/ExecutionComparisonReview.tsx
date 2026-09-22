import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { uuid } from 'expo-modules-core';
import { Action, Copy, Panel } from '../ui/kit';
import { useRepository } from '../storage/StorageProvider';
import type { SavedStage, StageSummary } from '../storage/repository';
import StageViewport from '../editor/StageViewport';
import { DEFAULT_SNAPPING } from '../stage/snapping';
import type { ViewportState } from '../stage/coordinates';
import type { TrainingVideo } from './videoModel';
import { createExecutionComparison, createExecutionComparisonResult, isExecutionComparison, mapObservedEventsToPlan,
  observedExecution, plannedElements, removeExecutionMapping } from './executionComparison';
import type { ExecutionComparison, MappingKind } from './executionComparison';

const seconds = (value: number | null) => value === null ? 'Not measured' : `${(value / 1000).toFixed(3)} s`;
const delta = (value: number | null) => value === null ? 'Unavailable' : `${value >= 0 ? '+' : ''}${(value / 1000).toFixed(3)} s`;
const warnings: Record<string, string> = {
  ROUTE_CHANGED_USING_ORIGINAL_SNAPSHOT: 'The saved route or stage has changed. This comparison uses its original snapshot.',
  LINKED_STAGE_UNAVAILABLE: 'The saved stage is unavailable. The historical snapshot remains available.',
  INVALID_HISTORICAL_COMPARISON: 'This stored comparison is damaged or uses an unsupported version. Video analysis remains available.',
  NO_STAGE_MAPPING: 'No execution sections have been mapped yet.',
  MISSING_CONFIRMED_TOTAL: 'Confirm stimulus and drill-end events to measure total execution time.',
  MISSING_CONFIRMED_EVENTS: 'A mapped interval no longer has matching confirmed endpoints. Update or remove its mapping.',
  INCOMPLETE_MOVEMENT_ANALYSIS: 'Some movement or position intervals have incomplete confirmed endpoints.',
  UNMATCHED_PLANNED_ELEMENT: 'Some planned elements are unmapped.',
  UNMATCHED_OBSERVED_INTERVAL: 'Some confirmed intervals are unmapped.',
  PLANNED_DWELL_UNAVAILABLE: 'The evaluator estimates engagement time, not full position dwell. Dwell has no planned delta.',
  OBSERVED_RELOAD_OVERLAP_UNKNOWN: 'Map the incoming movement interval to measure reload overlap. Missing movement does not imply zero overlap.',
  ENGAGEMENT_COUNT_DIFFERS: 'Mapped confirmed shot counts differ from planned rounds. Engagement durations may cover different sequences.',
  AMBIGUOUS_OBSERVED_TOTAL: 'Several confirmed execution totals exist. Select one using the TOTAL mapping.',
  OVERLAPPING_ATTRIBUTION: 'Overlapping intervals cannot be assigned to independent timing buckets; they remain in residual time.',
  MAPPING_OUTSIDE_TOTAL: 'A mapped interval lies outside the selected execution total; it is excluded from timing buckets.',
  INCONSISTENT_TIMELINE_ORDER: 'Mapped intervals conflict with planned order or overlap ambiguously.',
  AMBIGUOUS_MAPPING: 'An observed interval or planned element has more than one assignment. Remove the conflicting mapping first.',
  UNMATCHED_PLANNED_REFERENCE: 'A mapping refers to an element outside this route snapshot.',
  UNCONFIRMED_MAPPING: 'Mapping suggestions require user confirmation.',
  INVALID_CONFIRMED_TIMELINE: 'The confirmed timeline could not be read. Review its events before comparing.',
  OBSERVED_INTERVAL_LIMIT: 'Only the first supported set of confirmed intervals is available for this comparison.',
};
export function ExecutionComparisonReview({ video, busy, onChange, onPreview }: {
  video: TrainingVideo; busy: boolean; onChange: (comparison: ExecutionComparison | undefined) => void; onPreview: (ms: number) => void;
}) {
  const repo = useRepository(), [open, setOpen] = useState(false), [stages, setStages] = useState<StageSummary[]>([]);
  const [chosen, setChosen] = useState<SavedStage | null>(null), [live, setLive] = useState<SavedStage | null | undefined>();
  const [loading, setLoading] = useState(false), [message, setMessage] = useState('');
  const [kind, setKind] = useState<MappingKind>('MOVEMENT'), [planId, setPlanId] = useState(''), [intervalId, setIntervalId] = useState('');
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const comparison = isExecutionComparison(video.executionComparison) ? video.executionComparison : undefined;
  const stageId = comparison?.snapshot.stageId;
  const result = useMemo(() => createExecutionComparisonResult(video.executionComparison, video, live), [video, live]);
  const observed = useMemo(() => observedExecution(video), [video]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setMessage(''); setLive(undefined);
    const load = async () => {
      try {
        if (stageId) { const stage = await repo.loadStage(stageId); if (active) setLive(stage); }
        else { const rows = await repo.listStages(); if (active) setStages(rows); }
      } catch (error) { if (active) { if (stageId) setLive(null); setMessage(String(error)); } }
      finally { if (active) setLoading(false); }
    };
    void load(); return () => { active = false; };
  }, [open, stageId, repo]);
  const guard = (fn: () => void) => { try { fn(); setMessage(''); } catch (error) {
    setMessage((error instanceof Error ? error.message : String(error)).split(', ').map(w => warnings[w] ?? w).join(' '));
  } };
  const chooseStage = async (id: string) => {
    setLoading(true);
    try { setChosen(await repo.loadStage(id)); setMessage(''); } catch (error) { setMessage(String(error)); }
    finally { setLoading(false); }
  };
  const link = async () => {
    if (!chosen) return;
    setLoading(true);
    try {
      const profile = await repo.loadProfile();
      onChange(createExecutionComparison(uuid.v4(), chosen, video, profile.performance, new Date().toISOString()));
      setPlanId(''); setIntervalId(''); setMessage('Snapshot linked. Map confirmed intervals, then Save analysis to retain changes.');
    } catch (error) { setMessage(String(error)); } finally { setLoading(false); }
  };
  const disabled = busy || loading;
  const selectedMapping = comparison?.mappings.find(m => m.kind === kind && m.planElementId === planId);
  const selectElement = (id: string) => {
    setPlanId(id);
    const mapping = comparison?.mappings.find(m => m.kind === kind && m.planElementId === id);
    setIntervalId(mapping?.observedIntervalId ?? '');
    const interval = observed.intervals.find(i => i.id === mapping?.observedIntervalId);
    if (interval) onPreview(interval.startMs);
  };
  return <Panel>
    <Action title={open ? 'Close plan comparison' : 'COMPARE TO PLAN'} disabled={busy} onPress={() => setOpen(!open)} />
    {open && <>
      <Copy>Map confirmed execution to a saved route. Video does not identify stage coordinates. Changes are saved with Save analysis.</Copy>
      {loading && <Copy>Loading saved stage…</Copy>}
      {!comparison && !video.executionComparison && <>
        <Copy>SELECT STAGE</Copy>
        {!loading && !stages.length && <Copy>No saved stages. Save a stage and accept or create a route in Stage Planner first.</Copy>}
        {stages.map(s => <Action key={s.id} title={s.name} disabled={disabled} onPress={() => chooseStage(s.id)} />)}
        {chosen && <>
          <Copy>SELECT SAVED / ACCEPTED ROUTE · {chosen.name}</Copy>
          {chosen.plan.route ? <>
            <Copy>{chosen.plan.route.name} · {chosen.plan.route.positions.length} positions. The estimate will use the current saved profile at linking time.</Copy>
            <Action title={`Link snapshot: ${chosen.plan.route.name}`} disabled={disabled} onPress={link} />
          </> : <Copy>This stage has no saved route. Save or accept a route in Stage Planner first.</Copy>}
        </>}
      </>}
      {comparison && <>
        <Copy>{comparison.snapshot.stageName} · {comparison.snapshot.plan.route.name} · Snapshot {comparison.snapshot.capturedAt}</Copy>
        <Copy>Saved route revision {comparison.snapshot.revision}. Historical timing inputs remain fixed.</Copy>
        <View style={{ height: 260 }}>
          <StageViewport stage={comparison.snapshot.document} viewport={viewport} onViewportChange={setViewport}
            readOnly routeEditing={false} gridVisible snapping={DEFAULT_SNAPPING} selectedId={null} onSelect={() => {}}
            onDragging={() => {}} setStage={() => {}}
            routePlanning={{ route: comparison.snapshot.plan.route, preview: true, selectedId: planId,
              onSelect: selectElement, onChange: () => {}, onDragging: () => {} }} />
        </View>
        <Action title="Fit snapshot route" onPress={() => setViewport({ zoom: 1, pan: { x: 0, y: 0 } })} />
        <Copy>MAP EXECUTION · Select an element below to highlight its planned position and mapped timeline interval.</Copy>
        {(['MOVEMENT', 'POSITION', 'RELOAD', 'STRING', 'TOTAL'] as MappingKind[]).map(k => <Action key={k} title={`${kind === k ? 'Selected: ' : ''}${k}`} disabled={disabled}
          onPress={() => { setKind(k); setPlanId(''); setIntervalId(''); }} />)}
        {kind === 'POSITION' && <Copy>Position dwell requires confirmed POSITION_ENTRY and POSITION_EXIT events.</Copy>}
        {kind === 'STRING' && <Copy>Map a complete first-to-last-shot string to one position’s engagement group. The plan estimate excludes draw and reload.</Copy>}
        <Copy>PLANNED ELEMENTS</Copy>
        {plannedElements(comparison, kind).map(p => <Action key={p.id}
          title={`${planId === p.id ? 'Selected · ' : ''}${p.label} · ${comparison.mappings.some(m => m.kind === kind && m.planElementId === p.id) ? 'Mapped' : 'Unmapped'}`}
          disabled={disabled} onPress={() => selectElement(p.id)} />)}
        <Copy>CONFIRMED TIMELINE INTERVALS</Copy>
        {!observed.intervals.some(i => i.kind === kind) && <Copy>No confirmed intervals of this kind. Review timeline endpoints first.</Copy>}
        {observed.intervals.filter(i => i.kind === kind).map(i => <View key={i.id} style={{ borderLeftWidth: intervalId === i.id ? 3 : 0, borderLeftColor: '#58c9b9', paddingLeft: 6 }}>
          <Action title={`${intervalId === i.id ? 'Selected · ' : ''}${seconds(i.startMs)} → ${seconds(i.endMs)} · ${seconds(i.durationMs)}`}
            disabled={disabled} onPress={() => { setIntervalId(i.id); onPreview(i.startMs); }} />
          <Copy>{i.eventIds.join(' → ')}</Copy>
        </View>)}
        <Action title={selectedMapping ? 'Update mapping' : 'Assign confirmed interval'} disabled={disabled || !planId || !intervalId} onPress={() => guard(() => {
          const at = new Date().toISOString();
          onChange(mapObservedEventsToPlan(comparison, video, { id: selectedMapping?.id ?? uuid.v4(), kind, planElementId: planId,
            observedIntervalId: intervalId, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true,
            createdAt: selectedMapping?.createdAt ?? at, updatedAt: at }));
        })} />
        {selectedMapping && <Action title="Remove selected mapping" disabled={disabled} onPress={() => guard(() => {
          onChange(removeExecutionMapping(comparison, selectedMapping.id, new Date().toISOString())); setIntervalId('');
        })} />}
        <Copy>PLAN VS OBSERVED</Copy>
        <Copy>Plan: {seconds(result.plannedTotalMs)}</Copy><Copy>Observed: {seconds(result.observedTotalMs)}</Copy><Copy>Delta: {delta(result.totalDeltaMs)}</Copy>
        <Copy>Attributed movement: {delta(result.buckets.movementDeltaMs)}</Copy>
        <Copy>Attributed engagements: {delta(result.buckets.engagementDeltaMs)}</Copy>
        <Copy>Attributed reload penalty: {delta(result.buckets.reloadDeltaMs)}</Copy>
        <Copy>Residual delta: {delta(result.buckets.residualDeltaMs)}</Copy>
        <Copy>Unattributed observed time: {seconds(result.unmappedTimeMs)} · Unattributed plan time: {seconds(result.plannedUnattributedMs)}. Residual includes unmapped intervals and unpaired components such as draw; zero attributed delta does not imply complete mapping.</Copy>
        <Copy>Mapping coverage: {result.completeness.percent.toFixed(0)}% (element counts, not timing certainty).</Copy>
        {(['positions', 'movements', 'reloads', 'strings'] as const).map(k => <Copy key={k}>{k}: {result.completeness[k].mapped} / {result.completeness[k].total}</Copy>)}
        {result.segmentComparisons.map(r => <Copy key={r.mappingId}>Movement to {r.planElementId}: plan {seconds(r.plannedMs)}, observed {seconds(r.observedMs)}, delta {delta(r.deltaMs)} · planned distance {r.plannedDistanceInches.toFixed(1)} in · mapping {r.mappingConfidence}</Copy>)}
        {result.positionComparisons.map(r => <Copy key={r.mappingId}>Position {r.planElementId}: observed dwell {seconds(r.observedMs)}; planned dwell unavailable. Engagement estimate {seconds(r.plannedEngagementMs)} · {r.plannedEngagementCount} planned targets / {r.plannedRounds ?? '?'} rounds · {r.observedConfirmedShotCount} confirmed shots / {r.observedStringCount} strings.</Copy>)}
        {result.reloadComparisons.map(r => <Copy key={r.mappingId}>Reload at {r.planElementId}: raw plan {seconds(r.plannedMs)}, observed {seconds(r.observedMs)}, delta {delta(r.deltaMs)}. Plan overlap {seconds(r.plannedOverlapMs)}, additional {seconds(r.plannedAdditionalMs)}; observed overlap {seconds(r.observedOverlapMs)}, additional {seconds(r.observedAdditionalMs)}; additional delta {delta(r.additionalDeltaMs)}.</Copy>)}
        {result.stringComparisons.map(r => <Copy key={r.mappingId}>Engagement at {r.planElementId}: plan {seconds(r.plannedMs)}, observed {seconds(r.observedMs)}, delta {delta(r.deltaMs)}.</Copy>)}
      </>}
      {result.warnings.map(w => <Copy key={w}>{warnings[w] ?? w}</Copy>)}
      {video.executionComparison && <Action title="Remove comparison link and mappings" disabled={disabled} onPress={() => { onChange(undefined); setChosen(null); setPlanId(''); setIntervalId(''); }} />}
      {!!message && <Copy>{message}</Copy>}
    </>}
  </Panel>;
}
