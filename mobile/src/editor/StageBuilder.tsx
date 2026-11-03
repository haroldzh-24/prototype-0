import type { EngagementAnchor } from '../planning/manualEngagements';
import DiagramImportScreen from '../diagramImport/DiagramImportScreen';
import type { EditorBackdrop } from '../diagramImport/DiagramImportScreen';
import { placeDrawing } from '../diagramImport/model';
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
import { fitViewport } from './viewportGestures';
import { isEngageable, targetLabel } from '@/planning/model';
import { colors, spacing, typography, themed } from '../ui/tokens';
import { Action, Copy, ErrorState, Panel, Segmented, ToolButton, ui } from '@/ui/kit';
import EditorHeader from './EditorHeader';
import StepBar from './StepBar';
import ToolBar from './ToolBar';
import SelectionBar from './SelectionBar';
import ModeChip from './ModeChip';
import UndoBar from './UndoBar';
import { checkStage } from '@/rules/stageCheck';
import RadialAddMenu from './RadialAddMenu';
import type { RadialChoice } from './RadialAddMenu';
import Text from '@/editor/FieldText';
import { uuid } from 'expo-modules-core';
import PlanningPanel from '@/planning/PlanningPanel';
import EngagementDetails from '@/planning/EngagementDetails';
import RouteAnalysis from '@/planning/RouteAnalysis';
import EngagementSettings from '@/planning/EngagementSettings';
import PlanChecklist from '@/planning/PlanChecklist';
import TargetPlanSheet from '@/planning/TargetPlanSheet';
import { planChecklist } from '@/planning/planStatus';
import type { ChecklistKey } from '@/planning/planStatus';
import { withPlanDefaults } from '@/planning/planDefaults';
import { commitRoute, resetRouteKeepingAreas, routeForPlan } from '@/planning/routeLifecycle';
import { assignFromPath, assignTarget } from '@/planning/assignments';
import { planWords } from '@/planning/planWords';

