import { useState } from 'react';
import { Text, View } from 'react-native';
import { uuid } from 'expo-modules-core';
import EditorSheet from '../editor/EditorSheet';
import { Action, Copy, DataRow, Input, Notice, Panel, Segmented, ui } from '../ui/kit';
import type { PowerFactor } from '../profile/model';
import type { TrainingContext } from './observations';
import { zoneChoices } from './drillLog';
import { analyzeLibraryRun, choicesFor, drillGroups, intervalLabels, libraryDrill, libraryDrills, libraryFamilies, libraryRunProblem,
  parseShotTimes, variantKey, variantLabel } from './drillLibrary';
import type { LibraryDrill, LibraryFamily, LibraryRun } from './drillLibrary';

const MODES = ['SHOT TIMES', 'SPLITS', 'TOTAL ONLY'] as const;
type Mode = typeof MODES[number];
const parseNumber = (text: string) => text.trim() === '' ? null : Number(text.trim());
const seconds = (v: number) => v.toFixed(2) + ' s';

function Counter({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Text style={[ui.copy, { flex: 1 }]}>{label}</Text>
    <Action title="−" accessibilityLabel={'Fewer ' + label} disabled={disabled || value <= 0} onPress={() => onChange(value - 1)} />
    <Text style={[ui.dataValue, { minWidth: 32, textAlign: 'center' }]}>{value}</Text>
    <Action title="+" accessibilityLabel={'More ' + label} disabled={disabled || value >= 300} onPress={() => onChange(value + 1)} />
  </View>;
}

/** Log one drill-library run: pick the drill, its options, the times from your timer and the hits by zone. */
export default function LibraryRunEditor({ visible, context, powerFactor, pars, onSave, onClose }: {
  visible: boolean; context: TrainingContext; powerFactor: PowerFactor; pars: Record<string, number>;
  onSave: (run: LibraryRun, par: number | null) => Promise<void> | void; onClose: () => void;
}) {
  const [drillId, setDrillId] = useState<string | null>(null);
  const drill = drillId ? libraryDrill(drillId) : undefined;
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [family, setFamily] = useState<LibraryFamily>('USPSA'), [chosenPf, setPf] = useState<PowerFactor | null>(null);
  // Your profile's power factor until you pick one here (the profile may load after the sheet opens).
  const pf = chosenPf ?? powerFactor;
  const [mode, setMode] = useState<Mode>('SHOT TIMES'), [times, setTimes] = useState(''), [total, setTotal] = useState('');
  const [zones, setZones] = useState<Record<string, number>>({}), [procedurals, setProcedurals] = useState('');
  const [notes, setNotes] = useState(''), [counts, setCounts] = useState(true), [par, setPar] = useState('');
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const dry = context === 'DRY_FIRE';

  const pick = (d: LibraryDrill) => {
    const next = choicesFor(d); setDrillId(d.id); setChoices(next); setZones({}); setTimes(''); setTotal(''); setError('');
    setPar(String(pars[variantKey({ drillId: d.id, choices: next })] ?? ''));
  };
  const choose = (key: string, value: string) => {
    const next = { ...choices, [key]: value }; setChoices(next);
    if (drill) setPar(String(pars[variantKey({ drillId: drill.id, choices: next })] ?? ''));
  };
  const parsed = mode === 'TOTAL ONLY' ? { times: [] as number[] } : parseShotTimes(times, mode === 'SPLITS' ? 'splits' : 'times');
  const shotTimes = 'times' in parsed ? parsed.times : [];
  const totalTime = mode === 'TOTAL ONLY' ? parseNumber(total) : shotTimes.length ? shotTimes[shotTimes.length - 1] : null;
  const steel = drill?.requiredHits === null;
  const counted = Object.fromEntries(Object.entries(zones).filter(([, n]) => n > 0));
  const run: LibraryRun | null = drill ? { id: '', drillId: drill.id, recordedAt: new Date().toISOString(), choices: choicesFor(drill, choices), shotTimes,
    totalTime: totalTime !== null && Number.isFinite(totalTime) ? totalTime : null, family, notes: notes.trim(),
    ...(family === 'USPSA' ? { powerFactor: pf } : {}),
    ...(!dry && (steel ? mode === 'TOTAL ONLY' : Object.keys(counted).length) ? { zones: steel ? { M: zones.M ?? 0 } : counted } : {}),
    ...(parseNumber(procedurals) ? { procedurals: parseNumber(procedurals)! } : {}), ...(counts ? {} : { counts: false }) } : null;
  const analysis = run ? analyzeLibraryRun(run, powerFactor) : null;
  const parValue = parseNumber(par);

  async function save() {
    if (!drill || !run) return;
    if ('problem' in parsed) { setError(parsed.problem); return; }
    if (mode === 'TOTAL ONLY' && (totalTime === null || !Number.isFinite(totalTime))) { setError('Enter the total time.'); return; }
    if (parValue !== null && !(Number.isFinite(parValue) && parValue > 0 && parValue <= 600)) { setError('Par must be a time in seconds, or blank.'); return; }
    const next = { ...run, id: uuid.v4(), recordedAt: new Date().toISOString() };
    const problem = libraryRunProblem(next);
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try { await onSave(next, parValue); setTimes(''); setTotal(''); setZones({}); setProcedurals(''); setNotes(''); }
    catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  return <EditorSheet title={drill ? drill.name : 'DRILL LIBRARY'} scrollKey={drill?.id ?? 'list'} visible={visible} close={() => { if (!saving) onClose(); }}>
    {!drill && <Panel>
      <Copy>Each drill is one timer run and measures numbers the planner uses. Times count toward your {dry ? 'dry-fire' : context === 'LIVE_FIRE' ? 'live-fire' : 'match'} numbers.</Copy>
      {drillGroups.map(group => <View key={group} style={{ gap: 8 }}>
        <Text style={ui.eyebrow}>{group.toUpperCase()}</Text>
        {libraryDrills.filter(d => d.group === group).map(d => <Action key={d.id} title={d.name} onPress={() => pick(d)} />)}
      </View>)}
    </Panel>}
    {drill && run && <Panel>
      <Copy>{drill.setup}</Copy>
      <Copy>{'Gives: ' + drill.gives}</Copy>
      <Copy>{'Planner use: ' + drill.planner}</Copy>
      {drill.choices.map(c => <View key={c.key} style={{ gap: 4 }}>
        <Text style={ui.eyebrow}>{c.label}</Text>
        <Segmented options={c.options.map(o => o.label)} value={c.options.find(o => o.value === run.choices[c.key])?.label ?? ''} disabled={saving}
          onChange={label => choose(c.key, c.options.find(o => o.label === label)!.value)} />
      </View>)}

      <Text style={ui.eyebrow}>TIMES</Text>
      <Segmented options={MODES} value={mode} disabled={saving} onChange={m => { setMode(m as Mode); setError(''); }} />
      {mode === 'TOTAL ONLY'
        ? <Input autoFocus={false} label="TOTAL TIME (SECONDS)" value={total} disabled={saving} onChange={setTotal} />
        : <Input autoFocus={false} label={mode === 'SPLITS' ? `SPLITS, FIRST = START TO FIRST SHOT (${drill.intervals.length}${drill.makeups ? '+' : ''})` : `SHOT TIMES FROM THE TIMER (${drill.intervals.length}${drill.makeups ? '+' : ''})`}
          value={times} disabled={saving} onChange={value => { setTimes(value); setError(''); }} />}
      {mode === 'TOTAL ONLY' && <Copy>A total gives your hit factor and trend, but no draw, split or move times.</Copy>}
      {'problem' in parsed && !!times.trim() && <Notice tone="warning">{parsed.problem}</Notice>}
      {analysis && analysis.intervals.length > 0 && <View style={{ gap: 2 }}>
        {analysis.intervals.map(i => <DataRow key={i.shot} label={`Shot ${i.shot} · ${intervalLabels[i.kind]}`} value={seconds(i.seconds)} />)}
        {shotTimes.length > 0 && shotTimes.length !== drill.intervals.length && !(drill.makeups && shotTimes.length > drill.intervals.length)
          && <Notice tone="warning">{`${drill.name} has ${drill.intervals.length} shots; ${shotTimes.length} entered.`}</Notice>}
      </View>}

      {dry ? <Copy>Dry fire: hits are not counted. Times count toward your dry-fire numbers only.</Copy> : steel ? <>
        <Text style={ui.eyebrow}>MISSES</Text>
        {mode === 'TOTAL ONLY' ? <Counter label="Missed shots" value={zones.M ?? 0} disabled={saving} onChange={n => setZones({ M: n })} />
          : <DataRow label="Makeup shots (from the shot count)" value={analysis?.steelMisses ?? 0} />}
      </> : <>
        <Text style={ui.eyebrow}>HITS BY ZONE · {drill.requiredHits} REQUIRED</Text>
        <Segmented options={libraryFamilies} value={family} disabled={saving} onChange={f => { setFamily(f as LibraryFamily); setZones({}); }} />
        {family === 'USPSA' && <Segmented options={['MINOR', 'MAJOR']} value={pf.toUpperCase()} disabled={saving} onChange={v => setPf(v === 'MAJOR' ? 'major' : 'minor')} />}
        {zoneChoices[family].map(zone => <Counter key={zone} label={zone === 'M' ? 'M (miss)' : zone === 'NS' ? 'NS (no-shoot hit)' : zone} value={zones[zone] ?? 0}
          disabled={saving} onChange={n => setZones(z => ({ ...z, [zone]: n }))} />)}
        <Input autoFocus={false} label="PROCEDURALS" value={procedurals} disabled={saving} onChange={setProcedurals} />
        {analysis?.score ? <>
          <DataRow label={`${analysis.score.method} points`} value={`${analysis.score.points} of ${analysis.score.maxPoints} (${Math.round(analysis.score.percent * 100)}%)`} />
          <DataRow label="Hit factor" value={analysis.score.hitFactor !== null ? analysis.score.hitFactor.toFixed(4) : 'Enter the times'} />
        </> : <Copy>Hits not counted yet. Leave them at zero to log the times only.</Copy>}
      </>}

      <Input autoFocus={false} label="PAR TIME (SECONDS, BLANK = NONE)" value={par} disabled={saving} onChange={setPar} />
      {parValue !== null && Number.isFinite(parValue) && parValue > 0 && run.totalTime !== null &&
        <DataRow label="Against par" value={run.totalTime <= parValue ? `${seconds(parValue - run.totalTime)} under` : `${seconds(run.totalTime - parValue)} over`} />}
      <Input autoFocus={false} label="NOTES" value={notes} disabled={saving} onChange={setNotes} />
      <Text style={ui.eyebrow}>PROFILE</Text>
      <Segmented options={['COUNTS', 'LOG ONLY']} value={counts ? 'COUNTS' : 'LOG ONLY'} disabled={saving} onChange={v => setCounts(v === 'COUNTS')} />
      <Copy>{counts ? 'This run’s times update your numbers and the planner.' : 'Kept in the log only (a warm-up, a bad setup).'}</Copy>
      {!!error && <Notice tone="error">{error}</Notice>}
      <Action title={saving ? 'Saving...' : 'SAVE RUN'} variant="primary" disabled={saving || (mode !== 'TOTAL ONLY' && !shotTimes.length)} onPress={() => { void save(); }} />
      <Action title="CHOOSE ANOTHER DRILL" disabled={saving} onPress={() => setDrillId(null)} />
      <Copy>{variantLabel(drill, run.choices)}</Copy>
    </Panel>}
  </EditorSheet>;
}
