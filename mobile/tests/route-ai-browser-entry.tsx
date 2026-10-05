// Isolated Metro entry for browser smoke only. Never imported by Expo Router.
import React, {useEffect,useMemo,useRef,useState} from 'react';
import {AppRegistry,View,Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useDocumentHistory} from '../src/editor/useDocumentHistory';
import StageViewport from '../src/editor/StageViewport';
import RouteAISheet from '../src/planning/routeAI/RouteAISheet';
import {RouteAIController} from '../src/planning/routeAI/controller';
import type {AIState} from '../src/planning/routeAI/controller';
import {createRouteAssistantContext} from '../src/planning/routeAssistant/context';
import {mockAdapter} from '../src/planning/routeAI/testing/mockAdapter';
import {productionAdapter} from '../src/planning/routeAI/nativeAdapter';
import {createPlan} from '../src/planning/model';
import {createRoute} from '../src/planning/route';
import {defaultEngagementRules} from '../src/planning/engagements';
import {DEFAULT_SNAPPING} from '../src/stage/snapping';
import {ToolButton,colors} from '../src/ui/kit';
import type {StageDocument} from '../src/stage/model';
const physical=(x:number,y:number)=>({space:'stage' as const,x,y,z:0});
const stage:StageDocument={schemaVersion:7,coordinateSystem:'inches',stage:{width:300,depth:240},objects:[{id:'start',type:'start',position:physical(20,100),rotation:0,geometry:{width:12,depth:12,height:0}}]};
const plan=createPlan();plan.route=createRoute('r');
plan.route.positions=[{id:'W1',label:'W1',position:physical(90,100),visibleTargetIds:[],engagedTargetIds:[]},{id:'W2',label:'W2',position:physical(150,60),visibleTargetIds:[],engagedTargetIds:[]},{id:'W3',label:'W3',position:physical(240,100),visibleTargetIds:[],engagedTargetIds:[]}];
plan.route.engagementRules={...defaultEngagementRules(),firingAreas:[{id:'goal',vertices:[{x:235,y:95},{x:245,y:95},{x:245,y:105},{x:235,y:105}]}]};
const move={intent:'MOVE_WAYPOINT' as const,waypointReference:'waypoint 2',distanceValue:2,distanceUnit:'yards',direction:'left'};
function TestApp(){
  const history=useDocumentHistory(stage,plan);
  const [saved,setSaved]=useState(JSON.stringify(history.plan)),[open,setOpen]=useState(false);
  const [state,setState]=useState<AIState>({availability:'UNKNOWN',messages:[],lifecycle:'IDLE',phase:''});
  const [viewport,setViewport]=useState({zoom:1,pan:{x:0,y:0}});
  const context=useMemo(()=>createRouteAssistantContext(history.stage,history.plan),[history.stage,history.plan]);
  const latest=useRef({context,history});latest.current={context,history};
  const unavailable=new URLSearchParams(location.search).has('unavailable');
  const [controller]=useState(()=>new RouteAIController(unavailable?productionAdapter():mockAdapter([{intent:'QUERY_DISTANCE'},move,{...move,waypointReference:'that waypoint'},{intent:'UNDO'},move,move]).adapter,'browser-stage',()=>latest.current.context,()=>latest.current.history.getAssistantHistory(),setState,unavailable?'on-device':'mock'));
  useEffect(()=>{void controller.initialize();return()=>controller.dispose();},[controller]);
  (globalThis as any).routeAISmoke={state,plan:history.plan,controller,manualChange:()=>history.setPlan(p=>({...p,route:{...p.route!,name:'Manually changed'}})),zoom:()=>setViewport({zoom:2,pan:{x:30,y:20}})};
  const preview=state.preview?.sourceRevision===context.revision?state.preview:undefined;
  return <SafeAreaProvider><View style={{height:'100vh' as any,backgroundColor:colors.background}}>
    <View style={{padding:8,flexDirection:'row',gap:8}}><Text style={{color:colors.text,flex:1}}>Route AI smoke</Text><ToolButton title="SAVE" onPress={()=>setSaved(JSON.stringify(history.plan))} /></View>
    <Text style={{color:colors.text,padding:8}}>{saved===JSON.stringify(history.plan)?'SAVED':'UNSAVED'}</Text>
    <StageViewport stage={history.stage} viewport={viewport} onViewportChange={setViewport} routeEditing readOnly gridVisible snapping={DEFAULT_SNAPPING} selectedId={null} onSelect={()=>{}} onDragging={()=>{}} setStage={history.setStage} routePlanning={{route:history.plan.route!,selectedId:null,onSelect:()=>{},onChange:()=>{},onDragging:()=>{},editing:false}} routeAI={{context,preview,highlights:state.highlights}} />
    <View style={{flexDirection:'row',flexWrap:'wrap',padding:4}}>{['PLAN','EDIT','ANALYZE','ASK','•••'].map(title=><View key={title} style={{flex:1}}><ToolButton title={title} onPress={()=>{if(title==='ASK')setOpen(true);}} /></View>)}</View>
    <RouteAISheet visible={open} close={()=>{controller.close();setOpen(false);}} state={state} controller={controller} revision={context.revision} inspect={()=>setOpen(false)} apply={()=>{void controller.apply(preview=>latest.current.history.applyAssistantPreview(preview));}} />
  </View></SafeAreaProvider>;
}
AppRegistry.registerComponent('RouteAISmoke',()=>TestApp);
AppRegistry.runApplication('RouteAISmoke',{rootTag:document.getElementById('root')});
