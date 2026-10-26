import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { borders, colors, spacing, touch, typography } from '../ui/tokens';
import { targetFamilies } from '../stage/targetFamily';
import type { TargetFamily } from '../stage/targetFamily';
import { presetsForFamily, shortPresetName } from '../stage/targetPresets';
import type { TargetPreset } from '../stage/targetPresets';
import { targetArtSvg, targetColours, targetIsoSvg } from '../stage/targetArt';
import type { TargetRole } from '../stage/targetArt';
import { formatLength } from '../stage/measurements';

/**
 * Radial add menu, like a stage builder's: long-press the bay (or ADD) and the choices fan out around your finger.
 * The first ring is categories (paper, no-shoot, steel, plates, wall, fault line, start); the second is that
 * category's targets for the match family, each drawn at its real proportions. Long-press a target for its card:
 * dimensions, a 3D view, the colour rule and where the size comes from.
 */
export type RadialChoice =
  | { kind: 'target'; presetId: string; noShoot: boolean }
  | { kind: 'tool'; tool: 'wall' | 'faultLine' }
  | { kind: 'start' };
type Category = 'paper' | 'noShoot' | 'steel' | 'plate';
type Item = { key: string; label: string; art: string; accessibilityLabel: string; choose: () => void; info?: { preset: TargetPreset; role: TargetRole } };

