import { recognizers, propose } from './recognition';
import { readRaster } from './rasterReader';
import { mergeDetections, acceptSelection, editSegmentOverlay } from './proposalEdits';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uuid } from 'expo-modules-core';
import { Action, Copy, Loading, Notice, Panel, ScreenHeader, Section, Segmented, ToolButton, colors, ui } from '../ui/kit';
import { borders, spacing, themed, typography } from '../ui/tokens';
import { useThemeMode } from '../ui/theme';
import { readPref, writePref } from '../ui/prefsStore';
import { useRepository } from '../storage/StorageProvider';
import { OperationGate } from '../training/operationGate';
import type { StageDocument } from '../stage/model';
import type { TargetFamily } from '../stage/targetFamily';
import { presetsForFamily } from '../stage/targetPresets';
import { formatYards, inchesToYards, yardsToInches } from '../stage/measurements';
import { assetUri, deleteDocumentFiles, pickDocument, pickPhoto, photographPaper, openOriginal } from './assets';
import { takeDerivatives } from './sessionFiles';
import { alignPage, preparePage } from './preparation';
import { fullCrop, fullQuad, latestBackdrop, reconstruct, validQuad, validCrop, validProposal, imagePoint, validateReconstruction } from './model';
import type { DocumentAsset, Point, Proposal, Reconstruction } from './model';
import {
  AUTO_SAVE_HINT_KEY, AUTO_SAVE_NOTICE, EVIDENCE, STEP_ORDER, TYPE_CHOICES, addNeeds, closeDecision, drawingNeeds, errorText, evidenceLabels,
  proposalTypeLabel, referenceSummary, reviewStatus, reviewSummary, scaleStatusLabels, shapeLabels, sourceKindLabels, stepParts, stepsDone, unclassified,
} from './importFlow';
import type { ImportStep } from './importFlow';

const CORNER_NAMES = ['top left', 'top right', 'bottom right', 'bottom left'] as const;
const CORNER_OPTIONS = ['1 TOP LEFT', '2 TOP RIGHT', '3 BOTTOM RIGHT', '4 BOTTOM LEFT'];
const CROP_OPTIONS = ['TOP LEFT', 'BOTTOM RIGHT'];
const TOP_DOWN = 'TOP-DOWN PLAN', PERSPECTIVE = 'PERSPECTIVE OR ISOMETRIC · REFERENCE ONLY';
const UNITS = ['in', 'ft', 'yd'] as const;
const MAX_REFERENCES = 20;
const list = (items: readonly string[]) => items.join(' · ');

