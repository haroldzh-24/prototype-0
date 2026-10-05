import { useEffect, useRef, useState } from 'react';
import { Action, Copy, DataRow, Panel, Loading, Notice } from '../ui/kit';
import EditorSheet from '../editor/EditorSheet';
import type { PlannerContext } from './planner';
import type { StagePlan } from './model';
import type { DiscoverySession } from './positionSources';
import { copyPlannerRoute } from './plannerUI';
import type { PlannerCard } from './plannerUI';
import { solveRoute } from './routeSolver/solveRoute';
import { solverInputFromPlan, solverPreviewCard } from './routeSolver/adoption';
import type { RouteSolverResult } from './routeSolver/types';
import { meaningfulRoute } from '../editor/routePresentation';

export default function AutoPlannerPanel({stage,plan,onUse,preview,onPreview,onClose,discoveryPreview,onConfigure,onSolverResult}:PlannerContext & {onSolverResult?:(result:RouteSolverResult)=>void;onConfigure:(section:'loadout'|'targets'|'rules'|'geometry'|'start')=>void;discoverySession:DiscoverySession|null;onDiscovery:(session:DiscoverySession)=>void;discoveryPreview:boolean;onDiscoveryPreview:()=>void;preview:PlannerCard|null;onPreview:(card:PlannerCard)=>void;onClose:()=>void;onUse:(plan:StagePlan)=>void}) {
  const [result,setResult]=useState<RouteSolverResult|null>(null),[generating,setGenerating]=useState(false),[alternatives,setAlternatives]=useState(false),[pending,setPending]=useState<PlannerCard|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{setResult(null);setGenerating(false);setPending(null);setAlternatives(false);return()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;};},[stage,plan]);
  const input=solverInputFromPlan(stage,plan);
  const cards=result?.bestRoute?[result.bestRoute,...result.alternatives].map((c,i)=>solverPreviewCard(c,plan,i)):[];
  function generate(){
    if(timer.current!==null)return;
    setGenerating(true);setResult(null);setPending(null);setAlternatives(false);setError('');
    timer.current=setTimeout(()=>{timer.current=null;try{const solved=solveRoute(input);setResult(solved);onSolverResult?.(solved);}catch{setError('Unable to plan this geometry. Review the stage and try again.');}finally{setGenerating(false);}},50);
  }
  function useRoute(card:PlannerCard,confirmed=false){const next=copyPlannerRoute(plan,card.route,confirmed||!meaningfulRoute(plan.route));if(next)onUse(next);else setPending(card);}
  return <EditorSheet title="PLAN ROUTE" visible={!preview&&!discoveryPreview} close={onClose}><Panel>
    <Copy>Minimum movement / Fewest required waypoints</Copy>
    {!cards.length&&<>
      <DataRow label="Start" value={Number.isFinite(input.start.x)?'Ready':'Needs setup'} />
      <DataRow label="Required areas / waypoints" value={input.requiredAreas.length} />
      <Copy>Visits configured firing areas. Without areas, existing manual waypoints are required. Target assignments and reloads can be edited after using the route.</Copy>
      {!input.requiredAreas.length&&<Notice>Configure firing areas or add required manual waypoints. With no requirements, the route stays at Start.</Notice>}
      <Action title="CONFIGURE" onPress={()=>onConfigure('rules')} />
      {!Number.isFinite(input.start.x)&&<Action title="SET START" onPress={()=>onConfigure('start')} />}
      {generating&&<Loading label="Planning route..." />}
      {!!error&&<Notice tone="error">{error}</Notice>}
      {result&&!result.bestRoute&&<Notice tone="error">{result.status==='limit'?'Planning limit reached. Simplify the required geometry.':result.status==='invalid-input'?'Check Start and required geometry.':'A required area cannot be reached.'}</Notice>}
      <Action variant="primary" title={generating?'Generating...':'GENERATE ROUTE'} disabled={generating} onPress={generate} />
    </>}
    {!!cards.length&&<>
      <Copy>ROUTE FOUND</Copy>
      {(alternatives?cards:cards.slice(0,1)).map((card,i)=><Panel key={card.id}>
        {alternatives&&<Copy>{i===0?'Best route':`Alternative ${i}`}</Copy>}
        <DataRow label="Movement" value={`${(card.movementDistance/36).toFixed(2)} yd`} />
        <DataRow label="Waypoints" value={card.positions} />
        <Copy>{card.comparison}</Copy>
        {pending?.id===card.id?<><Copy>Replace your existing route?</Copy><Action title="Keep route" onPress={()=>setPending(null)} /><Action variant="primary" title="Confirm replacement" onPress={()=>useRoute(card,true)} /></>:<Action variant="primary" title="USE ROUTE" onPress={()=>useRoute(card)} />}
        <Action title="VIEW ON STAGE" onPress={()=>onPreview(card)} />
      </Panel>)}
      {cards.length>1&&<Action title={alternatives?'Hide alternatives':'COMPARE ALTERNATIVES'} onPress={()=>setAlternatives(!alternatives)} />}
      <Action title="PLAN AGAIN" onPress={()=>setResult(null)} />
    </>}
  </Panel></EditorSheet>;
}
