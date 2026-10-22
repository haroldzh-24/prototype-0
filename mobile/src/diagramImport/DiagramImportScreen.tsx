import { recognizers, propose } from './recognition';
import { readRaster } from './rasterReader';
import { mergeDetections, acceptSelection, editSegmentOverlay } from './proposalEdits';
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uuid } from 'expo-modules-core';
import { Action, Copy, Notice, colors, ui } from '../ui/kit';
import { useRepository } from '../storage/StorageProvider';
import { OperationGate } from '../training/operationGate';
import { objectLabel } from '../stage/model';
import type { StageDocument } from '../stage/model';
import type { TargetFamily } from '../stage/targetFamily';
import { presetsForFamily } from '../stage/targetPresets';
import { assetUri, deleteDocumentFiles, pickDocument, photographPaper, openOriginal } from './assets';
import { takeDerivatives } from './sessionFiles';
import { alignPage, preparePage } from './preparation';
import { fullCrop, fullQuad, reconstruct, validQuad, validCrop, validProposal, imagePoint, validateReconstruction } from './model';
import type { DocumentAsset, Point, Proposal, Reconstruction } from './model';

function NumberField({ label, value, change, disabled = false }: { label: string; value: number; change: (value: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(current => Object.is(Number(current), value) ? current : Number.isFinite(value) ? String(value) : current); }, [value]);
  return <View><Copy>{label}</Copy><TextInput editable={!disabled} accessibilityLabel={label} value={text} keyboardType="numbers-and-punctuation" style={ui.input} onChangeText={value => { setText(value); change(value.trim() ? Number(value) : NaN); }} /></View>;
}
function DocumentImage({ asset, width, height, tap, children }: { asset: DocumentAsset; width: number; height: number; tap?: (p: Point) => void; children?: React.ReactNode }) {
  const [uri, setUri] = useState(''), [error, setError] = useState(''), [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => { let current = true; setUri(''); setError(''); assetUri(asset).then(uri => { if (current) setUri(uri); }).catch(e => { if (current) setError(String(e)); }); return () => { current = false; }; }, [asset.path]);
  return <View>
    {!!error && <Notice>{error}</Notice>}
    <Pressable accessibilityLabel="Stage diagram preview" accessibilityHint="Use the coordinate fields as an alternative to tapping the diagram." onLayout={e => setSize(e.nativeEvent.layout)}
      onPress={e => { if (size.width > 0 && size.height > 0) tap?.({ x: Math.max(0, Math.min(1, e.nativeEvent.locationX / size.width)), y: Math.max(0, Math.min(1, e.nativeEvent.locationY / size.height)) }); }}
      style={{ width: '100%', aspectRatio: width / height, backgroundColor: '#fff', overflow: 'hidden' }}>
      {!!uri && <View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%' }}><Image source={{ uri }} resizeMode="stretch" style={{ width: '100%', height: '100%' }} /></View>}
      <View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%' }}>{children}</View>
    </Pressable>
  </View>;
}
function ProposalOverlay({ proposal: p, number, selected }: { proposal: Proposal; number: number; selected: boolean }) {
  const [size,setSize] = useState({width:0,height:0});
  const start = {x:p.position.x*size.width,y:p.position.y*size.height};
  const end = p.end ? {x:p.end.x*size.width,y:p.end.y*size.height} : start;
  const length = Math.hypot(end.x-start.x,end.y-start.y);
  return <View onLayout={e=>setSize(e.nativeEvent.layout)} style={{position:'absolute',width:'100%',height:'100%'}}>
    {!p.end && p.extent && <View style={{position:'absolute',left:(p.position.x-p.extent.width/2)*size.width,top:(p.position.y-p.extent.height/2)*size.height,width:p.extent.width*size.width,height:p.extent.height*size.height,borderWidth:selected?3:1,borderColor:'#006d77',borderStyle:p.accepted?'solid':'dashed',borderRadius:p.recognition?.shape==='circle'?999:0,transform:[{rotate:p.rotation+'deg'}]}} />}
    {p.end && length>0 && <View style={{position:'absolute',left:(start.x+end.x)/2-length/2,top:(start.y+end.y)/2,width:length,borderTopWidth:selected?4:2,borderColor:'#006d77',borderStyle:p.accepted?'solid':'dashed',transform:[{rotate:Math.atan2(end.y-start.y,end.x-start.x)+'rad'}]}} />}
    <View style={{position:'absolute',left:`${p.position.x*100}%`,top:`${p.position.y*100}%`,borderWidth:selected?3:1,borderStyle:p.accepted?'solid':'dashed',borderColor:'#000',backgroundColor:'#fff',transform:[{rotate:(p.end?0:p.rotation)+'deg'}]}}><Text style={{color:'#111',fontSize:12}}>{number}{p.accepted?' +':' -'}</Text></View>
    {p.end && <View style={{position:'absolute',left:`${p.end.x*100}%`,top:`${p.end.y*100}%`,width:8,height:8,borderWidth:2,borderColor:'#000',backgroundColor:'#fff'}} />}
  </View>;
}
const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4 };
const objectTypes = ['cardboardTarget', 'noShootTarget', 'steelPlate', 'steelPopper', 'wall', 'faultLine', 'start'] as const;
export default function DiagramImportScreen({ visible, stageId, stage, family, close, apply }: {
  visible: boolean; stageId: string; stage: StageDocument; family: TargetFamily; close: () => void; apply: (stage: StageDocument) => void;
}) {
  const repo = useRepository(), gate = useRef(new OperationGate());
  const recognitionAbort = useRef<AbortController | null>(null);
  const [recognizing,setRecognizing] = useState(false), [batchIds,setBatchIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<Reconstruction | null>(null), [references, setReferences] = useState<Reconstruction[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [confirmClose, setConfirmClose] = useState(false);
  const [step, setStep] = useState<'page' | 'layout' | 'preview'>('page');
  const [corner, setCorner] = useState(0), [cursor, setCursor] = useState<'a' | 'b' | 'object' | 'end' | 'cropA' | 'cropB'>('object');
  const [selectedId, setSelectedId] = useState<string | null>(null), [showOriginal, setShowOriginal] = useState(false);
  const [pageNumber, setPageNumber] = useState(1), [distance, setDistance] = useState(120), [unit, setUnit] = useState<'in' | 'ft' | 'yd'>('in');
  const [a, setA] = useState<Point>({ x: .1, y: .5 }), [b, setB] = useState<Point>({ x: .9, y: .5 });
  const [evidence, setEvidence] = useState<'grid' | 'labeled-dimension' | 'user'>('user');
  const [damagedIds, setDamagedIds] = useState<string[]>([]), [cameraDenied, setCameraDenied] = useState(false), [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const draftPaths = (d: Reconstruction) => [d.source, d.page?.asset, d.rectified?.asset, d.aligned?.asset].flatMap(a => a?.path ? [a.path] : []);
  const refresh = async (current: (callback: () => void) => void) => { const report = await repo.loadDiagramImportsReport(stageId); current(() => { setReferences(report.drafts); setDamagedIds(report.damagedIds); }); };
  const deleteReference = (value: Reconstruction) => void run(async current => {
    await repo.deleteDiagramImport(stageId, value.id);
    // Shared originals (duplicated stages) are kept while any other draft still references them.
    await deleteDocumentFiles(draftPaths(value), await repo.diagramAssetPathsInUse());
    current(() => { setConfirmDeleteId(null); if (draft?.id === value.id) setDraft(null); setMessage('Reference deleted. Stage geometry and route were not changed.'); });
    await refresh(current);
  });
  const removeDamaged = () => void run(async current => {
    for (const id of damagedIds) await repo.deleteDiagramImport(stageId, id);
    current(() => setMessage(damagedIds.length + ' unreadable reference(s) removed.'));
    await refresh(current);
  });
  async function run(work: (current: (callback: () => void) => void) => Promise<void>) {
    const token = gate.current.begin(); if (token === null) return;
    setBusy(true); setError(''); setMessage('');
    const current = (callback: () => void) => { if (gate.current.current(token)) callback(); };
    try { await work(current); } catch (error) { current(() => setError(String(error))); }
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
    gate.current.activate(); setRecognizing(false); setBusy(false); setConfirmClose(false); setError(''); setCameraDenied(false); setConfirmDeleteId(null);
    void run(refresh);
    return () => { recognitionAbort.current?.abort(); gate.current.dispose(); };
  }, [visible, stageId, repo]);
  const exit = () => { setDraft(null); setSelectedId(null); close(); };
  const update = (changes: Partial<Reconstruction>) => {
    if (!draft) return;
    // Editing preparation cannot leave old proposals/scale attached to different pixels.
    if (changes.alignment && JSON.stringify(changes.alignment) !== JSON.stringify(draft.alignment)) {
      setBatchIds([]);
      if (step === 'page') changes = { rectified: undefined, aligned: undefined, calibration: undefined, proposals: [], ...changes };
      else if (step === 'layout') changes = { aligned: undefined, calibration: undefined, proposals: [], ...changes };
    }
    setDraft({ ...draft, ...changes });
  };
  const selected = draft?.proposals.find(p => p.id === selectedId);
  const changeProposal = (changes: Partial<Proposal>) => { if (draft && selected) update({ proposals: draft.proposals.map(p => p.id === selected.id ? { ...p, ...changes } : p) }); };
  const saveDraft = async (value: Reconstruction) => { validateReconstruction(value); await repo.saveDiagramImport(stageId, value); };
  const load = (value: Reconstruction) => { setDraft(value); setBatchIds([]); setSelectedId(null); setStep(value.aligned ? 'preview' : value.rectified ? 'layout' : 'page'); setPageNumber(value.page?.page ?? 1); setShowOriginal(false); if (value.calibration) { setA(value.calibration.a); setB(value.calibration.b); setDistance(value.calibration.inches); setUnit('in'); setEvidence(value.calibration.evidence); } };
  const importSource = (camera: boolean) => void run(async current => {
    current(() => setCameraDenied(false));
    let picked;
    try { picked = await (camera ? photographPaper() : pickDocument()); }
    catch (error) { if ((error as { code?: string }).code === 'CAMERA_DENIED') current(() => setCameraDenied(true)); throw error; }
    if (!picked) return;
    const value: Reconstruction = { version: 1, id: uuid.v4(), source: picked.asset, sourceKind: picked.kind, alignment: { corners: fullQuad(), rotation: 0, crop: fullCrop() }, projection: 'unknown', origin: { x: 0, y: 0 }, proposals: [] };
    await saveDraft(value); // Preserve the original even if rasterization is unavailable or fails.
    current(() => { load(value); setReferences(old => [...old, value]); });
    const result = await preparePage(value.source, 1);
    current(() => { setDraft({ ...value, page: result.page, alignment: { ...value.alignment, corners: result.corners && validQuad(result.corners) ? result.corners : fullQuad() } }); setMessage('Page boundary is a suggestion. Verify all four corners; no stage objects have been recognized.'); });
  });
  const detect = () => { if (gate.current.busy || !visible || !draft?.aligned || draft.projection !== 'top-down') return;
    const snapshot=draft, controller=new AbortController();recognitionAbort.current=controller;setShowOriginal(false);setRecognizing(true);
    void run(async current=>{try{const raster=await readRaster(snapshot.aligned!,controller.signal);const result=await propose(snapshot,raster,recognizers[0],controller.signal);current(()=>{update({proposals:mergeDetections(snapshot.proposals,result.proposals)});setBatchIds([]);setMessage(result.proposals.length+' geometry candidates found. '+result.warnings.join(' '));});}catch(error){throw new Error(String(error)+' Manual reconstruction remains available; no stage objects were changed.');}finally{current(()=>setRecognizing(false));if(recognitionAbort.current===controller)recognitionAbort.current=null;}});
  };
  const batch = (accepted:boolean) => { if(!draft)return;try{update({proposals:acceptSelection(draft.proposals,batchIds,accepted)});setError('');}catch(e){setError(String(e));} };
  const segmentEdit = (edit:{rotation?:number;lengthPixels?:number}) => { if(!selected||!draft?.aligned)return;try{changeProposal(editSegmentOverlay(selected,draft.aligned,edit));setError('');}catch(e){setError(String(e));} };
  const activePage = showOriginal ? draft?.page : step === 'page' ? draft?.page : step === 'layout' ? draft?.rectified : draft?.aligned;
  const tap = (p: Point) => {
    if (!draft || showOriginal) return;
    if (step === 'page') { const corners = [...draft.alignment.corners] as Reconstruction['alignment']['corners']; corners[corner] = p; update({ alignment: { ...draft.alignment, corners } }); }
    else if (step === 'layout') {
      const c = draft.alignment.crop;
      const far = { x: c.x + c.width, y: c.y + c.height };
      update({ alignment: { ...draft.alignment, crop: cursor === 'cropB' ? { ...c, width: p.x - c.x, height: p.y - c.y } : { x: p.x, y: p.y, width: far.x - p.x, height: far.y - p.y } } });
    } else if (cursor === 'a') { setA(p); update({calibration:undefined}); }
    else if (cursor === 'b') { setB(p); update({calibration:undefined}); }
    else if (selected) changeProposal(cursor === 'end' ? { end: p } : { position: p });
  };
  return <Modal visible={visible} animationType="none" onRequestClose={() => { if (!busy) setConfirmClose(true); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} accessibilityViewIsModal onAccessibilityEscape={() => { if (!busy) setConfirmClose(true); }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={row}><Copy>Import stage diagram</Copy>{recognizing && <Action title="Cancel recognition" onPress={()=>recognitionAbort.current?.abort()} />}<Action title="Close import" disabled={busy} onPress={() => setConfirmClose(true)} /></View>
      <ScrollView style={{ flex: 1 }} pointerEvents={busy ? 'none' : 'auto'} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 10 }}>
        {confirmClose && <View><Notice>Reference drafts are saved separately. Geometry added to the editor still needs the editor Save action.</Notice><Action title="Keep editing import" onPress={() => setConfirmClose(false)} /><Action title="Save reference draft and close" disabled={!draft || busy} onPress={() => void run(async current => { await saveDraft(draft!); current(exit); })} /><Action title="Close without saving preview changes" onPress={exit} /></View>}
        <Copy>Import a stage briefing PDF, exported plan, screenshot, or photograph of printed paper. Top-down plans are required for reconstruction.</Copy>
        <View style={row}><Action title="Import PDF or image" disabled={busy} onPress={() => importSource(false)} /><Action title="Photograph paper" disabled={busy} onPress={() => importSource(true)} /></View>
        {cameraDenied && <Action title="Open Settings to allow camera" onPress={() => { void Linking.openSettings(); }} />}
        {references.map(value => <View key={value.id} style={row}>
          <Action title={'Reference: ' + value.source.name} disabled={busy} onPress={() => load(value)} />
          {confirmDeleteId === value.id ? <><Action title="Keep" disabled={busy} onPress={() => setConfirmDeleteId(null)} /><Action title="Delete reference" variant="destructive" disabled={busy} onPress={() => deleteReference(value)} /></>
            : <Action title="Delete" accessibilityLabel={'Delete reference ' + value.source.name} disabled={busy} onPress={() => setConfirmDeleteId(value.id)} />}
        </View>)}
        {!!damagedIds.length && <><Notice>{damagedIds.length} saved reference(s) could not be read and are hidden. Their data has not been changed.</Notice><Action title="Remove unreadable references" disabled={busy} onPress={removeDamaged} /></>}
        {!!error && <Notice>{error}</Notice>}{!!message && <Notice>{message}</Notice>}{busy && <Copy>Preparing document...</Copy>}
        {draft && <>
          <Copy>{draft.source.name}</Copy>
          <Action title="Open or download original document" disabled={busy} onPress={()=>void run(async()=>{await openOriginal(draft.source);})} />
          <View style={row}><Action title="Save reference draft" disabled={busy} onPress={() => void run(async current => { await saveDraft(draft); const saved = await repo.loadDiagramImports(stageId); current(() => { setReferences(saved); setMessage('Reference draft saved. Stage geometry and route were not changed.'); }); })} />
            <Action title={showOriginal ? 'Show editing preview' : 'Show original page'} disabled={!draft.page || busy} onPress={() => setShowOriginal(v => !v)} /></View>
          <View style={row}>{(['page', 'layout', 'preview'] as const).map(value => <Action key={value} title={value === 'page' ? '1. Page and corners' : value === 'layout' ? '2. Layout region' : '3. Reconstruction preview'} disabled={busy || value === 'layout' && !draft.rectified || value === 'preview' && !draft.aligned} onPress={() => { setStep(value); setShowOriginal(false); }} />)}</View>
          {activePage && <DocumentImage asset={activePage.asset} width={activePage.width} height={activePage.height} tap={busy ? undefined : tap}>
            {!showOriginal && step === 'page' && draft.alignment.corners.map((p,i) => imagePoint(p) && <View key={i} style={{ position: 'absolute', left: `${p.x*100}%`, top: `${p.y*100}%`, width: 22, height: 22, marginLeft: -11, marginTop: -11, borderWidth: 2, borderColor: '#000', backgroundColor: '#fff' }}><Text style={{color:'#111',fontSize:12}}>{i+1}</Text></View>)}
            {!showOriginal && step === 'layout' && validCrop(draft.alignment.crop) && <View style={{ position: 'absolute', left: `${draft.alignment.crop.x*100}%`, top: `${draft.alignment.crop.y*100}%`, width: `${draft.alignment.crop.width*100}%`, height: `${draft.alignment.crop.height*100}%`, borderWidth: 3, borderStyle: 'dashed', borderColor: '#006d77' }} />}
            {!showOriginal && step === 'preview' && <>
              {[a,b].map((p,i) => imagePoint(p) && <View key={'scale'+i} style={{ position: 'absolute', left: `${p.x*100}%`, top: `${p.y*100}%`, backgroundColor: '#fff', borderWidth: 1 }}><Text style={{color:'#111',fontSize:12}}>{i ? 'B' : 'A'}</Text></View>)}
              {draft.proposals.map((p,i) => validProposal(p) && <ProposalOverlay key={p.id} proposal={p} number={i+1} selected={p.id===selectedId} />)}
            </>}
          </DocumentImage>}
          {step === 'page' && <>
            <NumberField disabled={busy} label={'PDF page (1-' + (draft.page?.pageCount ?? '?') + ')'} value={pageNumber} change={setPageNumber} />
            <Action title="Render selected page" disabled={busy} onPress={() => void run(async current => { const result = await preparePage(draft.source, pageNumber); current(() => { update({ page: result.page, rectified: undefined, aligned: undefined, calibration: undefined, proposals: [], projection: 'unknown', alignment: { corners: result.corners && validQuad(result.corners) ? result.corners : fullQuad(), rotation: 0, crop: fullCrop() } }); setShowOriginal(false); }); })} />
            <Copy>Changing page alignment clears previous overlays and scale. Set page corners clockwise: top left, top right, bottom right, bottom left. Tap a corner selector then the image, or enter percentages. Page correction does not turn an isometric drawing into a top-down plan.</Copy>
            <View style={row}>{['Top left','Top right','Bottom right','Bottom left'].map((label,i)=><Action key={label} title={'Set corner '+(i+1)+' '+label+(corner===i?' / Selected':'')} disabled={busy} onPress={()=>setCorner(i)} />)}</View>
            <NumberField disabled={busy} label="Corner X percent" value={draft.alignment.corners[corner].x*100} change={x=>{const corners=[...draft.alignment.corners] as Reconstruction['alignment']['corners'];corners[corner]={...corners[corner],x:x/100};update({alignment:{...draft.alignment,corners}});}} />
            <NumberField disabled={busy} label="Corner Y percent" value={draft.alignment.corners[corner].y*100} change={y=>{const corners=[...draft.alignment.corners] as Reconstruction['alignment']['corners'];corners[corner]={...corners[corner],y:y/100};update({alignment:{...draft.alignment,corners}});}} />
            <Action title={'Rotate page clockwise / '+draft.alignment.rotation+' degrees'} disabled={busy} onPress={()=>update({alignment:{...draft.alignment,rotation:((draft.alignment.rotation+90)%360) as 0|90|180|270}})} />
            <Action title="Reset page corners" disabled={busy} onPress={()=>update({alignment:{...draft.alignment,corners:fullQuad()}})} />
            <Action title="Align page" disabled={busy || !draft.page} onPress={()=>void run(async current=>{const page=await alignPage(draft.page!,{...draft.alignment,crop:fullCrop()});current(()=>{update({rectified:page,aligned:undefined,calibration:undefined,proposals:[],alignment:{...draft.alignment,crop:fullCrop()}});setStep('layout');setShowOriginal(false);});})} />
          </>}
          {step === 'layout' && <>
            <Copy>Changing the layout crop clears previous overlays and scale. Crop to the actual layout. Exclude headings, briefing text, logos, legends and inset views. Region selection is manual; no automatic layout detector has been validated.</Copy>
            <View style={row}><Action title="Set layout top left" disabled={busy} onPress={()=>setCursor('cropA')} /><Action title="Set layout bottom right" disabled={busy} onPress={()=>setCursor('cropB')} /></View>
            {(['x','y','width','height'] as const).map(key=><NumberField disabled={busy} key={key} label={'Layout '+key+' percent'} value={draft.alignment.crop[key]*100} change={value=>update({alignment:{...draft.alignment,crop:{...draft.alignment.crop,[key]:value/100}}})} />)}
            <Action title="Use layout region" disabled={busy || !draft.rectified} onPress={()=>void run(async current=>{const aligned=await alignPage(draft.rectified!,{corners:fullQuad(),rotation:0,crop:draft.alignment.crop});current(()=>{update({aligned,calibration:undefined,proposals:[]});setStep('preview');setShowOriginal(false);});})} />
          </>}
          {step === 'preview' && draft.aligned && <>
            <Notice>Prototype detection finds clean lines and shapes. Unknown shapes need classification; a circle is not automatically steel. All candidates require review. Positions and default dimensions are approximate; target icons never determine scale.</Notice>
            <Action title="EXPERIMENTAL: Detect clean diagram geometry" disabled={busy || draft.projection!=='top-down'} onPress={detect} />
            <Copy>Confirm a clean top-down crop first. Detection can run before calibration; adding objects to the stage still requires confirmed scale. Photos, isometric drawings, text-heavy or noisy crops may need manual reconstruction.</Copy>
            <View style={row}><Action title={'Top-down plan'+(draft.projection==='top-down'?' / Selected':'')} disabled={busy} onPress={()=>update({projection:'top-down'})} /><Action title={'Perspective or isometric / Reference only'+(draft.projection==='perspective'?' / Selected':'')} disabled={busy} onPress={()=>update({projection:'perspective'})} /></View>
            <Copy>Scale: choose two printed grid intersections or ends of a labeled dimension, then enter the real distance. Paper perspective correction estimates proportions; verify with a second dimension.</Copy>
            <View style={row}><Action title="Set scale point A" disabled={busy} onPress={()=>setCursor('a')} /><Action title="Set scale point B" disabled={busy} onPress={()=>setCursor('b')} /></View>
            {(['a','b'] as const).flatMap(key=>(['x','y'] as const).map(axis=><NumberField disabled={busy} key={key+axis} label={'Scale '+key.toUpperCase()+' '+axis+' percent'} value={(key==='a'?a:b)[axis]*100} change={value=>{(key==='a'?setA:setB)(old=>({...old,[axis]:value/100}));update({calibration:undefined});}} />))}
            <NumberField disabled={busy} label="Known real distance" value={distance} change={value=>{setDistance(value);update({calibration:undefined});}} /><View style={row}>{(['in','ft','yd'] as const).map(value=><Action key={value} title={value+(value===unit?' / Selected':'')} disabled={busy} onPress={()=>{setUnit(value);update({calibration:undefined});}} />)}</View>
            <View style={row}>{(['grid','labeled-dimension','user'] as const).map(value=><Action key={value} title={'Scale evidence: '+value+(evidence===value?' / Selected':'')} disabled={busy} onPress={()=>{setEvidence(value);update({calibration:undefined});}} />)}</View>
            <Action title="Confirm approximate scale" disabled={busy} onPress={()=>{try{const calibration={a,b,inches:distance*(unit==='ft'?12:unit==='yd'?36:1),evidence,approximate:true};validateReconstruction({...draft,calibration});update({calibration});setMessage('Scale confirmed as approximate. Verify another known dimension before accepting elements.');setError('');}catch(e){setError(String(e));}}} />
            <Copy>{draft.calibration?'Confirmed distance: '+draft.calibration.inches+' inches / Approximate':'Scale is not confirmed.'}</Copy>
            <NumberField disabled={busy} label="Stage origin X inches" value={draft.origin.x} change={x=>update({origin:{...draft.origin,x}})} /><NumberField disabled={busy} label="Stage origin Y inches" value={draft.origin.y} change={y=>update({origin:{...draft.origin,y}})} />
            <Action title="Add missing element" disabled={busy || draft.proposals.length>=1000} onPress={()=>{const p:Proposal={id:uuid.v4(),type:'cardboardTarget',position:{x:.5,y:.5},rotation:0,extent:{width:.08,height:.08},accepted:false,approximate:true,notes:'Default physical dimensions; verify in editor.',source:'manual'};update({proposals:[...draft.proposals,p]});setSelectedId(p.id);setCursor('object');}} />
            {draft.proposals.map((p,i)=><Action key={p.id} title={'Overlay '+(i+1)+' / '+(p.type==='prop'||p.type==='port'||p.type==='unknown'?p.type:objectLabel(p.type))+' / '+(p.accepted?'Accepted':'Rejected')+' / Approximate'+(p.id===selectedId?' / Selected':'')} disabled={busy} onPress={()=>{setSelectedId(p.id);setCursor('object');}} />)}
            <View style={row}><Action title="Accept selected proposals" disabled={busy||!batchIds.length} onPress={()=>batch(true)} /><Action title="Reject selected proposals" disabled={busy||!batchIds.length} onPress={()=>batch(false)} /><Action title="Clear batch selection" disabled={busy||!batchIds.length} onPress={()=>setBatchIds([])} /></View>
            {draft.proposals.map((p,i)=><Action key={'batch-'+p.id} title={'Batch overlay '+(i+1)+(batchIds.includes(p.id)?' / Selected':' / Not selected')} disabled={busy} onPress={()=>setBatchIds(ids=>ids.includes(p.id)?ids.filter(id=>id!==p.id):[...ids,p.id])} />)}
            {selected && <>
              <View style={row}><Action title="Accept selected element" disabled={busy || ['unknown','prop','port'].includes(selected.type)} onPress={()=>changeProposal({accepted:true})} /><Action title="Reject selected element" disabled={busy} onPress={()=>changeProposal({accepted:false})} /></View>
              <View style={row}>{objectTypes.map(type=><Action key={type} title={'Type: '+objectLabel(type)} disabled={busy} onPress={()=>changeProposal({type,presetId:undefined,end:type==='wall'||type==='faultLine'?selected.end??{x:Math.min(.99,selected.position.x+.1),y:selected.position.y}:undefined})} />)}</View>
              {presetsForFamily(family).filter(p=>p.type===selected.type).map(p=><Action key={p.id} title={'Preset: '+p.name+(selected.presetId===p.id?' / Selected':'')} disabled={busy} onPress={()=>changeProposal({presetId:p.id})} />)}
              {selected.recognition && <Copy>{'Detected '+selected.recognition.shape+' / Heuristic confidence '+Math.round((selected.confidence??0)*100)+'% / Scale at detection: '+selected.recognition.scaleStatus+' / Page '+selected.recognition.sourceImage.page+(selected.recognition.groupId?' / Repeated shape group':'')+'. Verify classification and dimensions.'}</Copy>}
              {selected.extent && !selected.end && <><NumberField disabled={busy} label="Overlay width percent (not physical target size)" value={selected.extent.width*100} change={width=>changeProposal({extent:{...selected.extent!,width:width/100}})} /><NumberField disabled={busy} label="Overlay height percent (not physical target size)" value={selected.extent.height*100} change={height=>changeProposal({extent:{...selected.extent!,height:height/100}})} /></>}
              <NumberField disabled={busy} label="Element X percent" value={selected.position.x*100} change={x=>changeProposal({position:{...selected.position,x:x/100}})} /><NumberField disabled={busy} label="Element Y percent" value={selected.position.y*100} change={y=>changeProposal({position:{...selected.position,y:y/100}})} />
              <Action title="Set selected element position" disabled={busy} onPress={()=>setCursor('object')} />
              {selected.end ? <><Action title="Set segment end" disabled={busy} onPress={()=>setCursor('end')} /><NumberField disabled={busy} label="Segment end X percent" value={selected.end.x*100} change={x=>changeProposal({end:{...selected.end!,x:x/100}})} /><NumberField disabled={busy} label="Segment end Y percent" value={selected.end.y*100} change={y=>changeProposal({end:{...selected.end!,y:y/100}})} /><NumberField disabled={busy} label="Segment rotation degrees" value={Math.atan2((selected.end.y-selected.position.y)*draft.aligned.height,(selected.end.x-selected.position.x)*draft.aligned.width)*180/Math.PI} change={rotation=>segmentEdit({rotation})} /><NumberField disabled={busy} label="Segment length percent of image width" value={Math.hypot((selected.end.x-selected.position.x)*draft.aligned.width,(selected.end.y-selected.position.y)*draft.aligned.height)/draft.aligned.width*100} change={length=>segmentEdit({lengthPixels:length/100*draft.aligned!.width})} /></> : <NumberField disabled={busy} label="Element rotation degrees" value={selected.rotation} change={rotation=>changeProposal({rotation})} />}
              <Copy>{selected.notes}</Copy>
            </>}
            <Action title="Add accepted elements to editor" disabled={busy || draft.projection!=='top-down' || !draft.calibration || !draft.proposals.some(p=>p.accepted)} onPress={()=>void run(async current=>{const document=reconstruct(draft,stage,family);await saveDraft(draft);current(()=>{setReferences(old=>[...old.filter(value=>value.id!==draft.id),draft]);apply(document);setMessage(document === stage ? 'These elements are already in the editor. Edit them there, or Undo the previous addition before accepting corrected overlays.' : 'Accepted elements added. Close import and use Save in the stage editor. Existing objects and route are preserved; editor Undo removes this addition.');});})} />
          </>}
        </>}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
