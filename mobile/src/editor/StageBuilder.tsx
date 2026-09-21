import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import type { NavigationAction } from 'expo-router/react-navigation';
import { useRepository } from '@/storage/StorageProvider';
import type { SavedStage } from '@/storage/repository';
import EditorSheet from './EditorSheet';
import { fitViewport, zoomViewport } from './viewportGestures';
import { RoundAssignment } from '@/planning/PlanningPanel';
import { assignRounds, isEngageable } from '@/planning/model';
import ToolIcon from '../ui/ToolIcon';
import type { ToolIconName } from '../ui/ToolIcon';
import { colors, typography } from '../ui/tokens';
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
import { MAX_ZOOM, MIN_ZOOM } from '@/stage/coordinates';
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
  useEffect(() => {
    let active = true;
    repo.loadProfile().then(p => { if (active) setProfile(p.performance); }).catch(e => { if (active) setProfileError(String(e)); });
    return () => { active = false; };
  }, [repo]);
  const changeRoute = (route: StageRoute) => {
    setPlan(current => ({ ...current, route }));
  };
  const enterRoute = () => {
    if (!plan.route) changeRoute(createRoute('route-' + uuid.v4()));
    setRouteMode(true); setRouteVisible(true); setSelectedId(null); setViewMode('topDown');
  };
  const [panel, setPanel] = useState<'edit' | 'plan' | 'view' | 'snap' | 'summary' | 'assign' | 'reload' | 'delete' | 'reset' | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [routeVisible, setRouteVisible] = useState(true);
  const [planSection, setPlanSection] = useState<'loadout' | 'targets' | 'summary'>('loadout');
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
    if (Platform.OS !== 'web' || !shouldInstallBeforeUnload(Platform.OS, dirty)) return;
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
  const zoom = (factor: number) => setViewport((current) => zoomViewport(current, current.zoom * factor, { x: 0, y: 0 }, { width: 0, height: 0 }));

  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
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
    <View style={styles.topbar}>
      <Button title="Back" displayTitle={"\u2039"} compact disabled={saving || dragging} onPress={() => navigation.canGoBack() ? router.back() : router.replace('/planner')} />
      <TextInput accessibilityLabel="Stage name" style={[ui.input, styles.name]} value={name} maxLength={100} onChangeText={setName} />
      <Button title={saving ? 'Saving...' : 'Save'} accent compact disabled={saving || dragging} onPress={() => void save()} />
    </View>
    <View style={styles.readout}>
      <Text style={[styles.status, routeMode && styles.active]}>{routeMode ? 'ROUTE MODE' : viewMode === '25d' ? '2.5D PREVIEW' : 'STAGE EDITOR'}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>{dirty ? 'UNSAVED' + (saveMessage && saveMessage !== 'Saved on this device.' ? ' / ' + saveMessage : '') : saveMessage || 'SAVED'}</Text>
    </View>
    <View style={styles.canvas}>
      {viewMode === '25d' ? <Stage25D stage={stage} selectedId={selectedId} /> :
        <StageViewport stage={stage} viewport={viewport} onViewportChange={setViewport} gridVisible={gridVisible}
          selectedId={selectedId} snapping={snapping} routeEditing={routeMode}
          routePlanning={(routeMode || routeVisible) && plan.route ? { route: plan.route, selectedId: positionId, onSelect: setPositionId, onChange: changeRoute, onDragging: setDragging } : undefined}
          onSelect={setSelectedId} onDragging={setDragging} setStage={setStage} />}
    {selected && !dragging && !routeMode && viewMode === 'topDown' && <View style={styles.context}>
      <View style={styles.readout}><Text style={styles.status}>{objectLabel(selected.type).toUpperCase()}</Text><Button title="Deselect" compact disabled={dragging} onPress={() => setSelectedId(null)} /></View>
      <View style={styles.controls}>
        <Button title="Move" disabled={dragging} onPress={() => setEditError('Drag the selected object, or use EDIT for exact X / Y.')} />
        <Button title="Rotate" disabled={dragging} onPress={() => rotate(rotationStep)} />
        <Button title="Edit" disabled={dragging} onPress={() => setPanel('edit')} />
        <Button title="Duplicate" disabled={dragging || selected.type === 'start'} onPress={() => act({ kind: 'duplicate' })} />
        <Button title="Delete" danger disabled={dragging || selected.type === 'start'} onPress={() => setPanel('delete')} />
      </View>
    </View>}
    </View>
    {viewMode === 'topDown' && <View style={styles.zoomBar}>
      <Button title="-" compact label="Zoom out" disabled={viewport.zoom <= MIN_ZOOM || dragging} onPress={() => zoom(1 / 1.25)} />
      <Text testID="stage-zoom" style={styles.status}>{Math.round(viewport.zoom * 100)}%</Text>
      <Button title="+" compact label="Zoom in" disabled={viewport.zoom >= MAX_ZOOM || dragging} onPress={() => zoom(1.25)} />
      <Button title="Fit" compact disabled={dragging} onPress={() => setViewport(fitViewport())} />
      <Text style={[styles.status, { flex: 1, textAlign: 'right' }]}>{routeMode ? (plan.route?.positions.find(p => p.id === positionId)?.label ?? 'DRAG POSITIONS') : snapping.enabled ? 'SNAP ' + snapping.gridIncrement + ' IN' : 'FREE MOVE'}</Text>
    </View>}
    {!!editError && <Text accessibilityLiveRegion="polite" style={styles.error}>{editError}</Text>}
    <View style={styles.bottomBar}>
      {routeMode ? <>
        <Button title="+ Position" icon="position" displayTitle="Position" disabled={dragging} onPress={() => {
          if (!plan.route) return;
          const id = 'position-' + uuid.v4(); let number = 1;
          while (plan.route.positions.some(p => p.label === 'P' + number)) number++;
          changeRoute({ ...plan.route, positions: [...plan.route.positions, { id, label: 'P' + number, position: { space: 'stage', x: stage.stage.width / 2, y: stage.stage.depth / 2, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] }] });
          setPositionId(id);
        }} />
        <Button title="Assign" icon="targets" active={panel === 'assign'} displayTitle="Targets" label="Assign targets" disabled={dragging || !plan.route?.positions.some(p => p.id === positionId)} onPress={() => setPanel('assign')} />
        <Button title="Reload" icon="reload" active={panel === 'reload'} displayTitle="Reload" disabled={dragging || !plan.route?.positions.some(p => p.id === positionId)} onPress={() => setPanel('reload')} />
        <Button title="Summary" icon="summary" active={panel === 'summary'} displayTitle="Summary" disabled={dragging} onPress={() => setPanel('summary')} />
        <Button title="Exit route" icon="exit" displayTitle="Exit" disabled={dragging} onPress={() => setRouteMode(false)} />
      </> : <>
        <Button title="Add" icon="add" displayTitle="Add" disabled={dragging || viewMode !== 'topDown'} onPress={() => setShowAdd(true)} />
        <Button title="Edit" icon="edit" active={panel === 'edit'} displayTitle="Edit" disabled={dragging || !selected || viewMode !== 'topDown'} onPress={() => setPanel('edit')} />
        <Button title="Route" icon="route" displayTitle="Route" disabled={dragging} onPress={enterRoute} />
        <Button title="Plan" icon="plan" active={panel === 'plan'} displayTitle="Plan" disabled={dragging} onPress={() => setPanel('plan')} />
        <Button title="View" icon="view" active={panel === 'view'} displayTitle="View" disabled={dragging} onPress={() => setPanel('view')} />
      </>}
    </View>
    <EditorSheet title={panel === 'edit' && selected ? objectLabel(selected.type) : ({ edit: 'Edit', plan: 'Plan', view: 'View', snap: 'Grid & snap', summary: 'Route summary', assign: 'Targets', reload: 'Reload', delete: 'Delete object', reset: 'Reset positions' }[panel ?? 'edit'])} visible={panel !== null} close={() => setPanel(null)}>
      {panel === 'edit' && selected && <>
        <ObjectInspector key={selected.id} item={selected} disabled={false} onApply={applyEdit} />
        {isEngageable(selected) && <RoundAssignment key={'rounds-' + selected.id} label={objectLabel(selected.type)} value={plan.engagements[selected.id] ?? 0} onSave={rounds => {
          const result = assignRounds(plan, stage, selected.id, rounds); setEditError(result.error ?? ''); if (!result.error) setPlan(result.plan);
        }} />}
        {!!editError && <Text style={styles.error}>{editError}</Text>}
      </>}
      {panel === 'plan' && <>
        <View style={styles.controls}>{(['loadout', 'targets', 'summary'] as const).map(section => <Button key={section} title={section} active={planSection === section} onPress={() => setPlanSection(section)} />)}</View>
        {planSection === 'summary' ? plan.route ? <RoutePanel section="summary" stage={stage} plan={plan} route={plan.route} profile={profile} selectedId={positionId} select={setPositionId} onChange={changeRoute} /> : <Text>Create a route to see its ammunition summary.</Text> :
          <PlanningPanel section={planSection} plan={plan} stage={stage} onChange={setPlan} />}
      </>}
      {panel === 'view' && <>
        <View style={styles.controls}>
          <Button title="Top Down" active={viewMode === 'topDown'} onPress={() => { setViewMode('topDown'); setPanel(null); }} />
          <Button title="2.5D" active={viewMode === '25d'} onPress={() => { setViewMode('25d'); setPanel(null); }} />
        </View>
        <Button title={'Grid / ' + (gridVisible ? 'ON' : 'OFF')} active={gridVisible} onPress={() => setGridVisible(v => !v)} />
        <Button title={'Route / ' + (routeVisible ? 'ON' : 'OFF')} active={routeVisible} onPress={() => setRouteVisible(v => !v)} />
        <Button title="Fit Stage / Reset View" onPress={() => { setViewport(fitViewport()); setViewMode('topDown'); setPanel(null); }} />
        <Button title="Grid / Snap Settings" onPress={() => setPanel('snap')} />
        <Button title="Reset Positions" danger onPress={() => setPanel('reset')} />
      </>}
      {panel === 'snap' && <SnapControls value={snapping} onChange={setSnapping} disabled={false} />}
      {(panel === 'summary' || panel === 'assign' || panel === 'reload') && plan.route && <>
        {!!profileError && <Text>{profileError}</Text>}
        <RoutePanel section={panel} stage={stage} plan={plan} route={plan.route} profile={profile} selectedId={positionId} select={setPositionId} onChange={changeRoute} />
      </>}
      {(panel === 'delete' || panel === 'reset') && <>
        <Text>{panel === 'delete' ? 'Delete this object and its planning references?' : 'Restore the default stage? This also clears the route and target assignments.'}</Text>
        <Button title="Cancel" onPress={() => setPanel(null)} />
        <Button title={panel === 'delete' ? 'Confirm delete' : 'Confirm reset'} danger onPress={() => { act({ kind: panel }); setPanel(null); }} />
      </>}
    </EditorSheet>
  </SafeAreaView>;
}