function NumberField({ label, value, change, disabled = false }: { label: string; value: number; change: (value: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(current => Object.is(Number(current), value) ? current : Number.isFinite(value) ? String(value) : current); }, [value]);
  return <View style={styles.field}><Text style={ui.eyebrow}>{label}</Text>
    <TextInput editable={!disabled} accessibilityLabel={label} value={text} keyboardType="numbers-and-punctuation" style={ui.input} placeholderTextColor={colors.subdued}
      onChangeText={value => { setText(value); change(value.trim() ? Number(value) : NaN); }} /></View>;
}
function DocumentImage({ asset, width, height, tap, children }: { asset: DocumentAsset; width: number; height: number; tap?: (p: Point) => void; children?: ReactNode }) {
  const [uri, setUri] = useState(''), [error, setError] = useState(''), [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => { let current = true; setUri(''); setError(''); assetUri(asset).then(uri => { if (current) setUri(uri); }).catch(e => { if (current) setError(errorText(e)); }); return () => { current = false; }; }, [asset.path]);
  // A margin around the picture keeps markers on its edges and corners whole instead of clipped.
  return <View style={{ gap: spacing.sm }}>
    {!!error && <Notice tone="error">{error}</Notice>}
    <View style={{ padding: spacing.md, backgroundColor: colors.secondary, borderWidth: borders.regular, borderColor: colors.hairline }}>
    <Pressable accessibilityLabel="Stage diagram preview" accessibilityHint="Tap to place the point named above. ENTER NUMBERS gives coordinate fields instead." onLayout={e => setSize(e.nativeEvent.layout)}
      onPress={e => {
        // iOS reports locationX/Y; the browser's click event only has offsetX/Y.
        const n = e.nativeEvent as { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
        const x = Number.isFinite(n.locationX) ? n.locationX! : n.offsetX ?? NaN, y = Number.isFinite(n.locationY) ? n.locationY! : n.offsetY ?? NaN;
        if (size.width > 0 && size.height > 0 && Number.isFinite(x) && Number.isFinite(y)) tap?.({ x: Math.max(0, Math.min(1, x / size.width)), y: Math.max(0, Math.min(1, y / size.height)) });
      }}
      style={{ width: '100%', aspectRatio: width / height, backgroundColor: colors.canvas }}>
      {!!uri && <View pointerEvents="none" style={styles.fill}><Image source={{ uri }} resizeMode="stretch" style={{ width: '100%', height: '100%' }} /></View>}
      <View pointerEvents="none" style={styles.fill}>{children}</View>
    </Pressable>
    </View>
  </View>;
}
/** A numbered marker on the drawing; filled when it is the point a tap places now. */
function Marker({ at, label, active = false, tone }: { at: Point; label: string; active?: boolean; tone?: string }) {
  return <View style={[styles.marker, { left: `${at.x * 100}%`, top: `${at.y * 100}%`, borderColor: tone ?? colors.border }, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
    <Text style={[styles.markerText, active && { color: colors.onAccent }]}>{label}</Text></View>;
}
/** Review marks sit on a printed (usually white) drawing, so each line has a halo in the background colour. */
function ProposalOverlay({ proposal: p, number, selected }: { proposal: Proposal; number: number; selected: boolean }) {
  const [size,setSize] = useState({width:0,height:0});
  const tone = p.accepted ? colors.accent : p.reviewed ? colors.subdued : colors.detected, line = selected ? 4 : 2, dash = p.accepted ? 'solid' as const : 'dashed' as const;
  const start = {x:p.position.x*size.width,y:p.position.y*size.height};
  const end = p.end ? {x:p.end.x*size.width,y:p.end.y*size.height} : start;
  const length = Math.hypot(end.x-start.x,end.y-start.y), angle = Math.atan2(end.y-start.y,end.x-start.x)+'rad';
  const mark = p.accepted ? ' ✓' : p.reviewed ? ' ✕' : '';
  return <View onLayout={e=>setSize(e.nativeEvent.layout)} style={styles.fill}>
    {!p.end && p.extent && <View style={{position:'absolute',left:(p.position.x-p.extent.width/2)*size.width-1,top:(p.position.y-p.extent.height/2)*size.height-1,width:p.extent.width*size.width+2,height:p.extent.height*size.height+2,borderWidth:1,borderColor:colors.background,borderRadius:p.recognition?.shape==='circle'?999:0,transform:[{rotate:p.rotation+'deg'}]}}>
      <View style={{flex:1,borderWidth:line,borderColor:tone,borderStyle:dash,borderRadius:p.recognition?.shape==='circle'?999:0}} /></View>}
    {p.end && length>0 && <>
      <View style={{position:'absolute',left:(start.x+end.x)/2-length/2,top:(start.y+end.y)/2-line/2-1,width:length,height:line+2,backgroundColor:colors.background,transform:[{rotate:angle}]}} />
      <View style={{position:'absolute',left:(start.x+end.x)/2-length/2,top:(start.y+end.y)/2-line/2,width:length,borderTopWidth:line,borderColor:tone,borderStyle:dash,transform:[{rotate:angle}]}} />
    </>}
    <View style={[styles.chip,{left:`${p.position.x*100}%`,top:`${p.position.y*100}%`,borderColor:tone,borderStyle:dash,borderWidth:selected?3:2,transform:[{rotate:(p.end?0:p.rotation)+'deg'}]}]}><Text style={styles.markerText}>{number}{mark}</Text></View>
    {p.end && <View style={{position:'absolute',left:`${p.end.x*100}%`,top:`${p.end.y*100}%`,marginLeft:-5,marginTop:-5,width:10,height:10,borderWidth:2,borderColor:tone,backgroundColor:colors.panel}} />}
  </View>;
}

/** The drawing the editor shows under the stage: which saved drawing (`id`), its picture and placement in stage inches. */
export type EditorBackdrop = { id: string; uri: string; left: number; top: number; width: number; height: number; opacity: number };

export default function DiagramImportScreen({ visible, stageId, stage, family, close, apply, onBackdrop, reopenId = null }: {
  visible: boolean; stageId: string; stage: StageDocument; family: TargetFamily; close: () => void; apply: (stage: StageDocument) => void;
  /** The latest calibrated top-down drawing, for the editor to show under the plan (null when there is none). */
  onBackdrop?: (backdrop: EditorBackdrop | null) => void;
  /** Opens on this saved drawing (its SCALE step once it is straightened): the editor's REALIGN. */
  reopenId?: string | null;
}) {
  useThemeMode();
  const repo = useRepository(), gate = useRef(new OperationGate());
  // Whenever the import closes, hand the editor the drawing to trace over.
  useEffect(() => {
    if (visible || !onBackdrop) return;
    let active = true;
    repo.loadDiagramImports(stageId).then(async drafts => {
      const latest = latestBackdrop(drafts);
      const next = latest ? { id: latest.id, uri: await assetUri(latest.backdrop.asset), left: latest.backdrop.left, top: latest.backdrop.top, width: latest.backdrop.width, height: latest.backdrop.height, opacity: latest.backdrop.opacity } : null;
      if (active) onBackdrop(next);
    }).catch(() => { if (active) onBackdrop(null); });
    return () => { active = false; };
  }, [visible, stageId]);
  const recognitionAbort = useRef<AbortController | null>(null);
  const [recognizing,setRecognizing] = useState(false), [batchIds,setBatchIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<Reconstruction | null>(null), [references, setReferences] = useState<Reconstruction[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [confirmClose, setConfirmClose] = useState(false);
  const [step, setStep] = useState<ImportStep>('photo'), [cropping, setCropping] = useState(false);
  const [corner, setCorner] = useState(0), [cursor, setCursor] = useState<'a' | 'b' | 'object' | 'end' | 'cropA' | 'cropB'>('object');
  const [selectedId, setSelectedId] = useState<string | null>(null), [showOriginal, setShowOriginal] = useState(false);
  const [pageNumber, setPageNumber] = useState(1), [distance, setDistance] = useState(120), [unit, setUnit] = useState<'in' | 'ft' | 'yd'>('in');
  const [a, setA] = useState<Point>({ x: .1, y: .5 }), [b, setB] = useState<Point>({ x: .9, y: .5 });
  const [evidence, setEvidence] = useState<'grid' | 'labeled-dimension' | 'user'>('user');
  const [damagedIds, setDamagedIds] = useState<string[]>([]), [cameraDenied, setCameraDenied] = useState(false), [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** The draft as last saved (JSON), to tell whether closing needs to save or ask. */
  const [savedJson, setSavedJson] = useState<string | null>(null);
  const [numbers, setNumbers] = useState(false), [several, setSeveral] = useState(false), [toast, setToast] = useState(false);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(false), 5000); return () => clearTimeout(timer); }, [toast]);
  const draftPaths = (d: Reconstruction) => [d.source, d.page?.asset, d.rectified?.asset, d.aligned?.asset].flatMap(a => a?.path ? [a.path] : []);
  const refresh = async (current: (callback: () => void) => void) => { const report = await repo.loadDiagramImportsReport(stageId); current(() => { setReferences(report.drafts); setDamagedIds(report.damagedIds); }); return report.drafts; };
  const deleteReference = (value: Reconstruction) => void run(async current => {
    await repo.deleteDiagramImport(stageId, value.id);
    // Shared originals (duplicated stages) are kept while any other draft still references them.
    await deleteDocumentFiles(draftPaths(value), await repo.diagramAssetPathsInUse());
    current(() => { setConfirmDeleteId(null); if (draft?.id === value.id) { setDraft(null); setSavedJson(null); setStep('photo'); } setMessage('Reference deleted. The stage and its route did not change.'); });
    await refresh(current);
  });
  const removeDamaged = () => void run(async current => {
    for (const id of damagedIds) await repo.deleteDiagramImport(stageId, id);
    current(() => setMessage(damagedIds.length === 1 ? '1 unreadable reference removed.' : damagedIds.length + ' unreadable references removed.'));
    await refresh(current);
  });
  async function run(work: (current: (callback: () => void) => void) => Promise<void>) {
    const token = gate.current.begin(); if (token === null) return;
    setBusy(true); setError(''); setMessage('');
    const current = (callback: () => void) => { if (gate.current.current(token)) callback(); };
    try { await work(current); } catch (error) { current(() => setError(errorText(error))); }
    finally { current(() => setBusy(false)); gate.current.finish(token); }
  }
  useEffect(() => {
    if (!visible) {
      recognitionAbort.current?.abort(); gate.current.dispose();
      // Derivative images made this session but not referenced by any saved draft are discarded.
      const created = takeDerivatives();
      if (created.length) void repo.diagramAssetPathsInUse().then(inUse => deleteDocumentFiles(created, inUse)).catch(() => {});
      return;
    }
    gate.current.activate(); setRecognizing(false); setBusy(false); setConfirmClose(false); setError(''); setCameraDenied(false); setConfirmDeleteId(null); setToast(false);
    void run(async current => {
      const drafts = await refresh(current);
      // REALIGN from the editor: open that drawing where its scale points and origin are set.
      const reopen = reopenId ? drafts.find(d => d.id === reopenId) : undefined;
      if (reopen) current(() => load(reopen));
    });
    return () => { recognitionAbort.current?.abort(); gate.current.dispose(); };
  }, [visible, stageId, repo]);
  const exit = () => { setDraft(null); setSavedJson(null); setSelectedId(null); setStep('photo'); setCropping(false); setSeveral(false); setConfirmClose(false); close(); };
  const update = (changes: Partial<Reconstruction>) => {
    if (!draft) return;
    // Editing preparation cannot leave old proposals/scale attached to different pixels.
    if (changes.alignment && JSON.stringify(changes.alignment) !== JSON.stringify(draft.alignment)) {
      setBatchIds([]);
      // The crop is drawn on the straightened page, so new corners or rotation also start it again from the whole page.
      if (step === 'corners' && cropping) changes = { aligned: undefined, calibration: undefined, proposals: [], ...changes };
      else if (step !== 'scale') changes = { rectified: undefined, aligned: undefined, calibration: undefined, proposals: [], ...changes, alignment: { ...changes.alignment, crop: fullCrop() } };
    }
    setDraft({ ...draft, ...changes });
  };
  const selected = draft?.proposals.find(p => p.id === selectedId);
  const changeProposal = (changes: Partial<Proposal>) => { if (draft && selected) update({ proposals: draft.proposals.map(p => p.id === selected.id ? { ...p, ...changes } : p) }); };
  const saveDraft = async (value: Reconstruction) => { validateReconstruction(value); await repo.saveDiagramImport(stageId, value); };
  const persist = async (value: Reconstruction, current: (callback: () => void) => void) => { await saveDraft(value); current(() => setSavedJson(JSON.stringify(value))); };
  const dirty = !!draft && JSON.stringify(draft) !== savedJson;
  const load = (value: Reconstruction) => {
    setDraft(value); setSavedJson(JSON.stringify(value)); setBatchIds([]); setSelectedId(null); setSeveral(false); setConfirmClose(false); setShowOriginal(false);
    setStep(value.aligned ? 'scale' : value.page ? 'corners' : 'photo'); setCropping(!!value.rectified && !value.aligned);
    setCursor(value.aligned ? (value.calibration ? 'object' : 'a') : 'cropA'); setPageNumber(value.page?.page ?? 1);
    if (value.calibration) { setA(value.calibration.a); setB(value.calibration.b); setDistance(value.calibration.inches); setUnit('in'); setEvidence(value.calibration.evidence); }
  };
  const importSource = (camera: 'file' | 'photos' | 'camera') => void run(async current => {
    current(() => setCameraDenied(false));
    let picked;
    try { picked = await (camera === 'camera' ? photographPaper() : camera === 'photos' ? pickPhoto() : pickDocument()); }
    catch (error) { if ((error as { code?: string }).code === 'CAMERA_DENIED') current(() => setCameraDenied(true)); throw error; }
    if (!picked) return;
    // Top-down plan is picked by default; Perspective or isometric stays one tap away on the Scale step.
    const value: Reconstruction = { version: 1, id: uuid.v4(), source: picked.asset, sourceKind: picked.kind, alignment: { corners: fullQuad(), rotation: 0, crop: fullCrop() }, projection: 'top-down', origin: { x: 0, y: 0 }, proposals: [] };
    await saveDraft(value); // Preserve the original even if rasterization is unavailable or fails.
    current(() => { load(value); setReferences(old => [...old, value]); });
    const result = await preparePage(value.source, 1);
    current(() => {
      setDraft({ ...value, page: result.page, alignment: { ...value.alignment, corners: result.corners && validQuad(result.corners) ? result.corners : fullQuad() } });
      setMessage(value.sourceKind === 'pdf' ? `Page 1 of ${result.page.pageCount} ready. Pick another page if you need to, then NEXT.` : 'Picture ready. NEXT to check its corners.');
    });
  });
  const renderPage = () => { if (!draft) return; void run(async current => { const result = await preparePage(draft.source, pageNumber); current(() => { update({ page: result.page, rectified: undefined, aligned: undefined, calibration: undefined, proposals: [], projection: 'top-down', alignment: { corners: result.corners && validQuad(result.corners) ? result.corners : fullQuad(), rotation: 0, crop: fullCrop() } }); setShowOriginal(false); setSelectedId(null); }); }); };
  const detect = () => { if (gate.current.busy || !visible || !draft?.aligned || draft.projection !== 'top-down') return;
    const snapshot=draft, controller=new AbortController();recognitionAbort.current=controller;setShowOriginal(false);setRecognizing(true);
    void run(async current=>{try{const raster=await readRaster(snapshot.aligned!,controller.signal);const result=await propose(snapshot,raster,recognizers[0],controller.signal);current(()=>{update({proposals:mergeDetections(snapshot.proposals,result.proposals)});setBatchIds([]);setMessage((result.proposals.length===1?'1 shape found. ':result.proposals.length+' shapes found. ')+result.warnings.join(' '));});}catch(error){throw new Error(errorText(error)+' You can still add elements by hand; nothing on the stage changed.');}finally{current(()=>setRecognizing(false));if(recognitionAbort.current===controller)recognitionAbort.current=null;}});
  };
  const batch = (accepted:boolean) => { if(!draft)return;try{update({proposals:acceptSelection(draft.proposals,batchIds,accepted)});setError('');}catch(e){setError(errorText(e));} };
  const segmentEdit = (edit:{rotation?:number;lengthPixels?:number}) => { if(!selected||!draft?.aligned)return;try{changeProposal(editSegmentOverlay(selected,draft.aligned,edit));setError('');}catch(e){setError(errorText(e));} };
  const activePage = !draft ? undefined : showOriginal || step === 'photo' ? draft.page : step === 'corners' ? (cropping ? draft.rectified : draft.page) : draft.aligned;
  const tap = (p: Point) => {
    if (!draft || showOriginal) return;
    if (step === 'corners' && !cropping) { const corners = [...draft.alignment.corners] as Reconstruction['alignment']['corners']; corners[corner] = p; update({ alignment: { ...draft.alignment, corners } }); }
    else if (step === 'corners') {
      const c = draft.alignment.crop;
      const far = { x: c.x + c.width, y: c.y + c.height };
      update({ alignment: { ...draft.alignment, crop: cursor === 'cropB' ? { ...c, width: p.x - c.x, height: p.y - c.y } : { x: p.x, y: p.y, width: far.x - p.x, height: far.y - p.y } } });
    } else if (step !== 'scale') return;
    else if (cursor === 'a') { setA(p); update({calibration:undefined}); }
    else if (cursor === 'b') { setB(p); update({calibration:undefined}); }
    else if (selected) changeProposal(cursor === 'end' ? { end: p } : { position: p });
  };

  // Steps: 1 PHOTO (source and page) · 2 CORNERS (corners, optional crop; NEXT aligns) · 3 SCALE (kind, scale, origin, elements).
  const stepIndex = STEP_ORDER.indexOf(step), done = stepsDone(draft);
  const goTo = (next: ImportStep) => { setStep(next); setCropping(false); setShowOriginal(false); setConfirmClose(false); if (next === 'scale') setCursor(draft?.calibration ? 'object' : 'a'); };
  const startCrop = () => { if (!draft?.page) return;
    const enter = () => { setCropping(true); setCursor('cropA'); setShowOriginal(false); };
    if (draft.rectified) return enter();
    void run(async current => { const rectified = await alignPage(draft.page!, { ...draft.alignment, crop: fullCrop() }); current(() => { update({ rectified }); enter(); }); });
  };
  const alignAndContinue = () => { if (!draft?.page) return;
    if (draft.aligned) return goTo('scale'); // Nothing changed since it was aligned: changes clear `aligned`.
    void run(async current => {
      const rectified = draft.rectified ?? await alignPage(draft.page!, { ...draft.alignment, crop: fullCrop() });
      const aligned = await alignPage(rectified, { corners: fullQuad(), rotation: 0, crop: draft.alignment.crop });
      current(() => { update({ rectified, aligned, calibration: undefined, proposals: [] }); goTo('scale'); });
    });
  };
  const addToStage = () => { if (!draft) return; void run(async current => {
    const document = reconstruct(draft, stage, family); await persist(draft, current);
    const added = document.objects.length - stage.objects.length;
    current(() => { setReferences(old => [...old.filter(value => value.id !== draft.id), draft]); apply(document);
      setMessage(document === stage ? 'These elements are already on the stage. Edit them in the Stage editor, or undo the earlier addition there before adding corrected ones.'
        : (added === 1 ? 'Added 1 element to the stage. Save in the Stage editor to keep it' : 'Added ' + added + ' elements to the stage. Save in the Stage editor to keep them') + '; undo there removes this addition. Existing objects and the route are unchanged.'); });
  }); };
  const confirmScale = () => { if (!draft) return; try { const calibration = { a, b, inches: distance * (unit === 'ft' ? 12 : unit === 'yd' ? 36 : 1), evidence, approximate: true }; validateReconstruction({ ...draft, calibration }); update({ calibration }); setMessage('Scale confirmed as approximate. Check it against a second known distance before accepting elements.'); setError(''); } catch (e) { setError(errorText(e)); } };
  /** Closing saves a draft that can become the drawing under the stage; other unsaved changes ask first; no changes just close. */
  const requestClose = () => {
    if (busy) return;
    const decision = closeDecision(draft, savedJson);
    if (decision === 'close') return exit();
    if (decision === 'ask') return setConfirmClose(true);
    const value = draft!;
    void run(async current => {
      try { await saveDraft(value); }
      catch (e) { current(() => { setError('Couldn’t save the drawing: ' + errorText(e)); setConfirmClose(true); }); return; }
      current(() => {
        exit();
        if (!readPref(AUTO_SAVE_HINT_KEY)) { writePref(AUTO_SAVE_HINT_KEY, '1'); setToast(true); AccessibilityInfo?.announceForAccessibility?.(AUTO_SAVE_NOTICE); }
      });
    });
  };

  const parts = stepParts(done);
  const stepBar = <View style={styles.stepBar} accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${stepIndex + 1} of 3, ${parts[stepIndex].replace(/^\d /, '').replace(' ✓', '').toLowerCase()}${done.some(Boolean) ? '. Done: ' + parts.filter((_, i) => done[i]).map(p => p.replace(/^\d /, '').replace(' ✓', '').toLowerCase()).join(', ') : ''}`}
    accessibilityValue={{ min: 1, max: 3, now: stepIndex + 1 }}>
    <View style={styles.track}><View style={[styles.progress, { width: `${(stepIndex + 1) / 3 * 100}%` }]} /></View>
    <Text style={styles.steps}>{parts.map((part, i) => [i > 0 && ' · ', <Text key={part} style={i === stepIndex ? styles.current : undefined}>{part}</Text>])}</Text>
    {busy && <Loading label={recognizing ? 'Detecting shapes…' : 'Working…'} />}
    {recognizing && <Action title="CANCEL DETECTION" onPress={() => recognitionAbort.current?.abort()} />}
  </View>;

  const tapHint = !draft || step === 'photo' ? '' : showOriginal ? 'Showing the original page. Taps do nothing here.'
    : step === 'corners' ? (cropping ? `Tap places the crop's ${cursor === 'cropB' ? 'bottom right' : 'top left'} corner` : `Tap places corner ${corner + 1} · ${CORNER_NAMES[corner]}`)
    : cursor === 'a' || cursor === 'b' ? `Tap places scale point ${cursor.toUpperCase()}`
    : selected ? `Tap ${cursor === 'end' ? 'places the end of' : 'moves'} element ${draft.proposals.indexOf(selected) + 1}` : 'Pick a scale point or an element, then tap the drawing to place it';
  const image = draft && activePage && <View style={{ gap: spacing.sm }}>
    {!!tapHint && <Text style={ui.eyebrow}>{tapHint.toUpperCase()}</Text>}
    <DocumentImage asset={activePage.asset} width={activePage.width} height={activePage.height} tap={busy || step === 'photo' ? undefined : tap}>
      {!showOriginal && step === 'corners' && !cropping && draft.alignment.corners.map((p,i) => imagePoint(p) && <Marker key={i} at={p} label={String(i + 1)} active={corner === i} />)}
      {!showOriginal && step === 'corners' && cropping && validCrop(draft.alignment.crop) && <View style={{ position: 'absolute', left: `${draft.alignment.crop.x*100}%`, top: `${draft.alignment.crop.y*100}%`, width: `${draft.alignment.crop.width*100}%`, height: `${draft.alignment.crop.height*100}%`, borderWidth: 1, borderColor: colors.background }}>
        <View style={{ flex: 1, borderWidth: 3, borderStyle: 'dashed', borderColor: colors.accent }} /></View>}
      {!showOriginal && step === 'scale' && <>
        {draft.proposals.map((p,i) => validProposal(p) && <ProposalOverlay key={p.id} proposal={p} number={i+1} selected={p.id===selectedId} />)}
        {[a,b].map((p,i) => imagePoint(p) && <Marker key={'scale'+i} at={p} label={i ? 'B' : 'A'} active={cursor === (i ? 'b' : 'a')} />)}
      </>}
    </DocumentImage>
    {step !== 'photo' && <View style={styles.row}>
      <Action title={numbers ? 'HIDE NUMBERS' : 'ENTER NUMBERS'} variant="quiet" disabled={busy} onPress={() => setNumbers(v => !v)} />
      {(step === 'scale' || cropping) && <Action title={showOriginal ? 'SHOW STRAIGHTENED DRAWING' : 'SHOW ORIGINAL PAGE'} variant="quiet" disabled={!draft.page || busy} onPress={() => setShowOriginal(v => !v)} />}
    </View>}
  </View>;

  const draftCard = draft && <View style={styles.card}>
    <Text style={ui.sectionTitle} numberOfLines={2}>{draft.source.name}</Text>
    <Copy>{list([sourceKindLabels[draft.sourceKind], referenceSummary(draft), dirty ? 'Unsaved changes' : 'Saved'])}</Copy>
    <View style={styles.row}>
      <Action title={dirty ? 'SAVE DRAFT' : 'SAVED ✓'} disabled={busy || !dirty} onPress={() => void run(async current => { await persist(draft, current); const saved = await repo.loadDiagramImports(stageId); current(() => { setReferences(saved); setMessage('Reference saved. The stage and its route did not change.'); }); })} />
      {step === 'photo' && <Action title="OPEN ORIGINAL FILE" disabled={busy} onPress={() => void run(async () => { await openOriginal(draft.source); })} />}
    </View>
  </View>;

  const atLimit = references.length + damagedIds.length >= MAX_REFERENCES;
  const photoStep = <>
    <Section title="Choose the drawing">
      <Copy>A stage briefing PDF, an exported plan, a screenshot, or a photo of the printed page. Only a top-down plan can add elements to the stage; any drawing can be kept for reference.</Copy>
      {atLimit && <Notice tone="warning">This stage has {MAX_REFERENCES} saved references. Delete one below to import another.</Notice>}
      <View style={styles.row}>
        {Platform.OS === 'ios' && <Action title="CHOOSE FROM PHOTOS" disabled={busy || atLimit} onPress={() => importSource('photos')} />}
        <Action title="IMPORT PDF OR IMAGE" disabled={busy || atLimit} onPress={() => importSource('file')} />
        <Action title="PHOTOGRAPH PAPER" disabled={busy || atLimit} onPress={() => importSource('camera')} />
      </View>
      {cameraDenied && <Action title="OPEN SETTINGS TO ALLOW THE CAMERA" onPress={() => { void Linking.openSettings(); }} />}
    </Section>
    {draft && <Section title="Page">
      {draftCard}
      {draft.sourceKind === 'pdf' ? <View style={styles.row}>
        <NumberField disabled={busy} label={'PDF page (1–' + (draft.page?.pageCount ?? '?') + ')'} value={pageNumber} change={setPageNumber} />
        <View style={{ justifyContent: 'flex-end' }}><Action title="SHOW PAGE" disabled={busy} onPress={renderPage} /></View>
      </View> : !draft.page && <Action title="PREPARE THE PICTURE AGAIN" disabled={busy} onPress={renderPage} />}
      {image}
    </Section>}
    {(references.length > 0 || damagedIds.length > 0) && <Section title={`Saved references · ${references.length} of ${MAX_REFERENCES}`}>
      {references.map(value => <View key={value.id} style={styles.card}>
        <Text style={ui.sectionTitle} numberOfLines={2}>{value.source.name}</Text>
        <Copy>{list([sourceKindLabels[value.sourceKind], referenceSummary(draft?.id === value.id ? draft : value), ...(draft?.id === value.id ? ['Open now'] : [])])}</Copy>
        {confirmDeleteId === value.id ? <>
          <Notice tone="warning">Delete this reference and its pictures? The stage and its route don’t change.</Notice>
          <View style={styles.row}><Action title="KEEP" disabled={busy} onPress={() => setConfirmDeleteId(null)} /><Action title="DELETE REFERENCE" accessibilityLabel={'Confirm deleting reference ' + value.source.name} variant="destructive" disabled={busy} onPress={() => deleteReference(value)} /></View>
        </> : <View style={styles.row}>
          <Action title="OPEN" accessibilityLabel={'Open reference ' + value.source.name} disabled={busy} onPress={() => load(value)} />
          <Action title="DELETE" accessibilityLabel={'Delete reference ' + value.source.name} disabled={busy} onPress={() => setConfirmDeleteId(value.id)} />
        </View>}
      </View>)}
      {!!damagedIds.length && <><Notice tone="warning">{damagedIds.length === 1 ? '1 saved reference can’t be read and is hidden.' : damagedIds.length + ' saved references can’t be read and are hidden.'} Their data has not been changed.</Notice><Action title="REMOVE UNREADABLE REFERENCES" disabled={busy} onPress={removeDamaged} /></>}
    </Section>}
  </>;

  const cropIsWhole = !!draft && JSON.stringify(draft.alignment.crop) === JSON.stringify(fullCrop());
  const laterWork = !!draft && (!!draft.calibration || draft.proposals.length > 0);
  const cornersStep = draft && <>
    {draftCard}
    {!cropping ? <>
      <Copy>Check that the four numbered corners sit on the corners of the page, or of the drawing on it: 1 top left, 2 top right, 3 bottom right, 4 bottom left. Suggested corners are a guess. Straightening a photo doesn’t turn a perspective drawing into a top-down plan.</Copy>
      {laterWork && <Notice tone="warning">Changing the corners or rotation clears the scale and the elements found on step 3.</Notice>}
      {image}
      <Segmented options={CORNER_OPTIONS} value={CORNER_OPTIONS[corner]} disabled={busy} onChange={v => setCorner(CORNER_OPTIONS.indexOf(v))} />
      {numbers && <View style={styles.row}>
        <NumberField disabled={busy} label="Corner X (%)" value={draft.alignment.corners[corner].x*100} change={x=>{const corners=[...draft.alignment.corners] as Reconstruction['alignment']['corners'];corners[corner]={...corners[corner],x:x/100};update({alignment:{...draft.alignment,corners}});}} />
        <NumberField disabled={busy} label="Corner Y (%)" value={draft.alignment.corners[corner].y*100} change={y=>{const corners=[...draft.alignment.corners] as Reconstruction['alignment']['corners'];corners[corner]={...corners[corner],y:y/100};update({alignment:{...draft.alignment,corners}});}} />
      </View>}
      <View style={styles.row}>
        <Action title={'ROTATE ↻ · ' + draft.alignment.rotation + '°'} accessibilityLabel={'Rotate the page clockwise, now ' + draft.alignment.rotation + ' degrees'} disabled={busy} onPress={()=>update({alignment:{...draft.alignment,rotation:((draft.alignment.rotation+90)%360) as 0|90|180|270}})} />
        <Action title="RESET CORNERS" disabled={busy} onPress={()=>update({alignment:{...draft.alignment,corners:fullQuad()}})} />
      </View>
      <Section title="Crop (optional)">
        <Copy>{cropIsWhole ? 'Uses the whole page. Crop to leave out headings, briefing text, logos, legends and inset views.' : `Cropped to ${Math.round(draft.alignment.crop.width * 100)}% × ${Math.round(draft.alignment.crop.height * 100)}% of the straightened page.`}</Copy>
        <Action title={cropIsWhole ? 'CROP' : 'EDIT CROP'} disabled={busy || !draft.page || !validQuad(draft.alignment.corners)} onPress={startCrop} />
      </Section>
    </> : <Section title="Crop (optional)">
      <Copy>Crop the straightened page to the stage layout. Leave out headings, briefing text, logos, legends and inset views. You choose the region; nothing is detected automatically.</Copy>
      {laterWork && <Notice tone="warning">Changing the crop clears the scale and the elements found on step 3.</Notice>}
      {image}
      <Segmented options={CROP_OPTIONS} value={cursor === 'cropB' ? CROP_OPTIONS[1] : CROP_OPTIONS[0]} disabled={busy} onChange={v => setCursor(v === CROP_OPTIONS[1] ? 'cropB' : 'cropA')} />
      {numbers && <View style={styles.row}>{(['x','y','width','height'] as const).map(key=><NumberField disabled={busy} key={key} label={'Crop ' + ({ x: 'left', y: 'top', width: 'width', height: 'height' })[key] + ' (%)'} value={draft.alignment.crop[key]*100} change={value=>update({alignment:{...draft.alignment,crop:{...draft.alignment.crop,[key]:value/100}}})} />)}</View>}
      <View style={styles.row}>
        <Action title="WHOLE PAGE" disabled={busy || cropIsWhole} onPress={() => update({ alignment: { ...draft.alignment, crop: fullCrop() } })} />
        <Action title="DONE" accessibilityLabel="Done cropping" disabled={busy} onPress={() => { setCropping(false); setShowOriginal(false); }} />
      </View>
    </Section>}
  </>;

  const presets = selected ? presetsForFamily(family).filter(p => p.type === selected.type) : [];
  const typeValue = selected ? TYPE_CHOICES.find(([type]) => type === selected.type)?.[1] ?? '' : '';
  const scaleStep = draft && (draft.aligned ? <>
    {draftCard}
    {image}
    <Section title="Kind of drawing">
      <Segmented options={[TOP_DOWN, PERSPECTIVE]} value={draft.projection === 'top-down' ? TOP_DOWN : draft.projection === 'perspective' ? PERSPECTIVE : ''} disabled={busy} onChange={v => update({ projection: v === TOP_DOWN ? 'top-down' : 'perspective' })} />
      {draft.projection === 'perspective' ? <Notice tone="warning">Reference only: a perspective or isometric drawing can’t add elements or go under the stage.</Notice>
        : draft.projection === 'unknown' && <Notice tone="warning">Pick the kind of drawing. Only a top-down plan can add elements or go under the stage.</Notice>}
    </Section>
    <Section title="Scale">
      <Copy>Place A and B on two points a known distance apart, such as two grid lines or the ends of a labelled dimension, then enter that distance. Never use the size of a printed target icon. Straightening a photo only estimates proportions, so check a second distance.</Copy>
      <Segmented options={['POINT A', 'POINT B']} value={cursor === 'a' ? 'POINT A' : cursor === 'b' ? 'POINT B' : ''} disabled={busy} onChange={v => setCursor(v === 'POINT A' ? 'a' : 'b')} />
      {numbers && <View style={styles.row}>{(['a','b'] as const).flatMap(key=>(['x','y'] as const).map(axis=><NumberField disabled={busy} key={key+axis} label={'Point '+key.toUpperCase()+' '+axis.toUpperCase()+' (%)'} value={(key==='a'?a:b)[axis]*100} change={value=>{(key==='a'?setA:setB)(old=>({...old,[axis]:value/100}));update({calibration:undefined});}} />))}</View>}
      <NumberField disabled={busy} label="Known distance" value={distance} change={value=>{setDistance(value);update({calibration:undefined});}} />
      <Segmented options={UNITS.map(u => u.toUpperCase())} value={unit.toUpperCase()} disabled={busy} onChange={v => { setUnit(v.toLowerCase() as typeof unit); update({ calibration: undefined }); }} />
      <Text style={ui.eyebrow}>WHERE THE DISTANCE COMES FROM</Text>
      <Segmented options={EVIDENCE.map(e => evidenceLabels[e].toUpperCase())} value={evidenceLabels[evidence].toUpperCase()} disabled={busy} onChange={v => { setEvidence(EVIDENCE.find(e => evidenceLabels[e].toUpperCase() === v) ?? 'user'); update({ calibration: undefined }); }} />
      <Action title={draft.calibration ? 'SCALE CONFIRMED ✓' : 'CONFIRM SCALE'} disabled={busy || !!draft.calibration} onPress={confirmScale} />
      <Copy>{draft.calibration ? list(['Scale confirmed', 'A to B is ' + formatYards(draft.calibration.inches), 'approximate', evidenceLabels[draft.calibration.evidence]]) : 'Scale is not confirmed.'}</Copy>
    </Section>
    <Section title="Position on the stage">
      <Copy>Where the drawing’s top-left corner sits on the stage.</Copy>
      <View style={styles.row}>
        <NumberField disabled={busy} label="Origin X (yd)" value={Number(inchesToYards(draft.origin.x).toFixed(3))} change={x=>update({origin:{...draft.origin,x:yardsToInches(x)}})} />
        <NumberField disabled={busy} label="Origin Y (yd)" value={Number(inchesToYards(draft.origin.y).toFixed(3))} change={y=>update({origin:{...draft.origin,y:yardsToInches(y)}})} />
      </View>
    </Section>
    <Section title="Elements">
      <Notice>Detection is experimental: it finds clean lines and shapes. Check every element; a circle is not automatically steel. Positions are approximate and sizes come from the type or preset, not the drawing.</Notice>
      <View style={styles.row}>
        <Action title="DETECT SHAPES (EXPERIMENTAL)" disabled={busy || draft.projection !== 'top-down'} onPress={detect} />
        <Action title="ADD MISSING ELEMENT" disabled={busy || draft.proposals.length >= 1000} onPress={()=>{const p:Proposal={id:uuid.v4(),type:'cardboardTarget',position:{x:.5,y:.5},rotation:0,extent:{width:.08,height:.08},accepted:false,approximate:true,notes:'Default physical size; check it in the Stage editor.',source:'manual'};update({proposals:[...draft.proposals,p]});setSelectedId(p.id);setCursor('object');setSeveral(false);}} />
      </View>
      {draft.proposals.length > 0 && <>
        <Copy>{reviewSummary(draft.proposals)}</Copy>
        {several ? <Panel>
          <Text style={ui.eyebrow}>{`TAP ELEMENTS TO SELECT THEM · ${batchIds.length} SELECTED`}</Text>
          <View style={styles.row}>
            <Action title="ACCEPT SELECTED" disabled={busy || !batchIds.length} onPress={() => batch(true)} />
            <Action title="REJECT SELECTED" disabled={busy || !batchIds.length} onPress={() => batch(false)} />
            <Action title="CLEAR SELECTION" disabled={busy || !batchIds.length} onPress={() => setBatchIds([])} />
            <Action title="DONE" accessibilityLabel="Done selecting several" disabled={busy} onPress={() => { setSeveral(false); setBatchIds([]); }} />
          </View>
        </Panel> : <Action title="SELECT SEVERAL" variant="quiet" disabled={busy} onPress={() => { setSeveral(true); setSelectedId(null); }} />}
        {draft.proposals.map((p, i) => {
          const label = `${i + 1} · ${proposalTypeLabel(p.type)} · ${reviewStatus(p)}`, inBatch = batchIds.includes(p.id);
          return several
            ? <ToolButton key={p.id} title={(inBatch ? '✓ ' : '') + label} selected={inBatch} disabled={busy} onPress={() => setBatchIds(ids => ids.includes(p.id) ? ids.filter(id => id !== p.id) : [...ids, p.id])} />
            : <ToolButton key={p.id} title={label} selected={p.id === selectedId} disabled={busy} onPress={() => { setSelectedId(p.id); setCursor('object'); }} />;
        })}
      </>}
      {selected && !several && <Panel>
        <Text style={ui.sectionTitle}>{`Element ${draft.proposals.indexOf(selected) + 1} · ${proposalTypeLabel(selected.type)}`}</Text>
        <Copy>{list([reviewStatus(selected), 'position approximate'])}</Copy>
        <View style={styles.row}>
          <Action title="ACCEPT" accessibilityLabel="Accept this element" disabled={busy || unclassified(selected) || selected.accepted} onPress={()=>changeProposal({accepted:true,reviewed:true})} />
          <Action title="REJECT" accessibilityLabel="Reject this element" disabled={busy || !selected.accepted && !!selected.reviewed} onPress={()=>changeProposal({accepted:false,reviewed:true})} />
        </View>
        {unclassified(selected) && <Copy>Pick a type before accepting it. Ports and props can’t be added from here; add them in the Stage editor.</Copy>}
        <Text style={ui.eyebrow}>TYPE</Text>
        {[TYPE_CHOICES.slice(0, 4), TYPE_CHOICES.slice(4)].map(group => <Segmented key={group[0][0]} options={group.map(([, label]) => label)} value={typeValue} disabled={busy} onChange={v => { const type = TYPE_CHOICES.find(([, label]) => label === v)?.[0]; if (type) changeProposal({type,presetId:undefined,end:type==='wall'||type==='faultLine'?selected.end??{x:Math.min(.99,selected.position.x+.1),y:selected.position.y}:undefined}); }} />)}
        {presets.length > 0 && <><Text style={ui.eyebrow}>TARGET</Text>{presets.map(p=><ToolButton key={p.id} title={p.name.toUpperCase()} selected={selected.presetId===p.id} disabled={busy} onPress={()=>changeProposal({presetId:p.id})} />)}</>}
        {selected.recognition && <Copy>{list(['Detected ' + shapeLabels[selected.recognition.shape], 'heuristic confidence ' + Math.round((selected.confidence??0)*100) + '%', 'scale at detection ' + scaleStatusLabels[selected.recognition.scaleStatus], 'page ' + selected.recognition.sourceImage.page, ...(selected.recognition.groupId ? ['repeated shape'] : [])]) + '. Check the type and size.'}</Copy>}
        {selected.end ? <Segmented options={['MOVE START', 'MOVE END']} value={cursor === 'end' ? 'MOVE END' : cursor === 'object' ? 'MOVE START' : ''} disabled={busy} onChange={v => setCursor(v === 'MOVE END' ? 'end' : 'object')} />
          : cursor !== 'object' && <Action title="MOVE BY TAPPING" disabled={busy} onPress={() => setCursor('object')} />}
        {numbers && <View style={styles.row}>
          <NumberField disabled={busy} label="Element X (%)" value={selected.position.x*100} change={x=>changeProposal({position:{...selected.position,x:x/100}})} />
          <NumberField disabled={busy} label="Element Y (%)" value={selected.position.y*100} change={y=>changeProposal({position:{...selected.position,y:y/100}})} />
          {selected.extent && !selected.end && <><NumberField disabled={busy} label="Outline width on the drawing (%)" value={selected.extent.width*100} change={width=>changeProposal({extent:{...selected.extent!,width:width/100}})} /><NumberField disabled={busy} label="Outline height on the drawing (%)" value={selected.extent.height*100} change={height=>changeProposal({extent:{...selected.extent!,height:height/100}})} /></>}
          {selected.end ? <><NumberField disabled={busy} label="End X (%)" value={selected.end.x*100} change={x=>changeProposal({end:{...selected.end!,x:x/100}})} /><NumberField disabled={busy} label="End Y (%)" value={selected.end.y*100} change={y=>changeProposal({end:{...selected.end!,y:y/100}})} /><NumberField disabled={busy} label="Segment angle (°)" value={Math.atan2((selected.end.y-selected.position.y)*draft.aligned.height,(selected.end.x-selected.position.x)*draft.aligned.width)*180/Math.PI} change={rotation=>segmentEdit({rotation})} /><NumberField disabled={busy} label="Segment length (% of drawing width)" value={Math.hypot((selected.end.x-selected.position.x)*draft.aligned.width,(selected.end.y-selected.position.y)*draft.aligned.height)/draft.aligned.width*100} change={length=>segmentEdit({lengthPixels:length/100*draft.aligned!.width})} /></>
            : <NumberField disabled={busy} label="Rotation (°)" value={selected.rotation} change={rotation=>changeProposal({rotation})} />}
        </View>}
        {!!selected.notes && <Copy>{selected.notes}</Copy>}
      </Panel>}
    </Section>
  </> : <><Notice tone="warning">This drawing isn’t straightened yet. Go BACK and press NEXT on the corners step.</Notice></>);

  // Footer: what is still needed (before the action, not as an error after it), BACK, and the step's one primary action.
  const needs = !draft ? (step === 'photo' ? ['Choose a drawing to start.'] : [])
    : step === 'photo' ? (!draft.page ? [draft.sourceKind === 'pdf' ? 'Show a page of the PDF first.' : 'The picture isn’t ready yet.'] : [])
    : step === 'corners' ? [...(!validQuad(draft.alignment.corners) ? ['Set four corners that don’t cross.'] : []), ...(cropping && !validCrop(draft.alignment.crop) ? ['Set a crop inside the page.'] : [])]
    : draft.aligned ? (addNeeds(draft).length ? ['To add elements: ' + list(addNeeds(draft)) + '.'] : []) : [];
  const primary = step === 'scale'
    ? <Action title="ADD ACCEPTED ELEMENTS TO STAGE" variant="primary" disabled={busy || !draft || addNeeds(draft).length > 0} onPress={addToStage} />
    : <Action title="NEXT" variant="primary" disabled={busy || !draft?.page || needs.length > 0} onPress={step === 'photo' ? () => goTo('corners') : alignAndContinue} />;
  const closeNeeds = draft ? drawingNeeds(draft) : [];
  const footer = <View style={styles.footer}>
    {confirmClose ? <>
      {!!error && <Notice tone="error">{error}</Notice>}
      <Notice tone="warning">{'You have unsaved changes. ' + (closeNeeds.length ? 'This drawing can go under the stage once it has: ' + list(closeNeeds) + '.' : 'Save them before closing?')}</Notice>
      <View style={styles.row}>
        <Action title="KEEP EDITING" onPress={() => { setConfirmClose(false); setError(''); }} />
        <Action title="SAVE AND CLOSE" disabled={!draft || busy} onPress={() => void run(async current => { await saveDraft(draft!); current(exit); })} />
        <Action title="CLOSE WITHOUT SAVING" variant="destructive" disabled={busy} onPress={exit} />
      </View>
    </> : <>
      {!!error && <Notice tone="error">{error}</Notice>}
      {!!message && <Notice>{message}</Notice>}
      {needs.map(n => <Copy key={n}>{n}</Copy>)}
      <View style={styles.row}>
        {step !== 'photo' && <Action title="BACK" accessibilityLabel={'Back to ' + (step === 'scale' ? 'corners' : 'photo')} disabled={busy} onPress={() => goTo(step === 'scale' ? 'corners' : 'photo')} />}
        <View style={{ flex: 1 }}>{primary}</View>
      </View>
    </>}
  </View>;

  return <>
    <Modal visible={visible} animationType="none" onRequestClose={requestClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} accessibilityViewIsModal onAccessibilityEscape={requestClose}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScreenHeader title="Import stage diagram" action={<Action title="CLOSE" accessibilityLabel="Close import" disabled={busy} onPress={requestClose} />} />
          {stepBar}
          <ScrollView style={{ flex: 1 }} pointerEvents={busy ? 'none' : 'auto'} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
            {step === 'photo' ? photoStep : step === 'corners' ? cornersStep : scaleStep}
          </ScrollView>
          {footer}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
    {/* Shown once, over the Stage editor, after the first automatic save. */}
    {toast && !visible && <Pressable accessibilityRole="button" accessibilityLabel={AUTO_SAVE_NOTICE + ' Dismiss.'} onPress={() => setToast(false)} style={styles.toast}><Notice tone="success">{AUTO_SAVE_NOTICE}</Notice></Pressable>}
  </>;
}

const styles = themed(c => ({
  fill: { position: 'absolute', width: '100%', height: '100%' },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'flex-end' },
  field: { gap: spacing.xs, flexGrow: 1, flexShrink: 1, minWidth: 140 },
  card: { gap: spacing.sm, padding: spacing.md, borderWidth: borders.regular, borderColor: c.border, backgroundColor: c.panel },
  stepBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: borders.regular, borderColor: c.border, backgroundColor: c.background },
  track: { height: 6, backgroundColor: c.hairline },
  progress: { height: 6, backgroundColor: c.text },
  steps: { ...typography.category, color: c.subdued },
  current: { color: c.text, textDecorationLine: 'underline' },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, borderTopWidth: borders.strong, borderColor: c.border, backgroundColor: c.background },
  marker: { position: 'absolute', minWidth: 24, height: 24, marginLeft: -12, marginTop: -12, paddingHorizontal: 3, borderWidth: 2, backgroundColor: c.panel, alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', paddingHorizontal: 3, backgroundColor: c.panel },
  markerText: { ...typography.category, fontSize: 13, lineHeight: 16, color: c.text },
  toast: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 104 },
}));
