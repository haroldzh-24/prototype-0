import { forwardRef } from 'react';
import { Platform, StyleSheet, Text as RNText, TextInput as RNTextInput, useWindowDimensions } from 'react-native';
import type { TextInputProps, TextProps } from 'react-native';
import { useA11y } from './a11y';

/**
 * The app's Text and TextInput. Every screen imports these instead of React Native's (tests/textScale.test.cjs).
 *
 * Large text: text follows the phone's text size (Settings › Display & Text Size › Larger Text) and stops growing
 * at a cap, so the largest accessibility sizes (React Native scales those more than 3×) can't break the tools.
 * - reading: sentences, lists, sheets, fields — up to 2× (17 pt body → 34 pt).
 * - bar: labels in fixed bars and on the stage (tool bar, step bar, header, badges, T1/P1) — up to 1.35×, the
 *   largest size before the accessibility sizes.
 * - number: big figures (times, hit factors) — up to 1.5×.
 * Pass maxFontSizeMultiplier to choose; reading is the default.
 *
 * Bold Text: custom fonts don't follow the setting, so with Bold Text on each Barlow weight is one step heavier.
 */
export const TEXT_SCALE = { reading: 2, bar: 1.35, number: 1.5 } as const;

const HEAVIER: Record<string, string> = {
  Barlow_500Medium: 'Barlow_600SemiBold',
  Barlow_600SemiBold: 'Barlow_700Bold',
  Barlow_700Bold: 'Barlow_800ExtraBold',
  BarlowCondensed_700Bold: 'BarlowCondensed_800ExtraBold',
  BarlowCondensed_800ExtraBold: 'BarlowCondensed_900Black',
};
/** The font one weight heavier, for Bold Text (unchanged when there is none). */
export const heavierFont = (family?: string) => (family && HEAVIER[family]) || family;

/**
 * Development preview of large text in the web build, which has no Dynamic Type: set
 * `globalThis.__pspFontScale = 3.57` (the largest iOS size) and text scales as on a phone, capped the same way.
 * Never set in the app; the phone does the real scaling natively.
 */
const previewScale = () => Platform.OS === 'web' && typeof __DEV__ !== 'undefined' && __DEV__ ? Number((globalThis as { __pspFontScale?: number }).__pspFontScale) || 0 : 0;

function textStyle(style: TextProps['style'], bold: boolean, cap: number | null | undefined) {
  const preview = previewScale();
  if (!bold && !preview) return style;
  const flat = (StyleSheet.flatten(style) ?? {}) as { fontFamily?: string; fontSize?: number; lineHeight?: number };
  const extra: { fontFamily?: string; fontSize?: number; lineHeight?: number } = {};
  if (bold) { const heavier = heavierFont(flat.fontFamily); if (heavier && heavier !== flat.fontFamily) extra.fontFamily = heavier; }
  if (preview) {
    const k = cap && cap >= 1 ? Math.min(preview, cap) : preview;
    extra.fontSize = (flat.fontSize ?? 14) * k;
    if (flat.lineHeight) extra.lineHeight = flat.lineHeight * k;
  }
  return Object.keys(extra).length ? [style, extra] : style;
}

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  const { boldText } = useA11y();
  const cap = props.maxFontSizeMultiplier ?? TEXT_SCALE.reading;
  return <RNText ref={ref} {...props} maxFontSizeMultiplier={cap} style={textStyle(props.style, boldText, cap)} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  const { boldText } = useA11y();
  const cap = props.maxFontSizeMultiplier ?? TEXT_SCALE.reading;
  return <RNTextInput ref={ref} {...props} maxFontSizeMultiplier={cap} style={textStyle(props.style, boldText, cap) as TextInputProps['style']} />;
});

/** The phone's text size as a multiplier (1 = default; the web preview's scale in development). */
export function useFontScale() {
  const { fontScale } = useWindowDimensions();
  return previewScale() || fontScale || 1;
}
