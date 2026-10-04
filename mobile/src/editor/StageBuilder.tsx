import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import type { NavigationAction } from 'expo-router/react-navigation';
import { useRepository } from '@/storage/StorageProvider';
import type { SavedStage } from '@/storage/repository';
import EditorSheet from './EditorSheet';
import { fitViewport, zoomViewport } from './viewportGestures';
import { RoundAssignment } from '@/planning/PlanningPanel';
import { assignRounds, isEngageable, targetLabel } from '@/planning/model';
import ToolIcon from '../ui/ToolIcon';
import type { ToolIconName } from '../ui/ToolIcon';
import { colors, typography } from '../ui/tokens';
import { ui } from '@/ui/kit';
import AddMenu from './AddMenu';
import Text from '@/editor/FieldText';
import { uuid } from 'expo-modules-core';
import PlanningPanel from '@/planning/PlanningPanel';
import EngagementDetails from '@/planning/EngagementDetails';
import RouteAnalysis from '@/planning/RouteAnalysis';
import EngagementSettings from '@/planning/EngagementSettings';
import EngagementPanel from '@/planning/EngagementPanel';
import { evaluateRoute, reorderPosition } from '@/planning/route';
import { defaultRouteLayers, meaningfulRoute } from './routePresentation';
import RoutePanel from '@/planning/RoutePanel';
import AutoPlannerPanel from '@/planning/AutoPlannerPanel';
import { currentDiscovery } from '@/planning/positionSources';
import type { DiscoverySession } from '@/planning/positionSources';
import { plannerPreviewRoute } from '@/planning/plannerUI';
import type { PlannerCard } from '@/planning/plannerUI';
import { createRoute, toggleRouteTarget } from '@/planning/route';
import type { TargetAssignmentMode, StageRoute } from '@/planning/route';
import type { ShooterPerformanceProfile } from '@/profile/model';
import { reconcilePlan } from '@/planning/model';
import Stage25D from '@/editor/Stage25D';
import StageViewport from '@/editor/StageViewport';
import SnapControls from '@/editor/SnapControls';
import ObjectInspector from '@/editor/ObjectInspector';
import { DEFAULT_SNAPPING } from '@/stage/snapping';
import type { SnapSettings } from '@/stage/snapping';
import type { ObjectEdit } from '@/stage/operations';
import { MAX_ZOOM, MIN_ZOOM } from '@/stage/coordinates';
import type { ViewportState } from '@/stage/coordinates';
import { applyObjectAction, validSelection } from '@/editor/objectActions';
import type { ObjectAction } from '@/editor/objectActions';
import { shouldInstallBeforeUnload } from './browserGuards';
import { objectLabel } from '@/stage/model';
import type { StageDocument } from '@/stage/model';
import { editObject } from '@/stage/operations';
import { OperationGate } from '../training/operationGate';
import StageSettings from './StageSettings';
import { formatLength } from '../stage/measurements';
import { useDocumentHistory } from './useDocumentHistory';
import { placeTarget, rotateTarget, isTarget } from '../stage/targetPlacement';
import { targetPreset } from '../stage/targetPresets';
import { addSegment, endpoints, isSegment, editSegmentMetrics, segmentMetrics, snapEndpoint } from '../stage/segments';
import type { DesignerTool } from './designerTools';
import { formatYards } from '../stage/measurements';
import { outsideStage } from '../stage/resize';
import type { StagePosition } from '../stage/coordinates';
import type { TargetFamily } from '../stage/targetFamily';

