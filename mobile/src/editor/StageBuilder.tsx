import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
import { shouldInstallBeforeUnload } from './browserGuards';
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
  const [showPlanning, setShowPlanning] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [viewMode, setViewMode] = useState<'topDown' | '25d'>('topDown');
  const [stage, setStage] = useState<StageDocument>(() => initial?.document ?? createDefaultStage());
  const [stageId, setStageId] = useState(initial?.id), [name, setName] = useState(initial?.name ?? 'Untitled stage');
  const snapshot = JSON.stringify({ name, stage, plan });
  const [savedSnapshot, setSavedSnapshot] = useState(initial ? snapshot : '');
  const [saving, setSaving] = useState(false), savingRef = useRef(false), [saveMessage, setSaveMessage] = useState('');
  const [showAdd, setShowAdd] = useState(false), [pendingExit, setPendingExit] = useState<NavigationAction | null>(null), [allowExit, setAllowExit] = useState(false);
  useEffect(() => {
    let active = true;
    repo.loadProfile().then(p => { if (active) setProfile(p.performance); }).catch(e => { if (active) setProfileError(String(e)); });
    return () => { active = false; };
  }, [repo]);
  const dirty = snapshot !== savedSnapshot;
  usePreventRemove((dirty || saving) && !allowExit, ({ data }) => setPendingExit(data.action));
  useEffect(() => { if (allowExit && pendingExit) navigation.dispatch(pendingExit); }, [allowExit, pendingExit, navigation]);
  useEffect(() => {
    if (!shouldInstallBeforeUnload(Platform.OS, dirty)) return;
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
  const changeRoute = (route: StageRoute) => { setPlan(current => ({ ...current, route })); };
  const enterRoute = () => { if (!plan.route) changeRoute(createRoute('route-' + uuid.v4())); setRouteMode(true); setViewMode('topDown'); };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [snapping, setSnapping] = useState<SnapSettings>({ ...DEFAULT_SNAPPING });
  const [editError, setEditError] = useState('');
  const [dragging, setDragging] = useState(false);
  const selected = stage.objects.find((object) => object.id === selectedId);
  useEffect(() => { if (selectedId && !selected) setSelectedId(validSelection(stage, selectedId)); }, [selectedId, selected]);

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
  const rotate = (degrees: number) => { if (selected) setEditError(applyEdit({ rotation: selected.rotation + degrees }) ?? ''); };
  const zoom = (factor: number) => setViewport((current) => ({ ...current, zoom: clampZoom(current.zoom * factor) }));
  const fitView = () => setViewport({ zoom: 1, pan: { x: 0, y: 0 } });

  return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
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
    <View style={styles.shell}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => navigation.canGoBack() ? router.back() : router.replace('/planner')} style={styles.topButton}>
          <Text style={styles.topButtonText}>{'< BACK'}</Text>
        </Pressable>
        <TextInput accessibilityLabel="Stage name" style={styles.nameInput} value={name} maxLength={100} onChangeText={setName} />
        <Pressable accessibilityRole="button" disabled={saving || dragging} onPress={() => void save()} style={[styles.topButton, styles.primaryButton, saving && styles.disabledButton]}>
          <Text style={styles.topButtonText}>{saving ? 'SAVING...' : 'SAVE'}</Text>
        </Pressable>
      </View>
      {routeMode && <View style={styles.modeBanner}><Text style={styles.modeText}>ROUTE MODE</Text></View>}
      <View style={styles.mainStage}>
        {viewMode === '25d' ? <Stage25D stage={stage} selectedId={selectedId} /> : <StageViewport stage={stage} viewport={viewport} selectedId={selectedId} snapping={snapping}
          routePlanning={routeMode && plan.route ? { route: plan.route, selectedId: positionId, onSelect: setPositionId, onChange: changeRoute, onDragging: setDragging } : undefined}
          onSelect={setSelectedId} onDragging={setDragging} onViewportChange={setViewport} setStage={setStage} />}
      </View>
      {selected && <View style={styles.contextBar}>
        <ActionChip label="MOVE" onPress={() => {}} />
        <ActionChip label="ROTATE" onPress={() => rotate(rotationStep)} />
        <ActionChip label="EDIT" onPress={() => setShowInspector(true)} />
        <ActionChip label="DUPLICATE" onPress={() => act({ kind: 'duplicate' })} />
        <ActionChip label="DELETE" danger onPress={() => act({ kind: 'delete' })} />
      </View>}
      {showInspector && selected && <View style={styles.bottomSheet}><ObjectInspector item={selected} disabled={dragging} onApply={applyEdit} /></View>}
      {routeMode && plan.route ? <RoutePanel stage={stage} plan={plan} route={plan.route} profile={profile} selectedId={positionId} select={setPositionId} onChange={changeRoute} /> : !routeMode && showPlanning && <PlanningPanel plan={plan} stage={stage} onChange={setPlan} />}
      {routeMode && plan.route && !!profileError && <Text style={styles.status}>{profileError}</Text>}
      {editError !== '' && <Text accessibilityLiveRegion="polite" style={styles.status}>{editError}</Text>}
      {!routeMode && <View style={styles.zoomBar}>
        <Pressable accessibilityRole="button" onPress={() => setViewMode('topDown')} style={[styles.zoomButton, viewMode === 'topDown' && styles.activeButton]}><Text style={styles.zoomText}>TOP DOWN</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setViewMode('25d')} style={[styles.zoomButton, viewMode === '25d' && styles.activeButton]}><Text style={styles.zoomText}>2.5D</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setViewport(current => ({ ...current, zoom: clampZoom(current.zoom / 1.25) }))} disabled={viewport.zoom <= MIN_ZOOM} style={[styles.zoomButton, viewport.zoom <= MIN_ZOOM && styles.disabledButton]}><Text style={styles.zoomText}>−</Text></Pressable>
        <Text style={styles.zoomValue}>{Math.round(viewport.zoom * 100)}%</Text>
        <Pressable accessibilityRole="button" onPress={() => setViewport(current => ({ ...current, zoom: clampZoom(current.zoom * 1.25) }))} disabled={viewport.zoom >= MAX_ZOOM} style={[styles.zoomButton, viewport.zoom >= MAX_ZOOM && styles.disabledButton]}><Text style={styles.zoomText}>+</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={fitView} style={styles.zoomButton}><Text style={styles.zoomText}>FIT</Text></Pressable>
      </View>}
      <View style={styles.bottomBar}>
        {!routeMode ? <>
          <Pressable accessibilityRole="button" onPress={() => setShowAdd(true)} style={styles.bottomAction}><Text style={styles.bottomActionText}>ADD</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setShowInspector(true)} disabled={!selected} style={[styles.bottomAction, !selected && styles.disabledButton]}><Text style={styles.bottomActionText}>EDIT</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={enterRoute} style={styles.bottomAction}><Text style={styles.bottomActionText}>ROUTE</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setShowPlanning(value => !value)} style={styles.bottomAction}><Text style={styles.bottomActionText}>PLAN</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setViewMode('topDown')} style={styles.bottomAction}><Text style={styles.bottomActionText}>VIEW</Text></Pressable>
        </> : <>
          <Pressable accessibilityRole="button" onPress={() => setRouteMode(false)} style={styles.bottomAction}><Text style={styles.bottomActionText}>EXIT ROUTE</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setShowPlanning(true)} style={styles.bottomAction}><Text style={styles.bottomActionText}>SUMMARY</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => {}} style={styles.bottomAction}><Text style={styles.bottomActionText}>+ POSITION</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => {}} style={styles.bottomAction}><Text style={styles.bottomActionText}>TARGETS</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => {}} style={styles.bottomAction}><Text style={styles.bottomActionText}>RELOAD</Text></Pressable>
        </>}
      </View>
    </View>
  </SafeAreaView>;
}

