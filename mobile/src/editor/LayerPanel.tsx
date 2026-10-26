import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { stackArtSvg } from '@/stage/targetArt';
import { uuid } from 'expo-modules-core';
import { Action, Copy, DataRow, Notice, Panel, Segmented } from '@/ui/kit';
import type { StageDocument } from '@/stage/model';
import { targetLabel } from '@/planning/model';
import { addLayer, attachmentText, coverLabel, exposure, hardCoverFromPreset, hardCoverPresets, isPaper, layersOf, rollCover, rollLayer,
  ROLL_STEP, setHardCover, slideCoverSnapped, slideLayer, SLIDE_STEP, updateAttachment } from '@/stage/targetLayers';
import type { HardCoverPreset, Paper } from '@/stage/targetLayers';

const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 };
/** The stack face-on, so it can be seen while the sheet covers the stage. */
function StackPreview({ stage, baseId }: { stage: StageDocument; baseId: string }) {
  // On a light card in day and night, so black paint and dark outlines always read.
  return <View style={{ backgroundColor: '#EDEDE8', padding: 8 }}>
    <Image accessibilityLabel="The target and its layers, as the shooter sees them" source={{ uri: 'data:image/svg+xml;base64,' + btoa(stackArtSvg(stage, baseId, { size: 240 })) }}
      style={{ width: '100%', height: 200 }} contentFit="contain" cachePolicy="none" transition={0} />
  </View>;
}
const MAX_COVERS = 3;

/**
 * Layers on a paper target: hostage no-shoots and second targets on top of (or behind) it, and painted hard cover.
 * Every change is one undo step in the editor's history.
 */
