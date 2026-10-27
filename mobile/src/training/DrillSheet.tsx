import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { uuid } from 'expo-modules-core';
import EditorSheet from '../editor/EditorSheet';
import { Action, Copy, DataRow, Input, Notice, Panel, Segmented, ui } from '../ui/kit';
import type { PowerFactor } from '../profile/model';
import { presetsForFamily } from '../stage/targetPresets';
import type { TrainingRecord } from './model';
import { trainingContexts } from './observations';
import type { TrainingContext } from './observations';
import { contextLabels } from './presentation';
import { zoneChoices } from './drillLog';
import { analyzeLibraryRun, canMarkHits, choicesFor, phaseKindOf, intervalLabels, libraryDrill, libraryFamilies, libraryRunProblem, parseShotTimes, targetYards,
  variantKey, variantLabel, zonesFromHits } from './drillLibrary';
import type { LibraryFamily, LibraryRun, LibraryTarget } from './drillLibrary';
import { runsOfDrill, runText } from './drillDays';
import HitMarker from './HitMarker';
import DrillVideo, { ClipPlayer } from './DrillVideo';
import PhaseBreakdown from './PhaseBreakdown';
import { phaseSeconds } from './movementPhases';
import type { Side } from './movementPhases';
import type { Mark } from './videoTiming';
import type { VideoSession } from './videoModel';
import { marksOf } from './videoTiming';
import type { RunVideo } from './DrillVideo';
import { discardVideoAsset, playbackUri } from './videoAssets';
import { isTrustedEvent } from './videoModel';

const MODES = ['SHOT TIMES', 'SPLITS', 'TOTAL ONLY'] as const;
type Mode = typeof MODES[number];
const HIT_MODES = ['COUNT BY ZONE', 'MARK ON TARGET'] as const;
const parseNumber = (text: string) => text.trim() === '' ? null : Number(text.trim());
const seconds = (v: number) => v.toFixed(2) + ' s';
const papers = (family: LibraryFamily) => presetsForFamily(family).filter(p => p.type === 'cardboardTarget');
const blankTarget = (family: LibraryFamily, presetId?: string): LibraryTarget | null => {
  const preset = papers(family).find(p => p.id === presetId) ?? papers(family)[0];
  return preset ? { presetId: preset.id, faceWidth: preset.width, faceHeight: preset.height, aim: { x: 0, y: 0 }, hits: [] } : null;
};

