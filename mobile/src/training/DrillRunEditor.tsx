import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { uuid } from 'expo-modules-core';
import EditorSheet from '../editor/EditorSheet';
import { Action, Copy, DataRow, Input, Notice, Panel, Segmented } from '../ui/kit';
import { presetsForFamily } from '../stage/targetPresets';
import type { TargetPreset } from '../stage/targetPresets';
import { matchFamilies } from '../rules/rulesets';
import { pressPoint } from './pressPoint';
import { outlineUri, tapToFace } from './targetFace';
export { outlineUri, tapToFace } from './targetFace';
import type { TargetFamily } from '../stage/targetFamily';
import { drillRunProblem, groupStats, MAX_HITS_PER_RUN, offsetText, scoreRun, zoneChoices } from './drillLog';
import type { DrillHit, DrillRun } from './drillLog';

// Drill scoring follows the active rulesets (IDPA rules are on hold; see src/rules/rulesets.ts).
const families: TargetFamily[] = [...matchFamilies];
const DIAGRAM_WIDTH = 280;

const parseNumber = (text: string) => text.trim() === '' ? null : Number(text.trim());

export function emptyRun(family: TargetFamily | null, preset: TargetPreset | undefined, now = new Date().toISOString()): DrillRun {
  return { id: uuid.v4(), recordedAt: now, targetPresetId: preset?.id ?? null, family, faceWidth: preset?.width ?? 18, faceHeight: preset?.height ?? 30,
    distanceYards: null, aim: { x: 0, y: 0 }, hits: [], totalTime: null, splits: [], notes: '' };
}

