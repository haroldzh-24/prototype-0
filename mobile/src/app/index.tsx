import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { uuid } from 'expo-modules-core';
import StageViewport from '@/editor/StageViewport';
import { clampZoom, MAX_ZOOM, MIN_ZOOM } from '@/stage/coordinates';
import type { ViewportState } from '@/stage/coordinates';
import { createDefaultStage } from '@/stage/defaults';
import { createObjectId } from '@/stage/ids';
import type { StageDocument } from '@/stage/model';
import { addObject, removeLastObject, rotateObject } from '@/stage/operations';

export default function HomeScreen() {
  const [stage, setStage] = useState<StageDocument>(createDefaultStage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [dragging, setDragging] = useState(false);
  const selected = stage.objects.find((object) => object.id === selectedId);
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  const resetStage = () => {
    setStage(createDefaultStage());
    setSelectedId(null);
    // Reset objects only; preserve the user's zoom and pan.
  };
  const add = (type: 'target' | 'wall') => {
    const id = createObjectId(type, uuid.v4);
    setStage((current) => addObject(current, type, id));
  };
  const rotate = (degrees: number) => {
    if (selected) setStage((current) => rotateObject(current, selected.id, degrees));
  };
  const zoom = (factor: number) => setViewport((current) => ({ ...current, zoom: clampZoom(current.zoom * factor) }));

  return <SafeAreaView style={styles.screen}>
    <ScrollView scrollEnabled={!dragging} contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>PROTOTYPE #0</Text>
      <Text style={styles.title}>2D Stage Planner</Text>
      <Text style={styles.description}>Arrange targets and walls. Tap an object to select and rotate it.</Text>
      <Text style={styles.status}>{stage.stage.width / 12} ft × {stage.stage.depth / 12} ft workspace · {Math.round(viewport.zoom * 100)}% zoom</Text>
      <StageViewport stage={stage} viewport={viewport} selectedId={selectedId}
        onSelect={setSelectedId} onDragging={setDragging} setStage={setStage} />
      <Text style={styles.status}>{selected ? (selected.type === 'start' ? 'Start Position' : selected.type) + ' · ' + selected.rotation + '°' : 'No object selected'}</Text>
      <View style={styles.controls}>
        <Button title="Rotate -15°" disabled={!selected || dragging} onPress={() => rotate(-15)} />
        <Button title="Rotate +15°" disabled={!selected || dragging} onPress={() => rotate(15)} />
        <Button title="Zoom -" disabled={viewport.zoom <= MIN_ZOOM || dragging} onPress={() => zoom(1 / 1.25)} />
        <Button title="Zoom +" disabled={viewport.zoom >= MAX_ZOOM || dragging} onPress={() => zoom(1.25)} />
      </View>
      <View style={styles.controls}>
        <Button title="Add Target" disabled={dragging} onPress={() => add('target')} />
        <Button title="Remove Target" disabled={dragging} onPress={() => setStage((current) => removeLastObject(current, 'target'))} />
        <Button title="Add Wall" disabled={dragging} onPress={() => add('wall')} />
        <Button title="Remove Wall" disabled={dragging} onPress={() => setStage((current) => removeLastObject(current, 'wall'))} />
        <Button title="Reset Positions" disabled={dragging} onPress={resetStage} />
      </View>
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