function Counter({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Text style={[ui.copy, { flex: 1 }]}>{label}</Text>
    <Action title="−" accessibilityLabel={'Fewer ' + label} disabled={disabled || value <= 0} onPress={() => onChange(value - 1)} />
    <Text style={[ui.dataValue, { minWidth: 32, textAlign: 'center' }]}>{value}</Text>
    <Action title="+" accessibilityLabel={'More ' + label} disabled={disabled || value >= 300} onPress={() => onChange(value + 1)} />
  </View>;
}

/**
 * One drill: how to run it, what it measures, logging a run (timer times, hits by zone or marked on the target, par),
 * and your runs of it. Runs are filed by day and practice type by the caller; there are no sessions to manage.
 */
export default function DrillSheet({ visible, drillId, records, context, onContextChange, powerFactor, pars, onSave, onRemove, onUpdate, hand, onHandChange, onClose }: {
  visible: boolean; drillId: string | null; records: readonly TrainingRecord[];
  /** Dry fire, live fire or match: which of your numbers the run builds. */
  context: TrainingContext; onContextChange: (context: TrainingContext) => void;
  powerFactor: PowerFactor; pars: Record<string, number>;
  /** `par`: undefined = unchanged, null = cleared, a number = set for this drill variant. `video`: the run's video, saved with it. */
  onSave: (run: LibraryRun, par: number | null | undefined, video?: RunVideo) => Promise<string | void> | string | void;
  onRemove: (runId: string) => Promise<void> | void; onClose: () => void;
  /** Save a changed run (a kept movement breakdown). */
  onUpdate: (run: LibraryRun) => Promise<void> | void;
  /** Your shooting hand, for the movement breakdown. */
  hand: Side; onHandChange: (hand: Side) => void;
}) {
  const drill = drillId ? libraryDrill(drillId) : undefined;
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [family, setFamily] = useState<LibraryFamily>('USPSA'), [chosenPf, setPf] = useState<PowerFactor | null>(null);
  // Your profile's power factor until you pick one here (the profile may load after the sheet opens).
  const pf = chosenPf ?? powerFactor;
  const [mode, setMode] = useState<Mode>('SHOT TIMES'), [times, setTimes] = useState(''), [total, setTotal] = useState('');
  const [zones, setZones] = useState<Record<string, number>>({}), [procedurals, setProcedurals] = useState('');
  const [hitMode, setHitMode] = useState<typeof HIT_MODES[number]>('COUNT BY ZONE'), [target, setTarget] = useState<LibraryTarget | null>(null);
  const [notes, setNotes] = useState(''), [counts, setCounts] = useState(true);
  // Null until you type: the field shows the saved par (which may arrive after the sheet opens) and saving leaves it alone.
  const [parEdit, setParEdit] = useState<string | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [saved, setSaved] = useState('');
  const [removing, setRemoving] = useState<string | null>(null), [watching, setWatching] = useState<string | null>(null);
  const [phaseMarks, setPhaseMarks] = useState<Mark[]>([]);
  // The video of the run being logged: kept only if the run is saved, otherwise its copy is removed.
  const [video, setVideo] = useState<RunVideo | null>(null), videoRef = useRef(video); videoRef.current = video;
  const dropVideo = () => { if (videoRef.current) { try { discardVideoAsset(videoRef.current.asset); } catch { /* already gone */ } } setVideo(null); };
  const dry = context === 'DRY_FIRE';

  // LOG ONLY is for one run (a warm-up, a bad setup): the next run counts again.
  const clearRun = () => { setTimes(''); setTotal(''); setZones({}); setProcedurals(''); setNotes(''); setCounts(true); setTarget(t => t ? { ...t, hits: [] } : t); };
  // A different drill starts clean.
  useEffect(() => {
    if (!drill) return;
    // Your target family and power factor carry over; how times are entered starts as shot times again.
    setChoices(choicesFor(drill)); clearRun(); setMode('SHOT TIMES'); setTarget(null); setHitMode('COUNT BY ZONE'); setParEdit(null); setError(''); setSaved(''); setRemoving(null);
    setWatching(null); setPhaseMarks([]); dropVideo();
  }, [drillId]);

  if (!drill) return <EditorSheet title="DRILL" visible={visible && !!drillId} close={onClose}><Panel><Copy>Unknown drill.</Copy></Panel></EditorSheet>;
  const choose = (key: string, value: string) => { setChoices({ ...choices, [key]: value }); setParEdit(null); setSaved(''); };
  const parsed = mode === 'TOTAL ONLY' ? { times: [] as number[] } : parseShotTimes(times, mode === 'SPLITS' ? 'splits' : 'times');
  const shotTimes = 'times' in parsed ? parsed.times : [];
  const totalTime = mode === 'TOTAL ONLY' ? parseNumber(total) : shotTimes.length ? shotTimes[shotTimes.length - 1] : null;
  const steel = drill.requiredHits === null;
  const marking = !dry && canMarkHits(drill) && hitMode === 'MARK ON TARGET' && !!target;
  const counted = marking ? zonesFromHits(target!.hits) ?? {} : Object.fromEntries(Object.entries(zones).filter(([, n]) => n > 0));
  const run: LibraryRun = { id: '', drillId: drill.id, recordedAt: new Date().toISOString(), choices: choicesFor(drill, choices), shotTimes,
    totalTime: totalTime !== null && Number.isFinite(totalTime) ? totalTime : null, family, notes: notes.trim(),
    ...(family === 'USPSA' ? { powerFactor: pf } : {}),
    ...(!dry && (steel ? mode === 'TOTAL ONLY' : Object.keys(counted).length) ? { zones: steel ? { M: zones.M ?? 0 } : counted } : {}),
    ...(marking && target!.hits.length ? { target: target! } : {}), ...(video ? { videoId: video.id } : {}),
    ...(parseNumber(procedurals) ? { procedurals: parseNumber(procedurals)! } : {}), ...(counts ? {} : { counts: false }) };
  const analysis = analyzeLibraryRun(run, powerFactor);
  const key = variantKey(run);
  const par = parEdit ?? String(pars[key] ?? ''), parValue = parseNumber(par);
  const mine = runsOfDrill(records, drill.id).filter(e => variantKey(e.run) === key);
  const timed = mine.filter(e => e.run.totalTime !== null);
  const best = timed.length ? Math.min(...timed.map(e => e.run.totalTime!)) : null;
  const preset = target ? papers(family).find(p => p.id === target.presetId) : undefined;

  /** A saved run's video and its marks (the beep from the video, the run's shot times). */
  function runClip(recordId: string, saved: LibraryRun): { uri: string | null; error: string; marks: Mark[]; session: VideoSession; beepMs: number | null } | null {
    const clip = saved.videoId ? records.find(r => r.id === recordId)?.videos?.find(v => v.session.id === saved.videoId) : undefined;
    if (!clip) return null;
    const beep = clip.analysis.events.find(ev => ev.type === 'STIMULUS' && isTrustedEvent(ev));
    const base = { session: clip.session, beepMs: beep?.timestampMs ?? null, marks: beep ? marksOf(beep.timestampMs, saved.shotTimes) : [] };
    try { return { ...base, uri: playbackUri(clip.session.asset), error: '' }; }
    catch (err) { return { ...base, uri: null, error: String(err instanceof Error ? err.message : err) }; }
  }
  // Your movement breakdowns of these options, averaged per movement.
  const broken = mine.flatMap(e => e.run.phases ? [phaseSeconds(e.run.phases)] : []);
  const phaseAverages = broken.length ? broken[0].map((p, i) => {
    const values = broken.map(b => b[i].seconds).filter((v): v is number => v !== null);
    return { label: p.label, seconds: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, n: values.length };
  }) : [];
  const keepPhases = async (saved: LibraryRun) => {
    setSaving(true); setError('');
    try { await onUpdate(saved); setPhaseMarks([]); } catch (err) { setError(String(err)); throw err; } finally { setSaving(false); }
  };

  // Nothing else can be saved or removed while a removal is written.
  async function remove(runId: string) {
    setRemoving(null); setSaving(true); setError('');
    try { await onRemove(runId); } catch (err) { setError(String(err)); } finally { setSaving(false); }
  }

  async function save() {
    if ('problem' in parsed) { setError(parsed.problem); return; }
    if (mode === 'TOTAL ONLY' && (totalTime === null || !Number.isFinite(totalTime))) { setError('Enter the total time.'); return; }
    if (parValue !== null && !(Number.isFinite(parValue) && parValue > 0 && parValue <= 600)) { setError('Par must be a time in seconds, or blank.'); return; }
    if (marking && target!.hits.some(h => h.zone === null)) { setError('Pick the zone of every marked hit (the orange ones) before saving.'); return; }
    const next = { ...run, id: uuid.v4(), recordedAt: new Date().toISOString() };
    const problem = libraryRunProblem(next);
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try {
      const warning = await onSave(next, parEdit === null ? undefined : parValue, video ?? undefined);
      clearRun(); setParEdit(null); setVideo(null);
      setSaved(`Saved: ${runText(next, powerFactor)}` + (video ? ', with its video.' : '.') + (warning ? ' ' + warning : ''));
    }
    catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  return <EditorSheet title={drill.name} scrollKey={drill.id} visible={visible} close={() => { if (!saving) { dropVideo(); onClose(); } }}>
    <Panel>
      <Text style={ui.eyebrow}>HOW TO RUN IT</Text>
      <Copy>{drill.setup}</Copy>
      <Text style={ui.eyebrow}>WHAT IT MEASURES</Text>
      <Copy>{drill.gives}</Copy>
      <Copy>{'The stage planner uses it for: ' + drill.planner.charAt(0).toLowerCase() + drill.planner.slice(1)}</Copy>
      {drill.choices.map(c => <View key={c.key} style={{ gap: 4 }}>
        <Text style={ui.eyebrow}>{c.label}</Text>
        <Segmented options={c.options.map(o => o.label)} value={c.options.find(o => o.value === run.choices[c.key])?.label ?? ''} disabled={saving}
          onChange={label => choose(c.key, c.options.find(o => o.label === label)!.value)} />
      </View>)}
    </Panel>

    <Panel>
      <Text style={ui.sectionTitle}>LOG A RUN</Text>
      <Text style={ui.eyebrow}>PRACTICE</Text>
      <Segmented options={trainingContexts.map(c => contextLabels[c])} value={contextLabels[context]} disabled={saving}
        onChange={label => { onContextChange(trainingContexts.find(c => contextLabels[c] === label)!); setSaved(''); }} />
      <Text style={ui.eyebrow}>TIMES</Text>
      <Segmented options={MODES} value={mode} disabled={saving} onChange={m => { setMode(m as Mode); setError(''); }} />
      {mode === 'TOTAL ONLY'
        ? <Input autoFocus={false} label="TOTAL TIME (SECONDS)" value={total} disabled={saving} onChange={value => { setTotal(value); setSaved(''); }} />
        : <Input autoFocus={false} label={mode === 'SPLITS' ? `SPLITS, FIRST = START TO FIRST SHOT (${drill.intervals.length}${drill.makeups ? '+' : ''})` : `SHOT TIMES FROM THE TIMER (${drill.intervals.length}${drill.makeups ? '+' : ''})`}
          value={times} disabled={saving} onChange={value => { setTimes(value); setError(''); setSaved(''); }} />}
      {mode === 'TOTAL ONLY' && <Copy>A total gives your hit factor and trend, but no draw, split or move times.</Copy>}
      <DrillVideo drill={drill} context={context} video={video} onChange={setVideo} disabled={saving}
        onUseTimes={found => { setMode('SHOT TIMES'); setTimes(found.map(t => t.toFixed(2)).join(' ')); setError(''); setSaved(''); }} />
      {'problem' in parsed && !!times.trim() && <Notice tone="warning">{parsed.problem}</Notice>}
      {analysis && analysis.intervals.length > 0 && <View style={{ gap: 2 }}>
        {analysis.intervals.map(i => <DataRow key={i.shot} label={`Shot ${i.shot} · ${intervalLabels[i.kind]}`} value={seconds(i.seconds)} />)}
        {shotTimes.length > 0 && shotTimes.length !== drill.intervals.length && !(drill.makeups && shotTimes.length > drill.intervals.length)
          && <Notice tone="warning">{`${drill.name} has ${drill.intervals.length} shots; ${shotTimes.length} entered.`}</Notice>}
      </View>}

      {dry ? <Copy>Dry fire: hits are not counted. Times count toward your dry-fire numbers only.</Copy> : steel ? <>
        <Text style={ui.eyebrow}>MISSES</Text>
        {mode === 'TOTAL ONLY' ? <Counter label="Missed shots" value={zones.M ?? 0} disabled={saving} onChange={n => setZones({ M: n })} />
          : <DataRow label="Makeup shots (from the shot count)" value={analysis?.steelMisses ?? '—'} />}
      </> : <>
        <Text style={ui.eyebrow}>HITS · {drill.requiredHits} REQUIRED</Text>
        <Segmented options={libraryFamilies} value={family} disabled={saving} onChange={f => { setFamily(f as LibraryFamily); setZones({}); setTarget(t => t ? blankTarget(f as LibraryFamily) : t); }} />
        {family === 'USPSA' && <Segmented options={['MINOR', 'MAJOR']} value={pf.toUpperCase()} disabled={saving} onChange={v => setPf(v === 'MAJOR' ? 'major' : 'minor')} />}
        {canMarkHits(drill) && <Segmented options={HIT_MODES} value={hitMode} disabled={saving}
          onChange={m => { setHitMode(m as typeof HIT_MODES[number]); if (m === 'MARK ON TARGET' && !target) setTarget(blankTarget(family)); }} />}
        {marking && preset ? <>
          {papers(family).length > 1 && <Segmented options={papers(family).map(p => p.short ?? p.name)} value={preset.short ?? preset.name} disabled={saving}
            onChange={name => setTarget(blankTarget(family, papers(family).find(p => (p.short ?? p.name) === name)?.id))} />}
          <HitMarker family={family} preset={preset} target={target!} distanceYards={targetYards(drill, run.choices)} disabled={saving} onChange={setTarget} />
        </> : zoneChoices[family].map(zone => <Counter key={zone} label={zone === 'M' ? 'M (miss)' : zone === 'NS' ? 'NS (no-shoot hit)' : zone} value={zones[zone] ?? 0}
          disabled={saving} onChange={n => setZones(z => ({ ...z, [zone]: n }))} />)}
        <Input autoFocus={false} label="PROCEDURALS" value={procedurals} disabled={saving} onChange={setProcedurals} />
        {analysis?.score ? <>
          <DataRow label={`${analysis.score.method} points`} value={`${analysis.score.approximate ? '≈ ' : ''}${analysis.score.points} of ${analysis.score.maxPoints} (${Math.round(analysis.score.percent * 100)}%)`} />
          {analysis.score.approximate && <Copy>Estimate: PCSL caps points per target and a T counts as two hits, so counts for the whole run can score higher than target by target.</Copy>}
          <DataRow label="Hit factor" value={analysis.score.hitFactor !== null ? analysis.score.hitFactor.toFixed(4) : 'Enter the times'} />
        </> : <Copy>Hits not counted yet. Leave them empty to log the times only.</Copy>}
      </>}

      <Input autoFocus={false} label="PAR TIME (SECONDS, BLANK = NONE)" value={par} disabled={saving} onChange={setParEdit} />
      {parValue !== null && Number.isFinite(parValue) && parValue > 0 && run.totalTime !== null &&
        <DataRow label="Against par" value={run.totalTime <= parValue ? `${seconds(parValue - run.totalTime)} under` : `${seconds(run.totalTime - parValue)} over`} />}
      <Input autoFocus={false} label="NOTES" value={notes} disabled={saving} onChange={value => { setNotes(value); setSaved(''); }} />
      <Text style={ui.eyebrow}>YOUR NUMBERS</Text>
      <Segmented options={['COUNTS', 'LOG ONLY']} value={counts ? 'COUNTS' : 'LOG ONLY'} disabled={saving} onChange={v => setCounts(v === 'COUNTS')} />
      <Copy>{counts ? 'This run’s times update your numbers and the planner.' : 'Kept in the log only (a warm-up, a bad setup).'}</Copy>
      {!!error && <Notice tone="error">{error}</Notice>}
      {!!saved && <Notice tone="success">{saved}</Notice>}
      <Action title={saving ? 'Saving...' : 'SAVE RUN'} variant="primary" disabled={saving || (mode !== 'TOTAL ONLY' && !shotTimes.length)} onPress={() => { void save(); }} />
    </Panel>

    <Panel>
      <Text style={ui.sectionTitle}>YOUR RUNS</Text>
      <Copy>{variantLabel(drill, run.choices)}</Copy>
      {mine.length ? <>
        <DataRow label="Runs" value={String(mine.length)} />
        {best !== null && <DataRow label="Best time" value={seconds(best)} />}
        {pars[key] !== undefined && <DataRow label="Par" value={seconds(pars[key])} />}
        {phaseAverages.length > 0 && <>
          <Text style={ui.eyebrow}>{`YOUR ${phaseKindOf(run) === 'reload' ? 'RELOAD' : 'DRAW'}, BROKEN DOWN · ${broken.length} RUN${broken.length === 1 ? '' : 'S'}`}</Text>
          {phaseAverages.map(p => <DataRow key={p.label} label={p.label} value={p.seconds === null ? '—' : seconds(p.seconds)} />)}
        </>}
        {mine.slice(0, 10).map((e, i) => { const clip = runClip(e.recordId, e.run), kind = phaseKindOf(e.run); return <View key={e.run.id} style={{ gap: 4 }}>
          <Copy>{`${new Date(e.run.recordedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${contextLabels[e.context]} · ${runText(e.run, powerFactor)}`
            + (pars[key] !== undefined && e.run.totalTime !== null ? (e.run.totalTime <= pars[key] ? ' · under par' : ' · over par') : '') + (clip ? ' · video' : '')
            + (e.run.phases ? ` · ${e.run.phases.kind} broken down` : '')}</Copy>
          {clip && <Action title={watching === e.run.id ? 'HIDE VIDEO' : 'WATCH'} accessibilityLabel={(watching === e.run.id ? 'Hide the video of run ' : 'Watch run ') + (i + 1)}
            onPress={() => { setWatching(watching === e.run.id ? null : e.run.id); setPhaseMarks([]); }} />}
          {clip && watching === e.run.id && (clip.uri ? <ClipPlayer uri={clip.uri} marks={[...clip.marks, ...phaseMarks]} /> : <Notice tone="warning">{clip.error}</Notice>)}
          {clip && watching === e.run.id && kind && clip.beepMs !== null && e.run.shotTimes.length >= (kind === 'draw' ? 1 : 2) &&
            <PhaseBreakdown kind={kind} session={clip.session} beepMs={clip.beepMs} shotTimes={e.run.shotTimes} side={hand} onSideChange={onHandChange}
              saved={e.run.phases} onMarks={setPhaseMarks} onKeep={phases => keepPhases({ ...e.run, phases })} disabled={saving} />}
          {removing === e.run.id ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action title="KEEP" accessibilityLabel={`Keep run ${i + 1}`} disabled={saving} onPress={() => setRemoving(null)} />
            <Action title="REMOVE RUN" variant="destructive" accessibilityLabel={`Confirm removing run ${i + 1}`} disabled={saving}
              onPress={() => { void remove(e.run.id); }} />
          </View> : <Action title="REMOVE" variant="quiet" accessibilityLabel={`Remove run ${i + 1}`} disabled={saving} onPress={() => setRemoving(e.run.id)} />}
        </View>; })}
        {mine.length > 10 && <Copy>{`${mine.length - 10} older run${mine.length - 10 === 1 ? '' : 's'} in History and YOUR NUMBERS.`}</Copy>}
      </> : <Copy>No runs with these options yet.</Copy>}
    </Panel>
  </EditorSheet>;
}