function Button({ title, label, onPress, disabled = false, active = false, danger = false, compact = false, accent = false, icon, displayTitle }: { title: string; label?: string; onPress: () => void; disabled?: boolean; active?: boolean; danger?: boolean; compact?: boolean; accent?: boolean; icon?: ToolIconName; displayTitle?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ disabled, selected: active }} disabled={disabled}
    style={({ pressed }) => [styles.button, compact && styles.compact, icon && styles.tool, active && styles.activeButton, danger && styles.danger, pressed && styles.pressed, disabled && styles.disabled]} onPress={onPress}>
    {icon && <ToolIcon name={icon} active={active} />}
    <Text style={[styles.buttonText, icon && styles.toolLabel, (active || accent) && styles.accentText, danger && styles.dangerText]}>{displayTitle ?? title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topbar: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  name: { ...typography.section, flex: 1, minWidth: 0, borderBottomWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 },
  readout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12 },
  canvas: { flex: 1, minHeight: 100, marginHorizontal: 0 },
  zoomBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2 },
  context: { position: 'absolute', bottom: 8, left: 8, right: 8, padding: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.panel },
  bottomBar: { flexDirection: 'row', gap: 0, paddingHorizontal: 4, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.panel },
  title: { ...typography.section, color: colors.text },
  status: { ...typography.category, color: colors.muted, marginVertical: 6, flexShrink: 1 },
  active: { color: colors.accent },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { flexGrow: 1, flexShrink: 1, backgroundColor: colors.secondary, paddingVertical: 10, paddingHorizontal: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  compact: { flexGrow: 0, flexShrink: 0, paddingHorizontal: 12, backgroundColor: 'transparent', borderBottomWidth: 0 },
  tool: { flex: 1, backgroundColor: 'transparent', gap: 4, paddingVertical: 6, paddingHorizontal: 2, minHeight: 54, borderBottomWidth: 0 },
  toolLabel: { fontSize: 10, lineHeight: 14, color: colors.muted, fontWeight: '400' },
  activeButton: { borderColor: colors.accent, backgroundColor: colors.selected },
  danger: { borderColor: colors.danger },
  dangerText: { color: colors.danger },
  accentText: { color: colors.accent },
  pressed: { backgroundColor: colors.selected },
  disabled: { opacity: 0.4 },
  error: { color: colors.text, padding: 8 },
  buttonText: { ...typography.label, color: colors.text, textAlign: 'center' },
});
