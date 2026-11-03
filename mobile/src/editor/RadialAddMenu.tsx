import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { borders, colors, spacing, touch, typography } from '../ui/tokens';
import { Segmented } from '../ui/kit';
import { targetFamilies } from '../stage/targetFamily';
import type { TargetFamily } from '../stage/targetFamily';
import { presetsForFamily, shortPresetName } from '../stage/targetPresets';
import type { TargetPreset } from '../stage/targetPresets';
import { stackArtSvg, targetArtSvg, targetColours, targetIsoSvg } from '../stage/targetArt';
import type { TargetRole } from '../stage/targetArt';
import { formatLength } from '../stage/measurements';
import { partialChoices, partialPreview } from '../stage/partialTargets';
import type { PartialChoice, PartialKind } from '../stage/partialTargets';
import { SEP, words } from '../ui/words';

/**
 * Radial add menu, like a stage editor's: long-press the bay (or ADD) and the choices fan out around your finger.
 * The first ring is categories (paper, partial, no-shoot, steel, plates, wall, fault line); the second is that
 * category's targets for the match family, each drawn at its real proportions. PARTIAL holds covered targets ready to
 * place (hard cover, half targets, a hostage, doubles). Long-press a target for its card: dimensions, a 3D view or the
 * cover, the colour rule and where the size comes from.
 */
export type RadialChoice =
  | { kind: 'target'; presetId: string; noShoot: boolean }
  | { kind: 'partial'; presetId: string; partial: PartialKind }
  | { kind: 'tool'; tool: 'wall' | 'faultLine' };
type Category = 'paper' | 'partial' | 'noShoot' | 'steel' | 'plate';
type Info = { preset: TargetPreset; role: TargetRole; partial?: PartialChoice };
type Item = { key: string; label: string; art: string; accessibilityLabel: string; choose: () => void; info?: Info };

const uri = (svg: string) => 'data:image/svg+xml;base64,' + btoa(svg);
const LINE_ICON = (dashed: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M8 40L40 8" stroke="${colors.ink}" stroke-width="${dashed ? 4 : 9}" ${dashed ? 'stroke-dasharray="7 5"' : ''} stroke-linecap="butt"/></svg>`;
const CENTER = 56;
/** Item size and ring radius: a ring of more than eight (PARTIAL on a USPSA target has eleven) uses smaller items further out. */
export const ringLayout = (count: number) => count > 8 ? { item: 52, radius: 138, label: 72 } : { item: 64, radius: count > 6 ? 118 : 104, label: 104 };

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
  return { x: clamp(at.x, reach, bounds.width - reach), y: clamp(at.y, reach + 56, bounds.height - reach) };
}
export const presetsIn = (family: TargetFamily, category: Exclude<Category, 'partial'>) => presetsForFamily(family).filter(p =>
  category === 'paper' || category === 'noShoot' ? p.type === 'cardboardTarget' : category === 'steel' ? p.type === 'steelPopper' : p.type === 'steelPlate');
/** The PARTIAL ring for a family: covered versions of its first paper target, each with its own picture. */
export function partialItems(family: TargetFamily, size = 48): { preset: TargetPreset; choice: PartialChoice; art: string }[] {
  const preset = presetsIn(family, 'paper')[0];
  if (!preset) return [];
  return partialChoices(preset).map(choice => { const preview = partialPreview(preset, choice.partial); return { preset, choice, art: stackArtSvg(preview.stage, preview.id, { size }) }; });
}

