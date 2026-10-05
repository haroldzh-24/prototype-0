import { executeRouteAssistantCommand } from '../routeAssistant/executor';
import type { AssistantHistory } from '../routeAssistant/history';
import type { RouteAssistantContext, RouteAssistantCommand, RouteAssistantResult, RouteChangePreview, Highlights } from '../routeAssistant/types';
import { compactContext, instructions, trustedFacts, revisionToken, boundedInterpretation, utf8Bytes } from './types';
import type { Availability, Decision, RouteAIAdapter } from './types';
import { resolveDecision, validateDecision } from './resolve';
import type { Resolution } from './resolve';
export const quickPrompts=['How long is this route?','Why is waypoint 2 here?','Compare alternatives','Make the route shorter'];
export type Lifecycle='IDLE'|'INTERPRETING'|'RESOLVING_REFERENCE'|'EXECUTING_QUERY'|'SOLVING'|'FORMATTING_RESPONSE'|'WAITING_FOR_CLARIFICATION'|'PREVIEW_READY'|'APPLYING'|'ERROR'|'CANCELLED';
export type ChatMessage={id:string;role:'You'|'AI';text:string;requestId?:string;status:'complete'|'pending'|'failed'|'cancelled';previewId?:string;error?:string};
export type RequestOutcome={status:'complete'|'clarification'|'preview'|'cancelled'|'stale'|'error'|'ignored';requestId?:string};
export type Timing={interpretMs:number;referenceMs:number;assistantMs:number;solverMs?:number;formatMs:number;totalMs:number;adapter:'on-device'|'mock'|'web'};
export type AIState={availability:Availability;messages:ChatMessage[];lifecycle:Lifecycle;requestId?:string;phase:string;preview?:RouteChangePreview;highlights?:Highlights;clarification?:{question:string;options:{id:string;label:string}[]};error?:string;details?:string;timing?:Timing};
const labels:Partial<Record<Lifecycle,string>>={INTERPRETING:'Understanding\u2026',RESOLVING_REFERENCE:'Checking route\u2026',EXECUTING_QUERY:'Checking route\u2026',SOLVING:'Replanning\u2026',FORMATTING_RESPONSE:'Writing response\u2026',APPLYING:'Applying\u2026'};
export const isBusy=(s:AIState)=>!!(s.lifecycle&&labels[s.lifecycle]);
export function friendlyError(error:unknown):string {
  const text=String(error);
  if(/TIMED_OUT/.test(text))return 'ROUTE AI TOOK TOO LONG. Try again.';
  if(/CANCELLED/.test(text))return 'REQUEST CANCELLED';
  if(/CONTEXT_SIZE|contextSizeExceeded|exceededContextWindowSize/i.test(text))return 'The conversation was too long. The model session was reset; try again.';
  if(/UNSUPPORTED_LANGUAGE|unsupportedLanguage/i.test(text))return 'The on-device model does not support this language.';
  if(/REFUSAL|guardrail|refusal/i.test(text))return 'The model could not handle this request. Try a simpler route question.';
  if(/MODEL_NOT_READY/.test(text))return 'MODEL NOT READY. Try again later.';
  if(/UNSUPPORTED_DEVICE|NATIVE_UNAVAILABLE|UNSUPPORTED_OS|APPLE_INTELLIGENCE_NOT_ENABLED/.test(text))return 'MODEL UNAVAILABLE';
  if(/INVALID_STRUCTURED_OUTPUT/.test(text))return "COULDN'T UNDERSTAND REQUEST. Try rephrasing it.";
  if(/STALE/.test(text))return 'The route changed. Recalculate the proposal.';
  if(/SOLVER_/.test(text))return "ROUTE COULDN'T BE RECALCULATED";
  return 'ROUTE AI ERROR. Try again.';
}
export type AssistantExecutor=(c:RouteAssistantContext,command:RouteAssistantCommand,history:AssistantHistory,signal:AbortSignal)=>Promise<RouteAssistantResult>;
/** A replaceable boundary. Yield for painting; computation is still synchronous JS, not a worker. */
export const scheduledExecutor:AssistantExecutor=async(c,command,history,signal)=>{
  await new Promise<void>(resolve=>setTimeout(resolve,32));
  if(signal.aborted)throw Error('REQUEST_CANCELLED');
  return executeRouteAssistantCommand(c,command,history);
};
let controllerSequence=0;
type Request={cancelReason?:string;stageId?:string;id:string;revision:string;session:string;abort:AbortController;started:number;timing:Timing};
export class RouteAIController {
  state:AIState={availability:'UNKNOWN',messages:[],lifecycle:'IDLE',phase:''};
  readonly diagnostics:{cancelled:number;stale:number;last?:Timing}={cancelled:0,stale:0};
  private pending?:{decision:Decision;resolution:Resolution;message:string;revision:string;stageId?:string;requestId:string};
  private instanceId=++controllerSequence;
  private active=true;private sequence=0;private messageSequence=0;private request?:Request;private lastMessage='';
  private recent:{role:string;text:string}[]=[];
  private observedRevision='';
  constructor(private adapter:RouteAIAdapter,private sessionId:string,private getContext:()=>RouteAssistantContext,private getHistory:()=>AssistantHistory,private publish:(state:AIState)=>void,private adapterKind:'on-device'|'mock'|'web'='on-device',private options:{interpretMs?:number;formatMs?:number;operationMs?:number;executor?:AssistantExecutor}={}){}
  private update(next:Partial<AIState>){if(!this.active)return;this.state={...this.state,...next};this.publish(this.state);}
  private transition(lifecycle:Lifecycle,next:Partial<AIState>={}){this.update({...next,lifecycle,phase:labels[lifecycle]??''});}
  private message(role:ChatMessage['role'],text:string,requestId?:string,status:ChatMessage['status']='complete'){
    const message:ChatMessage={id:`message-${++this.messageSequence}`,role,text:text.slice(0,1200),requestId,status};
    this.update({messages:[...this.state.messages,message].slice(-24)});
  }
  private finishMessage(r:Request,text:string,status:ChatMessage['status']='complete',previewId?:string){
    this.update({messages:this.state.messages.map(m=>m.requestId===r.id&&m.role==='AI'&&m.status==='pending'?{...m,text:text.slice(0,1200),status,previewId,error:status==='failed'?text:undefined}:m)});
  }
  async initialize(){this.active=true;try{const availability=await this.adapter.getAvailability();if(this.active)this.update({availability});}catch(e){this.update({availability:'NATIVE_UNAVAILABLE',error:friendlyError(e),details:String(e)});}}
  private check(r:Request){
    if(!this.active||this.request!==r||r.abort.signal.aborted)throw Error('REQUEST_CANCELLED');
    if(this.getContext().revision!==r.revision||this.getContext().stageId!==r.stageId)throw Error('STALE_REQUEST');
  }
  private async boundary<T>(r:Request,work:()=>Promise<T>,ms:number):Promise<T>{
    this.check(r);const phase=this.state.lifecycle,started=performance.now();let timer:ReturnType<typeof setTimeout>|undefined;
    let abort:()=>void=()=>{};
    try{
      const interrupted=new Promise<never>((_,reject)=>{
        abort=()=>reject(Error('REQUEST_CANCELLED'));r.abort.signal.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>reject(Error('REQUEST_TIMED_OUT')),ms);
      });
      const value=await Promise.race([work(),interrupted]);
      this.check(r);if(performance.now()-started>ms)throw Error('REQUEST_TIMED_OUT');return value;
    }finally{
      const elapsed=performance.now()-started;
      if(phase==='INTERPRETING')r.timing.interpretMs+=elapsed;
      if(phase==='SOLVING'||phase==='EXECUTING_QUERY')r.timing.assistantMs=elapsed;
      if(phase==='FORMATTING_RESPONSE')r.timing.formatMs=elapsed;
      clearTimeout(timer);r.abort.signal.removeEventListener('abort',abort);}
  }
  private start(message:string,addUser=true):Request{
    const c=this.getContext(),id=`${this.sessionId}-request-${this.instanceId}-${++this.sequence}`;
    const r:Request={stageId:c.stageId,id,revision:c.revision,session:id,abort:new AbortController(),started:performance.now(),timing:{interpretMs:0,referenceMs:0,assistantMs:0,formatMs:0,totalMs:0,adapter:this.adapterKind}};
    this.request=r;this.lastMessage=message;this.observedRevision=c.revision;
    if(addUser)this.message('You',message,id);this.message('AI','',id,'pending');
    this.transition('INTERPRETING',{requestId:id,error:undefined,details:undefined,timing:undefined,clarification:undefined,highlights:undefined});return r;
  }
  async send(message:string):Promise<RequestOutcome>{
    if(!this.active||isBusy(this.state)||this.request||!message.trim()||this.state.availability!=='AVAILABLE'||this.state.preview)return {status:'ignored'};
    const r=this.start(message.trim().slice(0,600));
    try{
      const c=this.getContext(),started=performance.now();
      await this.boundary(r,async()=>{
        await this.adapter.resetSession(r.session);this.check(r);
        await this.adapter.createSession(r.session,instructions);this.check(r);
      },this.options.interpretMs??60000);
      const decision=validateDecision(await this.boundary(r,()=>this.adapter.interpret(r.session,boundedInterpretation(this.lastMessage,compactContext(this.sessionId,c),this.recent)),this.options.interpretMs??60000));
      r.timing.interpretMs=performance.now()-started;
      return await this.execute(r,c,decision,this.lastMessage);
    }catch(e){return this.failed(r,e);}finally{this.release(r);}
  }
  private async execute(r:Request,c:RouteAssistantContext,decision:Decision,message:string):Promise<RequestOutcome>{
    this.check(r);this.transition('RESOLVING_REFERENCE');const started=performance.now();
    const resolution=resolveDecision(c,decision,r.id);r.timing.referenceMs=performance.now()-started;
    const heavy=!['ANSWER_ONLY','NEED_CLARIFICATION'].includes(resolution.command.type);
    this.transition(heavy?'SOLVING':'EXECUTING_QUERY');
    const result=await this.boundary(r,()=> (this.options.executor??scheduledExecutor)(c,resolution.command,this.getHistory(),r.abort.signal),this.options.operationMs??120000);
    r.timing.assistantMs=result.durationMs;r.timing.solverMs=result.kind==='preview'?result.solverDurationMs:undefined;
    if(result.kind==='error')throw Error(result.code);
    if(result.kind==='clarification'){
      this.pending={decision,resolution,message,revision:c.revision,stageId:c.stageId,requestId:r.id};this.finishMessage(r,result.data.question);
      this.transition('WAITING_FOR_CLARIFICATION',{clarification:result.data});return {status:'clarification',requestId:r.id};
    }
    this.pending=undefined;
    if(result.kind==='answer'&&result.highlights&&result.data&&typeof result.data==='object'){
      if('stageObjectIds' in result.data)result.highlights.stageObjectIds=(result.data as {stageObjectIds:string[]}).stageObjectIds.filter(id=>c.stage.objects.some(o=>o.id===id));
      if(resolution.command.type==='ANSWER_ONLY'&&resolution.command.query.type==='REQUIRED_AREAS')result.highlights.requiredAreaIds=c.solverInput.requiredAreas.map(a=>a.id);
    }
    this.transition('FORMATTING_RESPONSE',{clarification:undefined});const formatStarted=performance.now();
    const facts=trustedFacts(result),safeFacts=utf8Bytes(JSON.stringify(facts))<=4000?facts:{status:'factsTooLarge',message:'Too many facts to summarize. Ask about one waypoint or segment.'};
    let text:string;
    try{text=await this.boundary(r,()=>this.adapter.format(r.session,{revision:revisionToken(c.revision),question:message,facts:safeFacts}),this.options.formatMs??45000);}
    catch(e){this.check(r);if(/TIMED_OUT|CANCELLED|STALE/.test(String(e)))throw e;
      text=result.kind==='preview'?'Proposal ready. Review the metrics and press Apply to change the route.':'The query completed, but the model could not write a response. See Details for the current facts.';
      this.update({error:friendlyError(e),details:JSON.stringify(facts)});
    }
    this.check(r);r.timing.formatMs=performance.now()-formatStarted;r.timing.totalMs=performance.now()-r.started;
    this.finishMessage(r,text,'complete',result.kind==='preview'?result.preview.id:undefined);
    this.recent=[...this.recent,{role:'user',text:message.slice(0,600)},{role:'assistant',text:text.slice(0,600)}].slice(-4);
    this.transition(result.kind==='preview'?'PREVIEW_READY':'IDLE',{preview:result.kind==='preview'?result.preview:undefined,highlights:'highlights' in result?result.highlights:undefined,timing:r.timing});
    return {status:result.kind==='preview'?'preview':'complete',requestId:r.id};
  }
  async choose(id:string):Promise<RequestOutcome>{
    const p=this.pending;if(!p||isBusy(this.state)||this.request)return {status:'ignored'};
    if(!p.resolution.pendingField){this.update({clarification:undefined});return {status:'ignored'};}
    if(p.revision!==this.getContext().revision||p.stageId!==this.getContext().stageId){this.pending=undefined;this.transition('ERROR',{error:friendlyError('STALE_REQUEST'),clarification:undefined});return {status:'stale'};}
    const field=p.resolution.pendingField,decision={...p.decision,[field]:field==='alternativeNumber'?Number(id):id};
    // Continue the same conversational request with fresh ownership, no second model interpretation.
    const r=this.start(p.message,false);this.pending=undefined;
    try{await this.boundary(r,()=>this.adapter.createSession(r.session,instructions),this.options.interpretMs??60000);return await this.execute(r,this.getContext(),decision,p.message);}
    catch(e){return this.failed(r,e);}finally{this.release(r);}
  }
  cancel(reason='REQUEST_CANCELLED',clearPreview=true){
    const r=this.request;if(r){this.request=undefined;r.cancelReason=reason;r.abort.abort();this.finishMessage(r,friendlyError(reason),'cancelled');this.diagnostics[/STALE/.test(reason)?'stale':'cancelled']++;
      void this.adapter.cancelGeneration?.(r.session).catch(()=>{});void this.adapter.resetSession(r.session).catch(()=>{});}
    this.pending=undefined;this.transition('CANCELLED',{requestId:undefined,preview:clearPreview?undefined:this.state.preview,highlights:undefined,clarification:undefined,error:r?friendlyError(reason):undefined});
  }
  invalidate(reason='REQUEST_CANCELLED'){this.recent=[];this.cancel(reason);}
  contextChanged(){const revision=this.getContext().revision;if(this.observedRevision&&revision!==this.observedRevision){this.recent=[];if(this.request)this.cancel('STALE_REQUEST');else {this.pending=undefined;this.update({clarification:undefined,highlights:undefined});}}this.observedRevision=revision;}
  background(){this.invalidate();}
  close(){if(this.request)this.cancel();}
  clearHighlights(){this.update({highlights:undefined});}
  async retry(){if(this.state.preview)return;await this.send(this.lastMessage);}
  async recalculate(){if(!this.state.preview)return;this.cancel();await this.send(this.lastMessage||'Replan the route');}
  async apply(apply:(preview:RouteChangePreview)=>{status:string;code?:string}){
    const preview=this.state.preview;if(!preview||!preview.valid||isBusy(this.state)||this.request)return;
    if(preview.sourceRevision!==this.getContext().revision||preview.sourceStageId!==this.getContext().stageId){this.applied({status:'invalid',code:'STALE_PREVIEW'});return;}
    const r=this.startApply();this.transition('APPLYING',{requestId:r.id});
    try{await this.boundary(r,()=>new Promise<void>(resolve=>setTimeout(resolve,32)),this.options.operationMs??120000);this.check(r);const result=apply(preview);this.applied(result);}
    catch(e){this.failed(r,e);}finally{this.release(r);}
  }
  private startApply():Request{const id=`${this.sessionId}-apply-${this.instanceId}-${++this.sequence}`;const r:Request={stageId:this.getContext().stageId,id,session:id,revision:this.getContext().revision,abort:new AbortController(),started:performance.now(),timing:{interpretMs:0,referenceMs:0,assistantMs:0,formatMs:0,totalMs:0,adapter:this.adapterKind}};this.request=r;return r;}
  applied(result:{status:string;code?:string}){
    if(result.status!=='applied'){this.transition('ERROR',{error:friendlyError(result.code),details:result.code});return;}
    const undo=this.state.preview?.command.type==='UNDO_LAST_ASSISTANT_CHANGE';this.pending=undefined;
    this.transition('IDLE',{preview:undefined,highlights:undefined,clarification:undefined});this.message('AI',undo?'Reverted the previous route change. Save to keep it.':'Applied. The route has changed. Save to keep it.',this.request?.id);
  }
  private failed(r:Request,e:unknown):RequestOutcome{
    if(this.request!==r||!this.active)return {status:/STALE/.test(r.cancelReason??'')?'stale':'cancelled',requestId:r.id};
    const stale=/STALE/.test(String(e));this.finishMessage(r,friendlyError(e),stale?'cancelled':'failed');
    if(stale)this.diagnostics.stale++;
    this.transition(stale?'CANCELLED':'ERROR',{error:friendlyError(e),details:String(e),preview:undefined,highlights:undefined,clarification:undefined});
    const availability=String(e).match(/UNSUPPORTED_DEVICE|APPLE_INTELLIGENCE_NOT_ENABLED|MODEL_NOT_READY|UNSUPPORTED_OS|NATIVE_UNAVAILABLE/)?.[0] as Availability|undefined;
    if(availability)this.update({availability});return {status:stale?'stale':'error',requestId:r.id};
  }
  private release(r:Request){
    r.timing.totalMs=performance.now()-r.started;this.diagnostics.last={...r.timing};
    void this.adapter.resetSession(r.session).catch(()=>{});
    if(this.request===r){this.request=undefined;this.update({requestId:undefined});}
  }
  dispose(){this.cancel();this.active=false;this.recent=[];}
}
