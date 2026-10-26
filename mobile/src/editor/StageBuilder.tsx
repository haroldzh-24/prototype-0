import type { EngagementAnchor } from '../planning/manualEngagements';
import DiagramImportScreen from '../diagramImport/DiagramImportScreen';
import { reviewManualRoute } from '../planning/manualRouteReview';
import ManualReviewPanel from './ManualReviewPanel';
import { addManualEngagement, editManualEngagement, deleteManualEngagement, reorderManualEngagement, manualEngagementLabel, routeSections } from '../planning/manualEngagements';
import { setConnection, retainConnections } from '../planning/routeGeometry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
import { ErrorState, ui } from '@/ui/kit';
import { checkStage } from '@/rules/stageCheck';
import AddMenu from './AddMenu';
import Text from '@/editor/FieldText';
import { uuid } from 'expo-modules-core';
import PlanningPanel from '@/planning/PlanningPanel';
import EngagementDetails from '@/planning/EngagementDetails';
import RouteAnalysis from '@/planning/RouteAnalysis';
import EngagementSettings from '@/planning/EngagementSettings';

import { evaluateRoute, reorderPosition } from '@/planning/route';
import { coverageText, defaultRouteLayers, meaningfulRoute, routeTargetCoverage } from './routePresentation';
import RoutePanel from '@/planning/RoutePanel';
import RoutePlannerV2Panel from '@/planning/v2/RoutePlannerV2Panel';
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
import { applyInspectorEdit, applyObjectAction, validSelection } from '@/editor/objectActions';
import type { ObjectAction } from '@/editor/objectActions';
import { shouldInstallBeforeUnload } from './browserGuards';
import { objectLabel } from '@/stage/model';
import type { StageDocument } from '@/stage/model';
import { OperationGate } from '../training/operationGate';
import StageSettings from './StageSettings';
import { useDocumentHistory } from './useDocumentHistory';
import { placeTarget, isTarget } from '../stage/targetPlacement';
import { targetPreset } from '../stage/targetPresets';
import { addSegment, endpoints, isSegment, segmentMetrics, snapEndpoint } from '../stage/segments';
import type { DesignerTool } from './designerTools';
import { formatYards } from '../stage/measurements';
import { outsideStage } from '../stage/resize';
import type { StagePosition } from '../stage/coordinates';
import type { TargetFamily } from '../stage/targetFamily';
import RouteAISheet from '../planning/routeAI/RouteAISheet';
import { RouteAIController } from '../planning/routeAI/controller';
import type { AIState } from '../planning/routeAI/controller';
import { productionAdapter } from '../planning/routeAI/nativeAdapter';
import type { RouteAIAdapter } from '../planning/routeAI/types';
import { createRouteAssistantContext, fingerprint } from '../planning/routeAssistant/context';
import { solverInputFromPlan } from '../planning/routeSolver/adoption';
import type { RouteSolverResult } from '../planning/routeSolver/types';