const uri = (svg: string) => 'data:image/svg+xml;base64,' + btoa(svg);
const LINE_ICON = (dashed: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M8 40L40 8" stroke="${colors.ink}" stroke-width="${dashed ? 4 : 9}" ${dashed ? 'stroke-dasharray="7 5"' : ''} stroke-linecap="butt"/></svg>`;
const START_ICON = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="8" y="12" width="32" height="24" fill="${colors.startFill}" stroke="${colors.ink}" stroke-width="3"/><path d="M24 17v14M17 24l7-7 7 7" fill="none" stroke="${colors.ink}" stroke-width="3"/></svg>`;
const ITEM = 64, CENTER = 56;

/** Ring layout: item centres around (0, 0), first item straight up, clockwise. */
export function ringPositions(count: number, radius: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, count);
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });
}
/** Keep the whole menu inside the canvas. */
export function clampCenter(at: { x: number; y: number }, bounds: { width: number; height: number }, reach: number) {
  const clamp = (v: number, lo: number, hi: number) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
  return { x: clamp(at.x, reach, bounds.width - reach), y: clamp(at.y, reach + 44, bounds.height - reach) };
}
export const presetsIn = (family: TargetFamily, category: Category) => presetsForFamily(family).filter(p =>
  category === 'paper' || category === 'noShoot' ? p.type === 'cardboardTarget' : category === 'steel' ? p.type === 'steelPopper' : p.type === 'steelPlate');

export default function RadialAddMenu({ at, bounds, targetFamily, onChoose, onClose }: {
  at: { x: number; y: number }; bounds: { width: number; height: number }; targetFamily: TargetFamily;
  onChoose: (choice: RadialChoice) => void; onClose: () => void;
}) {
  const [family, setFamily] = useState(targetFamily);
  const [category, setCategory] = useState<Category | null>(null);
  const [info, setInfo] = useState<{ preset: TargetPreset; role: TargetRole } | null>(null);
  useEffect(() => { setFamily(targetFamily); }, [targetFamily]);
  const scheme = colors.background; // re-render on theme change through the parent; art uses real-world colours
  const items: Item[] = useMemo(() => {
    const first = (c: Category) => presetsIn(family, c)[0];
    if (!category) return ([
      ['paper', 'PAPER', first('paper'), 'scoring'], ['noShoot', 'NO-SHOOT', first('noShoot'), 'noShoot'],
      ['steel', 'POPPERS', first('steel'), 'scoring'], ['plate', 'PLATES', first('plate'), 'scoring'],
    ] as const).filter(([, , preset]) => !!preset).map(([key, label, preset, role]): Item => ({
      key, label, art: targetArtSvg(preset!, role, { size: 48 }), accessibilityLabel: label.toLowerCase() + ' targets',
      choose: () => setCategory(key),
    })).concat([
      { key: 'wall', label: 'WALL', art: LINE_ICON(false), accessibilityLabel: 'Draw a wall', choose: () => onChoose({ kind: 'tool', tool: 'wall' }) },
      { key: 'fault', label: 'FAULT LINE', art: LINE_ICON(true), accessibilityLabel: 'Draw a fault line', choose: () => onChoose({ kind: 'tool', tool: 'faultLine' }) },
      { key: 'start', label: 'START', art: START_ICON(), accessibilityLabel: 'Select the start position', choose: () => onChoose({ kind: 'start' }) },
    ]);
    const role: TargetRole = category === 'noShoot' ? 'noShoot' : 'scoring';
    return presetsIn(family, category).map((preset): Item => ({
      key: preset.id, label: shortPresetName(preset), art: targetArtSvg(preset, role, { size: 48 }),
      accessibilityLabel: `${role === 'noShoot' ? 'No-shoot ' : ''}${preset.name}, ${formatLength(preset.width)} by ${formatLength(preset.height)}`,
      choose: () => onChoose({ kind: 'target', presetId: preset.id, noShoot: role === 'noShoot' }), info: { preset, role },
    }));
  }, [family, category, onChoose, scheme]);
  const radius = items.length > 6 ? 118 : 104;
  const center = clampCenter(at, bounds, radius + ITEM / 2 + 4);
  const ring = ringPositions(items.length, radius);

  return <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} testID="radial-add-menu">
    <Pressable accessibilityLabel="Close the add menu" onPress={onClose} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#00000055' }} />
    {/* Family: the match's by default; others are a tap away, as in the old list. */}
    <View accessibilityRole="radiogroup" accessibilityLabel="Target family" style={{ position: 'absolute', top: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'center', gap: 0 }}>
      {targetFamilies.map((f, i) => <Pressable key={f} accessibilityRole="radio" accessibilityState={{ checked: f === family }} onPress={() => { setFamily(f); setInfo(null); }}
        style={{ minHeight: 40, minWidth: 72, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: f === family ? colors.text : colors.panel, borderWidth: borders.regular, borderColor: colors.border, marginLeft: i ? -borders.regular : 0 }}>
        <Text style={{ ...typography.label, fontSize: 16, color: f === family ? colors.background : colors.text }}>{f}</Text></Pressable>)}
    </View>
    {ring.map((p, i) => { const item = items[i]; return <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={item.accessibilityLabel}
      accessibilityHint={item.info ? 'Long-press for size and source' : undefined}
      onPress={item.choose} onLongPress={item.info ? () => setInfo(item.info!) : undefined}
      style={({ pressed }) => ({ position: 'absolute', left: center.x + p.x - ITEM / 2 - 20, top: center.y + p.y - ITEM / 2, width: ITEM + 40, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: ITEM, height: ITEM, borderRadius: ITEM / 2, backgroundColor: colors.panel, borderWidth: borders.strong, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={{ uri: uri(item.art) }} style={{ width: 40, height: 40 }} contentFit="contain" cachePolicy="none" transition={0} accessibilityIgnoresInvertColors />
      </View>
      <Text numberOfLines={2} style={{ ...typography.category, fontSize: 12, lineHeight: 14, letterSpacing: 0.2, color: colors.text, backgroundColor: colors.panel, paddingHorizontal: 3, marginTop: 2, textAlign: 'center', width: ITEM + 40 }}>{item.label}</Text>
    </Pressable>; })}
    <Pressable accessibilityRole="button" accessibilityLabel={category ? 'Back to categories' : 'Close the add menu'} onPress={() => category ? setCategory(null) : onClose()}
      style={({ pressed }) => ({ position: 'absolute', left: center.x - CENTER / 2, top: center.y - CENTER / 2, width: CENTER, height: CENTER, borderRadius: CENTER / 2,
        backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ ...typography.label, fontSize: 22, color: colors.background }}>{category ? '‹' : '×'}</Text>
    </Pressable>
    {info && <TargetInfoCard preset={info.preset} role={info.role} onClose={() => setInfo(null)}
      onPlace={() => onChoose({ kind: 'target', presetId: info.preset.id, noShoot: info.role === 'noShoot' })} />}
  </View>;
}

/** Size, 3D view, colour rule and source for one target. */
export function TargetInfoCard({ preset, role, onPlace, onClose }: { preset: TargetPreset; role: TargetRole; onPlace: () => void; onClose: () => void }) {
  const status = preset.verification === 'verified' ? 'SIZE VERIFIED (RULEBOOK)' : preset.verification === 'approximate' ? 'SIZE FROM THE MAKER · OUTLINE APPROXIMATE' : 'SIZE NOT VERIFIED';
  return <View accessibilityViewIsModal style={{ position: 'absolute', left: 8, right: 8, bottom: 8, maxHeight: '86%', backgroundColor: colors.panel, borderWidth: borders.strong, borderColor: colors.border }}>
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ ...typography.section, color: colors.text }}>{(role === 'noShoot' ? 'NO-SHOOT · ' : '') + preset.name.toUpperCase()}</Text>
      <Text style={{ ...typography.category, color: preset.verification === 'verified' ? colors.movement : colors.warning }}>{status}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', backgroundColor: '#FFFFFF', borderWidth: borders.regular, borderColor: colors.border, padding: 6 }}>
        <Image source={{ uri: uri(targetArtSvg(preset, role, { size: 180, dimensions: true })) }} style={{ flex: 3, aspectRatio: 1 }} contentFit="contain" cachePolicy="none" transition={0}
          accessibilityLabel={`${preset.name}: ${formatLength(preset.width)} wide, ${formatLength(preset.height)} tall`} />
        <Image source={{ uri: uri(targetIsoSvg(preset, role, { size: 120 })) }} style={{ flex: 2, aspectRatio: 1 }} contentFit="contain" cachePolicy="none" transition={0} accessibilityLabel="3D view" />
      </View>
      <Text style={{ ...typography.body, fontSize: 15, lineHeight: 20, color: colors.muted }}>{targetColours(preset, role).note}</Text>
      <Text style={{ ...typography.body, fontSize: 15, lineHeight: 20, color: colors.muted }}>{preset.reference}</Text>
      <Text selectable style={{ ...typography.body, fontSize: 13, lineHeight: 17, color: colors.accent }}>{preset.source}</Text>
      <Text style={{ ...typography.body, fontSize: 13, lineHeight: 17, color: colors.subdued }}>Outline only: scoring zones are not drawn until their sizes are verified.</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable accessibilityRole="button" onPress={onClose} style={{ flex: 1, minHeight: touch.min, justifyContent: 'center', alignItems: 'center', borderWidth: borders.strong, borderColor: colors.border, backgroundColor: colors.secondary }}>
          <Text style={{ ...typography.label, color: colors.text }}>BACK</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onPlace} style={{ flex: 2, minHeight: touch.min, justifyContent: 'center', alignItems: 'center', borderWidth: borders.strong, borderColor: colors.border, backgroundColor: colors.primary }}>
          <Text style={{ ...typography.label, color: colors.onPrimary }}>PLACE IT</Text></Pressable>
      </View>
    </ScrollView>
  </View>;
}