import { evaluateRoute, reorderPosition } from '@/planning/route';
import { coverageText, defaultRouteLayers, meaningfulRoute, routeTargetCoverage } from './routePresentation';
import RoutePanel from '@/planning/RoutePanel';
import RoutePlannerV2Panel from '@/planning/v2/RoutePlannerV2Panel';
import AutoPlannerPanel from '@/planning/AutoPlannerPanel';
import { currentDiscovery } from '@/planning/positionSources';
import type { DiscoverySession } from '@/planning/positionSources';
import { plannerPreviewRoute } from '@/planning/plannerUI';
import type { PlannerCard } from '@/planning/plannerUI';
import { toggleRouteTarget } from '@/planning/route';
import type { TargetAssignmentMode, StageRoute } from '@/planning/route';
import type { PowerFactor, ShooterPerformanceProfile } from '@/profile/model';
import { reconcilePlan } from '@/planning/model';
import StageViewport from '@/editor/StageViewport';
import SnapControls from '@/editor/SnapControls';
import ObjectInspector from '@/editor/ObjectInspector';
import { DEFAULT_SNAPPING, resolveMovement } from '@/stage/snapping';
import type { SnapSettings } from '@/stage/snapping';
import type { ObjectEdit } from '@/stage/operations';
import { createViewportTransform } from '@/stage/coordinates';
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
import { formatYards, formatYardsFixed, yardsToInches } from '../stage/measurements';
import type { StagePosition } from '../stage/coordinates';
import type { TargetFamily } from '../stage/targetFamily';
import RouteAISheet from '../planning/routeAI/RouteAISheet';
import LayerPanel from './LayerPanel';
import { isPaper } from '../stage/targetLayers';
import { defaultEngagementRules } from '../planning/engagements';
import { stageDownrange } from '../stage/orientation';
import { activeRuleset } from '../rules/rulesets';
import type { EngagementRules } from '../planning/engagements';
import { areaAt, areaFromFaultLines, areaProblem, moveCorner, nextAreaId, removeArea, snapCorner, wholeBayArea } from '../planning/firingAreaEditing';
import type { Point as AreaPoint } from '../planning/firingAreaEditing';
import { RouteAIController } from '../planning/routeAI/controller';
import type { AIState } from '../planning/routeAI/controller';
import { productionAdapter } from '../planning/routeAI/nativeAdapter';
import type { RouteAIAdapter } from '../planning/routeAI/types';
import { createRouteAssistantContext, fingerprint } from '../planning/routeAssistant/context';
import { solverInputFromPlan } from '../planning/routeSolver/adoption';
import type { RouteSolverResult } from '../planning/routeSolver/types';
import Stage3DView from '../stage3d/Stage3DView';
import EyeLevelView from '../stage3d/EyeLevelView';
import { buildWalk } from '../stage3d/walk';
import { moveObject } from '../stage/operations';
import HoldHint from './HoldHint';
import { deletedText, modeChip, positionName, positionNameWithNote, positionNote, positionTitle, positionTitleWithNote, resetText, SEP, targetName, targetNameWithType, targetTypeName, words } from '../ui/words';
import { partialLabel, placePartial } from '../stage/partialTargets';

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
  // ENGAGE (checklist line 3): drag from a position, or from the path, to a target.
  const [engageMode, setEngageMode] = useState(false);
  useEffect(() => { if (routeEditing || !routeMode) setEngageMode(false); }, [routeEditing, routeMode]);
  const [addingPoint, setAddingPoint] = useState(false);
  useEffect(() => { if (!routeEditing || !routeMode) setAddingPoint(false); }, [routeEditing, routeMode]);
  // AREAS: draw shooting areas on the plan. A draft is the corners of the area being drawn. `returnTo` is the sheet DONE
  // goes back to (AUTO-PLAN when it sent you here), or null for the canvas.
  const [areaMode, setAreaMode] = useState<false | { returnTo: Panel | null }>(false);
  const [areaDraft, setAreaDraft] = useState<AreaPoint[] | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [areaNote, setAreaNote] = useState('');
  useEffect(() => { if (!routeMode) { setAreaMode(false); setAreaDraft(null); } }, [routeMode]);
  useEffect(() => { if (!areaMode) setAreaNote(''); }, [areaMode]);
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
  const [profileError, setProfileError] = useState(''), [powerFactor, setPowerFactor] = useState<PowerFactor>('minor');
  useEffect(() => {
    let active = true;
    repo.loadProfile().then(p => { if (active) { setProfile(p.performance); setPowerFactor(p.powerFactor ?? 'minor'); } }).catch(e => { if (active) setProfileError(String(e)); });
    return () => { active = false; };
  }, [repo]);
  // The route PLAN shows: the saved one, or an empty draft that becomes the plan's route with the first edit, so opening
  // PLAN does not mark the stage unsaved (routeLifecycle.ts).
  const [draftId] = useState(() => 'route-' + uuid.v4());
  const route = useMemo(() => routeForPlan(plan, draftId), [plan.route, draftId]);
  const changeRoute = (next: StageRoute) => setPlan(current => commitRoute(current, next));
  const enterRoute = () => { setRouteMode(true); setSelectedId(null); setViewMode('topDown'); };
  type Panel = 'check' | 'layers' | 'settings' | 'edit' | 'plan' | 'view' | 'snap' | 'drawing' | 'route' | 'summary' | 'assign' | 'reload' | 'aiPlan' | 'planV2' | 'more' | 'rules' | 'waypoint' | 'order' | 'engagement' | 'saveError';
  const [panel, setPanel] = useState<Panel | null>(null);
  // What you are typing in a position's note field (kept as typed, even "P1…", which as a stored label alone is not shown).
  const [noteDraft, setNoteDraft] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => { setNoteDraft(null); }, [positionId, panel]);
  // A sheet opened from another (an item from •••, Route settings from AUTO-PLAN or the older optimizer) shows ‹ BACK
  // and returns there. Arriving back at ••• or at a planner, or closing, forgets it.
  const [sheetBack, setSheetBack] = useState<Panel | null>(null);
  useEffect(() => { if (panel === null || panel === 'more' || panel === 'planV2' || panel === 'aiPlan') setSheetBack(null); }, [panel]);
  const openFrom = (from: Panel, next: Panel) => { setSheetBack(from); setPanel(next); };
  const openFromMore = (next: Panel) => openFrom('more', next);
  // PLAN: the target whose target sheet is open (rounds, expected hits, engaged from).
  const [planTargetId, setPlanTargetId] = useState<string | null>(null);
  useEffect(() => { if (!routeMode) setPlanTargetId(null); }, [routeMode]);
  const [focusPosition, setFocusPosition] = useState<StagePosition | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [planSection, setPlanSection] = useState<'loadout' | 'targets'>('loadout');
  // 2D plan, 3D (orbit and edit), eye level (WALK). 2.5D is only the automatic fallback inside Stage3DView when 3D cannot start.
  const [viewMode, setViewMode] = useState<'topDown' | '3d' | 'eye'>('topDown');
  // Where WALK was opened from, so leaving the walk-through goes back there.
  const [walkFrom, setWalkFrom] = useState<'build' | 'plan'>('plan');
  // Press and hold was used: the one-time hint has done its job.
  const [holdUsed, setHoldUsed] = useState(false);

  const discovered = currentDiscovery(stage, discoverySession);
  const previewing = !!preview || discoveryPreview;
  useEffect(() => { setPreview(null); setDiscoveryPreview(false); }, [stage, plan, profile]);
  const stageId = initial.id;
  const [name, setName] = useState(initial.name);
  const [editingName, setEditingName] = useState(false);
  const snapshot = JSON.stringify({ name, stage, plan });
  const [savedSnapshot, setSavedSnapshot] = useState(initial ? snapshot : '');
  const [saving, setSaving] = useState(false), [saveMessage, setSaveMessage] = useState('');
  // The radial add menu: where it opened on the canvas, and the stage point when opened by a long press.
  const [radial, setRadial] = useState<{ at: { x: number; y: number }; point: StagePosition | null } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [pendingExit, setPendingExit] = useState<NavigationAction | null>(null), [allowExit, setAllowExit] = useState(false);
  // IMPORT, or REALIGN on a saved drawing (it opens on that drawing's scale step).
  const [importOpen, setImportOpen] = useState(false), [importReopen, setImportReopen] = useState<string | null>(null);
  // The latest calibrated stage drawing, shown under the plan to trace over. Its opacity and placement are saved with
  // the drawing's import record, so they are remembered for the stage (not part of the stage's own Save or undo).
  const [backdrop, setBackdrop] = useState<EditorBackdrop | null>(null);
  const drawingWrites = useRef(Promise.resolve());
  const changeDrawing = (next: EditorBackdrop) => {
    setBackdrop(next);
    drawingWrites.current = drawingWrites.current.then(async () => {
      const record = (await repo.loadDiagramImports(stageId)).find(d => d.id === next.id);
      if (record) await repo.saveDiagramImport(stageId, placeDrawing(record, next));
    }).catch(e => setEditError('The drawing setting could not be saved: ' + String(e)));
  };

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
  // What ADD places on each tap until DONE: a target from the ring (PAPER, NO-SHOOT, steel) or a partial target.
  const [placement, setPlacement] = useState<Exclude<RadialChoice, { kind: 'tool' }> | null>(null);
  const [draft, setDraft] = useState<{ start: StagePosition; end: StagePosition } | null>(null);
  const draftRef = useRef(draft);
  const [chain, setChain] = useState<string[]>([]);
  const updateDraft = (value: typeof draft) => { draftRef.current = value; setDraft(value); };
  const switchTool = (next: DesignerTool) => { updateDraft(null); setChain([]); setTool(next); setSelectedId(null); setEditError(''); };
  useEffect(() => { if (routeMode || previewing || viewMode !== 'topDown' || panel) { setTool('select'); updateDraft(null); setChain([]); setRadial(null); } }, [routeMode, previewing, viewMode, panel]);
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
  /** Place one object from the ADD ring at a point; it becomes the selection (the last placed stays selected). */
  const placeAt = (choice: Exclude<RadialChoice, { kind: 'tool' }>, point: StagePosition) => {
    const id = uuid.v4();
    const result = choice.kind === 'partial' ? placePartial(stage, choice.presetId, choice.partial, point, { target: id, layer: uuid.v4(), cover: uuid.v4() })
      : placeTarget(stage, choice.presetId, id, point, choice.noShoot);
    setEditError(result.error ?? '');
    if (!result.error) { setStage(result.stage); setSelectedId(id); }
  };
  /**
   * ADD works the same however it was opened (the ADD tool or press and hold): pick, then place with each tap until
   * DONE. Press and hold places the first one where the finger was (a wall or fault line starts there).
   */
  const chooseFromRadial = (choice: RadialChoice) => {
    const point = radial?.point ?? null;
    setRadial(null);
    if (choice.kind === 'tool') {
      switchTool(choice.tool);
      // A segment drawn from a long press starts where the finger was; the next tap ends it.
      if (point) updateDraft({ start: snapEndpoint(stage, point, null, snapping).point, end: snapEndpoint(stage, point, null, snapping).point });
      return;
    }
    setPlacement(choice); switchTool('target');
    if (point) placeAt(choice, point);
  };
  const openAdd = () => setRadial({ at: { x: canvasSize.width / 2, y: canvasSize.height / 2 }, point: null });
  /** DONE while adding: back to selecting, with the last object placed or drawn still selected. */
  const finishAdding = () => {
    const last = tool === 'target' ? selectedId : chain.at(-1) ?? null;
    updateDraft(null); setChain([]); setTool('select'); setPlacement(null); setEditError('');
    setSelectedId(last && stage.objects.some(o => o.id === last) ? last : null);
  };
  /**
   * The header's undo covers every document edit (one history). While drawing connected walls or fault lines, the last
   * step is the last segment drawn: undo takes it back and the next segment starts where it started, as UNDO SEGMENT did.
   */
  const undoEdit = () => {
    const last = (tool === 'wall' || tool === 'faultLine') && chain.length ? stage.objects.find(o => o.id === chain.at(-1)) : undefined;
    documentHistory.undo();
    if (last && isSegment(last)) { setChain(chain.slice(0, -1)); const start = endpoints(last).start; updateDraft({ start, end: start }); }
    else { updateDraft(null); setChain([]); }
  };
  const redoEdit = () => { updateDraft(null); setChain([]); documentHistory.redo(); };
  const act = (action: ObjectAction) => {
    documentHistory.begin();
    const result = applyObjectAction(stage, selectedId, action, uuid.v4);
    setPlan(current => action.kind === 'reset' ? (({ expectations: _cleared, ...rest }) => ({ ...rest, engagements: {}, route: undefined }))(current)
      : reconcilePlan(current, result.stage));
    setStage(result.stage);
    documentHistory.end();
    setSelectedId(result.selectedId);
    setEditError(result.error ?? '');
  };
  // Undo instead of confirm: deleting, removing a layer, paint or port, or resetting the stage happens at once and a
  // short bar offers UNDO. The bar shows only while the document is exactly as that edit left it (and for a while).
  const [undoNote, setUndoNote] = useState<{ text: string; revision: number } | null>(null);
  const noteUndo = (text: string) => setUndoNote({ text, revision: documentHistory.revision() });
  /**
   * Make an edit and offer UNDO for it only if it changed the document: an UNDO for nothing would take back an older
   * edit. An edit that changed nothing also takes down an older edit's bar, so the bar on screen is always about the
   * last thing you did.
   */
  const withUndo = (text: string, edit: () => void) => {
    const before = documentHistory.revision(); edit();
    if (documentHistory.revision() !== before) noteUndo(text); else setUndoNote(null);
  };
  const undoVisible = !!undoNote && undoNote.revision === documentHistory.revision();
  useEffect(() => { if (!undoNote) return; const timer = setTimeout(() => setUndoNote(null), 8000); return () => clearTimeout(timer); }, [undoNote]);
  const deleteSelected = () => {
    if (!selected || selected.type === 'start') return;
    const name = targetName(stage, selected) || objectLabel(selected.type).toLowerCase();
    withUndo(deletedText(name), () => act({ kind: 'delete' }));
  };
  const resetStage = () => { withUndo(resetText, () => act({ kind: 'reset', targetFamily })); setPanel(null); };
  const applyEdit = (edit: ObjectEdit): string | null => {
    if (!selected) return 'Select an object first.';
    const result = applyInspectorEdit(stage, selected.id, edit, snapping.enabled ? snapping.rotationIncrement : null);
    if (result.error) return result.error;
    setStage(result.stage);
    setEditError('');
    return null;
  };
  const selectedWaypoint = route.positions.find(p => p.id === positionId);
  // What ANALYZE and the checklist read: the plan with the rule rounds and the profile loadout filled in (not saved).
  const planDefaults = useMemo(() => withPlanDefaults(stage, plan, profile), [stage, plan, profile]);
  const routeEvaluation = useMemo(() => route.positions.length ? evaluateRoute(stage, planDefaults.plan, route, profile) : null, [stage, planDefaults, route, profile]);
  // PLAN's checklist: 1 Shooting areas · 2 Route · 3 Targets and reloads; its target count is PLAN's badge.
  const checklist = planChecklist(stage, plan, profile, routeEvaluation ?? undefined);
  const rotationStep = snapping.enabled ? (snapping.rotationIncrement ?? 15) : 15;
  const rotate = (degrees: number) => {
    if (selected) setEditError(applyEdit({ rotation: selected.rotation + degrees }) ?? '');
  };
  /** 3D: wall height in 6 in steps, a target's bottom edge (elevation) in 3 in steps. */
  const changeHeight = (direction: 1 | -1) => {
    if (selected?.type === 'wall') setEditError(applyEdit({ geometry: { height: Math.max(6, selected.geometry.height + direction * 6) } }) ?? '');
    else if (selected && isTarget(selected)) setEditError(applyEdit({ position: { z: Math.max(0, selected.position.z + direction * 3) } }) ?? '');
  };
  const route3d = useMemo(() => {
    if (viewMode !== '3d' || !route.positions.length) return undefined;
    // Reuse the route evaluation's engagement analysis rather than running it a second time on every drag.
    const walk = buildWalk(stage, route, routeEvaluation?.engagementAnalysis);
    return { path: walk.path, windows: walk.windows.map(w => w.path), stops: walk.stops.slice(1) };
  }, [viewMode, stage, route, routeEvaluation]);
  // Route editing, previews and position tools work on the 2D plan only, however they were opened.
  useEffect(() => { if (routeEditing || engageMode || areaMode || addingPoint || assignmentMode || preview || discoveryPreview) setViewMode(v => v === 'topDown' ? v : 'topDown'); },
    [routeEditing, engageMode, areaMode, addingPoint, assignmentMode, preview, discoveryPreview]);
  const routeRules = route.engagementRules;
  const firingAreas = routeRules?.firingAreas ?? [];
  /** Change the route's rules, creating them for the match's ruleset if the route has none yet (and the route, if PLAN shows a draft). */
  const changeRules = (change: (rules: EngagementRules) => EngagementRules) => setPlan(current => {
    const shown = routeForPlan(current, draftId);
    return commitRoute(current, { ...shown, engagementRules: change(shown.engagementRules ?? defaultEngagementRules(stage, activeRuleset(targetFamily))) });
  });
  /** A layer (hostage no-shoot, double) is moved by moving the target it sits on. */
  const layerParentId = (id: string) => { const o = stage.objects.find(x => x.id === id); return isPaper(o) && o.attachment ? o.attachment.parentId : null; };
  /** The selection bar names the object as everywhere else (T3, NS1), then what it is. */
  const selectedTitle = (o: NonNullable<typeof selected>) => {
    if (isPaper(o) && o.attachment) { const parent = stage.objects.find(x => x.id === o.attachment!.parentId); return [targetName(stage, o), (o.type === 'noShootTarget' ? 'NO-SHOOT' : 'TARGET') + ' ON ' + (parent ? targetLabel(stage, parent.id) : 'TARGET')].join(SEP).toUpperCase(); }
    if (!isTarget(o)) return objectLabel(o.type).toUpperCase();
    return [targetName(stage, o), o.type === 'noShootTarget' ? 'NO-SHOOT' : targetPreset(o.presetId ?? '')?.name ?? targetTypeName(o.type) + ' target'].join(SEP).toUpperCase();
  };
  /** Leave PATH, ENGAGE and AREAS (one route tool is active at a time). */
  const clearRouteTools = () => { setRouteEditing(false); setEngageMode(false); setAreaMode(false); setAreaDraft(null); setAddingPoint(false); setAssignmentMode(null); };
  const areaTap = (point: StagePosition) => {
    if (areaDraft) {
      const scale = canvasSize.width > 0 ? createViewportTransform(stage.stage, canvasSize, viewport).scale : 1;
      const corner = snapCorner(point, stage, firingAreas, 18 / Math.max(scale, 1e-6));
      if (areaDraft.length >= 64) { setEditError('An area can have at most 64 corners.'); return; }
      setAreaDraft([...areaDraft, corner]); setEditError('');
    } else setAreaId(areaAt(firingAreas, point));
  };
  const finishArea = () => {
    if (!areaDraft) return;
    const problem = areaProblem(areaDraft);
    if (problem) { setEditError(problem); return; }
    const id = nextAreaId(firingAreas), vertices = areaDraft;
    changeRules(rules => ({ ...rules, firingAreas: [...rules.firingAreas, { id, vertices }] }));
    setAreaDraft(null); setAreaId(id); setEditError('');
  };
  const addFromFaultLines = () => {
    const id = nextAreaId(firingAreas), area = areaFromFaultLines(stage, stageDownrange(stage), id), problem = areaProblem(area.vertices);
    if (problem) { setEditError('Could not draft an area from these fault lines: ' + problem); return; }
    changeRules(rules => ({ ...rules, firingAreas: [...rules.firingAreas, area] })); setAreaId(id); setEditError('');
    setAreaNote('Drafted from the fault lines: everything uprange of them. Check it against the stage brief and drag corners to adjust.');
  };
  const addWholeBay = () => {
    const id = nextAreaId(firingAreas);
    changeRules(rules => ({ ...rules, firingAreas: [...rules.firingAreas, wholeBayArea(stage, id)] })); setAreaId(id);
  };
  const moveAreaCorner = (id: string, index: number, point: AreaPoint) => changeRules(rules => ({ ...rules,
    firingAreas: rules.firingAreas.map(a => a.id === id ? moveCorner(a, index, { x: Math.round(point.x), y: Math.round(point.y) }, stage) ?? a : a) }));

  const stageFindings = checkStage(stage, routeRules, targetFamily);
  const stageSafety = stageFindings.filter(f => f.severity === 'safety').length, stageRules = stageFindings.filter(f => f.severity === 'rule').length;
  const leaveWalk = () => { if (walkFrom === 'build') { clearRouteTools(); setRouteMode(false); switchTool('select'); } setViewMode('topDown'); };
  const coverage = routeTargetCoverage(stage.objects.filter(isEngageable).map(o => o.id), route, routeEvaluation?.engagementAnalysis?.coveredTargetIds);
  const routeStatus = !meaningfulRoute(route)
    ? 'NO ROUTE YET\n' + (firingAreas.length ? `AUTO-PLAN finds the fewest legal positions, or draw the route with ${planWords.drawByHand}.` : `Draw where competitors may shoot with AREAS, then AUTO-PLAN. Or draw the route with ${planWords.drawByHand}.`)
    : 'ROUTE\n' + [formatYardsFixed(routeEvaluation?.distance ?? 0, 1), `${route.positions.length} ${route.positions.length === 1 ? 'position' : 'positions'}`, coverageText(coverage)].join(SEP);
  /** Start one PLAN tool (AREAS, PATH, ENGAGE); one is on at a time, on the 2D plan. AREAS can return to a sheet on DONE. */
  const startRouteTool = (which: 'areas' | 'path' | 'engage', returnTo: Panel | null = null) => {
    clearRouteTools(); setViewMode('topDown'); setPanel(null);
    if (which === 'areas') { setAreaMode({ returnTo }); setAreaId(firingAreas[0]?.id ?? null); }
    else if (which === 'path') setRouteEditing(true);
    else setEngageMode(true);
  };
  /** The checklist's lines open their tools: AREAS, the ROUTE sheet, ENGAGE. */
  const openChecklistLine = (key: ChecklistKey) => {
    if (key === 'route') { clearRouteTools(); setViewMode('topDown'); setPanel('route'); }
    else startRouteTool(key === 'areas' ? 'areas' : 'engage');
  };
  /** ENGAGE: a drag from a position assigns the target there; from the path, it adds a position there first. */
  const assignByDrag = (anchor: EngagementAnchor, point: StagePosition, targetId: string) => {
    if (anchor.kind === 'waypoint') changeRoute(assignTarget(route, stage, anchor.waypointId, targetId));
    else changeRoute(assignFromPath(stage, route, anchor.sectionId, point, targetId, 'position-' + uuid.v4()));
  };
  /** Delete a position at once; the undo bar brings it back ("Deleted P2 · UNDO"). */
  const deletePosition = () => {
    const index = route.positions.findIndex(p => p.id === positionId);
    if (index < 0) return;
    withUndo(deletedText(positionName(index)), () => changeRoute(retainConnections({ ...route, positions: route.positions.filter(p => p.id !== positionId), reloads: route.reloads.filter(r => r.positionId !== positionId) })));
    setPositionId(null); setPanel(null);
  };
  /** Reset route at once, keeping the shooting areas and route rules; the undo bar brings the route back. */
  const resetRoute = () => { withUndo(planWords.routeReset, () => changeRoute(resetRouteKeepingAreas(route, 'route-' + uuid.v4()))); setPositionId(null); setNodeId(null); setPanel(null); };
  const adding = !previewing && !routeMode && viewMode === 'topDown' && (tool === 'target' || tool === 'wall' || tool === 'faultLine');
  const segment = draft ? segmentMetrics(draft.start, draft.end) : null;
  const waypointIndex = selectedWaypoint ? route.positions.indexOf(selectedWaypoint) : -1;
  /** The mode chip: what a tap does now, which mode, and DONE. Null when a tap only selects. */
  const mode: { title: string; detail: string; done: () => void; doneDisabled?: boolean } | null = previewing ? null
    : adding ? (tool === 'target'
      ? { title: modeChip.place, detail: placement ? ((placement.kind === 'partial' ? partialLabel(placement.partial) + SEP : placement.noShoot ? 'NO-SHOOT' + SEP : '') + (targetPreset(placement.presetId)?.name ?? '').toUpperCase()) : '', done: finishAdding }
      : { title: draft ? modeChip.drawEnd : modeChip.drawStart, detail: [tool === 'wall' ? 'WALL' : 'FAULT LINE', segment && formatYards(segment.length), segment && segment.angle.toFixed(1) + '°'].filter(Boolean).join(SEP), done: finishAdding })
    : !routeMode || viewMode === 'eye' ? null
    : assignmentMode ? { title: modeChip.assign, detail: [waypointIndex >= 0 && positionName(waypointIndex), (assignmentMode === 'visible' ? 'VISIBLE' : 'ENGAGED') + ' TARGETS'].filter(Boolean).join(SEP), done: () => setAssignmentMode(null) }
    : areaMode ? { title: areaDraft ? modeChip.areaCorner : modeChip.areaSelect, doneDisabled: !!areaDraft,
      detail: areaDraft ? `NEW AREA${SEP}${areaDraft.length} ${areaDraft.length === 1 ? 'CORNER' : 'CORNERS'}${areaDraft.length >= 3 ? SEP + 'FINISH AREA WHEN DONE' : ''}` : `${words.shootingAreas.toUpperCase()}${SEP}${firingAreas.length}${firingAreas.length ? SEP + 'DRAG CORNERS TO ADJUST' : ''}`,
      done: () => { const back = areaMode.returnTo; setAreaMode(false); setAreaId(null); if (back) setPanel(back); } }
    : routeEditing ? (addingPoint ? { title: modeChip.pathAdd, detail: 'PATH', done: () => setAddingPoint(false) }
      : { title: modeChip.pathSelect, detail: 'PATH' + SEP + 'DRAG A POSITION TO MOVE IT', done: () => { setRouteEditing(false); setAssignmentMode(null); } })
    : engageMode ? { title: modeChip.engage, detail: `ENGAGE${SEP}${checklist.targets.planned}/${checklist.targets.total} TARGETS PLANNED`, done: () => setEngageMode(false) }
    : null;
  const layerSelected = !!selected && isPaper(selected) && !!selected.attachment;
  const showSelection = !previewing && !!selected && !dragging && !routeMode && !radial && (viewMode === '3d' || (viewMode === 'topDown' && tool === 'select'));
  const planSelection = !previewing && routeMode && viewMode !== 'eye' && !engageMode && !areaMode && !!selectedWaypoint && !addingPoint && !assignmentMode;
  const undoBar = (docked: boolean) => undoNote && <UndoBar docked={docked} text={undoNote.text}
    action={<ToolButton title={words.undo} accessibilityLabel={'Undo: ' + undoNote.text} onPress={() => { undoEdit(); setUndoNote(null); }} />} />;
  const sheetTitles: Record<Panel, string> = { layers: 'Layers', check: 'Stage check', settings: words.stageSize, aiPlan: 'Movement optimizer', planV2: 'Plan route', edit: 'Edit', plan: 'Plan', view: 'Route layers', snap: 'Grid and snap', drawing: 'Drawing', route: 'Route', summary: 'Analysis', assign: 'Targets', reload: 'Reload', more: routeMode ? words.settings.plan : words.settings.build, rules: 'Route settings', waypoint: words.position, order: 'Position order', engagement: 'Engagement', saveError: 'Save error' };
  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
    <EditorSheet title="Close stage" visible={pendingExit !== null && !allowExit} close={() => setPendingExit(null)}>
      <View style={ui.panel}>
        <Text style={styles.title}>{saving ? 'SAVE IN PROGRESS' : dirty ? 'UNSAVED CHANGES' : 'STAGE SAVED'}</Text>
        <Text>{dirty ? 'Save your work before closing, or discard the changes.' : 'Your stage is saved on this device.'}</Text>
        <Action title="KEEP EDITING" accessibilityLabel="Keep editing" onPress={() => setPendingExit(null)} />
        <Action title={saving ? 'SAVING…' : 'SAVE'} accessibilityLabel={saving ? 'Saving…' : 'Save'} variant={dirty && !saving ? 'primary' : 'secondary'} disabled={saving || !dirty} onPress={() => void save()} />
        {saveMessage && saveMessage !== 'Saved on this device.' && <ErrorState title="Stage could not be saved." detail={saveMessage} />}
        <Action title={dirty ? 'DISCARD CHANGES AND CLOSE' : 'CLOSE STAGE'} accessibilityLabel={dirty ? 'Discard changes and close' : 'Close stage'} variant={dirty ? 'destructive' : 'secondary'} disabled={saving} onPress={() => setAllowExit(true)} />
      </View>
    </EditorSheet>
    <EditorSheet title="Stage name" visible={editingName} close={() => setEditingName(false)}>
      <View style={ui.panel}><TextInput accessibilityLabel="Stage name" autoFocus style={ui.input} value={name} maxLength={100} onChangeText={setName} onSubmitEditing={() => setEditingName(false)} /><Text>The new name is kept when you save the stage.</Text></View>
    </EditorSheet>
    {/* 1 Header */}
    <EditorHeader>
      <ToolButton title={'‹'} accessibilityLabel="Back" disabled={saving || dragging} onPress={() => previewing ? (setPreview(null), setDiscoveryPreview(false)) : router.dismissTo({ pathname: '/match', params: { id: initial.matchId } })} />
      <Pressable accessibilityRole="button" accessibilityLabel="Edit stage name" accessibilityState={{ disabled: previewing }} disabled={previewing} onPress={() => setEditingName(true)}
        style={({ pressed }) => [styles.nameButton, pressed && styles.pressed]}>
        <Text numberOfLines={2} style={styles.name}>{name || 'Untitled stage'}</Text>
        {!previewing && <Text style={styles.pencil}>{'✎'}</Text>}
      </Pressable>
      {!previewing && <>
        <ToolButton title={'↶'} accessibilityLabel="Undo" disabled={dragging || saving || !documentHistory.canUndo} onPress={undoEdit} />
        <ToolButton title={'↷'} accessibilityLabel="Redo" disabled={dragging || saving || !documentHistory.canRedo} onPress={redoEdit} />
        {/* Orange only when there is something to save; saved reads as a quiet, disabled state. */}
        <ToolButton title={saving ? 'SAVING…' : dirty ? 'SAVE' : 'SAVED ✓'} accessibilityLabel={saving ? 'Saving…' : dirty ? 'Save' : 'Saved'} primary={dirty && !saving}
          disabled={saving || dragging || !dirty} onPress={() => void save()} />
      </>}
    </EditorHeader>
    {!!saveMessage && saveMessage !== 'Saved on this device.' && <View style={styles.controls}><Text style={styles.error}>Stage could not be saved.</Text><Action title="SAVE ERROR DETAILS" accessibilityLabel="Save error details" onPress={() => setPanel('saveError')} /></View>}
    {/* 2 Step bar: BUILD's badge counts the stage check's safety and rule findings; PLAN's counts the targets planned. */}
    <StepBar>
      <ToolButton grow title={words.steps.build} selected={!routeMode} disabled={dragging || previewing}
        accessibilityLabel={'Build the stage' + (stageSafety + stageRules ? `. Stage check: ${[stageSafety && stageSafety + ' safety', stageRules && stageRules + ' rule'].filter(Boolean).join(', ')}` : '')}
        badge={stageSafety + stageRules ? String(stageSafety + stageRules) : undefined} badgeTone={stageSafety ? 'danger' : 'neutral'}
        onPress={() => { clearRouteTools(); setRouteMode(false); setPanel(null); setViewMode('topDown'); switchTool('select'); }} />
      <ToolButton grow title={words.steps.plan} selected={routeMode && viewMode !== 'eye'} disabled={dragging || previewing}
        accessibilityLabel={`Plan the route. ${checklist.targets.planned} of ${checklist.targets.total} targets planned`} badge={checklist.targets.total ? `${checklist.targets.planned}/${checklist.targets.total}` : undefined}
        onPress={() => { switchTool('select'); setPanel(null); enterRoute(); }} />
      <ToolButton grow title={words.steps.walk} accessibilityLabel="Walk the route at eye level" selected={routeMode && viewMode === 'eye'} disabled={dragging || previewing} onPress={() => {
        if (viewMode !== 'eye') setWalkFrom(routeMode ? 'plan' : 'build');
        switchTool('select'); setPanel(null); clearRouteTools(); if (!routeMode) enterRoute(); setViewMode('eye'); }} />
    </StepBar>
    {/* PLAN's checklist header, at the top of the canvas area: each line opens its tool (AREAS, ROUTE, ENGAGE). */}
    {routeMode && viewMode !== 'eye' && !previewing && <PlanChecklist checklist={checklist} onPress={openChecklistLine}
      current={areaMode ? 'areas' : routeEditing ? 'route' : engageMode ? 'targets' : null} />}
    {/* 3 Canvas */}
    <View style={styles.canvas} onLayout={({ nativeEvent }) => setCanvasSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}>
      {viewMode === 'eye' ? <EyeLevelView stage={stage} plan={plan} ruleset={activeRuleset(targetFamily)} onExit={leaveWalk} /> :
        viewMode === '3d' ? <Stage3DView stage={stage} selectedId={selectedId} editable={!routeMode && !previewing} route={route3d}
          onSelect={id => { if (!routeMode) setSelectedId(id); else if (id && stage.objects.some(o => o.id === id && isEngageable(o))) setPlanTargetId(id); }} onExit={() => setViewMode('topDown')}
          onMoveStart={() => onDragging(true)} onMoveEnd={() => onDragging(false)}
          onMove={(id, position) => setStage(current => {
            // Dragging a layer moves its target by the same amount along the ground (its height stays).
            const parentId = layerParentId(id), dragged = current.objects.find(o => o.id === id), parent = parentId ? current.objects.find(o => o.id === parentId) : null;
            const moving = parent ? parent.id : id, to = parent && dragged ? { ...parent.position, x: parent.position.x + position.x - dragged.position.x, y: parent.position.y + position.y - dragged.position.y } : position;
            return moveObject(current, moving, resolveMovement(current, moving, to, snapping).position);
          })} /> :
        <StageViewport assign={routeMode && engageMode && !previewing ? { onAssign: assignByDrag } : undefined}
          onTargetTap={routeMode && !previewing && !areaMode && !routeEditing && !assignmentMode ? setPlanTargetId : undefined}
          onRoutePoint={addingPoint ? point => {
          if (point.x < 0 || point.y < 0 || point.x > stage.stage.width || point.y > stage.stage.depth) return;
          const id = 'position-' + uuid.v4(); let number = 1;
          while (route.positions.some(p => p.label === 'P' + number)) number++;
          changeRoute({ ...route, positions: [...route.positions, { id, label: 'P' + number, position: point, visibleTargetIds: [], engagedTargetIds: [] }] });
          setPositionId(id); setNodeId(null); setAddingPoint(false);
        } : undefined} firingAreas={routeMode && (firingAreas.length || areaDraft) ? { areas: firingAreas, draft: areaMode ? areaDraft : null, selectedId: areaMode ? areaId : null,
          editing: areaMode && !areaDraft && !previewing, onMoveCorner: moveAreaCorner, onDragging } : undefined}
          onAreaPoint={routeMode && areaMode && !previewing ? areaTap : undefined} backdrop={backdrop && backdrop.opacity > 0 ? backdrop : undefined} tool={tool} draft={draft} onDraw={draw} onPlace={point => {
          if (placement) placeAt(placement, point);
        }} routeAI={routeMode?{context:aiContext,preview:aiPreview,highlights:aiState.preview&&!aiPreview?undefined:aiState.highlights}:undefined} stage={stage} viewport={viewport} onViewportChange={setViewport} gridVisible={routeMode ? layers.grid : gridVisible} focusPosition={focusPosition}
          selectedId={selectedId} snapping={snapping} routeEditing={routeMode} readOnly={previewing} autoPositions={discoveryPreview ? discovered?.candidates : undefined}
          routePlanning={discoveryPreview ? undefined : preview ? { preview: true, route: plannerPreviewRoute(plan, preview)!, selectedId: null, onSelect: () => {}, onChange: () => {}, onDragging: () => {} } : routeMode || plan.route ? { assignmentMode: routeMode ? assignmentMode : null, onTargetTap: id => {
            if (!assignmentMode || !positionId) return;
            changeRoute(toggleRouteTarget(route, stage, positionId, id, assignmentMode));
          }, // PATH shows the path and positions only; ENGAGE also draws every position's assignments (a line to each target).
          layers: routeEditing ? { ...layers, path: true, waypoints: true, nodes: false, windows: false, arrows: 'OFF' as const }
            : engageMode ? { ...layers, path: true, waypoints: true, nodes: false, windows: false, arrows: 'ALL' as const } : layers,
          selectedNodeId: nodeId, editing: routeEditing && !engageMode, onNodeSelect: (id, node) => { setPositionId(id); setNodeId(node); setPanel('engagement'); }, route, selectedId: positionId, onSelect: id => { setPositionId(id); setNodeId(null); }, onChange: changeRoute, onDragging } : undefined}
          onLongPress={!routeMode && !previewing ? (point, at) => { setHoldUsed(true); setRadial({ at, point }); } : undefined}
          onSelect={setSelectedId} onDragging={onDragging} setStage={setStage} />}
      {/* The view switch (2D · 3D) and FIT; while a mode is on, its chip takes the switch's place. WALK is the eye-level view. */}
      {mode && !radial && <ModeChip title={mode.title} detail={mode.detail}
        action={<ToolButton title={words.done} accessibilityLabel={'Done: ' + mode.title.toLowerCase()} disabled={dragging || mode.doneDisabled} onPress={mode.done} />} />}
      {!mode && !previewing && !radial && viewMode !== 'eye' && <View style={styles.viewSwitch} accessibilityRole="radiogroup" accessibilityLabel="View">
        {([['topDown', words.views.planButton, words.views.plan], ['3d', words.views.threeDButton, words.views.threeD]] as const).map(([view, title, label]) =>
          <ToolButton key={view} title={title} accessibilityLabel={label} selected={viewMode === view} disabled={dragging} onPress={() => { setViewMode(view); setPanel(null); }} />)}
      </View>}
      {viewMode === 'topDown' && !radial && <View style={styles.fit}><ToolButton title="FIT" accessibilityLabel="Fit the stage" disabled={dragging} onPress={() => setViewport(fitViewport())} /></View>}
      {/* 4 Selection bar: the same in 2D and 3D. A layer (hostage, double) moves and turns with its target. */}
      {showSelection && selected && <SelectionBar title={selectedTitle(selected)} action={<>
        {!layerSelected && <>
          <ToolButton title={'↺'} accessibilityLabel={words.selection.rotateLeft} disabled={dragging} onPress={() => rotate(-rotationStep)} />
          <ToolButton title={'↻'} accessibilityLabel={words.selection.rotateRight} disabled={dragging} onPress={() => rotate(rotationStep)} />
        </>}
        <ToolButton title={'✕'} accessibilityLabel={words.selection.deselect} disabled={dragging} onPress={() => setSelectedId(null)} />
      </>}>
        {layerSelected ? <>
          <ToolButton grow title={words.selection.layers} accessibilityLabel="Slide, rotate or remove this layer" disabled={dragging} onPress={() => setPanel('layers')} />
          <ToolButton grow title={words.selection.baseTarget} accessibilityLabel="Select the target underneath" disabled={dragging} onPress={() => setSelectedId(layerParentId(selected.id))} />
          <ToolButton grow danger title={words.selection.delete} disabled={dragging} onPress={deleteSelected} />
        </> : <>
          <ToolButton grow title={words.selection.edit} accessibilityLabel={'Edit: position, size and rotation'} disabled={dragging} onPress={() => setPanel('edit')} />
          {isPaper(selected) && <ToolButton grow title={words.selection.layers} accessibilityLabel="Layers: no-shoots, targets, hard cover and face cuts on this target" disabled={dragging} onPress={() => setPanel('layers')} />}
          <ToolButton grow title={words.selection.duplicate} disabled={dragging || selected.type === 'start'} onPress={() => act({ kind: 'duplicate' })} />
          <ToolButton grow danger title={words.selection.delete} disabled={dragging || selected.type === 'start'} onPress={deleteSelected} />
        </>}
      </SelectionBar>}
      {/* PLAN's selection: a position (P1): its targets, reload and delete are in its sheet. */}
      {planSelection && <SelectionBar>
        <ToolButton grow title={positionTitle(waypointIndex).toUpperCase()} accessibilityLabel={positionTitle(waypointIndex)} onPress={() => setPanel('waypoint')} />
      </SelectionBar>}
      {undoVisible && !panel && !radial && !showSelection && !planSelection && viewMode !== 'eye' && undoBar(true)}
      <HoldHint show={!previewing && !routeMode && viewMode === 'topDown' && tool === 'select' && !radial && !selected && !dragging && !undoVisible} learned={holdUsed} />
      {radial && viewMode === 'topDown' && !routeMode && !previewing && <RadialAddMenu at={radial.at} bounds={canvasSize} targetFamily={targetFamily}
        onChoose={chooseFromRadial} onClose={() => setRadial(null)} />}
    </View>

    {!!editError && <Text accessibilityLiveRegion="polite" style={styles.error}>{editError}</Text>}
    {routeMode && areaMode && !!areaNote && !previewing && <Text accessibilityLiveRegion="polite" style={styles.note}>{areaNote}</Text>}
    {/* Ask is opened from PLAN's •••; closing it returns there. */}
    <RouteAISheet visible={aiOpen} close={()=>{aiController.close();setAIOpen(false);setPanel('more');}} state={aiState} controller={aiController} revision={aiContext.revision} inspect={()=>setAIOpen(false)} apply={()=>{
      return aiController.apply(preview=>aiLatest.current.documentHistory.applyAssistantPreview(preview));
    }} />
    {/* 5 Tool bar: the step's tools and •••, or the current mode's tools. WALK keeps its own (stops, eye height, •••). */}
    {viewMode !== 'eye' && <ToolBar label={mode ? mode.title : routeMode ? 'Plan tools' : 'Build tools'}>
      {discoveryPreview ? <View style={{ flex: 1, gap: 4 }}><Text>Amber squares: {discovered?.candidates.length ?? 0} discovered positions. Pan or zoom to inspect.</Text><Action title="BACK TO PLANNER" accessibilityLabel="Back to planner" onPress={() => setDiscoveryPreview(false)} /></View>
        : preview ? <View style={{ flex: 1, gap: 4 }}><Text style={styles.status}>{[`Route ${preview.number}`, preview.label, preview.personalizedFallback && 'Balanced fallback'].filter(Boolean).join(SEP)}</Text><Text>{['Cyan: path', 'thin lines: assigned targets', 'white: moving reload', 'R: reload'].join(SEP)}</Text><Action title="BACK TO RESULTS" accessibilityLabel="Back to results" onPress={() => setPreview(null)} /></View>
        : adding ? <>
          {/* ADD stays on while placing or drawing: tap it to pick something else. */}
          <ToolButton grow selected title={words.tools.add} accessibilityLabel="Add something else" disabled={dragging} onPress={openAdd} />
          {tool !== 'target' && <>
            <ToolButton grow title={snapping.enabled ? 'SNAP ON' : 'SNAP OFF'} accessibilityLabel={snapping.enabled ? 'Snap on' : 'Snap off'} disabled={dragging} onPress={() => setSnapping(s => ({ ...s, enabled: !s.enabled }))} />
            <ToolButton grow title="CANCEL DRAFT" accessibilityLabel="Cancel draft" disabled={dragging || !draft} onPress={() => updateDraft(null)} />
          </>}
        </>
        : routeMode && assignmentMode ? <>
          <ToolButton grow title="VISIBLE TARGETS" accessibilityLabel="Visible targets" selected={assignmentMode === 'visible'} onPress={() => setAssignmentMode('visible')} />
          <ToolButton grow title="ENGAGED TARGETS" accessibilityLabel="Engaged targets" selected={assignmentMode === 'engaged'} onPress={() => setAssignmentMode('engaged')} />
        </>
        : routeMode && areaMode ? (areaDraft ? <>
          <ToolButton grow primary title="FINISH AREA" disabled={dragging || areaDraft.length < 3} onPress={finishArea} />
          <ToolButton grow title="UNDO CORNER" disabled={dragging || !areaDraft.length} onPress={() => setAreaDraft(areaDraft.slice(0, -1))} />
          <ToolButton grow title="CANCEL" accessibilityLabel="Cancel the new area" disabled={dragging} onPress={() => { setAreaDraft(null); setEditError(''); }} />
        </> : <>
          <ToolButton grow primary={!firingAreas.length} title="NEW AREA" disabled={dragging || firingAreas.length >= 32} onPress={() => { setAreaDraft([]); setAreaId(null); setEditError(''); setAreaNote(''); }} />
          <ToolButton grow title="FROM FAULT LINES" accessibilityLabel="Draft the shooting area from the fault lines" disabled={dragging || firingAreas.length >= 32 || !stage.objects.some(o => o.type === 'faultLine')} onPress={addFromFaultLines} />
          <ToolButton grow title="WHOLE BAY" accessibilityLabel="Add the whole bay as one area" disabled={dragging || firingAreas.length >= 32} onPress={() => { addWholeBay(); setAreaNote(''); }} />
          <ToolButton grow danger title="DELETE AREA" disabled={dragging || !areaId} onPress={() => { if (areaId) changeRules(rules => removeArea(rules, areaId)); setAreaId(null); }} />
        </>)
        : routeMode && routeEditing ? <>
          <ToolButton grow title="ADD POSITION" selected={addingPoint} disabled={dragging} onPress={() => { setAddingPoint(true); setAssignmentMode(null); setPanel(null); }} />
          <ToolButton grow title="ORDER" disabled={dragging} onPress={() => setPanel('order')} />
          <ToolButton grow danger title="DELETE" accessibilityLabel="Delete position" disabled={dragging || !selectedWaypoint} onPress={deletePosition} />
          <ToolButton grow title="CONNECTION" disabled={dragging || !selectedWaypoint} onPress={() => setPanel('waypoint')} />
        </>
        : routeMode && engageMode ? <Text style={styles.note}>Drag from the path to add a position there. Tap a target for its rounds and expected hits.</Text>
        : routeMode ? <>
          <ToolButton grow title={words.tools.areas} accessibilityLabel="Draw shooting areas" disabled={dragging} onPress={() => startRouteTool('areas')} />
          <ToolButton grow title={words.tools.route} accessibilityLabel="Route: auto-plan, or draw by hand" primary={!meaningfulRoute(route)} disabled={dragging} onPress={() => setPanel('route')} />
          {/* With the checklist done, ANALYZE is the one orange next step. */}
          <ToolButton grow title={words.tools.analyze} accessibilityLabel="Time, ammunition and coverage" primary={checklist.lines.every(l => l.done)} disabled={dragging} onPress={() => setPanel('summary')} />
          <ToolButton title={words.tools.more} accessibilityLabel={words.settings.plan} disabled={dragging} onPress={() => setPanel('more')} />
        </>
        : <>
          <ToolButton grow title={words.tools.add} accessibilityLabel="Add targets, partial targets, walls and fault lines" disabled={dragging || viewMode !== 'topDown'} onPress={openAdd} />
          <ToolButton grow title={words.tools.import} accessibilityLabel="Import stage diagram" disabled={dragging} onPress={() => setImportOpen(true)} />
          <ToolButton grow title={words.tools.check} accessibilityLabel="Stage check" disabled={dragging} onPress={() => setPanel('check')} />
          <ToolButton title={words.tools.more} accessibilityLabel={words.settings.build} disabled={dragging} onPress={() => setPanel('more')} />
        </>}
    </ToolBar>}
    <EditorSheet title={panel === 'edit' && selected ? (targetName(stage, selected) ? targetNameWithType(stage, selected.id) : objectLabel(selected.type)) : sheetTitles[panel ?? 'edit']} visible={panel !== null && panel !== 'aiPlan' && panel !== 'planV2'} close={() => setPanel(null)}
      back={sheetBack && panel !== sheetBack ? { label: 'Back to ' + sheetTitles[sheetBack].toLowerCase(), onPress: () => setPanel(sheetBack) } : undefined}
      footer={undoVisible && (panel === 'layers' || panel === 'edit') ? undoBar(false) : undefined}>
      {panel === 'layers' && selected && <LayerPanel stage={stage} selectedId={selected.id} setStage={setStage} onSelect={setSelectedId} onRemoved={noteUndo} />}
      {panel === 'saveError' && <ErrorState title="Stage could not be saved. Try SAVE again after reviewing the details." detail={saveMessage} />}
      {panel === 'engagement' && <EngagementDetails stage={stage} route={route} nodeId={nodeId} onChange={changeRoute} />}
      {/* Route settings return to where they were opened from: •••, AUTO-PLAN or the older optimizer. */}
      {panel === 'rules' && <>
        <EngagementSettings stage={stage} initial={route.engagementRules} family={targetFamily} onCancel={() => setPanel(sheetBack)} onApply={rules => { changeRoute({ ...route, engagementRules: rules }); setPanel(sheetBack); }} /></>}
      {panel === 'waypoint' && selectedWaypoint && <>
        <Text style={styles.title}>{positionTitleWithNote(waypointIndex, selectedWaypoint.label)}</Text>
        <Text>Select a position to edit its incoming connection. Drag diamonds; tap + to insert bends.</Text>
        {(() => {
          const index=waypointIndex, origin=index ? route.positions[index-1] : stage.objects.find(o=>o.type==='start');
          if(!origin) return <Text>Add a previous position to create a connection.</Text>;
          const connection=route.connections?.find(c=>c.fromId===origin.id && c.toId===selectedWaypoint.id) ?? {fromId:origin.id,toId:selectedWaypoint.id,style:'STRAIGHT' as const,bends:[]};
          return <><View style={styles.controls}>{(['STRAIGHT','ROUNDED'] as const).map(style=><ToolButton key={style} title={style} selected={connection.style===style} onPress={()=>changeRoute(setConnection(route,{...connection,style}))} />)}</View>
          {connection.bends.map((bend,i)=><View key={'move-'+bend.id}><Text>{'Move bend '+(i+1)+' (one inch)'}</Text><View style={styles.controls}>{(['Left','Right','Up','Down'] as const).map(direction=><Action key={direction} title={('Bend '+(i+1)+' '+direction).toUpperCase()} accessibilityLabel={'Bend '+(i+1)+' '+direction} onPress={()=>changeRoute(setConnection(route,{...connection,bends:connection.bends.map(b=>b.id===bend.id?{...b,position:{...b.position,x:Math.max(0,Math.min(stage.stage.width,b.position.x+(direction==='Left'?-1:direction==='Right'?1:0))),y:Math.max(0,Math.min(stage.stage.depth,b.position.y+(direction==='Up'?-1:direction==='Down'?1:0)))}}:b)}))} />)}</View></View>)}
          {connection.bends.map((bend,i)=><Action key={bend.id} title={'DELETE BEND '+(i+1)} accessibilityLabel={'Delete bend '+(i+1)} variant="destructive" onPress={()=>changeRoute(setConnection(route,{...connection,bends:connection.bends.filter(b=>b.id!==bend.id)}))} />)}</>;
        })()}
        {/* The name is the route order (P2); the stored label is only your optional note beside it ("P2 · Barricade left"). */}
        <Text>{`Note (optional), shown beside ${positionName(waypointIndex)}`}</Text>
        <TextInput accessibilityLabel="Position note" placeholder="Barricade left" style={ui.input} maxLength={30}
          value={noteDraft?.id === selectedWaypoint.id ? noteDraft.text : positionNote(selectedWaypoint.label)}
          onChangeText={label => { setNoteDraft({ id: selectedWaypoint.id, text: label }); changeRoute({ ...route, positions: route.positions.map(p => p.id === positionId ? { ...p, label } : p) }); }} />
        <Text>{formatYards(routeEvaluation?.segments.find(s => s.toId === positionId)?.distance ?? 0)} from previous</Text>
        <Text>{formatYards(routeEvaluation?.segments.find(s => s.fromId === positionId)?.distance ?? 0)} to next</Text>
        <Text>{selectedWaypoint.engagedTargetIds.length} targets assigned{selectedWaypoint.movingTargetIds?.length ? ` (${selectedWaypoint.movingTargetIds.length} while moving)` : ''}</Text>
        <Text>Reload: {(() => { const magazines = planDefaults.plan.loadout.magazines, reload = route.reloads.find(r => r.positionId === positionId); const index = magazines.findIndex(m => m.id === reload?.magazineId); return !reload ? 'None' : index < 0 ? 'Missing magazine' : magazines[index].label || 'Magazine ' + (index + 1); })()}</Text>
        <Action title="TARGETS" onPress={() => setPanel('assign')} />
        <Action title="RELOAD" onPress={() => setPanel('reload')} />
        <Action title="DELETE" accessibilityLabel="Delete position" variant="destructive" onPress={deletePosition} />
      </>}
      {panel === 'order' && <>
        {route.positions.map((p, i) => <View key={p.id}><Action title={positionNameWithNote(i, p.label).toUpperCase()} accessibilityLabel={positionTitleWithNote(i, p.label)} onPress={() => { setPositionId(p.id); setPanel('waypoint'); }} /><View style={styles.controls}><Action title="EARLIER" accessibilityLabel="Earlier" disabled={!i} onPress={() => changeRoute(reorderPosition(route, p.id, -1))} /><Action title="LATER" accessibilityLabel="Later" disabled={i === route.positions.length - 1} onPress={() => changeRoute(reorderPosition(route, p.id, 1))} /></View></View>)}
      </>}
      {/* ROUTE: AUTO-PLAN is the main way to a route; drawing it by hand is the alternative. ENGAGE (checklist line 3) assigns targets by dragging. */}
      {panel === 'route' && <Panel>
        <Copy>{routeStatus}</Copy>
        <Action title="AUTO-PLAN" accessibilityLabel="Plan the route automatically" variant={meaningfulRoute(route) ? 'secondary' : 'primary'} onPress={() => setPanel('planV2')} />
        <Copy>Or draw the route by hand, then drag from each position to the targets it engages.</Copy>
        <Action title={planWords.drawByHand} accessibilityLabel="Draw or edit the route by hand" onPress={() => startRouteTool('path')} />
        <Action title="ENGAGE" accessibilityLabel="Engage targets: drag from a position to a target" onPress={() => startRouteTool('engage')} />
      </Panel>}
      {/* ••• holds only the current step's settings. Undo and redo are in the header; zoom is FIT and pinch; views are 2D · 3D and WALK. */}
      {panel === 'more' && <Panel>
        {routeMode ? <>
          <Action title="ROUTE SETTINGS" accessibilityLabel="Route settings" onPress={() => openFromMore('rules')} />
          <Action title="LOADOUT" accessibilityLabel="Loadout" onPress={() => { setPlanSection('loadout'); openFromMore('plan'); }} />
          <Action title="TARGET ROUNDS" accessibilityLabel="Target rounds" onPress={() => { setPlanSection('targets'); openFromMore('plan'); }} />
          <Action title="ROUTE LAYERS" accessibilityLabel="Route layers" onPress={() => openFromMore('view')} />
          {backdrop && <Action title="DRAWING" accessibilityLabel="Drawing under the stage: opacity, nudge and realign" onPress={() => openFromMore('drawing')} />}
          <Text style={ui.eyebrow}>{planWords.alternatives.toUpperCase()}</Text>
          <Action title="ASK" accessibilityLabel={planWords.ask} onPress={() => { setAIOpen(true); setPanel(null); }} />
          <Action title="OLDER OPTIMIZER" accessibilityLabel={planWords.olderOptimizer} onPress={() => setPanel('aiPlan')} />
          <Action title="RESET ROUTE" accessibilityLabel="Reset route" variant="destructive" onPress={resetRoute} />
          <Copy>Reset clears the positions, reloads and drawn path. Shooting areas and route settings are kept; UNDO brings the route back.</Copy>
        </> : <>
          <Action title={words.stageSizeButton} accessibilityLabel={words.stageSize} onPress={() => openFromMore('settings')} />
          <Action title="GRID AND SNAP" accessibilityLabel="Grid and snap" onPress={() => openFromMore('snap')} />
          {backdrop && <Action title="DRAWING" accessibilityLabel="Drawing under the stage: opacity, nudge and realign" onPress={() => openFromMore('drawing')} />}
          <Action title="RESET STAGE" accessibilityLabel="Reset stage" variant="destructive" onPress={resetStage} />
          <Copy>Reset restores the default layout and clears the route and target assignments. Stage size, downrange and target family are kept; UNDO brings everything back.</Copy>
        </>}
      </Panel>}
      {panel === 'settings' && <StageSettings stage={stage} route={plan.route} onApply={setStage} onSelect={item => {
        setViewMode('topDown'); setAssignmentMode(null); setSheetBack(null);
        const position = item.kind === 'object' ? stage.objects.find(o => o.id === item.id)?.position : route.positions.find(p => p.id === item.id)?.position;
        if (position) setFocusPosition({ ...position });
        if (item.kind === 'object') { setRouteMode(false); setSelectedId(item.id); setPanel('edit'); }
        else { setRouteMode(true); setPositionId(item.id); setSelectedId(null); setPanel(null); }
      }} />}
      {panel === 'edit' && selected && <>
        {/* Height in 6 in steps for a wall, the bottom edge in 3 in steps for a target: the same in 2D and 3D. */}
        {(selected.type === 'wall' || isTarget(selected)) && <View style={styles.heightRow}>
          <Text style={[styles.title, { flex: 1 }]}>{selected.type === 'wall' ? 'HEIGHT' : 'RAISED'}</Text>
          <ToolButton title="−" accessibilityLabel={selected.type === 'wall' ? 'Lower the wall' : 'Lower the target'} onPress={() => changeHeight(-1)} />
          <Text accessibilityLabel={selected.type === 'wall' ? 'Wall height' : 'Target raised'} style={[styles.title, styles.heightValue]}>{formatYards(selected.type === 'wall' ? selected.geometry.height : selected.position.z)}</Text>
          <ToolButton title="+" accessibilityLabel={selected.type === 'wall' ? 'Raise the wall' : 'Raise the target'} onPress={() => changeHeight(1)} />
        </View>}
        {/* BUILD builds: rounds, expected hits and the engaging position are in PLAN's target sheet. */}
        <ObjectInspector key={selected.id} item={selected} disabled={false} onApply={applyEdit} onRemoved={noteUndo} />
        {!!editError && <Text style={styles.error}>{editError}</Text>}
      </>}
      {panel === 'check' && <View style={{ gap: 8, paddingHorizontal: spacing.lg }}>
        <Text>Rule limits this stage can be checked against from its geometry. The match director's reading of the rules decides.</Text>
        {!stageFindings.length && <Text>No findings from the stage check.</Text>}
        {stageFindings.map((f, i) => <View key={f.code + i} style={{ borderWidth: 2, borderColor: f.severity === 'safety' ? colors.danger : colors.border, padding: 8, gap: 2 }}>
          <Text style={{ fontWeight: '700', color: f.severity === 'safety' ? colors.danger : colors.text }}>{(f.severity === 'safety' ? 'SAFETY' : f.severity === 'rule' ? 'RULE' : 'INFO') + (f.rule ? SEP + f.rule : '')}</Text>
          <Text>{f.message}</Text>
          {f.objectIds.length > 0 && stage.objects.some(o => o.id === f.objectIds[0]) && <Action title="SHOW ON STAGE" accessibilityLabel="Show on stage" onPress={() => { setSelectedId(f.objectIds[0]); setPanel(null); }} />}
        </View>)}
      </View>}
      {panel === 'summary' && <RouteAnalysis stage={stage} plan={plan} route={route} profile={profile} ruleset={activeRuleset(targetFamily) === 'PCSL' ? 'PCSL' : 'USPSA'} powerFactor={powerFactor} onRouteChange={changeRoute} onPlanChange={setPlan} edit={() => { startRouteTool('path'); }} />}
      {panel === 'plan' && <>
        <View style={styles.controls}>{(['loadout', 'targets'] as const).map(section => <ToolButton key={section} title={section === 'loadout' ? 'LOADOUT' : 'TARGET ROUNDS'} accessibilityLabel={section === 'loadout' ? 'Loadout' : 'Target rounds'} selected={planSection === section} onPress={() => setPlanSection(section)} />)}</View>
        {<PlanningPanel section={planSection} plan={plan} stage={stage} profile={profile} onChange={setPlan} />}
      </>}
      {panel === 'view' && <>
        {(['path', 'waypoints', 'nodes', 'windows', 'targetIds', 'grid'] as const).map(key => { const label = ({ path: 'Route', waypoints: words.positions, nodes: 'Engagement marks', windows: 'Moving windows', targetIds: 'Target names', grid: 'Grid' }[key]) + SEP + (layers[key] ? 'ON' : 'OFF');
          return <Action key={key} title={label.toUpperCase()} accessibilityLabel={label} onPress={() => setLayers(l => ({ ...l, [key]: !l[key] }))} />; })}
        <Action title={('Target arrows' + SEP + layers.arrows).toUpperCase()} accessibilityLabel={'Target arrows' + SEP + layers.arrows} onPress={() => setLayers(l => ({ ...l, arrows: l.arrows === 'OFF' ? 'SELECTED' : l.arrows === 'SELECTED' ? 'ALL' : 'OFF' }))} />
      </>}
      {/* The drawing under the stage (BUILD's and PLAN's •••): opacity, small nudges in yards, and REALIGN in the import. */}
      {panel === 'drawing' && backdrop && <Panel>
        <Copy>The calibrated stage drawing under the plan, to trace over. These settings are kept with the stage.</Copy>
        <Text style={ui.eyebrow}>OPACITY</Text>
        <Segmented options={DRAWING_OPACITY.map(([title]) => title)} value={DRAWING_OPACITY.find(([, value]) => value === backdrop.opacity)?.[0] ?? ''}
          onChange={title => changeDrawing({ ...backdrop, opacity: DRAWING_OPACITY.find(([t]) => t === title)?.[1] ?? backdrop.opacity })} />
        <Text style={ui.eyebrow}>NUDGE</Text>
        <Copy>{`Moves the drawing ${formatYardsFixed(DRAWING_NUDGE, 1)} per tap. Its top-left corner is at ${formatYardsFixed(backdrop.left)}${SEP}${formatYardsFixed(backdrop.top)} on the stage.`}</Copy>
        <View style={styles.controls}>{([['←', 'left', -1, 0], ['↑', 'up', 0, -1], ['↓', 'down', 0, 1], ['→', 'right', 1, 0]] as const).map(([title, way, dx, dy]) =>
          <ToolButton key={way} title={title} accessibilityLabel={'Nudge the drawing ' + way} onPress={() => changeDrawing({ ...backdrop, left: backdrop.left + dx * DRAWING_NUDGE, top: backdrop.top + dy * DRAWING_NUDGE })} />)}</View>
        <Action title="REALIGN" accessibilityLabel="Realign the drawing: set its scale points and position again" onPress={() => { setImportReopen(backdrop.id); setImportOpen(true); setPanel(null); }} />
        <Copy>REALIGN opens this drawing in the import, on its scale step: the scale points and where it sits on the stage.</Copy>
      </Panel>}
      {panel === 'snap' && <>{!routeMode && <View style={{ paddingHorizontal: spacing.lg }}><Action title={('Grid' + SEP + (gridVisible ? 'ON' : 'OFF')).toUpperCase()} accessibilityLabel={'Grid' + SEP + (gridVisible ? 'ON' : 'OFF')} onPress={() => setGridVisible(v => !v)} /></View>}<SnapControls value={snapping} onChange={setSnapping} disabled={false} /></>}
      {(panel === 'assign' || panel === 'reload') && <>
        <Action title="BACK TO POSITION" accessibilityLabel="Back to position" onPress={() => setPanel('waypoint')} />
        {!!profileError && <ErrorState title="Profile unavailable. Route timing may be unavailable." detail={profileError} />}
        {/* RELOAD lists the magazines ANALYZE plans with: yours, or the default loadout (saved with a reload picked from it). */}
        <RoutePanel onAssign={mode => { setAssignmentMode(mode); setPanel(null); }} section={panel} stage={stage} plan={plan} route={route} selectedId={positionId} onChange={changeRoute}
          profile={profile} onPlanChange={setPlan} />
      </>}
    </EditorSheet>
    {panel === 'planV2' && <RoutePlannerV2Panel stage={stage} plan={plan} preview={preview} onPreview={setPreview}
      onClose={() => { setPreview(null); setPanel(null); }}
      onConfigure={section => { if (section === 'start') { setSelectedId(stage.objects.find(o => o.type === 'start')?.id ?? null); openFrom('planV2', 'edit'); }
        // EDIT SHOOTING AREAS: DONE comes back to AUTO-PLAN. With none yet, the first area is ready for its corners.
        else if (section === 'areas') { setPreview(null); startRouteTool('areas', 'planV2'); if (!firingAreas.length) setAreaDraft([]); }
        else openFrom('planV2', 'rules'); }}
      onUse={next => { setPreview(null); setRouteEditing(false); setPlan(next); setPositionId(null); setNodeId(null); setAssignmentMode(null); setPanel(null); }} />}
    {/* The older optimizer is an alternative under PLAN's •••: closing it returns there; its settings come back to it. */}
    {panel === 'aiPlan' && <AutoPlannerPanel onSolverResult={result=>setSolverEvidence({key:solverKey,result})} onConfigure={section => { if (section === 'start') { setSelectedId(stage.objects.find(o => o.type === 'start')?.id ?? null); openFrom('aiPlan', stage.objects.some(o => o.type === 'start') ? 'edit' : 'settings'); } else if (section === 'geometry') openFrom('aiPlan', 'settings'); else if (section === 'rules') openFrom('aiPlan', 'rules'); else { setPlanSection(section); openFrom('aiPlan', 'plan'); } }} discoverySession={discoverySession} onDiscovery={setDiscoverySession} discoveryPreview={discoveryPreview} onDiscoveryPreview={() => setDiscoveryPreview(true)} stage={stage} plan={plan} profile={profile} preview={preview} onPreview={setPreview} onClose={() => { setPreview(null); setDiscoveryPreview(false); setPanel('more'); }} onUse={next => { setPreview(null); setRouteEditing(false); setPlan(next); setPositionId(null); setNodeId(null); setAssignmentMode(null); setPanel(null); }} />}
    {/* Tapping a target in PLAN (2D or 3D): its rounds, expected hits and the position that engages it. */}
    {routeMode && planTargetId && <TargetPlanSheet visible close={() => setPlanTargetId(null)} stage={stage} plan={plan} route={route} targetId={planTargetId}
      onPlanChange={setPlan} onRouteChange={changeRoute} />}
    <DiagramImportScreen visible={importOpen} reopenId={importReopen} stageId={stageId} stage={stage} family={targetFamily} close={() => { setImportOpen(false); setImportReopen(null); }} onBackdrop={setBackdrop} apply={document => documentHistory.appendObjects(document.objects)} />
  </SafeAreaView>;
}

