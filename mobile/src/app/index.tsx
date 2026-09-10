import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { uuid } from 'expo-modules-core';
import StageViewport from '@/editor/StageViewport';
import SnapControls from '@/editor/SnapControls';
import ObjectInspector from '@/editor/ObjectInspector';
import { DEFAULT_SNAPPING } from '@/stage/snapping';
import type { SnapSettings } from '@/stage/snapping';
import type { ObjectEdit } from '@/stage/operations';
import { clampZoom, MAX_ZOOM, MIN_ZOOM } from '@/stage/coordinates';
import type { ViewportState } from '@/stage/coordinates';
import { createDefaultStage } from '@/stage/defaults';
import { createObjectId } from '@/stage/ids';
import { objectLabel } from '@/stage/model';
import type { StageDocument } from '@/stage/model';
import { addObject, removeLastObject, editObject } from '@/stage/operations';

export default function HomeScreen() {
  const [stage, setStage] = useState<StageDocument>(createDefaultStage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [snapping, setSnapping] = useState<SnapSettings>({ ...DEFAULT_SNAPPING });
  const [editError, setEditError] = useState('');
  const [dragging, setDragging] = useState(false);
  const selected = stage.objects.find((object) => object.id === selectedId);
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  const resetStage = () => {
    setStage(createDefaultStage());
    setSelectedId(null);
    setEditError('');
    // Reset objects only; preserve the user's zoom and pan.
  };
  const add = (type: 'cardboardTarget' | 'noShootTarget' | 'wall' | 'faultLine') => {
    const id = createObjectId(type, uuid.v4);
    setStage((current) => addObject(current, type, id));
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
      <Text style={styles.description}>Arrange targets and walls. Tap an object to select and rotate it.</Text>
      <Text style={styles.status}>{stage.stage.width / 12} ft × {stage.stage.depth / 12} ft workspace · {Math.round(viewport.zoom * 100)}% zoom</Text>
      <StageViewport stage={stage} viewport={viewport} selectedId={selectedId} snapping={snapping}
        onSelect={setSelectedId} onDragging={setDragging} setStage={setStage} />
      <Text style={styles.status}>{selected ? objectLabel(selected.type) + ' · ' + selected.rotation + '°' : 'No object selected'}</Text>
      <Text style={styles.status}>C: scoring cardboard ? NS: no-shoot. Target badges are symbols; the line shows physical face width in plan view.</Text>
      <SnapControls value={snapping} onChange={setSnapping} disabled={dragging} />
      {editError !== '' && <Text accessibilityLiveRegion="polite">{editError}</Text>}
      <View style={styles.controls}>
        <Button title={"Rotate -" + rotationStep + " deg"} disabled={!selected || dragging} onPress={() => rotate(-rotationStep)} />
        <Button title={"Rotate +" + rotationStep + " deg"} disabled={!selected || dragging} onPress={() => rotate(rotationStep)} />
        <Button title="Zoom -" disabled={viewport.zoom <= MIN_ZOOM || dragging} onPress={() => zoom(1 / 1.25)} />
        <Button title="Zoom +" disabled={viewport.zoom >= MAX_ZOOM || dragging} onPress={() => zoom(1.25)} />
      </View>
      <View style={styles.controls}>
        <Button title="Add Cardboard Target" disabled={dragging} onPress={() => add('cardboardTarget')} />
        <Button title="Remove Cardboard Target" disabled={dragging} onPress={() => setStage((current) => removeLastObject(current, 'cardboardTarget'))} />
        <Button title="Add No-Shoot Target" disabled={dragging} onPress={() => add('noShootTarget')} />
        <Button title="Remove No-Shoot Target" disabled={dragging} onPress={() => setStage((current) => removeLastObject(current, 'noShootTarget'))} />
        <Button title="Add Wall" disabled={dragging} onPress={() => add('wall')} />
        <Button title="Remove Wall" disabled={dragging} onPress={() => setStage((current) => removeLastObject(current, 'wall'))} />
        <Button title="Add Fault Line" disabled={dragging} onPress={() => add('faultLine')} />
        <Button title="Remove Fault Line" disabled={dragging} onPress={() => setStage((current) => removeLastObject(current, 'faultLine'))} />
        <Button title="Reset Positions" disabled={dragging} onPress={resetStage} />
      </View>
      {selected && <ObjectInspector key={selected.id} item={selected} disabled={dragging} onApply={applyEdit} />}
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