function ActionChip({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.contextButton, danger && styles.dangerButton]}><Text style={[styles.contextText, danger && styles.dangerText]}>{label}</Text></Pressable>;
}

function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} style={[styles.button, disabled && styles.disabledButton]} onPress={onPress}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090b0c' },
  shell: { flex: 1, backgroundColor: '#090b0c', paddingHorizontal: 10, paddingTop: 8 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  topButton: { paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#465044', backgroundColor: '#121618', minWidth: 70 },
  primaryButton: { backgroundColor: '#c0a46b' },
  topButtonText: { color: '#e8ebe6', fontWeight: '700', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  nameInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#465044', backgroundColor: '#121618', color: '#e8ebe6', paddingHorizontal: 12 },
  modeBanner: { backgroundColor: '#191e21', borderWidth: 1, borderColor: '#465044', paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8 },
  modeText: { color: '#c0a46b', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  mainStage: { flex: 1, minHeight: 420, marginBottom: 8 },
  contextBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  contextButton: { backgroundColor: '#121618', borderWidth: 1, borderColor: '#465044', paddingVertical: 10, paddingHorizontal: 12, minHeight: 40 },
  contextText: { color: '#e8ebe6', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  dangerButton: { borderColor: '#7f4a45', backgroundColor: '#1d1516' },
  dangerText: { color: '#d98f81' },
  bottomSheet: { backgroundColor: '#121618', borderTopWidth: 1, borderColor: '#465044', paddingTop: 8, marginBottom: 8 },
  zoomBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  zoomButton: { backgroundColor: '#121618', borderWidth: 1, borderColor: '#465044', paddingVertical: 10, paddingHorizontal: 12, minHeight: 40 },
  activeButton: { borderColor: '#c0a46b', backgroundColor: '#191e21' },
  zoomText: { color: '#e8ebe6', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  zoomValue: { minWidth: 50, textAlign: 'center', color: '#e8ebe6', fontWeight: '700', fontSize: 11 },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, gap: 6 },
  bottomAction: { flex: 1, backgroundColor: '#121618', borderWidth: 1, borderColor: '#465044', paddingVertical: 12, minHeight: 46, alignItems: 'center' },
  bottomActionText: { color: '#e8ebe6', fontWeight: '700', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  disabledButton: { opacity: 0.45 },
  button: { backgroundColor: '#121618', paddingVertical: 10, paddingHorizontal: 12, minHeight: 44, borderWidth: 1, borderColor: '#465044' },
  buttonText: { color: '#e8ebe6', fontWeight: '700', fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#e8ebe6' },
  status: { color: '#c0a46b', marginVertical: 4, fontSize: 11, letterSpacing: 0.6 },
});