export default function DrillRunEditor({ visible, initialFamily, onSave, onClose }: {
  visible: boolean; initialFamily: TargetFamily; onSave: (run: DrillRun) => Promise<void> | void; onClose: () => void;
}) {
  const [family, setFamily] = useState<TargetFamily>(initialFamily);
  const papers = (f: TargetFamily) => presetsForFamily(f).filter(p => p.type === 'cardboardTarget');
  const [presetId, setPresetId] = useState(papers(initialFamily)[0]?.id ?? '');
  const preset = papers(family).find(p => p.id === presetId) ?? papers(family)[0];
  const [run, setRun] = useState<DrillRun>(() => emptyRun(initialFamily, papers(initialFamily)[0]));
  const [selected, setSelected] = useState<string | null>(null), [aiming, setAiming] = useState(false);
  const [distance, setDistance] = useState(''), [time, setTime] = useState(''), [splits, setSplits] = useState('');
  const [required, setRequired] = useState(''), [procedurals, setProcedurals] = useState('');
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const height = preset ? DIAGRAM_WIDTH * preset.height / preset.width : DIAGRAM_WIDTH;
  const [size, setSize] = useState({ width: DIAGRAM_WIDTH, height });
  const stats = groupStats({ ...run, distanceYards: parseNumber(distance) });
  const parsedRequired = parseNumber(required), parsedProcedurals = parseNumber(procedurals);
  const score = scoreRun({ ...run, family, totalTime: parseNumber(time),
    requiredHits: parsedRequired !== null && Number.isInteger(parsedRequired) && parsedRequired >= 0 ? parsedRequired : null,
    procedurals: parsedProcedurals !== null && Number.isInteger(parsedProcedurals) && parsedProcedurals >= 0 ? parsedProcedurals : 0 });
  const selectedHit = run.hits.find(h => h.id === selected);
  const changePreset = (f: TargetFamily, p: TargetPreset | undefined) => {
    setFamily(f); setPresetId(p?.id ?? '');
    // Recorded hits keep their inches; the face size follows the chosen preset.
    setRun(r => ({ ...r, family: f, targetPresetId: p?.id ?? null, faceWidth: p?.width ?? r.faceWidth, faceHeight: p?.height ?? r.faceHeight,
      hits: r.hits.map(h => ({ ...h, zone: h.zone && !zoneChoices[f].includes(h.zone) ? null : h.zone })) }));
  };
  const tap = (lx: number, ly: number) => {
    const p = tapToFace(lx, ly, size.width, size.height, run.faceWidth, run.faceHeight);
    if (aiming) { setRun(r => ({ ...r, aim: p })); setAiming(false); return; }
    if (run.hits.length >= MAX_HITS_PER_RUN) { setError(`A run holds at most ${MAX_HITS_PER_RUN} hits.`); return; }
    const hit: DrillHit = { id: uuid.v4(), order: run.hits.length + 1, x: p.x, y: p.y, zone: null };
    setRun(r => ({ ...r, hits: [...r.hits, hit] })); setSelected(hit.id); setError('');
  };
  const renumber = (hits: DrillHit[]) => hits.map((h, i) => ({ ...h, order: i + 1 }));
  async function save() {
    const next: DrillRun = { ...run, family, distanceYards: parseNumber(distance), totalTime: parseNumber(time),
      splits: splits.trim() ? splits.split(/[,\s]+/).filter(Boolean).map(Number) : [],
      requiredHits: parseNumber(required), procedurals: parseNumber(procedurals) ?? 0 };
    const problem = drillRunProblem(next);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try { await onSave(next); setRun(r => ({ ...emptyRun(family, preset), powerFactor: r.powerFactor })); setSelected(null); setDistance(''); setTime(''); setSplits(''); setProcedurals(''); }
    catch (e) { setError(String(e)); } finally { setSaving(false); }
  }
  return <EditorSheet title="LOG DRILL RUN" visible={visible} close={() => { if (!saving) onClose(); }}><Panel>
    <Copy>TARGET</Copy>
    <Segmented options={families} value={family} disabled={saving} onChange={f => changePreset(f as TargetFamily, papers(f as TargetFamily)[0])} />
    <Segmented options={papers(family).map(p => p.name)} value={preset?.name ?? ''} disabled={saving} onChange={name => changePreset(family, papers(family).find(p => p.name === name))} />
    <Copy>{aiming ? 'Tap where you aimed.' : 'Tap the target where each shot hit. Tap a hit to tag its zone.'}</Copy>
    {preset && <Pressable accessibilityLabel="Drill target diagram" accessibilityHint="Tap to record a hit at that spot"
      onLayout={e => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      onPress={e => { const p = pressPoint(e.nativeEvent); if (p) tap(p.x, p.y); }}
      style={{ width: DIAGRAM_WIDTH, height, alignSelf: 'center', backgroundColor: '#f4f1ea' }}>
      <Image pointerEvents="none" source={{ uri: outlineUri(preset) }} style={{ width: DIAGRAM_WIDTH, height }} contentFit="fill" cachePolicy="none" />
      <View pointerEvents="none" style={{ position: 'absolute', left: (run.aim.x / run.faceWidth + 0.5) * size.width - 8, top: (0.5 - run.aim.y / run.faceHeight) * size.height - 8, width: 16, height: 16, borderWidth: 2, borderColor: '#1d4ed8', borderRadius: 8 }} />
      {run.hits.filter(h => h.x !== null && h.y !== null).map(h => <Pressable key={h.id} accessibilityLabel={`Hit ${h.order}${h.zone ? ' zone ' + h.zone : ''}`} onPress={() => setSelected(h.id)}
        style={{ position: 'absolute', left: ((h.x as number) / run.faceWidth + 0.5) * size.width - 7, top: (0.5 - (h.y as number) / run.faceHeight) * size.height - 7, width: 14, height: 14, borderRadius: 7,
          backgroundColor: h.id === selected ? '#dc2626' : '#111827', borderWidth: 1, borderColor: '#fff' }} />)}
    </Pressable>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      <Action title="MISS" disabled={saving} onPress={() => { const hit: DrillHit = { id: uuid.v4(), order: run.hits.length + 1, x: null, y: null, zone: 'M' }; setRun(r => ({ ...r, hits: [...r.hits, hit] })); }} />
      <Action title={family === 'IDPA' ? 'NON-THREAT HIT' : 'NO-SHOOT HIT'} disabled={saving} onPress={() => { const hit: DrillHit = { id: uuid.v4(), order: run.hits.length + 1, x: null, y: null, zone: family === 'IDPA' ? 'NT' : 'NS' }; setRun(r => ({ ...r, hits: [...r.hits, hit] })); }} />
      <Action title="UNDO LAST" disabled={saving || !run.hits.length} onPress={() => { setRun(r => ({ ...r, hits: r.hits.slice(0, -1) })); setSelected(null); }} />
      <Action title={aiming ? 'CANCEL AIM' : 'SET AIM POINT'} disabled={saving} onPress={() => setAiming(a => !a)} />
    </View>
    {selectedHit && <Panel>
      <Copy>{`HIT ${selectedHit.order}` + (selectedHit.x !== null ? ` · ${selectedHit.x.toFixed(1)} in, ${(selectedHit.y as number).toFixed(1)} in` : '')}</Copy>
      <Segmented options={zoneChoices[family]} value={selectedHit.zone ?? ''} disabled={saving} onChange={zone => setRun(r => ({ ...r, hits: r.hits.map(h => h.id === selectedHit.id ? { ...h, zone } : h) }))} />
      <Action title="DELETE HIT" variant="destructive" disabled={saving} onPress={() => { setRun(r => ({ ...r, hits: renumber(r.hits.filter(h => h.id !== selectedHit.id)) })); setSelected(null); }} />
    </Panel>}
    <DataRow label="Shots / misses" value={`${stats.shots} / ${stats.misses}`} />
    <DataRow label="Group centre" value={offsetText(stats.offset)} />
    <DataRow label="Extreme spread" value={stats.extremeSpread === null ? '—' : stats.extremeSpread.toFixed(1) + ' in'} />
    <DataRow label="Mean radius" value={stats.meanRadius === null ? '—' : stats.meanRadius.toFixed(1) + ' in' + (stats.meanRadiusMoa !== null ? ` (${stats.meanRadiusMoa.toFixed(1)} MOA)` : '')} />
    {family === 'USPSA' && <Segmented options={['MINOR', 'MAJOR']} value={(run.powerFactor ?? 'minor').toUpperCase()} disabled={saving} onChange={v => setRun(r => ({ ...r, powerFactor: v === 'MAJOR' ? 'major' : 'minor' }))} />}
    <DataRow label={`${score.method} · ${score.requiredHits} required`} value={score.points !== null ? `${score.points} pts` + (score.penalties ? ` (−${score.penalties})` : '') : score.pointsDown !== null ? `${score.pointsDown} down` : '—'} />
    {score.misses > 0 && <DataRow label="Missing hits" value={String(score.misses)} />}
    {family !== 'IDPA' && <DataRow label="Hit factor" value={score.hitFactor !== null ? score.hitFactor.toFixed(4) : 'Enter the time'} />}
    {family === 'IDPA' && <DataRow label="Final time" value={score.finalTime !== null ? score.finalTime.toFixed(2) + ' s' : 'Enter the time'} />}
    <Copy>{(score.untagged > 0 ? `${score.untagged} hit(s) have no zone yet. ` : '') + score.note}</Copy>
    <Input autoFocus={false} label="DISTANCE (YARDS)" value={distance} disabled={saving} onChange={setDistance} />
    <Input autoFocus={false} label="TOTAL TIME (SECONDS)" value={time} disabled={saving} onChange={setTime} />
    <Input autoFocus={false} label="SPLITS (SECONDS, COMMA SEPARATED)" value={splits} disabled={saving} onChange={setSplits} />
    <Input autoFocus={false} label="REQUIRED HITS (BLANK = ONE PER SHOT)" value={required} disabled={saving} onChange={setRequired} />
    <Input autoFocus={false} label={family === 'IDPA' ? 'PROCEDURAL ERRORS' : 'PROCEDURALS'} value={procedurals} disabled={saving} onChange={setProcedurals} />
    {!!error && <Notice tone="error">{error}</Notice>}
    <Action title={saving ? 'Saving...' : 'SAVE RUN'} variant="primary" disabled={saving || !run.hits.length} onPress={() => { void save(); }} />
  </Panel></EditorSheet>;
}
