import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import type { NavigationAction } from 'expo-router/react-navigation';
import { useRepository } from '@/storage/StorageProvider';
import type { SavedStage } from '@/storage/repository';
import { ui } from '@/ui/kit';
import AddMenu from './AddMenu';
import Text from '@/editor/FieldText';
import { uuid } from 'expo-modules-core';
import PlanningPanel from '@/planning/PlanningPanel';
import RoutePanel from '@/planning/RoutePanel';
import { createRoute } from '@/planning/route';
import type { StageRoute } from '@/planning/route';
import type { ShooterPerformanceProfile } from '@/profile/model';
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
import { applyObjectAction, validSelection } from '@/editor/objectActions';
import type { ObjectAction } from '@/editor/objectActions';
import { objectLabel } from '@/stage/model';
import type { StageDocument } from '@/stage/model';
import { editObject } from '@/stage/operations';

export default function StageBuilder({ initial }: { initial?: SavedStage }) {
  const repo = useRepository(), navigation = useNavigation();
  const [plan, setPlan] = useState(() => initial?.plan ?? createPlan());
  const [routeMode, setRouteMode] = useState(false);
  const [positionId, setPositionId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ShooterPerformanceProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  useEffect(() => { let active = true; repo.loadProfile().then(p => { if (active) setProfile(p.performance); }).catch(e => { if (active) setProfileError(String(e)); }); return () => { active = false; }; }, [repo]);
  const changeRoute = (route: StageRoute) => setPlan(current => ({ ...current, route }));
  const enterRoute = () => {
    if (!plan.route) changeRoute(createRoute('route-' + uuid.v4()));
    setRouteMode(true); setViewMode('topDown');
  };
  const [showPlanning, setShowPlanning] = useState(false);
  const [viewMode, setViewMode] = useState<'topDown' | '25d'>('topDown');
  const [stage, setStage] = useState<StageDocument>(() => initial?.document ?? createDefaultStage());
  const [stageId, setStageId] = useState(initial?.id), [name, setName] = useState(initial?.name ?? 'Untitled stage');
  const snapshot = JSON.stringify({ name, stage, plan });
  const [savedSnapshot, setSavedSnapshot] = useState(initial ? snapshot : '');
  const [saving, setSaving] = useState(false), savingRef = useRef(false), [saveMessage, setSaveMessage] = useState('');
  const [showAdd, setShowAdd] = useState(false), [pendingExit, setPendingExit] = useState<NavigationAction | null>(null), [allowExit, setAllowExit] = useState(false);
  const dirty = snapshot !== savedSnapshot;
  usePreventRemove((dirty || saving) && !allowExit, ({ data }) => setPendingExit(data.action));
  useEffect(() => { if (allowExit && pendingExit) navigation.dispatch(pendingExit); }, [allowExit, pendingExit, navigation]);
  useEffect(() => {
    if (typeof window === 'undefined' || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function save() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setSaveMessage('');
    try {
      if (stageId) await repo.saveStage(stageId, name, stage, plan);
      else setStageId(await repo.createStage(name, stage, plan));
      setSavedSnapshot(snapshot); setSaveMessage('Saved on this device.');
    } catch (e) { setSaveMessage(String(e)); }
    finally { savingRef.current = false; setSaving(false); }
  }
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
    setPlan(current => action.kind === 'reset' ? { ...current, engagements: {}, route: undefined } : reconcilePlan(current, result.stage));
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

  return <SafeAreaView edges={['bottom']} style={styles.screen}>
    <AddMenu visible={showAdd} close={() => setShowAdd(false)} create={type => act({ kind: 'create', type })} selectStart={() => setSelectedId(stage.objects.find(object => object.type === 'start')?.id ?? null)} />
    <Modal visible={pendingExit !== null && !allowExit} transparent animationType="fade" onRequestClose={() => setPendingExit(null)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#000b' }}><View style={ui.panel}>
        <Text style={styles.title}>{saving ? 'SAVE IN PROGRESS' : dirty ? 'UNSAVED CHANGES' : 'STAGE SAVED'}</Text>
        <Text>Save your work before closing, or discard the changes.</Text>
        <Button title="Keep editing" onPress={() => setPendingExit(null)} />
        <Button title={saving ? 'Saving...' : 'Save'} disabled={saving || !dirty} onPress={() => void save()} />
        {!!saveMessage && <Text>{saveMessage}</Text>}
        <Button title={dirty ? 'Discard changes and close' : 'Close stage'} disabled={saving} onPress={() => setAllowExit(true)} />
      </View></View>
    </Modal>
    <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={!dragging} contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>STAGE SYSTEM / 01</Text>
      <Text style={styles.title}>STAGE BUILDER</Text>
      <TextInput accessibilityLabel="Stage name" style={ui.input} value={name} maxLength={100} onChangeText={setName} />
      <View style={styles.controls}><Button title={saving ? 'Saving...' : 'Save'} disabled={saving || dragging} onPress={() => void save()} /><Button title="Close" disabled={saving || dragging} onPress={() => navigation.canGoBack() ? router.back() : router.replace('/planner')} /></View>
      <Text style={styles.status}>{dirty ? 'UNSAVED CHANGES' : 'SAVED'}{saveMessage ? ' / ' + saveMessage : ''}</Text>
      <Text style={styles.status}>{stage.stage.width / 12} x {stage.stage.depth / 12} FT | {viewMode === 'topDown' ? Math.round(viewport.zoom * 100) + '% | GRID 12/6 IN | ' + (routeMode ? 'ROUTE / FREE DRAG' : 'SNAP ' + (snapping.enabled ? snapping.gridIncrement + ' IN' : 'OFF')) : 'SPATIAL PREVIEW'}</Text>
      <View style={styles.controls}>
        <Button title="Stage editing" disabled={dragging || !routeMode} onPress={() => setRouteMode(false)} />
        <Button title="Route planning" disabled={dragging || routeMode} onPress={enterRoute} />
      </View>
      <View style={styles.controls}>
        <Button title="TOP DOWN" disabled={dragging || viewMode === 'topDown'} onPress={() => setViewMode('topDown')} />
        <Button title="2.5D" disabled={dragging || viewMode === '25d' || routeMode} onPress={() => setViewMode('25d')} />
        {viewMode === 'topDown' && <>
        <Button title="Zoom -" disabled={viewport.zoom <= MIN_ZOOM || dragging} onPress={() => zoom(1 / 1.25)} />
        <Button title="Zoom +" disabled={viewport.zoom >= MAX_ZOOM || dragging} onPress={() => zoom(1.25)} />
        </>}
      </View>
      {viewMode === '25d' ? <Stage25D stage={stage} selectedId={selectedId} /> : <>
      {!routeMode && <Button title="+ ADD" disabled={dragging} onPress={() => setShowAdd(true)} />}
      <StageViewport stage={stage} viewport={viewport} selectedId={selectedId} snapping={snapping}
        routePlanning={routeMode && plan.route ? { route: plan.route, selectedId: positionId, onSelect: setPositionId, onChange: changeRoute, onDragging: setDragging } : undefined}
        onSelect={setSelectedId} onDragging={setDragging} setStage={setStage} />
      {routeMode && plan.route ? <>
        {!!profileError && <Text>{profileError}</Text>}
        <RoutePanel stage={stage} plan={plan} route={plan.route} profile={profile} selectedId={positionId} select={setPositionId} onChange={changeRoute} />
      </> : <>
      <Text style={styles.status}>{selected ? objectLabel(selected.type).toUpperCase() + ' / ' + selected.rotation + ' DEG' : 'No object selected'}</Text>
      <Text style={styles.description}>FACE SYMBOLS / PHYSICAL SPAN LINES / PORT OPENINGS</Text>
      <SnapControls value={snapping} onChange={setSnapping} disabled={dragging} />
      {editError !== '' && <Text accessibilityLiveRegion="polite">{editError}</Text>}
      <View style={styles.controls}>
        <Button title={"Rotate -" + rotationStep + " deg"} disabled={!selected || dragging} onPress={() => rotate(-rotationStep)} />
        <Button title={"Rotate +" + rotationStep + " deg"} disabled={!selected || dragging} onPress={() => rotate(rotationStep)} />
      </View>
      <Text style={styles.status}>OBJECT ACTIONS</Text>
      <View style={styles.controls}>
        <Button title="Duplicate" disabled={!selected || selected.type === 'start' || dragging} onPress={() => act({ kind: 'duplicate' })} />
        <Button title="Delete" disabled={!selected || selected.type === 'start' || dragging} onPress={() => act({ kind: 'delete' })} />
        <Button title="Reset Positions" disabled={dragging} onPress={() => act({ kind: 'reset' })} />
      </View>
      {selected && <ObjectInspector key={selected.id} item={selected} disabled={dragging} onApply={applyEdit} />}
      </>}
      </>}
      <Button title={showPlanning ? "Hide Loadout / Planning" : "Loadout / Planning"} disabled={dragging} onPress={() => setShowPlanning(value => !value)} />
      {showPlanning && <PlanningPanel plan={plan} stage={stage} onChange={setPlan} />}
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
  screen: { flex: 1, backgroundColor: '#101411' },
  container: { padding: 12, paddingBottom: 100, gap: 4 },
  eyebrow: { color: '#d0b368', fontWeight: 'bold', letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#e1e5db' },
  description: { color: '#a6b0a0', marginTop: 2, marginBottom: 4, fontSize: 10 },
  status: { color: '#d0b368', marginVertical: 4, fontSize: 11, letterSpacing: 0.6 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4 },
  button: { backgroundColor: '#252e27', paddingVertical: 10, paddingHorizontal: 12, minHeight: 44, borderWidth: 1, borderColor: '#465044', borderRadius: 2 },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#e1e5db', fontWeight: 'bold', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
});