export default function RadialAddMenu({ at, bounds, targetFamily, onChoose, onClose }: {
  at: { x: number; y: number }; bounds: { width: number; height: number }; targetFamily: TargetFamily;
  onChoose: (choice: RadialChoice) => void; onClose: () => void;
}) {
  const [family, setFamily] = useState(targetFamily);
  // Only the match's family unless the shooter asks for the others (IDPA targets stay available there).
  const [otherFamilies, setOtherFamilies] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => { setFamily(targetFamily); }, [targetFamily]);
  const scheme = colors.background; // re-render on theme change through the parent; art uses real-world colours
  const items: Item[] = useMemo(() => {
    const first = (c: Exclude<Category, 'partial'>) => presetsIn(family, c)[0];
    const partials = partialItems(family);
    const choosePartial = (p: typeof partials[number]) => onChoose({ kind: 'partial', presetId: p.preset.id, partial: p.choice.partial });
    if (!category) return ([
      ['paper', 'PAPER', first('paper'), 'scoring'], ['noShoot', 'NO-SHOOT', first('noShoot'), 'noShoot'],
      ['steel', 'POPPERS', first('steel'), 'scoring'], ['plate', 'PLATES', first('plate'), 'scoring'],
    ] as const).filter(([, , preset]) => !!preset).map(([key, label, preset, role]): Item => ({
      key, label, art: targetArtSvg(preset!, role, { size: 48 }), accessibilityLabel: label.toLowerCase() + ' targets',
      choose: () => setCategory(key),
    })).flatMap((item, i) => i === 0 && partials.length ? [item, {
      key: 'partial', label: words.partial, art: partials[0].art, accessibilityLabel: 'partial targets: hard cover, half targets, hostage, doubles', choose: () => setCategory('partial'),
    }] : [item]).concat([
      { key: 'wall', label: 'WALL', art: LINE_ICON(false), accessibilityLabel: 'Draw a wall', choose: () => onChoose({ kind: 'tool', tool: 'wall' }) },
      { key: 'fault', label: 'FAULT LINE', art: LINE_ICON(true), accessibilityLabel: 'Draw a fault line', choose: () => onChoose({ kind: 'tool', tool: 'faultLine' }) },
    ]);
    if (category === 'partial') return partials.map((p): Item => ({
      key: p.choice.key, label: p.choice.label, art: p.art,
      accessibilityLabel: `${p.choice.label.toLowerCase()}, ${p.preset.name}, ${formatLength(p.preset.width)} by ${formatLength(p.preset.height)}`,
      choose: () => choosePartial(p), info: { preset: p.preset, role: 'scoring', partial: p.choice },
    }));
    const role: TargetRole = category === 'noShoot' ? 'noShoot' : 'scoring';
    return presetsIn(family, category).map((preset): Item => ({
      key: preset.id, label: shortPresetName(preset), art: targetArtSvg(preset, role, { size: 48 }),
      accessibilityLabel: `${role === 'noShoot' ? 'No-shoot ' : ''}${preset.name}, ${formatLength(preset.width)} by ${formatLength(preset.height)}`,
      choose: () => onChoose({ kind: 'target', presetId: preset.id, noShoot: role === 'noShoot' }), info: { preset, role },
    }));
  }, [family, category, onChoose, scheme]);
  const { item: ITEM, radius, label: LABEL } = ringLayout(items.length);
  const center = clampCenter(at, bounds, radius + ITEM / 2 + 4);
  const ring = ringPositions(items.length, radius);
  const image = ITEM * 0.62;

  return <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} testID="radial-add-menu">
    <Pressable accessibilityLabel="Close the add menu" onPress={onClose} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#00000055' }} />
    {/* Family: only the match's. OTHER FAMILIES reveals the switcher; "<family> ONLY" hides it and goes back to the match's family. */}
    <View style={{ position: 'absolute', top: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
      {otherFamilies ? <>
        <View accessibilityLabel="Target family" style={{ flexGrow: 1, flexShrink: 1, backgroundColor: colors.panel }}>
          <Segmented options={targetFamilies} value={family} onChange={f => { setFamily(f as TargetFamily); setInfo(null); }} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={'Only ' + targetFamily + ' targets'} onPress={() => { setOtherFamilies(false); setFamily(targetFamily); setInfo(null); }}
          style={{ minHeight: touch.min, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.panel, borderWidth: borders.strong, borderColor: colors.border }}>
          <Text style={{ ...typography.label, fontSize: 16, color: colors.text }}>{targetFamily + ' ONLY'}</Text></Pressable>
      </> : <Pressable accessibilityRole="button" accessibilityLabel="Other families" accessibilityHint={'Shows targets from families other than ' + targetFamily}
        accessibilityState={{ expanded: false }} onPress={() => setOtherFamilies(true)}
        style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.panel, borderWidth: borders.regular, borderColor: colors.border }}>
        <Text style={{ ...typography.label, fontSize: 16, color: colors.text }}>OTHER FAMILIES</Text></Pressable>}
    </View>
    {ring.map((p, i) => { const item = items[i]; return <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={item.accessibilityLabel}
      accessibilityHint={item.info ? 'Long-press for size and source' : undefined}
      onPress={item.choose} onLongPress={item.info ? () => setInfo(item.info!) : undefined}
      style={({ pressed }) => ({ position: 'absolute', left: center.x + p.x - LABEL / 2, top: center.y + p.y - ITEM / 2, width: LABEL, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: ITEM, height: ITEM, borderRadius: ITEM / 2, backgroundColor: colors.panel, borderWidth: borders.strong, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={{ uri: uri(item.art) }} style={{ width: image, height: image }} contentFit="contain" cachePolicy="none" transition={0} accessibilityIgnoresInvertColors />
      </View>
      <Text numberOfLines={2} style={{ ...typography.category, fontSize: ITEM < 64 ? 11 : 12, lineHeight: ITEM < 64 ? 13 : 14, letterSpacing: 0.2, color: colors.text, backgroundColor: colors.panel, paddingHorizontal: 2, marginTop: 2, textAlign: 'center', width: LABEL }}>{item.label}</Text>
    </Pressable>; })}
    <Pressable accessibilityRole="button" accessibilityLabel={category ? 'Back to categories' : 'Close the add menu'} onPress={() => category ? setCategory(null) : onClose()}
      style={({ pressed }) => ({ position: 'absolute', left: center.x - CENTER / 2, top: center.y - CENTER / 2, width: CENTER, height: CENTER, borderRadius: CENTER / 2,
        backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ ...typography.label, fontSize: 22, color: colors.background }}>{category ? '‹' : '×'}</Text>
    </Pressable>
    {info && <TargetInfoCard preset={info.preset} role={info.role} partial={info.partial} onClose={() => setInfo(null)}
      onPlace={() => onChoose(info.partial ? { kind: 'partial', presetId: info.preset.id, partial: info.partial.partial } : { kind: 'target', presetId: info.preset.id, noShoot: info.role === 'noShoot' })} />}
  </View>;
}

/** Size, 3D view, colour rule and source for one target. */
export function TargetInfoCard({ preset, role, partial, onPlace, onClose }: {
  preset: TargetPreset; role: TargetRole; onPlace: () => void; onClose: () => void;
  /** A PARTIAL choice: its cover picture and what it is, on the same card as its paper target's size and source. */
  partial?: { label: string; detail: string; partial: PartialKind };
}) {
  const stack = partial ? (() => { const preview = partialPreview(preset, partial.partial); return stackArtSvg(preview.stage, preview.id, { size: 180 }); })() : '';
  const status = preset.verification === 'verified' ? 'SIZE VERIFIED (RULEBOOK)' : preset.verification === 'approximate' ? 'SIZE FROM THE MAKER · OUTLINE APPROXIMATE' : 'SIZE NOT VERIFIED';
  return <View accessibilityViewIsModal style={{ position: 'absolute', left: 8, right: 8, bottom: 8, maxHeight: '86%', backgroundColor: colors.panel, borderWidth: borders.strong, borderColor: colors.border }}>
    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ ...typography.section, color: colors.text }}>{(partial ? partial.label + SEP : role === 'noShoot' ? 'NO-SHOOT' + SEP : '') + preset.name.toUpperCase()}</Text>
      <Text style={{ ...typography.category, color: preset.verification === 'verified' ? colors.movement : colors.warning }}>{status}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', backgroundColor: '#FFFFFF', borderWidth: borders.regular, borderColor: colors.border, padding: 6 }}>
        <Image source={{ uri: uri(targetArtSvg(preset, role, { size: 180, dimensions: true })) }} style={{ flex: 3, aspectRatio: 1 }} contentFit="contain" cachePolicy="none" transition={0}
          accessibilityLabel={`${preset.name}: ${formatLength(preset.width)} wide, ${formatLength(preset.height)} tall`} />
        {partial ? <Image source={{ uri: uri(stack) }} style={{ flex: 2, aspectRatio: 1 }} contentFit="contain" cachePolicy="none" transition={0} accessibilityLabel={partial.label.toLowerCase() + ', as the shooter sees it'} />
          : <Image source={{ uri: uri(targetIsoSvg(preset, role, { size: 120 })) }} style={{ flex: 2, aspectRatio: 1 }} contentFit="contain" cachePolicy="none" transition={0} accessibilityLabel="3D view" />}
      </View>
      {partial && <Text style={{ ...typography.body, fontSize: 15, lineHeight: 20, color: colors.text }}>{partial.detail}</Text>}
      {partial?.partial.kind === 'cover' && <Text style={{ ...typography.body, fontSize: 15, lineHeight: 20, color: colors.muted }}>Painted black (non-scoring). The edge follows the face's own landmarks (neck, shoulders, head width), not a maker's printed lines. After placing, slide or turn it in LAYERS.</Text>}
      <Text style={{ ...typography.body, fontSize: 15, lineHeight: 20, color: colors.muted }}>{targetColours(preset, role).note}</Text>
      <Text style={{ ...typography.body, fontSize: 15, lineHeight: 20, color: colors.muted }}>{preset.reference}</Text>
      <Text selectable style={{ ...typography.body, fontSize: 13, lineHeight: 17, color: colors.accent }}>{preset.source}</Text>
      <Text style={{ ...typography.body, fontSize: 13, lineHeight: 17, color: colors.subdued }}>Outline only: scoring zones are not drawn until their sizes are verified.</Text>
    </ScrollView>
    {/* BACK and PLACE IT stay in view below the scrolling card. */}
    <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingTop: spacing.sm, borderTopWidth: borders.regular, borderColor: colors.border }}>
      <Pressable accessibilityRole="button" onPress={onClose} style={{ flex: 1, minHeight: touch.min, justifyContent: 'center', alignItems: 'center', borderWidth: borders.strong, borderColor: colors.border, backgroundColor: colors.secondary }}>
        <Text style={{ ...typography.label, color: colors.text }}>BACK</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onPlace} style={{ flex: 2, minHeight: touch.min, justifyContent: 'center', alignItems: 'center', borderWidth: borders.strong, borderColor: colors.border, backgroundColor: colors.primary }}>
        <Text style={{ ...typography.label, color: colors.onPrimary }}>PLACE IT</Text></Pressable>
    </View>
  </View>;
}