export default function StageBuilder({ initial, targetFamily, routeAIAdapter }: { initial: SavedStage; targetFamily: TargetFamily; routeAIAdapter?: RouteAIAdapter }) {
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
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [engageMode, setEngageMode] = useState(false);
  const [creationAnchor, setCreationAnchor] = useState<EngagementAnchor | null>(null);
  const [manualEngagementId, setManualEngagementId] = useState<string | null>(null);
  useEffect(() => { if (routeEditing || !routeMode) setEngageMode(false); }, [routeEditing, routeMode]);
  useEffect(() => { if (routeEditing || engageMode || !routeMode) setReviewMode(false); }, [routeEditing, engageMode, routeMode]);
  const [addingPoint, setAddingPoint] = useState(false);
  useEffect(() => { if (!routeEditing || !routeMode) setAddingPoint(false); }, [routeEditing, routeMode]);
  const [layers, setLayers] = useState(defaultRouteLayers);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [positionId, setPositionId] = useState<string | null>(null);
  const [aiOpen,setAIOpen]=useState(false);
  const [aiState,setAIState]=useState<AIState>({availability:'UNKNOWN',messages:[],lifecycle:'IDLE',phase:''});
  const [solverEvidence,setSolverEvidence]=useState<{key:string;result:RouteSolverResult}|null>(null);
  const solverKey=useMemo(()=>fingerprint(solverInputFromPlan(stage,plan)),[stage,plan]);
  const aiContext=useMemo(()=>createRouteAssistantContext(stage,plan,{stageId:initial.id,selectedWaypointId:positionId??undefined,solverResult:solverEvidence?.key===solverKey?solverEvidence.result:undefined}),[initial.id,stage,plan,positionId,solverEvidence,solverKey]);
  const aiLatest=useRef({context:aiContext,documentHistory});aiLatest.current={context:aiContext,documentHistory};
  const [aiController]=useState(()=>new RouteAIController(routeAIAdapter??productionAdapter(),`stage-${initial.id}`,()=>aiLatest.current.context,()=>aiLatest.current.documentHistory.getAssistantHistory(),setAIState,routeAIAdapter?'mock':'on-device'));
  useEffect(()=>{void aiController.initialize();return()=>aiController.dispose();},[aiController]);
  useEffect(()=>{if(!aiState.highlights||aiState.preview)return;const timer=setTimeout(()=>aiController.clearHighlights(),15000);return()=>clearTimeout(timer);},[aiState.highlights,aiState.preview,aiController]);
  const aiPreview=aiState.preview?.sourceRevision===aiContext.revision?aiState.preview:undefined;
  useEffect(()=>{aiController.contextChanged();},[aiContext.revision,aiController]);
  useEffect(()=>{aiController.invalidate();},[initial.id,aiController]);
  useEffect(()=>{if(!routeMode){aiController.invalidate();setAIOpen(false);}},[routeMode,aiController]);
  useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state!=='active')aiController.background();});return()=>listener.remove();},[aiController]);
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
  const [plannerOrigin, setPlannerOrigin] = useState<'aiPlan' | 'planV2'>('aiPlan');
  const [panel, setPanel] = useState<'check' | 'settings' | 'edit' | 'plan' | 'view' | 'snap' | 'summary' | 'assign' | 'reload' | 'delete' | 'reset' | 'aiPlan' | 'planV2' | 'more' | 'draw' | 'rules' | 'waypoint' | 'order' | 'resetRoute' | 'deleteWaypoint' | 'engagement' | 'saveError' | 'manualEngagements' | 'manualTarget' | 'manualEdit' | 'manualCreate' | null>(null);
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
  const [editingName, setEditingName] = useState(false);
  const snapshot = JSON.stringify({ name, stage, plan });
  const [savedSnapshot, setSavedSnapshot] = useState(initial ? snapshot : '');
  const [saving, setSaving] = useState(false), [saveMessage, setSaveMessage] = useState('');
  const [showAdd, setShowAdd] = useState(false), [pendingExit, setPendingExit] = useState<NavigationAction | null>(null), [allowExit, setAllowExit] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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
  const updateDraft = (value: typeof draft) => { draftRef.current = value; setDraft(value); };
  const switchTool = (next: DesignerTool) => { updateDraft(null); setChain([]); setTool(next); setSelectedId(null); setEditError(''); };
  useEffect(() => { if (routeMode || previewing || viewMode !== 'topDown' || panel || showAdd) { setTool('select'); updateDraft(null); setChain([]); } }, [routeMode, previewing, viewMode, panel, showAdd]);
  const onDragging = (value: boolean) => { if (value) documentHistory.begin(); else documentHistory.end(); setDragging(value); };
  const draw = (phase: 'start' | 'preview' | 'commit' | 'cancel', point: StagePosition) => {
    if (phase === 'cancel') { updateDraft(null); return; }
    const current = draftRef.current;
    const snapped = snapEndpoint(stage, point, current?.start ?? null, snapping);
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
    setPlan(current => action.kind === 'reset' ? { ...current, engagements: {}, route: undefined } : reconcilePlan(current, result.stage, { stage, route: current.route }));
    setStage(result.stage);
    documentHistory.end();
    setSelectedId(result.selectedId);
    setEditError(result.error ?? '');
  };
  const applyEdit = (edit: ObjectEdit): string | null => {
    if (!selected) return 'Select an object first.';
    const result = applyInspectorEdit(stage, selected.id, edit, snapping.enabled ? snapping.rotationIncrement : null);
    if (result.error) return result.error;
    setStage(result.stage);
    setEditError('');
    return null;
  };
  const selectedManualEngagement = plan.route?.manualEngagements?.find(e => e.id === manualEngagementId);
  const manualPeers = plan.route?.manualEngagements?.filter(e => e.anchor.kind === 'waypoint' && selectedManualEngagement?.anchor.kind === 'waypoint' && e.anchor.waypointId === selectedManualEngagement.anchor.waypointId) ?? [];
  const manualOrder = manualPeers.findIndex(e => e.id === selectedManualEngagement?.id);
  const selectedWaypoint = plan.route?.positions.find(p => p.id === positionId);
  const manualReview = useMemo(() => reviewManualRoute(stage, plan.route), [stage, plan.route]);
  const highlightReviewEngagement = (entry: typeof manualReview.engagements[number]) => {
    setManualEngagementId(entry.engagement.id);
    if (entry.position) setFocusPosition({ ...entry.position });
  };
  const routeEvaluation = useMemo(() => plan.route ? evaluateRoute(stage, plan, plan.route, profile) : null, [stage, plan, profile]);
  const rotationStep = snapping.enabled ? (snapping.rotationIncrement ?? 15) : 15;
  const rotate = (degrees: number) => {
    if (selected) setEditError(applyEdit({ rotation: selected.rotation + degrees }) ?? '');
  };
  const zoom = (factor: number) => setViewport((current) => zoomViewport(current, current.zoom * factor, { x: 0, y: 0 }, { width: 0, height: 0 }));

  const stageFindings = checkStage(stage, plan.route?.engagementRules, targetFamily);
  const stageFindingCount = stageFindings.filter(f => f.severity !== 'info').length, stageSafety = stageFindings.some(f => f.severity === 'safety');
  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
    <AddMenu visible={showAdd} targetFamily={targetFamily} close={() => setShowAdd(false)} choose={(id, noShoot) => { setPlacement({ id, noShoot }); switchTool('target'); }} selectStart={() => { switchTool('select'); setSelectedId(stage.objects.find(object => object.type === 'start')?.id ?? null); }} />
    <EditorSheet title="Close stage" visible={pendingExit !== null && !allowExit} close={() => setPendingExit(null)}>
      <View style={ui.panel}>
        <Text style={styles.title}>{saving ? 'SAVE IN PROGRESS' : dirty ? 'UNSAVED CHANGES' : 'STAGE SAVED'}</Text>
        <Text>{dirty ? 'Save your work before closing, or discard the changes.' : 'Your stage is saved on this device.'}</Text>
        <Button title="Keep editing" onPress={() => setPendingExit(null)} />
        <Button title={saving ? 'Saving...' : 'Save'} disabled={saving || !dirty} onPress={() => void save()} />
        {saveMessage && saveMessage !== 'Saved on this device.' && <ErrorState title="Stage could not be saved." detail={saveMessage} />}
        <Button title={dirty ? 'Discard changes and close' : 'Close stage'} danger={dirty} disabled={saving} onPress={() => setAllowExit(true)} />
      </View>
    </EditorSheet>
    <EditorSheet title="Stage name" visible={editingName} close={() => setEditingName(false)}>
      <View style={ui.panel}><TextInput accessibilityLabel="Stage name" autoFocus style={ui.input} value={name} maxLength={100} onChangeText={setName} onSubmitEditing={() => setEditingName(false)} /><Text>Use Save in Stage Designer to persist the name.</Text></View>
    </EditorSheet>
    <View style={styles.topbar}>
      <Button title="Back" displayTitle={"\u2039"} compact disabled={saving || dragging} onPress={() => previewing ? (setPreview(null), setDiscoveryPreview(false)) : router.dismissTo({ pathname: '/match', params: { id: initial.matchId } })} />
      <View style={{ flex: 1, minWidth: 0 }}><Pressable accessibilityRole="button" accessibilityLabel="Edit stage name" accessibilityState={{ disabled: previewing }} style={{ minHeight: 44, justifyContent: 'center' }} disabled={previewing} onPress={() => setEditingName(true)}><Text numberOfLines={1} style={styles.name}>{name || 'Untitled stage'}</Text></Pressable><Text accessibilityLiveRegion="polite" style={[styles.status, { color: dirty ? colors.warning : colors.accent }]}>{dirty ? 'UNSAVED' : 'SAVED'}</Text></View>
      {!previewing && <Button title={saving ? 'Saving...' : 'Save'} accent compact disabled={saving || dragging} onPress={() => void save()} />}
    </View>
    {!!saveMessage && saveMessage !== 'Saved on this device.' && <View style={styles.controls}><Text style={styles.error}>Stage could not be saved.</Text><Button title="Save error details" onPress={() => setPanel('saveError')} /></View>}
    {<View style={styles.controls}>
      <Button title="BUILD" active={!routeMode} disabled={dragging || previewing} onPress={() => { setRouteMode(false); setRouteEditing(false); setPanel(null); setViewMode('topDown'); switchTool('select'); }} />
      <Button title="ROUTE" active={routeMode} disabled={dragging || previewing} onPress={() => { switchTool('select'); setPanel(null); enterRoute(); }} />
    </View>}
    {!routeMode && !previewing && <View style={styles.controls}><Button title={stageFindingCount ? `STAGE CHECK · ${stageFindingCount}${stageSafety ? ' SAFETY' : ''}` : 'STAGE CHECK'} danger={stageSafety} disabled={dragging} onPress={() => setPanel('check')} /></View>}
    {routeMode && !previewing && <View style={styles.controls}><Button title="PATH" active={routeEditing} disabled={dragging} onPress={() => { setReviewMode(false); setEngageMode(false); setRouteEditing(true); setPanel(null); }} /><Button title="ENGAGE" active={engageMode} disabled={dragging} onPress={() => { setReviewMode(false); setEngageMode(true); setRouteEditing(false); setAddingPoint(false); setAssignmentMode(null); setPanel(null); }} /><Button title="REVIEW" active={reviewMode} disabled={dragging} onPress={() => { setReviewMode(true); setEngageMode(false); setRouteEditing(false); setAddingPoint(false); setAssignmentMode(null); setPanel(null); }} /></View>}
    {routeMode && !reviewMode && !previewing && !meaningfulRoute(plan.route) && <View style={{ padding: 8, gap: 4 }}><Text>NO ROUTE YET</Text><Button title="PLAN ROUTE" onPress={() => { setPlannerOrigin('planV2'); setPanel('planV2'); }} /><Button title="OPTIMIZE MOVEMENT" onPress={() => { setPlannerOrigin('aiPlan'); setPanel('aiPlan'); }} /><Button title="Edit manually" onPress={() => setRouteEditing(true)} /></View>}
    {routeMode && !reviewMode && !previewing && meaningfulRoute(plan.route) && <Text style={styles.status}>ROUTE{'\n'}{formatYards(routeEvaluation?.distance ?? 0)} {'\u2022'} {plan.route?.positions.length} waypoints {'\u2022'} {coverageText(routeTargetCoverage(stage.objects.filter(isEngageable).map(o => o.id), plan.route, routeEvaluation?.engagementAnalysis?.coveredTargetIds))}</Text>}
    <View style={styles.canvas}>
      {viewMode === '25d' ? <Stage25D stage={stage} selectedId={selectedId} back={() => setViewMode('topDown')} /> :
        <StageViewport manualReview={routeMode && reviewMode && !previewing ? { review: manualReview, selectedTargetId: reviewTargetId, selectedEngagementId: manualEngagementId, onlyUnassigned, onSelectTarget: setReviewTargetId } : undefined} manualEngage={routeMode && engageMode && !previewing ? {
          selectedId: selectedManualEngagement?.id ?? null, onSelect: setManualEngagementId,
          onCreate: (anchor, targetId, direction) => {
            if (!plan.route) return;
            const id = 'engagement-' + uuid.v4();
            changeRoute(addManualEngagement(stage, plan.route, { id, anchor, targetId, direction })); setManualEngagementId(id);
          },
          onDirection: (id, direction) => { if (plan.route) changeRoute(editManualEngagement(stage, plan.route, id, { direction })); },
        } : undefined} onRoutePoint={addingPoint ? point => {
          if (!plan.route || point.x < 0 || point.y < 0 || point.x > stage.stage.width || point.y > stage.stage.depth) return;
          const id = 'position-' + uuid.v4(); let number = 1;
          while (plan.route.positions.some(p => p.label === 'P' + number)) number++;
          changeRoute({ ...plan.route, positions: [...plan.route.positions, { id, label: 'P' + number, position: point, visibleTargetIds: [], engagedTargetIds: [] }] });
          setPositionId(id); setNodeId(null); setAddingPoint(false);
        } : undefined} tool={tool} draft={draft} onDraw={draw} onPlace={point => {
          if (!placement) return;
          const result = placeTarget(stage,placement.id,uuid.v4(),point,placement.noShoot); setEditError(result.error ?? ''); if (!result.error) setStage(result.stage);
        }} routeAI={routeMode?{context:aiContext,preview:aiPreview,highlights:aiState.preview&&!aiPreview?undefined:aiState.highlights}:undefined} stage={stage} viewport={viewport} onViewportChange={setViewport} gridVisible={routeMode ? layers.grid : gridVisible} focusPosition={focusPosition}
          selectedId={selectedId} snapping={snapping} routeEditing={routeMode} readOnly={previewing} autoPositions={discoveryPreview ? discovered?.candidates : undefined}
          routePlanning={discoveryPreview ? undefined : preview ? { preview: true, route: plannerPreviewRoute(plan, preview)!, selectedId: null, onSelect: () => {}, onChange: () => {}, onDragging: () => {} } : (routeMode || routeVisible) && plan.route ? { assignmentMode: routeMode ? assignmentMode : null, onTargetTap: id => {
            if (!assignmentMode || !positionId) return;
            setPlan(current => current.route ? { ...current, route: toggleRouteTarget(current.route, stage, positionId, id, assignmentMode) } : current);
          }, layers: routeEditing || engageMode || reviewMode ? { ...layers, path: true, waypoints: true, nodes: false, windows: false, arrows: 'OFF' as const } : layers, selectedNodeId: nodeId, editing: routeEditing && !engageMode, onNodeSelect: (id, node) => { setPositionId(id); setNodeId(node); setPanel('engagement'); }, route: plan.route, selectedId: positionId, onSelect: id => { setPositionId(id); setNodeId(null); }, onChange: changeRoute, onDragging } : undefined}
          onSelect={setSelectedId} onDragging={onDragging} setStage={setStage} />}
    {!previewing && !routeMode && viewMode === 'topDown' && (tool === 'target' || tool === 'wall' || tool === 'faultLine') && <View style={styles.modeOverlay}>
      <View style={styles.readout}><Text numberOfLines={2} style={[styles.title, { flex: 1 }]}>{tool === 'target' ? (placement?.noShoot ? 'NO-SHOOT / ' : '') + (targetPreset(placement?.id ?? '')?.name ?? '') : tool === 'wall' ? 'WALL' : 'FAULT LINE'}</Text><Button title="DONE" compact disabled={dragging} onPress={() => switchTool('select')} /></View>
      {tool === 'target' ? <Text>Tap to place</Text> : <><Text>{draft ? formatYards(segmentMetrics(draft.start, draft.end).length) + ' \u2022 ' + segmentMetrics(draft.start, draft.end).angle.toFixed(1) + '\u00b0' : 'Tap start, then drag or tap endpoint'}</Text><View style={styles.controls}><Button title={snapping.enabled ? 'SNAP ON' : 'SNAP OFF'} disabled={dragging} onPress={() => setSnapping(s => ({ ...s, enabled: !s.enabled }))} /><Button title="UNDO SEGMENT" disabled={dragging || !chain.length} onPress={undoSegment} />{draft && <Button title="Cancel Draft" disabled={dragging} onPress={() => updateDraft(null)} />}</View></>}
    </View>}
    {viewMode === 'topDown' && <View style={{ position: 'absolute', top: 8, right: 8 }}><Button title="Fit" compact disabled={dragging} onPress={() => setViewport(fitViewport())} /></View>}
    {!previewing && routeMode && engageMode && selectedManualEngagement && !dragging && <View style={styles.context}>
      <Text>{selectedManualEngagement.anchor.kind === 'waypoint' && plan.route ? 'Engagement ' + manualEngagementLabel(plan.route, selectedManualEngagement) : 'Route engagement'} / {targetLabel(stage, selectedManualEngagement.targetId)}</Text>
      <Button title="Edit engagement" onPress={() => setPanel('manualEdit')} />
    </View>}
    {!previewing && routeMode && addingPoint && <View style={styles.context}><Text>ADD WAYPOINT / tap the canvas</Text><Button title="Cancel add waypoint" onPress={() => setAddingPoint(false)} /></View>}
    {!previewing && routeMode && !engageMode && !reviewMode && selectedWaypoint && !addingPoint && !assignmentMode && <View style={styles.context}><Button title={'WAYPOINT ' + (plan.route!.positions.indexOf(selectedWaypoint) + 1)} onPress={() => setPanel('waypoint')} /></View>}
    {!previewing && routeMode && assignmentMode && <View style={styles.context}>
      <Text style={styles.status}>{plan.route?.positions.find(p => p.id === positionId)?.label} / TAP TO TOGGLE {assignmentMode.toUpperCase()} TARGETS</Text>
      <View style={styles.controls}>
        <Button title="Visible targets" active={assignmentMode === 'visible'} onPress={() => setAssignmentMode('visible')} />
        <Button title="Engaged targets" active={assignmentMode === 'engaged'} onPress={() => setAssignmentMode('engaged')} />
        <Button title="Done" onPress={() => setAssignmentMode(null)} />
      </View>
    </View>}
    {!previewing && selected && tool === 'select' && !dragging && !routeMode && viewMode === 'topDown' && <View style={styles.context}>
      <View style={styles.readout}><Text style={styles.status}>{(isTarget(selected) ? targetPreset(selected.presetId ?? '')?.name ?? objectLabel(selected.type) : objectLabel(selected.type)).toUpperCase()}</Text><Button title="Deselect" compact disabled={dragging} onPress={() => setSelectedId(null)} /></View>
      <View style={styles.controls}>
        <Button title="EDIT" disabled={dragging} onPress={() => setPanel('edit')} />
          <Button title={isSegment(selected) ? "ENDPOINTS" : "ROTATE"} disabled={dragging} onPress={() => isSegment(selected) ? setFocusPosition({ ...selected.position }) : rotate(rotationStep)} />
        <Button title="DUPLICATE" disabled={dragging || selected.type === 'start'} onPress={() => act({ kind: 'duplicate' })} />
        <Button title="DELETE" danger disabled={dragging || selected.type === 'start'} onPress={() => setPanel('delete')} />
      </View>
    </View>}
    </View>

    {!!editError && <Text accessibilityLiveRegion="polite" style={styles.error}>{editError}</Text>}
    <RouteAISheet visible={aiOpen} close={()=>{aiController.close();setAIOpen(false);}} state={aiState} controller={aiController} revision={aiContext.revision} inspect={()=>setAIOpen(false)} apply={()=>{
      return aiController.apply(preview=>aiLatest.current.documentHistory.applyAssistantPreview(preview));
    }} />
    <View style={[styles.bottomBar, routeMode && routeEditing && { flexWrap: 'wrap' }, viewMode === '25d' && { display: 'none' }, !routeMode && !previewing && (tool === 'target' || tool === 'wall' || tool === 'faultLine') && { display: 'none' }]}>
      {discoveryPreview ? <View style={{ flex: 1, gap: 4 }}><Text>Amber squares: {discovered?.candidates.length ?? 0} discovered waypoints. Pan or zoom to inspect.</Text><Button title="Back to planner" onPress={() => setDiscoveryPreview(false)} /></View> : preview ? <View style={{ flex: 1, gap: 4 }}><Text style={styles.status}>Route {preview.number} / {preview.label}{preview.personalizedFallback ? ' / Balanced fallback' : ''}</Text><Text>Cyan: path / Thin lines: assigned targets / White: moving reload / R: reload</Text><Button title="Back to results" icon="exit" onPress={() => setPreview(null)} /></View> : routeMode && reviewMode ? <ManualReviewPanel review={manualReview} stage={stage} selectedTargetId={reviewTargetId} selectedEngagementId={manualEngagementId} onlyUnassigned={onlyUnassigned} disabled={dragging}
          onToggle={() => { setOnlyUnassigned(v => !v); if (!onlyUnassigned && manualReview.targets.find(t => t.target.id === reviewTargetId)?.assigned) setReviewTargetId(null); }}
          onSelectTarget={setReviewTargetId} onHighlight={highlightReviewEngagement}
          onRemove={id => { if (plan.route) changeRoute(deleteManualEngagement(plan.route, id)); }}
          onUndo={documentHistory.undo} onRedo={documentHistory.redo} canUndo={documentHistory.canUndo} canRedo={documentHistory.canRedo} /> : routeMode && engageMode ? <View style={{ flex: 1, gap: 6 }}>
          <Text>Drag from a waypoint or the path to a target. Tap an arrow to edit; drag it to change direction.</Text>
          <View style={styles.controls}><Button title="ENGAGEMENTS" disabled={dragging} onPress={() => setPanel('manualEngagements')} /><Button title="Undo" disabled={dragging || !documentHistory.canUndo} onPress={documentHistory.undo} /><Button title="Redo" disabled={dragging || !documentHistory.canRedo} onPress={documentHistory.redo} /></View>
        </View> : routeMode && routeEditing ? <>
          <Button title="ADD WAYPOINT" active={addingPoint} disabled={dragging} onPress={() => { setAddingPoint(true); setAssignmentMode(null); setPanel(null); }} />
          <Button title="MOVE" onPress={() => { setAddingPoint(false); setPanel(null); }} />
          <Button title="ORDER" onPress={() => setPanel('order')} />
          <Button title="DELETE" danger disabled={!selectedWaypoint} onPress={() => setPanel('deleteWaypoint')} />
          <Button title="ASK" onPress={() => {setAIOpen(true);setPanel(null);}} />
          <Button title="CONNECTION" disabled={!selectedWaypoint} onPress={() => setPanel('waypoint')} />
          <Button title="DONE" onPress={() => { setRouteEditing(false); setAssignmentMode(null); }} />
        </> : routeMode ? <>
        <Button title="PLAN" onPress={() => { setPlannerOrigin('planV2'); setPanel('planV2'); }} />
        <Button title="OPTIMIZE" onPress={() => { setPlannerOrigin('aiPlan'); setPanel('aiPlan'); }} />
        <Button title="EDIT" active={routeEditing} onPress={() => { setRouteEditing(true); setPanel(null); }} />
        <Button title="ANALYZE" onPress={() => setPanel('summary')} />
        <Button title="ASK" onPress={() => {setAIOpen(true);setPanel(null);}} />
        <Button title="&#8226;&#8226;&#8226;" label="Route tools" onPress={() => setPanel('more')} />
      </> : <>
        <Button title="SELECT" active={tool === 'select'} disabled={dragging} onPress={() => switchTool('select')} />
        <Button title="ADD" disabled={dragging || viewMode !== 'topDown'} onPress={() => setShowAdd(true)} />
        <Button title="DRAW" disabled={dragging || viewMode !== 'topDown'} onPress={() => setPanel('draw')} />
        <Button title="&#8226;&#8226;&#8226;" label="Stage tools" disabled={dragging} onPress={() => setPanel('more')} />
      </>}
    </View>
    <EditorSheet title={panel === 'edit' && selected ? objectLabel(selected.type) : ({ check: 'Stage check', settings: 'Stage Settings', aiPlan: 'MOVEMENT OPTIMIZER', planV2: 'PLAN ROUTE', edit: 'Edit', plan: 'Plan', view: routeMode ? 'ROUTE LAYERS' : 'View', snap: 'Grid & snap', summary: 'ANALYSIS', assign: 'Targets', reload: 'Reload', delete: 'Delete object', reset: 'Reset Stage', more: routeMode ? 'Route tools' : 'Stage tools', draw: 'Draw', rules: 'Route Settings', waypoint: 'Waypoint', order: 'Waypoint order', resetRoute: 'Reset Route', deleteWaypoint: 'Delete waypoint', engagement: 'Engagement', saveError: 'Save error', manualEngagements: 'Engagements', manualTarget: 'Reassign target', manualEdit: 'Edit engagement', manualCreate: 'Create engagement' }[panel ?? 'edit'])} visible={panel !== null && panel !== 'aiPlan' && panel !== 'planV2'} close={() => setPanel(null)}>
      {panel === 'manualEdit' && selectedManualEngagement && plan.route && <>
            <Text>{selectedManualEngagement.anchor.kind === 'waypoint' ? 'Waypoint ' + (plan.route.positions.findIndex(p => p.id === (selectedManualEngagement.anchor.kind === 'waypoint' ? selectedManualEngagement.anchor.waypointId : '')) + 1) + ' / ' + manualEngagementLabel(plan.route, selectedManualEngagement) : 'Route engagement'} / {targetLabel(stage, selectedManualEngagement.targetId)}</Text>
            <View style={styles.controls}>
              <Button title="Reassign target" disabled={dragging} onPress={() => setPanel('manualTarget')} />
              <Button title="Turn left" disabled={dragging} onPress={() => plan.route && changeRoute(editManualEngagement(stage, plan.route, selectedManualEngagement.id, { direction: selectedManualEngagement.direction - Math.PI / 12 }))} />
              <Button title="Turn right" disabled={dragging} onPress={() => plan.route && changeRoute(editManualEngagement(stage, plan.route, selectedManualEngagement.id, { direction: selectedManualEngagement.direction + Math.PI / 12 }))} />
              {selectedManualEngagement.anchor.kind === 'waypoint' && <><Button title="Earlier engagement" disabled={dragging || manualOrder <= 0} onPress={() => plan.route && changeRoute(reorderManualEngagement(plan.route, selectedManualEngagement.id, -1))} /><Button title="Later engagement" disabled={dragging || manualOrder < 0 || manualOrder >= manualPeers.length - 1} onPress={() => plan.route && changeRoute(reorderManualEngagement(plan.route, selectedManualEngagement.id, 1))} /></>}
              <Button title="Delete engagement" danger disabled={dragging} onPress={() => { if (plan.route) changeRoute(deleteManualEngagement(plan.route, selectedManualEngagement.id)); setManualEngagementId(null); setPanel(null); }} />
              <Button title="Deselect engagement" disabled={dragging} onPress={() => { setManualEngagementId(null); setPanel(null); }} />
            </View>
          </>}
      {panel === 'manualCreate' && plan.route && <>
        <Text>Choose an anchor, then a target. Route sections use their midpoint, including rounded sections.</Text>
        {plan.route.positions.map((p,i)=><Button key={p.id} title={'Anchor: Waypoint '+(i+1)} active={creationAnchor?.kind==='waypoint' && creationAnchor.waypointId===p.id} onPress={()=>setCreationAnchor({kind:'waypoint',waypointId:p.id})} />)}
        {routeSections(stage,plan.route).map((section,i)=><Button key={section.id} title={'Anchor: Route section '+(i+1)+' midpoint'} active={creationAnchor?.kind==='section' && creationAnchor.sectionId===section.id} onPress={()=>setCreationAnchor({kind:'section',sectionId:section.id,fraction:.5})} />)}
        {creationAnchor && stage.objects.filter(isEngageable).map(target=><Button key={target.id} title={'Create engagement to '+targetLabel(stage,target.id)} onPress={()=>{ if(plan.route) changeRoute(addManualEngagement(stage,plan.route,{id:'engagement-'+uuid.v4(),anchor:creationAnchor,targetId:target.id,direction:0})); setCreationAnchor(null); setPanel('manualEngagements'); }} />)}
      </>}
      {panel === 'manualEngagements' && plan.route && <>
        <Button title="Create engagement without dragging" onPress={()=>{setCreationAnchor(null);setPanel('manualCreate');}} />
        {!plan.route.manualEngagements?.length && <Text>No manual engagements. Drag from a waypoint or path to a target in ENGAGE.</Text>}
        {plan.route.manualEngagements?.map(e => <Button key={e.id} title={(e.anchor.kind === 'waypoint' ? 'Waypoint ' + (plan.route!.positions.findIndex(p => p.id === (e.anchor.kind === 'waypoint' ? e.anchor.waypointId : '')) + 1) + ' / ' + manualEngagementLabel(plan.route!, e) : 'Route engagement') + ' / ' + targetLabel(stage, e.targetId)} active={e.id === manualEngagementId} onPress={() => { setManualEngagementId(e.id); setPanel('manualEdit'); }} />)}
      </>}
      {panel === 'manualTarget' && selectedManualEngagement && plan.route && <>
        {stage.objects.filter(isEngageable).map(target => <Button key={target.id} title={targetLabel(stage, target.id)} active={target.id === selectedManualEngagement.targetId} onPress={() => { if (plan.route) changeRoute(editManualEngagement(stage, plan.route, selectedManualEngagement.id, { targetId: target.id })); setPanel('manualEdit'); }} />)}
      </>}
      {panel === 'saveError' && <ErrorState title="Stage could not be saved. Try Save again after reviewing the details." detail={saveMessage} />}
      {panel === 'engagement' && plan.route && <EngagementDetails stage={stage} route={plan.route} nodeId={nodeId} onChange={changeRoute} />}
      {panel === 'rules' && plan.route && <>
        <EngagementSettings stage={stage} initial={plan.route.engagementRules} onCancel={() => setPanel(plannerOrigin)} onApply={rules => { if (plan.route) changeRoute({ ...plan.route, engagementRules: rules }); setPanel(plannerOrigin); }} /></>}
      {panel === 'resetRoute' && <><Text>Clear the route, waypoints, reloads and route rules?</Text><Button title="Cancel" onPress={() => setPanel(null)} /><Button title="Reset route" danger onPress={() => { changeRoute(createRoute('route-' + uuid.v4())); setPositionId(null); setPanel(null); }} /></>}
      {panel === 'waypoint' && selectedWaypoint && plan.route && <>
        <Text>WAYPOINT {plan.route.positions.indexOf(selectedWaypoint) + 1}</Text>
        <Text>Select a waypoint to edit its incoming connection. Drag diamonds; tap + to insert bends.</Text>
        {(() => {
          const index=plan.route.positions.indexOf(selectedWaypoint), origin=index ? plan.route.positions[index-1] : stage.objects.find(o=>o.type==='start');
          if(!origin) return <Text>Add a previous waypoint to create a connection.</Text>;
          const connection=plan.route.connections?.find(c=>c.fromId===origin.id && c.toId===selectedWaypoint.id) ?? {fromId:origin.id,toId:selectedWaypoint.id,style:'STRAIGHT' as const,bends:[]};
          return <><View style={styles.controls}>{(['STRAIGHT','ROUNDED'] as const).map(style=><Button key={style} title={style} active={connection.style===style} onPress={()=>plan.route && changeRoute(setConnection(plan.route,{...connection,style}))} />)}</View>
          {connection.bends.map((bend,i)=><View key={'move-'+bend.id}><Text>{'Move bend '+(i+1)+' (one inch)'}</Text><View style={styles.controls}>{(['Left','Right','Up','Down'] as const).map(direction=><Button key={direction} title={'Bend '+(i+1)+' '+direction} onPress={()=>plan.route && changeRoute(setConnection(plan.route,{...connection,bends:connection.bends.map(b=>b.id===bend.id?{...b,position:{...b.position,x:Math.max(0,Math.min(stage.stage.width,b.position.x+(direction==='Left'?-1:direction==='Right'?1:0))),y:Math.max(0,Math.min(stage.stage.depth,b.position.y+(direction==='Up'?-1:direction==='Down'?1:0)))}}:b)}))} />)}</View></View>)}
          {connection.bends.map((bend,i)=><Button key={bend.id} title={'Delete bend '+(i+1)} danger onPress={()=>plan.route && changeRoute(setConnection(plan.route,{...connection,bends:connection.bends.filter(b=>b.id!==bend.id)}))} />)}</>;
        })()}
        <TextInput accessibilityLabel="Waypoint label" style={ui.input} value={selectedWaypoint.label} maxLength={30} onChangeText={label => { if (plan.route) changeRoute({ ...plan.route, positions: plan.route.positions.map(p => p.id === positionId ? { ...p, label } : p) }); }} />
        <Text>{formatYards(routeEvaluation?.segments.find(s => s.toId === positionId)?.distance ?? 0)} from previous</Text>
        <Text>{formatYards(routeEvaluation?.segments.find(s => s.fromId === positionId)?.distance ?? 0)} to next</Text>
        <Text>{selectedWaypoint.engagedTargetIds.length} targets assigned{selectedWaypoint.movingTargetIds?.length ? ` (${selectedWaypoint.movingTargetIds.length} while moving)` : ''}</Text>
        <Text>Reload: {(() => { const reload = plan.route.reloads.find(r => r.positionId === positionId); const index = plan.loadout.magazines.findIndex(m => m.id === reload?.magazineId); return !reload ? 'None' : index < 0 ? 'Missing magazine' : plan.loadout.magazines[index].label || 'Magazine ' + (index + 1); })()}</Text>
        <Button title="TARGETS" onPress={() => setPanel('assign')} />
        <Button title="RELOAD" onPress={() => setPanel('reload')} />
        <Button title="DELETE" danger onPress={() => setPanel('deleteWaypoint')} />
      </>}
      {panel === 'deleteWaypoint' && <><Text>Delete this waypoint and its reload assignment?</Text><Button title="Cancel" onPress={() => setPanel('waypoint')} /><Button title="Delete waypoint" danger onPress={() => { if (plan.route) { changeRoute(retainConnections({ ...plan.route, positions: plan.route.positions.filter(p => p.id !== positionId), reloads: plan.route.reloads.filter(r => r.positionId !== positionId) })); setPositionId(null); setPanel(null); } }} />
      </>}
      {panel === 'order' && plan.route && <>
        <Text>WAYPOINT ORDER</Text>
        {plan.route.positions.map((p, i) => <View key={p.id}><Button title={String(i + 1) + ' ' + p.label} onPress={() => { setPositionId(p.id); setPanel('waypoint'); }} /><View style={styles.controls}><Button title="Earlier" disabled={!i} onPress={() => plan.route && changeRoute(reorderPosition(plan.route, p.id, -1))} /><Button title="Later" disabled={i === plan.route!.positions.length - 1} onPress={() => plan.route && changeRoute(reorderPosition(plan.route, p.id, 1))} /></View></View>)}
      </>}
      {panel === 'draw' && <>
        <Button title="WALL" onPress={() => { setPanel(null); switchTool('wall'); }} />
        <Button title="FAULT LINE" onPress={() => { setPanel(null); switchTool('faultLine'); }} />

      </>}
      {panel === 'more' && <>
        {routeMode ? <>
          <Button title="Route Settings" onPress={() => setPanel('rules')} />
          <Button title="Loadout" onPress={() => { setPlanSection('loadout'); setPanel('plan'); }} />
          <Button title="Target Rounds" onPress={() => { setPlanSection('targets'); setPanel('plan'); }} />
          <Button title="Overlay Layers" onPress={() => setPanel('view')} />
          <Button title="Reset Route" danger onPress={() => setPanel('resetRoute')} />
        </> : <>
          <Text style={styles.title}>STAGE</Text>
          <Button title="Stage Dimensions" onPress={() => setPanel('settings')} />
          <Button title="Grid & Snapping" onPress={() => setPanel('snap')} />
          <Button title="2.5D Preview" onPress={() => { setViewMode('25d'); setPanel(null); }} />
          <Text style={styles.title}>PLANNING</Text><Button title="Loadout" onPress={() => { setPlanSection('loadout'); setPanel('plan'); }} /><Button title="Target Rounds" onPress={() => { setPlanSection('targets'); setPanel('plan'); }} /><Text style={styles.title}>VIEW</Text>


        </>}
        {!routeMode && <Button title="Import stage diagram" onPress={() => { setPanel(null); setImportOpen(true); }} />}
        {!routeMode && <Button title="Overlay / View Settings" onPress={() => setPanel('view')} />}
        <Button title="Zoom out" disabled={viewport.zoom <= MIN_ZOOM} onPress={() => zoom(1 / 1.25)} />
        <Text testID="stage-zoom">{Math.round(viewport.zoom * 100)}%</Text>
        <Button title="Zoom in" disabled={viewport.zoom >= MAX_ZOOM} onPress={() => zoom(1.25)} />
        {!routeMode && <Text style={styles.title}>EDIT HISTORY</Text>}
        <Button title="UNDO EDIT" disabled={!documentHistory.canUndo} onPress={() => { updateDraft(null); setChain([]); documentHistory.undo(); }} />
        <Button title="REDO EDIT" disabled={!documentHistory.canRedo} onPress={() => { updateDraft(null); setChain([]); documentHistory.redo(); }} />
        {!routeMode && <><Text style={styles.title}>DANGER</Text><Button title="Reset Stage" danger onPress={() => setPanel('reset')} /></>}
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
      {panel === 'check' && <View style={{ gap: 8 }}>
        <Text>Rule limits this stage can be checked against from its geometry. The match director's reading of the rules decides.</Text>
        {stageFindings.map((f, i) => <View key={f.code + i} style={{ borderWidth: 2, borderColor: f.severity === 'safety' ? colors.danger : colors.border, padding: 8, gap: 2 }}>
          <Text style={{ fontWeight: '700', color: f.severity === 'safety' ? colors.danger : colors.text }}>{(f.severity === 'safety' ? 'SAFETY' : f.severity === 'rule' ? 'RULE' : 'INFO') + (f.rule ? ' · ' + f.rule : '')}</Text>
          <Text>{f.message}</Text>
          {f.objectIds.length > 0 && stage.objects.some(o => o.id === f.objectIds[0]) && <Button title="Show on stage" onPress={() => { setSelectedId(f.objectIds[0]); setPanel(null); }} />}
        </View>)}
      </View>}
      {panel === 'summary' && plan.route && <RouteAnalysis stage={stage} plan={plan} route={plan.route} profile={profile} edit={() => { setRouteEditing(true); setPanel(null); }} />}
      {panel === 'plan' && <>
        {routeMode && <Button title={plannerOrigin === 'planV2' ? 'Back to PLAN ROUTE' : 'Back to MOVEMENT OPTIMIZER'} onPress={() => setPanel(plannerOrigin)} />}
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

      {panel === 'snap' && <>{!routeMode && <Button title={'Grid ' + (gridVisible ? 'ON' : 'OFF')} onPress={() => setGridVisible(v => !v)} />}<SnapControls value={snapping} onChange={setSnapping} disabled={false} /></>}
      {(panel === 'assign' || panel === 'reload') && plan.route && <>
        <Button title="Back to waypoint" onPress={() => setPanel('waypoint')} />
        {!!profileError && <ErrorState title="Profile unavailable. Route timing may be unavailable." detail={profileError} />}
        <RoutePanel onAssign={mode => { setAssignmentMode(mode); setPanel(null); }} section={panel} stage={stage} plan={plan} route={plan.route} selectedId={positionId} onChange={changeRoute} />
      </>}
      {(panel === 'delete' || panel === 'reset') && <>
        <Text>{panel === 'delete' ? 'Delete this object and its planning references?' : 'Restore the default layout? Stage size, downrange and target family are kept. This also clears the route and target assignments.'}</Text>
        <Button title="Cancel" onPress={() => setPanel(null)} />
        <Button title={panel === 'delete' ? 'Delete object' : 'Reset stage'} danger onPress={() => { act(panel === 'reset' ? { kind: 'reset', targetFamily } : { kind: 'delete' }); setPanel(null); }} />
      </>}
    </EditorSheet>
    {panel === 'planV2' && <RoutePlannerV2Panel stage={stage} plan={plan} preview={preview} onPreview={setPreview}
      onClose={() => { setPreview(null); setPanel(null); }}
      onConfigure={section => { if (section === 'start') { setSelectedId(stage.objects.find(o => o.type === 'start')?.id ?? null); setPanel('edit'); } else setPanel('rules'); }}
      onUse={next => { setPreview(null); setRouteEditing(false); setPlan(next); setPositionId(null); setNodeId(null); setAssignmentMode(null); setPanel(null); }} />}
    {panel === 'aiPlan' && <AutoPlannerPanel onSolverResult={result=>setSolverEvidence({key:solverKey,result})} onConfigure={section => { if (section === 'start') { setSelectedId(stage.objects.find(o => o.type === 'start')?.id ?? null); setPanel(stage.objects.some(o => o.type === 'start') ? 'edit' : 'settings'); } else if (section === 'geometry') setPanel('settings'); else if (section === 'rules') setPanel('rules'); else { setPlanSection(section); setPanel('plan'); } }} discoverySession={discoverySession} onDiscovery={setDiscoverySession} discoveryPreview={discoveryPreview} onDiscoveryPreview={() => setDiscoveryPreview(true)} stage={stage} plan={plan} profile={profile} preview={preview} onPreview={setPreview} onClose={() => { setPreview(null); setDiscoveryPreview(false); setPanel(null); }} onUse={next => { setPreview(null); setRouteEditing(false); setPlan(next); setPositionId(null); setNodeId(null); setAssignmentMode(null); setPanel(null); }} />}
    <DiagramImportScreen visible={importOpen} stageId={stageId} stage={stage} family={targetFamily} close={() => setImportOpen(false)} apply={document => documentHistory.appendObjects(document.objects)} />
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
  readout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12 },
  canvas: { flex: 1, minHeight: 100, marginHorizontal: 0 },
  zoomBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2 },
  modeOverlay: { position: 'absolute', top: 60, left: 8, right: 8, padding: 8, gap: 4, backgroundColor: colors.panel },
  context: { position: 'absolute', bottom: 8, left: 8, right: 8, padding: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.panel },
  bottomBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, paddingHorizontal: 4, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.panel },
  title: { ...typography.section, color: colors.text },
  status: { ...typography.category, color: colors.muted, marginVertical: 4, flexShrink: 1 },
  active: { color: colors.accent },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { flexGrow: 1, flexShrink: 1, maxWidth: '100%', backgroundColor: colors.secondary, paddingVertical: 10, paddingHorizontal: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  compact: { flexGrow: 0, flexShrink: 0, paddingHorizontal: 12, backgroundColor: 'transparent', borderBottomWidth: 0 },
  tool: { flex: 1, backgroundColor: 'transparent', gap: 4, paddingVertical: 6, paddingHorizontal: 2, minHeight: 54, borderBottomWidth: 0 },
  toolLabel: { fontSize: 10, lineHeight: 14, color: colors.muted, fontWeight: '400' },
  activeButton: { borderColor: colors.accent, backgroundColor: colors.selected },
  danger: { borderColor: colors.danger },
  dangerText: { color: colors.danger },
  accentText: { color: colors.accent },
  pressed: { backgroundColor: colors.selected },
  disabled: { opacity: 0.4 },
  error: { ...typography.body, color: colors.danger, padding: 8 },
  buttonText: { ...typography.label, color: colors.text, textAlign: 'center' },
});
