import { View } from 'react-native';
import { Action, Copy } from '../ui/kit';
import type { ExecutionComparison } from './executionComparison';
import type { TrainingVideo } from './videoModel';
import { generateMappingCandidates, reviewMappingSuggestion, suggestionsAreStale } from './mappingSuggestions';
import type { MappingPair } from './mappingSuggestions';

export function MappingSuggestionReview({ comparison, video, disabled, onChange, onSelect, guard }: {
  comparison: ExecutionComparison; video: TrainingVideo; disabled: boolean;
  onChange: (c: ExecutionComparison) => void; onSelect: (p: MappingPair) => void; guard: (fn: () => void) => void;
}) {
  const set = comparison.mappingSuggestions, stale = suggestionsAreStale(comparison, video);
  // Historical/foreign algorithm payloads stay stored but are not rendered as current results.
  const candidates = !stale && Array.isArray(set?.candidates) ? set.candidates.slice(0, 3) : [];
  return <>
    <Action title="SUGGEST MAPPING" disabled={disabled} onPress={() => guard(() => {
      const at = new Date().toISOString();
      onChange({ ...comparison, updatedAt: at, mappingSuggestions: generateMappingCandidates(comparison, video, at) });
    })} />
    <Copy>Suggestions use confirmed timing and route order. Review before accepting; stage coordinates and target identity are not recognized.</Copy>
    {set && stale && <Copy>Suggestions are stale. Generate again after timeline or grouping changes. Existing mappings remain available for review.</Copy>}
    {set && !stale && <>
      <Copy>{set.status.replaceAll('_', ' ')}</Copy>
      {set.warnings.map((w, i) => <Copy key={i}>{w}</Copy>)}
      {candidates.map((candidate, index) => <View key={candidate.id}>
        <Copy>{index === 0 ? 'BEST SUGGESTED MAPPING' : 'ALTERNATIVE'} · {candidate.confidence} · {(candidate.coverage * 100).toFixed(0)}% route coverage</Copy>
        {candidate.reasons.map((r, i) => <Copy key={i}>{r}</Copy>)}
        <Action title="Accept all pending mappings" disabled={disabled || !candidate.pairs.some(p => p.decision === 'PENDING')}
          onPress={() => guard(() => onChange(reviewMappingSuggestion(comparison, video, candidate.id, 'ALL', 'ACCEPTED', new Date().toISOString())))} />
        {candidate.pairs.map(pair => <View key={pair.id}>
          <Action title={`${pair.kind} → ${pair.planElementId} · ${pair.confidence} · ${pair.decision}`}
            disabled={disabled} onPress={() => onSelect(pair)} />
          <Copy>{(pair.startMs / 1000).toFixed(3)}–{(pair.endMs / 1000).toFixed(3)} s · {pair.observedIntervalIds.length} interval(s)
            {pair.timingDeltaMs === null ? '' : ` · timing delta ${(pair.timingDeltaMs / 1000).toFixed(3)} s`}</Copy>
          {pair.reasons.map((r, i) => <Copy key={i}>{r}</Copy>)}
          {pair.decision === 'PENDING' && comparison.mappings.some(m => m.kind === pair.kind &&
            (m.planElementId === pair.planElementId || (m.observedIntervalIds ?? [m.observedIntervalId]).some(id => pair.observedIntervalIds.includes(id))))
            && <Copy>Conflict with an existing mapping. Acceptance will not replace it; review or manually remap below.</Copy>}
          {pair.decision === 'PENDING' && <>
            <Action title="Accept mapping" disabled={disabled} onPress={() => guard(() => onChange(reviewMappingSuggestion(comparison, video, candidate.id, pair.id, 'ACCEPTED', new Date().toISOString())))} />
            <Action title="Reject mapping" disabled={disabled} onPress={() => guard(() => onChange(reviewMappingSuggestion(comparison, video, candidate.id, pair.id, 'REJECTED', new Date().toISOString())))} />
          </>}
          <Action title="Edit / manually remap below" disabled={disabled} onPress={() => onSelect(pair)} />
        </View>)}
        {!!candidate.unmatchedPlanned.length && <Copy>Unmapped plan: {candidate.unmatchedPlanned.join(', ')}</Copy>}
        {!!candidate.extraObserved.length && <Copy>Extra observed: {candidate.extraObserved.join(', ')}</Copy>}
      </View>)}
    </>}
  </>;
}
