import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { uuid } from 'expo-modules-core';
import PlanningPanel from '@/planning/PlanningPanel';
import { createPlan, reconcilePlan } from '@/planning/model';
import Stage25D from '@/editor/Stage25D';
import StageViewport from '@/editor/StageViewport';
import SnapControls from '@/editor/SnapControls';
import ObjectInspector from '@/editor/ObjectInspector';
import { DEFAULT_SNAPPING } from '@/stage/snapping';
import type { SnapSettings } from '@/stage/snapping';
import type { ObjectEdit } from '@/stage/operations';
import { clampZoom, MAX_ZOOM, MIN_ZOOM } from '@/stage/coordinates';
import type { ViewportState } from '@/stage/coordinates';
import { createDefaultStage } from '@/stage/defaults';
import { applyObjectAction, objectPalette, validSelection } from '@/editor/objectActions';
import type { ObjectAction } from '@/editor/objectActions';
import { objectLabel } from '@/stage/model';
import type { StageDocument } from '@/stage/model';
import { editObject } from '@/stage/operations';

export default function HomeScreen() {
  const [plan, setPlan] = useState(createPlan);
  const [showPlanning, setShowPlanning] = useState(false);
  const [viewMode, setViewMode] = useState<'topDown' | '25d'>('topDown');
  const [stage, setStage] = useState<StageDocument>(createDefaultStage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [snapping, setSnapping] = useState<SnapSettings>({ ...DEFAULT_SNAPPING });
  const [editError, setEditError] = useState('');
  const [dragging, setDragging] = useState(false);
  const selected = stage.objects.find((object) => object.id === selectedId);
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(validSelection(stage, selectedId));
  }, [selectedId, selected]);

  const act = (action: ObjectAction) => {
    const result = applyObjectAction(stage, selectedId, action, uuid.v4);
    setPlan(current => action.kind === 'reset' ? { ...current, engagements: {} } : reconcilePlan(current, result.stage));
    setStage(result.stage);
    setSelectedId(result.selectedId);
    setEditError(result.error ?? '');
  };
  const applyEdit = (edit: ObjectEdit): string | null => {
    if (!selected) return 'Select an object first.';
    const result = editObject(stage, selected.id, edit, snapping.enabled ? snapping.rotationIncrement : null);
    if (result.error) return result.error;
    setStage(result.stage);
    setEditError('');
    return null;
  };
  const rotationStep = snapping.enabled ? (snapping.rotationIncrement ?? 15) : 15;
  const rotate = (degrees: number) => {
    if (selected) setEditError(applyEdit({ rotation: selected.rotation + degrees }) ?? '');
  };
  const zoom = (factor: number) => setViewport((current) => ({ ...current, zoom: clampZoom(current.zoom * factor) }));

  return <SafeAreaView style={styles.screen}>
    <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={!dragging} contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>PROTOTYPE #0</Text>
      <Text style={styles.title}>2D Stage Planner</Text>
      <Button title={showPlanning ? "Hide Loadout / Planning" : "Loadout / Planning"} disabled={dragging} onPress={() => setShowPlanning(value => !value)} />
      {showPlanning && <PlanningPanel plan={plan} stage={stage} onChange={setPlan} />}
      <Text style={styles.description}>Arrange targets and walls. Tap an object to select and rotate it.</Text>
      <Text style={styles.status}>{stage.stage.width / 12} ft × {stage.stage.depth / 12} ft workspace · {Math.round(viewport.zoom * 100)}% zoom</Text>
      <View style={styles.controls}>
        <Button title="Top Down" disabled={dragging || viewMode === 'topDown'} onPress={() => setViewMode('topDown')} />
        <Button title="2.5D" disabled={dragging || viewMode === '25d'} onPress={() => setViewMode('25d')} />
      </View>
      {viewMode === '25d' ? <Stage25D stage={stage} selectedId={selectedId} /> : <>
      <StageViewport stage={stage} viewport={viewport} selectedId={selectedId} snapping={snapping}
        onSelect={setSelectedId} onDragging={setDragging} setStage={setStage} />
      <Text style={styles.status}>{selected ? objectLabel(selected.type) + ' · ' + selected.rotation + '°' : 'No object selected'}</Text>
      <Text style={styles.status}>C: scoring cardboard ? NS: no-shoot ? SP: steel plate ? P: steel popper. Target badges are symbols; the line shows physical face width in plan view.</Text>
      <SnapControls value={snapping} onChange={setSnapping} disabled={dragging} />
      {editError !== '' && <Text accessibilityLiveRegion="polite">{editError}</Text>}
      <View style={styles.controls}>
        <Button title={"Rotate -" + rotationStep + " deg"} disabled={!selected || dragging} onPress={() => rotate(-rotationStep)} />
        <Button title={"Rotate +" + rotationStep + " deg"} disabled={!selected || dragging} onPress={() => rotate(rotationStep)} />
        <Button title="Zoom -" disabled={viewport.zoom <= MIN_ZOOM || dragging} onPress={() => zoom(1 / 1.25)} />
        <Button title="Zoom +" disabled={viewport.zoom >= MAX_ZOOM || dragging} onPress={() => zoom(1.25)} />
      </View>
      <Text style={styles.status}>Add stage object</Text>
      <View style={styles.controls}>{objectPalette.map(({ type, label }) =>
        <Button key={type} title={label} disabled={dragging} onPress={() => act({ kind: 'create', type })} />
      )}</View>
      <Text style={styles.status}>Selected object actions</Text>
      <View style={styles.controls}>
        <Button title="Duplicate" disabled={!selected || selected.type === 'start' || dragging} onPress={() => act({ kind: 'duplicate' })} />
        <Button title="Delete" disabled={!selected || selected.type === 'start' || dragging} onPress={() => act({ kind: 'delete' })} />
        <Button title="Reset Positions" disabled={dragging} onPress={() => act({ kind: 'reset' })} />
      </View>
      {selected && <ObjectInspector key={selected.id} item={selected} disabled={dragging} onApply={applyEdit} />}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    style={[styles.button, disabled && styles.disabled]} onPress={onPress}>
    <Text style={styles.buttonText}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#eef2f5' },
  container: { padding: 20, paddingBottom: 100 },
  eyebrow: { color: '#c44b2b', fontWeight: 'bold', letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#24303c' },
  description: { color: '#5f6b76', marginTop: 8, marginBottom: 12 },
  status: { color: '#24303c', marginVertical: 8 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  button: { backgroundColor: '#33424f', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 5 },
  disabled: { opacity: 0.4 },
  buttonText: { color: 'white', fontWeight: 'bold' },
});