export default function LayerPanel({ stage, selectedId, setStage, onSelect }: {
  stage: StageDocument; selectedId: string; setStage: (next: StageDocument) => void; onSelect: (id: string) => void;
}) {
  const [coverId, setCoverId] = useState<string | null>(null), [error, setError] = useState('');
  const selected = stage.objects.find(o => o.id === selectedId);
  if (!isPaper(selected)) return <Panel><Copy>Select a paper target to add layers.</Copy></Panel>;
  const base = selected.attachment ? stage.objects.find(o => o.id === selected.attachment!.parentId) : selected;
  if (!isPaper(base)) return <Panel><Copy>This layer's target is missing.</Copy></Panel>;
  const name = (o: Paper) => o.type === 'cardboardTarget' ? targetLabel(stage, o.id) : 'No-shoot';
  const open = (o: Paper) => o.type === 'cardboardTarget' ? <DataRow label={`${name(o)} open scoring area`} value={Math.round(exposure(stage, o).fraction * 100) + '%'} /> : null;

  if (selected.attachment) {
    const a = selected.attachment, slide = (dx: number, dy: number) => setStage(updateAttachment(stage, selected.id, at => slideLayer(base, selected, at, dx, dy)));
    return <Panel>
      <StackPreview stage={stage} baseId={base.id} />
      <Copy>{(selected.type === 'noShootTarget' ? 'NO-SHOOT' : 'TARGET') + ' ON ' + name(base).toUpperCase()}</Copy>
      <Copy>{attachmentText(a)}</Copy>
      <View style={row}>
        <Action title="▲" accessibilityLabel="Slide up" onPress={() => slide(0, SLIDE_STEP)} />
        <Action title="▼" accessibilityLabel="Slide down" onPress={() => slide(0, -SLIDE_STEP)} />
        <Action title="◀" accessibilityLabel="Slide left" onPress={() => slide(-SLIDE_STEP, 0)} />
        <Action title="▶" accessibilityLabel="Slide right" onPress={() => slide(SLIDE_STEP, 0)} />
        <Action title="↺" accessibilityLabel="Rotate left" onPress={() => setStage(updateAttachment(stage, selected.id, at => rollLayer(at, -ROLL_STEP)))} />
        <Action title="↻" accessibilityLabel="Rotate right" onPress={() => setStage(updateAttachment(stage, selected.id, at => rollLayer(at, ROLL_STEP)))} />
      </View>
      <Segmented options={['IN FRONT', 'BEHIND']} value={a.front ? 'IN FRONT' : 'BEHIND'} onChange={v => setStage(updateAttachment(stage, selected.id, at => ({ ...at, front: v === 'IN FRONT' })))} />
      {open(base)}{open(selected)}
      <Action title="BASE TARGET" accessibilityLabel="Select the target underneath" onPress={() => onSelect(base.id)} />
      <Action title="REMOVE LAYER" variant="destructive" onPress={() => { setStage({ ...stage, objects: stage.objects.filter(o => o.id !== selected.id) }); onSelect(base.id); }} />
    </Panel>;
  }

  const covers = base.hardCover ?? [], cover = covers.find(c => c.id === coverId) ?? null;
  const w = base.geometry.faceWidth, h = base.geometry.faceHeight;
  const add = (kind: 'noShoot' | 'target') => { const id = uuid.v4(); const result = addLayer(stage, base.id, kind, id); setError(result.error ?? ''); if (!result.error) { setStage(result.stage); onSelect(id); } };
  const paint = (preset: HardCoverPreset) => {
    if (covers.length >= MAX_COVERS) { setError(`A target can carry at most ${MAX_COVERS} painted areas.`); return; }
    const c = hardCoverFromPreset(preset, w, h, uuid.v4()); setStage(setHardCover(stage, base.id, list => [...list, c])); setCoverId(c.id); setError('');
  };
  const change = (next: (c: NonNullable<typeof cover>) => NonNullable<typeof cover>) => cover && setStage(setHardCover(stage, base.id, list => list.map(c => c.id === cover.id ? next(c) : c)));
  return <Panel>
    <StackPreview stage={stage} baseId={base.id} />
    {open(base)}
    <Copy>ADD ON TOP</Copy>
    <View style={row}>
      <Action title="NO-SHOOT (HOSTAGE)" onPress={() => add('noShoot')} />
      <Action title="SECOND TARGET" onPress={() => add('target')} />
    </View>
    {layersOf(stage, base.id).map((o, i) => <Action key={o.id} title={`${o.type === 'noShootTarget' ? 'No-shoot' : name(o)} · ${attachmentText(o.attachment!)}`}
      accessibilityLabel={`Layer ${i + 1}`} onPress={() => onSelect(o.id)} />)}
    <Copy>HARD COVER (PAINTED BLACK)</Copy>
    <View style={row}>{hardCoverPresets.map(p => <Action key={p.preset} title={p.label} accessibilityLabel={'Paint: ' + p.detail} onPress={() => paint(p.preset)} />)}</View>
    {covers.map((c, i) => <Action key={c.id} title={`Paint ${i + 1} · ${coverLabel(c)}${c.id === cover?.id ? ' / Selected' : ''}`} onPress={() => setCoverId(c.id)} />)}
    {cover && <>
      <View style={row}>
        {cover.kind === 'edge' ? <>
          <Action title="▲" accessibilityLabel="Move the paint edge up" onPress={() => change(c => slideCoverSnapped(c, SLIDE_STEP, w, h))} />
          <Action title="▼" accessibilityLabel="Move the paint edge down" onPress={() => change(c => slideCoverSnapped(c, -SLIDE_STEP, w, h))} />
        </> : <>
          <Action title="◀" accessibilityLabel="Move the open strip left" onPress={() => change(c => slideCoverSnapped(c, -SLIDE_STEP, w, h))} />
          <Action title="▶" accessibilityLabel="Move the open strip right" onPress={() => change(c => slideCoverSnapped(c, SLIDE_STEP, w, h))} />
        </>}
        <Action title="↺" accessibilityLabel="Turn the paint edge left" onPress={() => change(c => rollCover(c, -ROLL_STEP))} />
        <Action title="↻" accessibilityLabel="Turn the paint edge right" onPress={() => change(c => rollCover(c, ROLL_STEP))} />
      </View>
      <Action title="REMOVE PAINT" variant="destructive" onPress={() => { setStage(setHardCover(stage, base.id, list => list.filter(c => c.id !== cover.id))); setCoverId(null); }} />
    </>}
    {!!error && <Notice tone="error">{error}</Notice>}
  </Panel>;
}
