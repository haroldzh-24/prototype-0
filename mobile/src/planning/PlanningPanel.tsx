import { useEffect, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';
import Text from '@/editor/FieldText';
import { uuid } from 'expo-modules-core';
import type { StageDocument } from '../stage/model';
import { objectLabel } from '../stage/model';
import { ammunitionSummary, assignRounds, createMagazineId, deleteMagazine, designateMagazine, isEngageable, saveMagazine, setChamber } from './model';
import type { Magazine, PlanResult, StagePlan } from './model';

export default function PlanningPanel({ plan, stage, onChange }: { plan: StagePlan; stage: StageDocument; onChange: (plan: StagePlan) => void }) {
  const [error, setError] = useState('');
  const apply = (result: PlanResult) => { setError(result.error ?? ''); if (!result.error) onChange(result.plan); };
  const summary = ammunitionSummary(plan,stage);
  return <View style={{ gap: 8, padding: 10, marginTop: 8, backgroundColor: '#1c261e', borderWidth: 1, borderColor: '#465044' }}>
    <Text style={{ fontSize: 14, color: '#d0b368', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 'bold' }}>Loadout and planned rounds</Text>
    <Text>Magazine counts are rounds actually loaded, excluding the chamber. Other magazines are carried spares. These are totals, not an engagement order or reload plan.</Text>
    <Text>Chamber loaded: {plan.loadout.chamberLoaded ? 'Yes (1 round)' : 'No'}</Text>
    <Switch trackColor={{ false: '#384236', true: '#345c59' }} thumbColor="#c5cebc" accessibilityLabel="Chamber loaded" value={plan.loadout.chamberLoaded} onValueChange={value => onChange(setChamber(plan,value))} />
    <Action label="Add Magazine" onPress={() => apply(saveMagazine(plan,{ id: createMagazineId(uuid.v4), capacity: 10, startingRounds: 0 },true))} />
    <Action label="Start without magazine" onPress={() => apply(designateMagazine(plan,null))} />
    {plan.loadout.startingMagazineId === null && <Text>No starting magazine designated.</Text>}
    {plan.loadout.magazines.map((magazine,index) => <View key={magazine.id} style={{ borderWidth: 1, borderColor: '#465044', padding: 8, gap: 6 }}>
      <Text>Magazine {index+1} — {plan.loadout.startingMagazineId === magazine.id ? 'Starting in firearm' : 'Carried spare'}</Text>
      <MagazineForm magazine={magazine} onSave={value => apply(saveMagazine(plan,value))} />
      <Action label="Use as starting magazine" onPress={() => apply(designateMagazine(plan,magazine.id))} />
      <Action label="Delete Magazine" onPress={() => { onChange(deleteMagazine(plan,magazine.id)); setError(''); }} />
    </View>)}
    <Text style={{ fontSize: 12, color: '#d0b368', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 'bold' }}>Target engagements</Text>
    <Text>Unassigned targets have zero planned rounds. No-shoots and props do not consume ammunition.</Text>
    {stage.objects.filter(isEngageable).map((object,index) => <RoundAssignment key={object.id}
      label={objectLabel(object.type)+' '+(index+1)+' ('+object.id+')'} value={plan.engagements[object.id] ?? 0}
      onSave={rounds => apply(assignRounds(plan,stage,object.id,rounds))} />)}
    <Text style={{ color: '#d0b368' }}>Total available: {summary.totalAvailable} · Planned: {summary.totalPlanned} · Reserve: {summary.reserve}</Text>
    {summary.insufficient && <Text accessibilityLiveRegion="polite" style={{ color: '#dfb369' }}>Planned rounds exceed available ammunition by {-summary.reserve}.</Text>}
    {error !== '' && <Text accessibilityLiveRegion="polite" style={{ color: '#dfb369' }}>{error}</Text>}
  </View>;
}
const inputStyle = { borderWidth: 1, borderColor: '#465044', backgroundColor: '#151d17', padding: 8, minHeight: 44, color: '#e1e5db', borderRadius: 2 };
function MagazineForm({ magazine, onSave }: { magazine: Magazine; onSave: (magazine: Magazine) => void }) {
  const [label,setLabel] = useState(magazine.label ?? '');
  const [capacity,setCapacity] = useState(String(magazine.capacity));
  const [rounds,setRounds] = useState(String(magazine.startingRounds));
  useEffect(() => { setLabel(magazine.label ?? ''); setCapacity(String(magazine.capacity)); setRounds(String(magazine.startingRounds)); },[magazine]);
  return <View style={{ gap: 6 }}>
    <Text>Label (optional)</Text><TextInput accessibilityLabel="Magazine label" style={inputStyle} value={label} onChangeText={setLabel} />
    <Text>Capacity</Text><TextInput accessibilityLabel="Magazine capacity" style={inputStyle} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
    <Text>Loaded rounds</Text><TextInput accessibilityLabel="Magazine loaded rounds" style={inputStyle} value={rounds} onChangeText={setRounds} keyboardType="number-pad" />
    <Action label="Apply Magazine" onPress={() => onSave({ ...magazine, label: label.trim() || undefined, capacity: numeric(capacity), startingRounds: numeric(rounds) })} />
  </View>;
}
function numeric(text: string) { return /^\d+$/.test(text.trim()) ? Number(text) : NaN; }
function RoundAssignment({ label, value, onSave }: { label: string; value: number; onSave: (rounds: number) => void }) {
  const [draft,setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)),[value]);
  return <View style={{ gap: 6 }}><Text>{label}</Text>
    <TextInput accessibilityLabel={'Planned rounds for '+label} style={inputStyle} value={draft} onChangeText={setDraft} keyboardType="number-pad" />
    <Action label="Apply Planned Rounds" onPress={() => onSave(numeric(draft))} />
  </View>;
}
function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ backgroundColor: '#252e27', padding: 10, minHeight: 44, borderWidth: 1, borderColor: '#465044', borderRadius: 2, alignSelf: 'flex-start' }}>
    <Text style={{ color: '#e1e5db', fontSize: 11, textTransform: 'uppercase' }}>{label}</Text>
  </Pressable>;
}
