import { TextInput, View } from 'react-native';
import { useState } from 'react';
import EditorSheet from '../../editor/EditorSheet';
import { Action, Copy, DataRow, ErrorState, Loading, Notice, Panel, StatusBadge, ui } from '../../ui/kit';
import type { AIState, RouteAIController } from './controller';
import { quickPrompts, isBusy } from './controller';
export default function RouteAISheet({visible,close,state,controller,revision,apply,inspect}: {
  visible:boolean;close:()=>void;state:AIState;controller:RouteAIController;revision:string;apply:()=>void;inspect:()=>void;
}) {
  const [input,setInput]=useState('');
  const busy=isBusy(state),available=state.availability==='AVAILABLE',preview=state.preview,stale=preview&&preview.sourceRevision!==revision;
  const send=()=>{const message=input.trim();if(!message||busy||preview||!available)return;setInput('');void controller.send(message);};
  const labels:Record<string,string>={UNKNOWN:'Checking availability',NATIVE_UNAVAILABLE:"On-device Route AI isn't available on this device.",UNSUPPORTED_OS:'Route AI requires iOS 26 or later.',UNSUPPORTED_DEVICE:'This device does not support Apple Intelligence.',APPLE_INTELLIGENCE_NOT_ENABLED:'Enable Apple Intelligence in Settings to use Route AI.',MODEL_NOT_READY:'The on-device model is downloading or not ready. Try again later.'};
  return <EditorSheet title="ROUTE AI" visible={visible} close={close} footer={<View style={{padding:12,gap:8}}>
    <TextInput accessibilityLabel="Ask about this route" placeholder="Ask about this route…" placeholderTextColor="#a7b3c4" style={[ui.input,{maxHeight:100}]} multiline maxLength={600} value={input} onChangeText={setInput} editable={available&&!busy&&!preview} />
    <Action title="SEND" variant="primary" disabled={!available||busy||!!preview||!input.trim()} onPress={send} />
  </View>}><View testID="route-ai-sheet" style={{padding:12,gap:12}}>
    <StatusBadge label={available?'OFFLINE':state.availability.replaceAll('_',' ')} tone={available?'selected':'warning'} />
    {!available&&<><Notice>{labels[state.availability]}</Notice><Copy>Normal Route Planner remains fully usable.</Copy><Action title="CHECK AGAIN" onPress={()=>void controller.initialize()} /></>}
    {available&&!state.messages.length&&<><Copy>Ask about the current route or propose a waypoint change.</Copy>{quickPrompts.map(prompt=><Action key={prompt} title={prompt} disabled={busy} onPress={()=>void controller.send(prompt)} />)}</>}
    {state.messages.filter(m=>m.status!=='pending').map(message=><View key={message.id} style={{gap:4}}><StatusBadge label={message.role} /><Copy>{message.text}</Copy></View>)}
    {busy&&<><Loading label={state.phase} /><Action title="CANCEL" onPress={()=>controller.cancel()} /></>}
    {state.error&&<><ErrorState title={state.error} detail={state.details} />{available&&!busy&&!preview&&<Action title="TRY AGAIN" onPress={()=>void controller.retry()} />}</>}
    {state.clarification&&<Panel><Copy>{state.clarification.question}</Copy>{state.clarification.options.map(option=><Action key={option.id} title={option.label} disabled={busy} onPress={()=>void controller.choose(option.id)} />)}</Panel>}
    {preview&&<Panel>
      <StatusBadge label={stale?'ROUTE CHANGED':'PROPOSED CHANGE'} tone={stale?'warning':'selected'} />
      <Copy>{preview.command.type.replaceAll('_',' ')}</Copy>
      {stale?<><Copy>This proposal was based on an earlier route.</Copy><Action title="RECALCULATE" disabled={busy} onPress={()=>void controller.recalculate()} /><Action title="DISMISS" onPress={()=>controller.cancel()} /></>:<>
        <DataRow label="BEFORE" value={`${(preview.before.distanceInches/36).toFixed(2)} yd`} />
        <DataRow label="AFTER" value={`${(preview.after.distanceInches/36).toFixed(2)} yd`} />
        <DataRow label="CHANGE" value={`${(preview.delta.distanceDifferenceInches/36).toFixed(2)} yd`} />
        {!preview.valid&&<Notice tone="error">This proposal is invalid. {preview.warnings.join(', ')}</Notice>}
        <Copy>The stage shows the proposed path in amber. Apply changes the draft; Save is still required.</Copy>
        <Action title="VIEW ON STAGE" disabled={busy} onPress={inspect} />
        <Action title="CANCEL" disabled={busy} onPress={()=>controller.cancel()} /><Action title="APPLY" variant="primary" disabled={busy||!preview.valid} onPress={apply} />
      </>}
    </Panel>}
    {state.highlights&&!preview&&<Action title="VIEW HIGHLIGHTS" disabled={busy} onPress={inspect} />}
    {typeof __DEV__!=='undefined'&&__DEV__&&state.timing&&<Copy>{state.timing.adapter==='mock'?'MOCK TIMING':'ON-DEVICE TIMING'} · Interpret {Math.round(state.timing.interpretMs)} ms · RouteAssistant {Math.round(state.timing.assistantMs)} ms{state.timing.solverMs!==undefined?` · Solver ${Math.round(state.timing.solverMs)} ms`:''} · Format {Math.round(state.timing.formatMs)} ms</Copy>}
  </View></EditorSheet>;
}
