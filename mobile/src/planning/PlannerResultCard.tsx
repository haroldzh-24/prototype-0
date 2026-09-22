import { Pressable, Text, View } from 'react-native';
import { Action, Copy, DataRow, colors, ui } from '../ui/kit';
import ToolIcon from '../ui/ToolIcon';
import type { PlannerCard } from './plannerUI';

export default function PlannerResultCard({ card, index, styleLabel, pending, onPreview, onUse, onConfirm, onCancel, expansion, onExpand }: {
  card: PlannerCard; index: number; styleLabel: string; pending: boolean;
  onPreview: () => void; onUse: () => void; onConfirm: () => void; onCancel: () => void;
  expansion: { why: boolean; details: boolean }; onExpand: (value: { why: boolean; details: boolean }) => void;
}) {
  const { why, details } = expansion;
  return <View style={{ gap: 6, borderTopWidth: 1, borderColor: colors.border, paddingVertical: 12 }}>
    <Text style={[ui.actionText, { color: colors.accent }]}>Candidate {index + 1}{index === 0 ? ' · Best Evaluated' : ''}</Text>
    <Text style={ui.actionText}>{styleLabel}</Text>
    <Copy>{card.label} · Compared with displayed candidates</Copy>
    <Text style={ui.statValue}>{card.estimatedTime === null ? 'Time unavailable' : `${card.estimatedTime.toFixed(2)} s`}</Text>
    <Copy>{`${(card.movementDistance / 12).toFixed(1)} ft · ${card.positions} positions · ${card.reloads} reloads`}</Copy>
    <Copy>{card.comparison}</Copy>
    <Copy>Used {card.sourceCounts.auto} automatically discovered positions / {card.sourceCounts.manual} manual positions</Copy>
    {card.personalization && <><Copy>Personalized confidence: {card.personalization.confidence}</Copy><Copy>Using: {card.personalization.using.join(', ') || 'Generic factors for this route'}</Copy><Copy>Fallback: {card.personalization.fallback.join(', ') || 'None within recorded range'}</Copy></>}
    {card.personalizedFallback && <Copy>Personalized fell back to Balanced.</Copy>}
    {!!card.reasons.length && <>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: why }} onPress={() => onExpand({ ...expansion, why: !why })} style={ui.action}><Text style={ui.actionText}>{why ? '−' : '+'} WHY THIS ROUTE</Text></Pressable>
      {why && <><Copy>Ranking preferences used for this candidate; these are not claims of superiority over every alternative.</Copy>{card.reasons.map((reason, i) => <Copy key={i}>{reason}</Copy>)}</>}
    </>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => onExpand({ ...expansion, details: !details })} style={ui.action}><Text style={ui.actionText}>{details ? '−' : '+'} DETAILS</Text></Pressable>
    {details && <>{card.personalization && <Copy>Profile-based evaluator estimate. Accepted manual routes currently display baseline timing; the difficulty curve is applied during Personalized comparison.</Copy>}<Copy>Difficulty is a distance-based index. Retreat is a geometric estimate.</Copy>{card.details.map(row => <DataRow key={row.label} {...row} />)}</>}
    <Pressable accessibilityRole="button" onPress={onPreview} style={[ui.action, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}><ToolIcon name="view" active /><Text style={ui.actionText}>VIEW ROUTE</Text></Pressable>
    {pending ? <><Copy>Replace the existing manual route with this route?</Copy><Action title="Cancel" onPress={onCancel} /><Action title="Confirm replacement" onPress={onConfirm} /></> : <Action title="USE THIS ROUTE" onPress={onUse} />}
  </View>;
}
