import { View, Text } from 'react-native';
import { stageToViewport } from '../stage/coordinates';
import type { ViewportTransform, StagePosition } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { RouteAssistantContext, RouteChangePreview, Highlights } from '../planning/routeAssistant/types';
import { colors } from '../ui/tokens';
export default function RouteAIOverlay({context,preview,highlights,transform,stage}:{context:RouteAssistantContext;preview?:RouteChangePreview;highlights?:Highlights;transform:ViewportTransform;stage:StageDocument}) {
  const project=(p:{x:number;y:number})=>stageToViewport({space:'stage',...p,z:0},transform);
  const line=(a:{x:number;y:number},b:{x:number;y:number},key:string)=>{
    const p=project(a),q=project(b),length=Math.hypot(q.x-p.x,q.y-p.y);
    return <View key={key} style={{position:'absolute',left:(p.x+q.x)/2-length/2,top:(p.y+q.y)/2,width:length,height:2,borderWidth:1,borderStyle:'dashed',borderColor:colors.warning,transform:[{rotate:Math.atan2(q.y-p.y,q.x-p.x)+'rad'}]}} />;
  };
  const points=preview?[context.solverInput.start,...preview.proposedRoute.positions.map(w=>w.position)]:[];
  const focus: {id:string;position:StagePosition}[]=[...context.route.positions.filter(w=>highlights?.waypointIds.includes(w.id)).map(w=>({id:w.id,position:w.position})),...stage.objects.filter(o=>highlights?.stageObjectIds.includes(o.id)).map(o=>({id:o.id,position:o.position}))];
  const areas=context.solverInput.requiredAreas.filter(a=>highlights?.requiredAreaIds.includes(a.id));
  const segments=highlights?.routeSegmentIds??[];
  const routePoints=[{id:'START',position:context.solverInput.start},...context.route.positions];
  return <View testID="route-ai-overlay" pointerEvents="none" style={{position:'absolute',left:0,right:0,top:0,bottom:0}}>
    {points.slice(1).map((p,i)=>line(points[i],p,'ghost-'+i))}
    {preview?.proposedRoute.positions.map((w,i)=>{const p=project(w.position);return <Text key={w.id} style={{position:'absolute',left:p.x+6,top:p.y+6,color:colors.warning,fontSize:11}}>PROPOSED {i+1}</Text>;})}
    {focus.map(w=>{const p=project(w.position);return <View key={w.id} style={{position:'absolute',left:p.x-26,top:p.y-26,width:52,height:52,borderWidth:2,borderColor:colors.warning,borderRadius:26}} />;})}
    {areas.map(a=>a.polygon.map((p,i)=>line(p,a.polygon[(i+1)%a.polygon.length],a.id+i)))}
    {segments.map(id=>{const i=routePoints.findIndex((p,i)=>i<routePoints.length-1&&`${p.id}->${routePoints[i+1].id}`===id);return i>=0?line(routePoints[i].position,routePoints[i+1].position,id):null;})}
    {preview?.constraints.map(a=>a.polygon.map((p,i)=>line(p,a.polygon[(i+1)%a.polygon.length],a.id+i)))}
  </View>;
}