export default function StageBuilder({ initial, targetFamily }: { initial: SavedStage; targetFamily: TargetFamily }) {
  const repo = useRepository(), navigation = useNavigation();
  const saveOperation = useRef(new OperationGate());
  useEffect(() => { saveOperation.current.activate(); return () => saveOperation.current.dispose(); }, []);
  const documentHistory = useDocumentHistory(initial.document, initial.plan);
  const { stage, plan, setStage, setPlan } = documentHistory;
  const [assignmentMode, setAssignmentMode] = useState<TargetAssignmentMode | null>(null);
  const [discoverySession, setDiscoverySession] = useState<DiscoverySession | null>(null);
  const [discoveryPreview, setDiscoveryPreview] = useState(false);
  const [preview, setPreview] = useState<PlannerCard | null>(null);
  useEffect(() => {
    if (!preview && !discoveryPreview) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { setPreview(null); setDiscoveryPreview(false); return true; });
    return () => back.remove();
  }, [preview, discoveryPreview]);
  const [routeMode, setRouteMode] = useState(false);
  const [routeEditing, setRouteEditing] = useState(false);
  const [layers, setLayers] = useState(defaultRouteLayers);
  const [nodeId, setNodeId] = useState<string | null>(null);
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
  const [panel, setPanel] = useState<'settings' | 'edit' | 'plan' | 'view' | 'snap' | 'summary' | 'assign' | 'reload' | 'delete' | 'reset' | 'aiPlan' | 'more' | 'draw' | 'rules' | 'waypoint' | 'order' | 'resetRoute' | 'deleteWaypoint' | 'engagement' | null>(null);
  const [focusPosition, setFocusPosition] = useState<StagePosition | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [routeVisible, setRouteVisible] = useState(true);
  const [planSection, setPlanSection] = useState<'loadout' | 'targets'>('loadout');
  const [viewMode, setViewMode] = useState<'topDown' | '25d'>('topDown');

  const discovered = currentDiscovery(stage, discoverySession);
  const previewing = !!preview || discoveryPreview;
  useEffect(() => { setPreview(null); setDiscoveryPreview(false); }, [stage, plan, profile]);
  const stageId = initial.id;
  const [name, setName] = useState(initial.name);
  const snapshot = JSON.stringify({ name, stage, plan });
  const [savedSnapshot, setSavedSnapshot] = useState(initial ? snapshot : '');
  const [saving, setSaving] = useState(false), [saveMessage, setSaveMessage] = useState('');
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
    const token = saveOperation.current.begin(); if (token === null) return;
    setSaving(true); setSaveMessage('');
    try {
      await repo.saveStage(stageId, name, stage, plan);
      if (!saveOperation.current.current(token)) return;
      setSavedSnapshot(snapshot); setSaveMessage('Saved on this device.');
    } catch (e) { if (saveOperation.current.current(token)) setSaveMessage(String(e)); }
    finally { if (saveOperation.current.current(token)) setSaving(false); saveOperation.current.finish(token); }
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [snapping, setSnapping] = useState<SnapSettings>({ ...DEFAULT_SNAPPING });
  const [editError, setEditError] = useState('');
  const [dragging, setDragging] = useState(false);
  useEffect(() => { setAssignmentMode(null); }, [routeMode, positionId]);
  const selected = stage.objects.find((object) => object.id === selectedId);
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(validSelection(stage, selectedId));
  }, [selectedId, selected]);

  const [tool, setTool] = useState<DesignerTool>('select');
  const [placement, setPlacement] = useState<{ id: string; noShoot: boolean } | null>(null);
  const [draft, setDraft] = useState<{ start: StagePosition; end: StagePosition } | null>(null);
  const draftRef = useRef(draft);
  const [chain, setChain] = useState<string[]>([]);
  const [snapRule, setSnapRule] = useState('');
  const updateDraft = (value: typeof draft) => { draftRef.current = value; setDraft(value); };
  const switchTool = (next: DesignerTool) => { updateDraft(null); setChain([]); setTool(next); setSelectedId(null); setEditError(''); };
  useEffect(() => { if (routeMode || previewing || viewMode !== 'topDown' || panel || showAdd) { setTool('select'); updateDraft(null); setChain([]); } }, [routeMode, previewing, viewMode, panel, showAdd]);
  const onDragging = (value: boolean) => { if (value) documentHistory.begin(); else documentHistory.end(); setDragging(value); };
  const draw = (phase: 'start' | 'preview' | 'commit' | 'cancel', point: StagePosition) => {
    if (phase === 'cancel') { updateDraft(null); return; }
    const current = draftRef.current;
    const snapped = snapEndpoint(stage, point, current?.start ?? null, snapping); setSnapRule(snapped.rule);
    if (!current) { if (phase === 'start') updateDraft({ start: snapped.point, end: snapped.point }); return; }
    if (phase !== 'commit') { updateDraft({ ...current, end: snapped.point }); return; }
    const id = uuid.v4(), result = addSegment(stage, tool === 'wall' ? 'wall' : 'faultLine', id, current.start, snapped.point);
    setEditError(result.error ?? '');
    if (!result.error) { setStage(result.stage); setChain(ids => [...ids,id]); updateDraft({ start: snapped.point, end: snapped.point }); }
  };
  const undoSegment = () => {
    const id = chain.at(-1), object = stage.objects.find(o => o.id === id); if (!object || !isSegment(object)) return;
    setStage({ ...stage, objects: stage.objects.filter(o => o.id !== id) }); setChain(chain.slice(0,-1));
    const start = endpoints(object).start; updateDraft({ start, end: start });
  };
  const act = (action: ObjectAction) => {
    documentHistory.begin();
    const result = applyObjectAction(stage, selectedId, action, uuid.v4);
    setPlan(current => action.kind === 'reset' ? { ...current, engagements: {}, route: undefined } : reconcilePlan(current, result.stage));
    setStage(result.stage);
    documentHistory.end();
    setSelectedId(result.selectedId);
    setEditError(result.error ?? '');
  };
  const applyEdit = (edit: ObjectEdit): string | null => {
    if (!selected) return 'Select an object first.';
    const onlyRotation = edit.rotation !== undefined && !edit.position && !edit.geometry && !edit.ports && !edit.faceCut;
    const segmentNumeric = isSegment(selected) && !edit.position && !edit.ports && (edit.rotation !== undefined || edit.geometry?.length !== undefined) && Object.keys(edit.geometry ?? {}).every(k => k === 'length');
    const result = isTarget(selected) && onlyRotation ? rotateTarget(stage, selected.id, edit.rotation!)
      : isSegment(selected) && segmentNumeric ? editSegmentMetrics(stage, selected, edit.geometry?.length ?? selected.geometry.length, edit.rotation ?? selected.rotation)
      : editObject(stage, selected.id, edit, snapping.enabled ? snapping.rotationIncrement : null);
    if (result.error) return result.error;
    setStage(result.stage);
    setEditError('');
    return null;
  };
  const selectedWaypoint = plan.route?.positions.find(p => p.id === positionId);
  const routeEvaluation = useMemo(() => plan.route ? evaluateRoute(stage, plan, plan.route, profile) : null, [stage, plan, profile]);
  const rotationStep = snapping.enabled ? (snapping.rotationIncrement ?? 15) : 15;
  const rotate = (degrees: number) => {
    if (selected) setEditError(applyEdit({ rotation: selected.rotation + degrees }) ?? '');
  };
  const zoom = (factor: number) => setViewport((current) => zoomViewport(current, current.zoom * factor, { x: 0, y: 0 }, { width: 0, height: 0 }));

  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
    <AddMenu visible={showAdd} targetFamily={targetFamily} close={() => setShowAdd(false)} choose={(id, noShoot) => { setPlacement({ id, noShoot }); switchTool('target'); }} selectStart={() => { switchTool('select'); setSelectedId(stage.objects.find(object => object.type === 'start')?.id ?? null); }} />
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
      <Button title="Back" displayTitle={"\u2039"} compact disabled={saving || dragging} onPress={() => previewing ? (setPreview(null), setDiscoveryPreview(false)) : router.dismissTo({ pathname: '/match', params: { id: initial.matchId } })} />
      <TextInput accessibilityLabel="Stage name" style={[ui.input, styles.name]} editable={!previewing} value={name} maxLength={100} onChangeText={setName} />
      <Button title={saving ? 'Saving...' : 'Save'} accent compact disabled={saving || dragging || previewing} onPress={() => void save()} />
    </View>
    <View style={styles.readout}>
      <Text style={[styles.status, routeMode && styles.active]}>{discoveryPreview ? 'AUTO POSITIONS / READ ONLY' : preview ? 'CANDIDATE PREVIEW / READ ONLY' : routeMode ? 'ROUTE MODE' : viewMode === '25d' ? '2.5D PREVIEW' : 'STAGE EDITOR'}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>{dirty ? 'UNSAVED' + (saveMessage && saveMessage !== 'Saved on this device.' ? ' / ' + saveMessage : '') : saveMessage || 'SAVED'}</Text>
    </View>
    {<View style={styles.controls}>
      <Button title="BUILD" active={!routeMode} disabled={dragging || previewing} onPress={() => { setRouteMode(false); setRouteEditing(false); setPanel(null); setViewMode('topDown'); switchTool('select'); }} />
      <Button title="ROUTE" active={routeMode} disabled={dragging || previewing} onPress={() => { switchTool('select'); setPanel(null); enterRoute(); }} />
    </View>}
    {!previewing && !routeMode && viewMode === 'topDown' && <>
      {(tool === 'target' || tool === 'wall' || tool === 'faultLine') && <View style={{ padding: 8, gap: 4 }}>
        <Text>{tool === 'target' ? (placement?.noShoot ? 'No-shoot / ' : '') + (targetPreset(placement?.id ?? '')?.name ?? '') + ' / Tap to place' : (tool === 'wall' ? 'Draw Wall' : 'Draw Fault Line') + ' / Tap start, drag or tap endpoint'}</Text>
        {draft && <Text>{formatYards(segmentMetrics(draft.start,draft.end).length)} ({formatLength(segmentMetrics(draft.start,draft.end).length)}) / {segmentMetrics(draft.start,draft.end).angle.toFixed(1)}° / {snapRule}</Text>}
        <View style={styles.controls}>
          <Button title="Done" disabled={dragging} onPress={() => switchTool('select')} />
          {tool !== 'target' && <><Button title="UNDO SEGMENT" disabled={dragging || !chain.length} onPress={undoSegment} /><Button title="Cancel current segment" disabled={dragging || !draft} onPress={() => updateDraft(null)} /><Button title={snapping.enabled ? 'Snap ON' : 'Snap OFF'} disabled={dragging} onPress={() => setSnapping(s => ({ ...s, enabled: !s.enabled }))} /></>}
        </View>
      </View>}
    </>}
    {routeMode && !previewing && !meaningfulRoute(plan.route) && <View style={{ padding: 8, gap: 4 }}><Text>No route planned yet.</Text><Button title="GENERATE ROUTE" onPress={() => setPanel('aiPlan')} /><Button title="Edit Manually" onPress={() => setRouteEditing(true)} /></View>}
    {routeMode && !previewing && meaningfulRoute(plan.route) && <Text style={styles.status}>{formatYards(routeEvaluation?.distance ?? 0)} / {plan.route?.positions.length} waypoints</Text>}
    <View style={styles.canvas}>
      {viewMode === '25d' ? <Stage25D stage={stage} selectedId={selectedId} /> :
        <StageViewport tool={tool} draft={draft} onDraw={draw} onPlace={point => {
          if (!placement) return;
          const result = placeTarget(stage,placement.id,uuid.v4(),point,placement.noShoot); setEditError(result.error ?? ''); if (!result.error) setStage(result.stage);
        }} stage={stage} viewport={viewport} onViewportChange={setViewport} gridVisible={routeMode ? layers.grid : gridVisible} focusPosition={focusPosition}
          selectedId={selectedId} snapping={snapping} routeEditing={routeMode} readOnly={previewing} autoPositions={discoveryPreview ? discovered?.candidates : undefined}
          routePlanning={discoveryPreview ? undefined : preview ? { preview: true, route: plannerPreviewRoute(plan, preview)!, selectedId: null, onSelect: () => {}, onChange: () => {}, onDragging: () => {} } : (routeMode || routeVisible) && plan.route ? { assignmentMode: routeMode ? assignmentMode : null, onTargetTap: id => {
            if (!assignmentMode || !positionId) return;
            setPlan(current => current.route ? { ...current, route: toggleRouteTarget(current.route, stage, positionId, id, assignmentMode) } : current);
          }, layers, selectedNodeId: nodeId, editing: routeEditing, onNodeSelect: (id, node) => { setPositionId(id); setNodeId(node); setPanel('engagement'); }, route: plan.route, selectedId: positionId, onSelect: id => { setPositionId(id); setNodeId(null); }, onChange: changeRoute, onDragging } : undefined}
          onSelect={setSelectedId} onDragging={onDragging} setStage={setStage} />}
    {viewMode === 'topDown' && <View style={{ position: 'absolute', top: 8, right: 8 }}><Button title="Fit" compact disabled={dragging} onPress={() => setViewport(fitViewport())} /></View>}
    {!previewing && routeMode && selectedWaypoint && !assignmentMode && <View style={styles.context}><Button title={'WAYPOINT ' + (plan.route!.positions.indexOf(selectedWaypoint) + 1)} onPress={() => setPanel('waypoint')} /></View>}
    {!previewing && routeMode && assignmentMode && <View style={styles.context}>
      <Text style={styles.status}>{plan.route?.positions.find(p => p.id === positionId)?.label} / TAP TO TOGGLE {assignmentMode.toUpperCase()} TARGETS</Text>
      <View style={styles.controls}>
        <Button title="Visible targets" active={assignmentMode === 'visible'} onPress={() => setAssignmentMode('visible')} />
        <Button title="Engaged targets" active={assignmentMode === 'engaged'} onPress={() => setAssignmentMode('engaged')} />
        <Button title="Done" onPress={() => setAssignmentMode(null)} />
      </View>
    </View>}
    {!previewing && selected && tool === 'select' && !dragging && !routeMode && viewMode === 'topDown' && <View style={styles.context}>
      <View style={styles.readout}><Text style={styles.status}>{objectLabel(selected.type).toUpperCase()}</Text><Button title="Deselect" compact disabled={dragging} onPress={() => setSelectedId(null)} /></View>
      <View style={styles.controls}>
          <Button title={isSegment(selected) ? "Endpoints" : "Rotate"} disabled={dragging} onPress={() => isSegment(selected) ? setFocusPosition({ ...selected.position }) : rotate(rotationStep)} />
        <Button title="Edit" disabled={dragging} onPress={() => setPanel('edit')} />
        <Button title="Duplicate" disabled={dragging || selected.type === 'start'} onPress={() => act({ kind: 'duplicate' })} />
        <Button title="Delete" danger disabled={dragging || selected.type === 'start'} onPress={() => setPanel('delete')} />
      </View>
    </View>}
    </View>

    {!!editError && <Text accessibilityLiveRegion="polite" style={styles.error}>{editError}</Text>}
    <View style={[styles.bottomBar, !routeMode && !previewing && (tool === 'target' || tool === 'wall' || tool === 'faultLine') && { display: 'none' }]}>
      {discoveryPreview ? <View style={{ flex: 1, gap: 4 }}><Text>Amber squares: {discovered?.candidates.length ?? 0} discovered positions. Pan or zoom to inspect.</Text><Button title="Back to planner" onPress={() => setDiscoveryPreview(false)} /></View> : preview ? <View style={{ flex: 1, gap: 4 }}><Text style={styles.status}>Candidate {preview.number} / {preview.label}{preview.personalizedFallback ? ' / Balanced fallback' : ''}</Text><Text>Cyan: path / Thin lines: assigned targets / White: moving reload / R: reload</Text><Button title="Back to results" icon="exit" onPress={() => setPreview(null)} /></View> : routeMode && routeEditing ? <>
          <Button title="ADD POINT" icon="position" displayTitle="Add point" disabled={dragging} onPress={() => {
          if (!plan.route) return;
          const id = 'position-' + uuid.v4(); let number = 1;
          while (plan.route.positions.some(p => p.label === 'P' + number)) number++;
          changeRoute({ ...plan.route, positions: [...plan.route.positions, { id, label: 'P' + number, position: { space: 'stage', x: stage.stage.width / 2, y: stage.stage.depth / 2, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] }] });
          setPositionId(id);
        }} />

          <Button title="MOVE" onPress={() => setPanel(null)} />
          <Button title="DELETE" danger disabled={!selectedWaypoint} onPress={() => setPanel('deleteWaypoint')} />
          <Button title="ORDER" onPress={() => setPanel('order')} />
          <Button title="DONE" onPress={() => { setRouteEditing(false); setAssignmentMode(null); }} />
        </> : routeMode ? <>
        <Button title="PLAN" onPress={() => setPanel('aiPlan')} />
        <Button title="EDIT" active={routeEditing} onPress={() => { setRouteEditing(true); setPanel(null); }} />
        <Button title="ANALYZE" onPress={() => setPanel('summary')} />
        <Button title="&#8226;&#8226;&#8226;" label="Route tools" onPress={() => setPanel('more')} />
      </> : <>
        <Button title="SELECT" active={tool === 'select'} disabled={dragging} onPress={() => switchTool('select')} />
        <Button title="ADD" disabled={dragging || viewMode !== 'topDown'} onPress={() => setShowAdd(true)} />
        <Button title="DRAW" disabled={dragging || viewMode !== 'topDown'} onPress={() => setPanel('draw')} />
        <Button title="&#8226;&#8226;&#8226;" label="Stage tools" disabled={dragging} onPress={() => setPanel('more')} />
      </>}
    </View>
    <EditorSheet title={panel === 'edit' && selected ? objectLabel(selected.type) : ({ settings: 'Stage Settings', aiPlan: 'PLAN ROUTE', edit: 'Edit', plan: 'Plan', view: 'View', snap: 'Grid & snap', summary: 'Route Analysis', assign: 'Targets', reload: 'Reload', delete: 'Delete object', reset: 'Reset Stage', more: routeMode ? 'Route tools' : 'Stage tools', draw: 'Draw', rules: 'Route Settings', waypoint: 'Waypoint', order: 'Engagement order', resetRoute: 'Reset Route', deleteWaypoint: 'Delete waypoint', engagement: 'Engagement' }[panel ?? 'edit'])} visible={panel !== null && panel !== 'aiPlan'} close={() => setPanel(null)}>
      {panel === 'engagement' && plan.route && <EngagementDetails stage={stage} route={plan.route} nodeId={nodeId} onChange={changeRoute} />}
      {panel === 'rules' && plan.route && <>
        <TextInput accessibilityLabel="Route name" style={ui.input} value={plan.route.name} maxLength={100} onChangeText={name => plan.route && changeRoute({ ...plan.route, name })} />
        <EngagementSettings stage={stage} initial={plan.route.engagementRules} onCancel={() => setPanel('aiPlan')} onApply={rules => { if (plan.route) changeRoute({ ...plan.route, engagementRules: rules }); setPanel('aiPlan'); }} /></>}
      {panel === 'resetRoute' && <><Text>Clear the route, waypoints, reloads and route rules?</Text><Button title="Keep route" onPress={() => setPanel(null)} /><Button title="Confirm reset route" danger onPress={() => { changeRoute(createRoute('route-' + uuid.v4())); setPositionId(null); setPanel(null); }} /></>}
      {panel === 'waypoint' && selectedWaypoint && plan.route && <>
        <Text>WAYPOINT {plan.route.positions.indexOf(selectedWaypoint) + 1}</Text>
        <TextInput accessibilityLabel="Waypoint label" style={ui.input} value={selectedWaypoint.label} maxLength={30} onChangeText={label => { if (plan.route) changeRoute({ ...plan.route, positions: plan.route.positions.map(p => p.id === positionId ? { ...p, label } : p) }); }} />
        <Text>From previous: {formatYards(routeEvaluation?.segments.find(s => s.toId === positionId)?.distance ?? 0)}</Text>
        <Text>To next: {formatYards(routeEvaluation?.segments.find(s => s.fromId === positionId)?.distance ?? 0)}</Text>
        <Text>{selectedWaypoint.engagedTargetIds.length + (selectedWaypoint.movingTargetIds?.length ?? 0)} targets assigned</Text>
        <Button title="TARGETS" onPress={() => setPanel('assign')} />
        <Button title="RELOAD" onPress={() => setPanel('reload')} />
        <Button title="DELETE" danger onPress={() => setPanel('deleteWaypoint')} />
      </>}
      {panel === 'deleteWaypoint' && <><Text>Delete this waypoint and its reload assignment?</Text><Button title="Keep waypoint" onPress={() => setPanel('waypoint')} /><Button title="Confirm delete waypoint" danger onPress={() => { if (plan.route) { changeRoute({ ...plan.route, positions: plan.route.positions.filter(p => p.id !== positionId), reloads: plan.route.reloads.filter(r => r.positionId !== positionId) }); setPositionId(null); setPanel(null); } }} />
      </>}
      {panel === 'order' && plan.route && <>
        <Text>WAYPOINT ORDER</Text>
        {plan.route.positions.map((p, i) => <View key={p.id}><Button title={String(i + 1) + ' ' + p.label} onPress={() => { setPositionId(p.id); setPanel('waypoint'); }} /><View style={styles.controls}><Button title="Earlier" disabled={!i} onPress={() => plan.route && changeRoute(reorderPosition(plan.route, p.id, -1))} /><Button title="Later" disabled={i === plan.route!.positions.length - 1} onPress={() => plan.route && changeRoute(reorderPosition(plan.route, p.id, 1))} /></View></View>)}
        <EngagementPanel stage={stage} route={plan.route} onChange={changeRoute} authoring={false} selectedId={positionId} />
      </>}
      {panel === 'draw' && <>
        <Button title="WALL" onPress={() => { setPanel(null); switchTool('wall'); }} />
        <Button title="FAULT LINE" onPress={() => { setPanel(null); switchTool('faultLine'); }} />
        <Button title={snapping.enabled ? 'Snap ON' : 'Snap OFF'} onPress={() => setSnapping(s => ({ ...s, enabled: !s.enabled }))} />
      </>}
      {panel === 'more' && <>
        {routeMode ? <>
          <Button title="Route Settings" onPress={() => setPanel('rules')} />
          <Button title="Loadout" onPress={() => { setPlanSection('loadout'); setPanel('plan'); }} />
          <Button title="Target Rounds" onPress={() => { setPlanSection('targets'); setPanel('plan'); }} />
          <Button title="Overlay Layers" onPress={() => setPanel('view')} />
          <Button title="Reset Route" danger onPress={() => setPanel('resetRoute')} />
        </> : <>
          <Button title="Stage Dimensions" onPress={() => setPanel('settings')} />
          <Button title="Grid & Snapping" onPress={() => setPanel('snap')} />
          <Button title="2.5D Preview" onPress={() => { setViewMode('25d'); setPanel(null); }} />
          <Button title="Loadout / Target Rounds" onPress={() => setPanel('plan')} />
          <Button title="Pan" onPress={() => { setPanel(null); switchTool('pan'); }} />
          <Button title="Reset Stage" danger onPress={() => setPanel('reset')} />
        </>}
        {!routeMode && <Button title="Overlay / View Settings" onPress={() => setPanel('view')} />}
        <Button title="Zoom out" disabled={viewport.zoom <= MIN_ZOOM} onPress={() => zoom(1 / 1.25)} />
        <Text testID="stage-zoom">{Math.round(viewport.zoom * 100)}%</Text>
        <Button title="Zoom in" disabled={viewport.zoom >= MAX_ZOOM} onPress={() => zoom(1.25)} />
        <Button title="UNDO EDIT" disabled={!documentHistory.canUndo} onPress={() => { updateDraft(null); setChain([]); documentHistory.undo(); }} />
        <Button title="REDO EDIT" disabled={!documentHistory.canRedo} onPress={() => { updateDraft(null); setChain([]); documentHistory.redo(); }} />
      </>}
      {panel === 'settings' && <StageSettings stage={stage} route={plan.route} onApply={setStage} onSelect={item => {
        setViewMode('topDown'); setAssignmentMode(null);
        const position = item.kind === 'object' ? stage.objects.find(o => o.id === item.id)?.position : plan.route?.positions.find(p => p.id === item.id)?.position;
        if (position) setFocusPosition({ ...position });
        if (item.kind === 'object') { setRouteMode(false); setSelectedId(item.id); setPanel('edit'); }
        else { setRouteMode(true); setRouteVisible(true); setPositionId(item.id); setSelectedId(null); setPanel(null); }
      }} />}
      {panel === 'edit' && selected && <>
        <ObjectInspector key={selected.id} item={selected} disabled={false} onApply={applyEdit} advancedContent={isEngageable(selected) && <RoundAssignment key={'rounds-' + selected.id} label={targetLabel(stage, selected.id)} value={plan.engagements[selected.id] ?? 0} onSave={rounds => {
          const result = assignRounds(plan, stage, selected.id, rounds); setEditError(result.error ?? ''); if (!result.error) setPlan(result.plan);
        }} />} />
        {!!editError && <Text style={styles.error}>{editError}</Text>}
      </>}
      {panel === 'summary' && plan.route && <RouteAnalysis stage={stage} plan={plan} route={plan.route} profile={profile} edit={() => { setRouteEditing(true); setPanel(null); }} />}
      {panel === 'plan' && <>
        {routeMode && <Button title="Back to PLAN ROUTE" onPress={() => setPanel('aiPlan')} />}
        <View style={styles.controls}>{(['loadout', 'targets'] as const).map(section => <Button key={section} title={section} active={planSection === section} onPress={() => setPlanSection(section)} />)}</View>
        {<PlanningPanel section={planSection} plan={plan} stage={stage} onChange={setPlan} />}
      </>}
      {panel === 'view' && routeMode && <>
        {(['path', 'waypoints', 'nodes', 'windows', 'targetIds', 'grid'] as const).map(key => <Button key={key} title={({ path: 'Route', waypoints: 'Waypoints', nodes: 'Engagement Nodes', windows: 'Moving Windows', targetIds: 'Target IDs', grid: 'Grid' }[key]) + ' ' + (layers[key] ? 'ON' : 'OFF')} onPress={() => setLayers(l => ({ ...l, [key]: !l[key] }))} />)}
        <Button title={'Target Arrows ' + layers.arrows} onPress={() => setLayers(l => ({ ...l, arrows: l.arrows === 'OFF' ? 'SELECTED' : l.arrows === 'SELECTED' ? 'ALL' : 'OFF' }))} />
      </>}
      {panel === 'view' && !routeMode && <>
        <View style={styles.controls}>
          <Button title="Top Down" active={viewMode === 'topDown'} onPress={() => { setViewMode('topDown'); setPanel(null); }} />
          <Button title="2.5D" active={viewMode === '25d'} onPress={() => { setViewMode('25d'); setPanel(null); }} />
        </View>
        <Button title={'Grid / ' + (gridVisible ? 'ON' : 'OFF')} active={gridVisible} onPress={() => setGridVisible(v => !v)} />
        <Button title={'Route / ' + (routeVisible ? 'ON' : 'OFF')} active={routeVisible} onPress={() => setRouteVisible(v => !v)} />
        <Button title="Fit Stage / Reset View" onPress={() => { setViewport(fitViewport()); setViewMode('topDown'); setPanel(null); }} />
        <Button title="Grid / Snap Settings" onPress={() => setPanel('snap')} />
      </>}

      {panel === 'snap' && <SnapControls value={snapping} onChange={setSnapping} disabled={false} />}
      {(panel === 'assign' || panel === 'reload') && plan.route && <>
        <Button title="Back to waypoint" onPress={() => setPanel('waypoint')} />
        {!!profileError && <Text>{profileError}</Text>}
        <RoutePanel onAssign={mode => { setAssignmentMode(mode); setPanel(null); }} section={panel} stage={stage} plan={plan} route={plan.route} selectedId={positionId} onChange={changeRoute} />
      </>}
      {(panel === 'delete' || panel === 'reset') && <>
        <Text>{panel === 'delete' ? 'Delete this object and its planning references?' : 'Restore the default stage? This also clears the route and target assignments.'}</Text>
        <Button title="Cancel" onPress={() => setPanel(null)} />
        <Button title={panel === 'delete' ? 'Confirm delete' : 'Confirm reset'} danger onPress={() => { act({ kind: panel }); setPanel(null); }} />
      </>}
    </EditorSheet>
    {panel === 'aiPlan' && <AutoPlannerPanel onConfigure={section => { if (section === 'rules') setPanel('rules'); else { setPlanSection(section); setPanel('plan'); } }} discoverySession={discoverySession} onDiscovery={setDiscoverySession} discoveryPreview={discoveryPreview} onDiscoveryPreview={() => setDiscoveryPreview(true)} stage={stage} plan={plan} profile={profile} preview={preview} onPreview={setPreview} onClose={() => { setPreview(null); setDiscoveryPreview(false); setPanel(null); }} onUse={next => { setPreview(null); setRouteEditing(false); setPlan(next); setPositionId(next.route?.positions[0]?.id ?? null); setAssignmentMode(null); setPanel(null); }} />}
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