/** Drawing opacity choices under the plan (••• → DRAWING). */
const DRAWING_OPACITY = [['OFF', 0], ['LIGHT', 0.3], ['HALF', 0.5], ['STRONG', 0.85]] as const;
/** One nudge of the drawing under the stage: a tenth of a yard. */
const DRAWING_NUDGE = yardsToInches(0.1);
const styles = themed(c => ({
  screen: { flex: 1, backgroundColor: c.background },
  nameButton: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.section, fontSize: 19, lineHeight: 22, flexShrink: 1, minWidth: 0, color: c.text },
  pencil: { ...typography.label, fontSize: 20, color: c.muted },
  canvas: { flex: 1, minHeight: 100, marginHorizontal: 0 },
  title: { ...typography.section, color: c.text },
  status: { ...typography.category, color: c.muted, marginVertical: 4, flexShrink: 1 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 6, paddingTop: 6 },
  viewSwitch: { position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row', gap: 0, backgroundColor: c.panel },
  fit: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  heightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  heightValue: { minWidth: 88, textAlign: 'center' },
  pressed: { opacity: 0.65 },
  error: { ...typography.body, color: c.danger, padding: 8 },
  note: { ...typography.body, fontSize: 15, lineHeight: 20, color: c.muted, paddingHorizontal: 8, paddingVertical: 4 },
}));
