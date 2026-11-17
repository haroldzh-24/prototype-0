import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * The phone's accessibility settings that change how the app looks or moves, read once at launch and kept current.
 * iOS reports all of them to JavaScript; Android and the web report some (the rest stay off).
 *
 * - boldText: Settings › Accessibility › Display & Text Size › Bold Text. Custom fonts (Barlow) ignore it, so the
 *   app's Text picks one weight heavier (ui/text.tsx).
 * - reduceMotion: Settings › Accessibility › Motion › Reduce Motion. Moves become jumps or fades.
 * - increaseContrast: Settings › Accessibility › Display & Text Size › Increase Contrast ("darker system colors").
 *   Switches to the high-contrast palette (also selectable in Profile for bright sun).
 * - invertColors: Smart Invert or Classic Invert. Photos, video and 3D are marked so Smart Invert leaves them alone.
 * - screenReader: VoiceOver (or TalkBack). Used to announce results and offer list alternatives to drag-only views.
 */
export type A11yState = { boldText: boolean; reduceMotion: boolean; increaseContrast: boolean; invertColors: boolean; screenReader: boolean };

let state: A11yState = { boldText: false, reduceMotion: false, increaseContrast: false, invertColors: false, screenReader: false };
const listeners = new Set<() => void>();
let started = false;

export const a11y = (): A11yState => state;

/** Internal (and tests): replace part of the state and notify subscribers. */
export function setA11y(next: Partial<A11yState>) {
  const merged = { ...state, ...next };
  if ((Object.keys(merged) as (keyof A11yState)[]).every(k => merged[k] === state[k])) return;
  state = merged;
  listeners.forEach(l => l());
}
export function onA11yChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

type Query = () => Promise<boolean>;
const QUERIES: [keyof A11yState, string, keyof typeof AccessibilityInfo | null][] = [
  ['boldText', 'boldTextChanged', 'isBoldTextEnabled'],
  ['reduceMotion', 'reduceMotionChanged', 'isReduceMotionEnabled'],
  ['increaseContrast', 'darkerSystemColorsChanged', 'isDarkerSystemColorsEnabled'],
  ['invertColors', 'invertColorsChanged', 'isInvertColorsEnabled'],
  ['screenReader', 'screenReaderChanged', 'isScreenReaderEnabled'],
];

/** Read the settings and follow changes. Safe to call more than once; missing APIs leave a setting off. */
export function startA11y() {
  if (started) return; started = true;
  for (const [key, event, query] of QUERIES) {
    // React Native Web answers "yes" to the screen-reader question whatever the browser does.
    if (key === 'screenReader' && Platform.OS === 'web') continue;
    const ask = query ? (AccessibilityInfo as unknown as Record<string, Query | undefined>)[query] : undefined;
    if (typeof ask === 'function') Promise.resolve().then(() => ask.call(AccessibilityInfo)).then(v => setA11y({ [key]: !!v }), () => {});
    try { AccessibilityInfo.addEventListener?.(event as never, ((v: boolean) => setA11y({ [key]: !!v })) as never); } catch { /* not on this platform */ }
  }
  // The web has no Reduce Motion event in React Native Web; the media query is the same setting.
  if (Platform.OS === 'web' && typeof globalThis.matchMedia === 'function') {
    const q = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    setA11y({ reduceMotion: q.matches });
    q.addEventListener?.('change', e => setA11y({ reduceMotion: e.matches }));
  }
}

/** Re-renders the caller when a setting changes; returns the current settings. */
export function useA11y(): A11yState {
  const [, setVersion] = useState(0);
  useEffect(() => onA11yChange(() => setVersion(v => v + 1)), []);
  return state;
}

/** Say something to VoiceOver (a result that appeared, a save). No-op without a screen reader. */
export function announce(message: string) {
  if (!state.screenReader || !message) return;
  try { AccessibilityInfo.announceForAccessibility?.(message); } catch { /* not on this platform */ }
}

/** Announce `message` to VoiceOver whenever it changes to a new, non-empty value (results, errors, saves). */
export function useAnnounce(message: string | null | undefined) {
  useEffect(() => { if (message) announce(message); }, [message]);
}

/** The words inside Text children, for announcing a live region on iOS. */
export function spokenText(children: unknown): string {
  if (children === null || children === undefined || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(spokenText).join('');
  const props = (children as { props?: { children?: unknown } }).props;
  return props ? spokenText(props.children) : '';
}
