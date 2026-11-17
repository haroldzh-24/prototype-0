import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TEXT_SCALE } from './text';
import { fonts } from './tokens';

/**
 * The launch animation (logo direction 2, "Target", chosen 2026-11-17; canvas "PSP logo and launch animation").
 *
 * The phone's own launch screen is plain #0B0D10, the animation's first frame, so nothing jumps when it starts. Then,
 * over about 1.6 s: the target turns face-on (like a turning target), the A-zone lights orange, two hits land in it,
 * and the wordmark comes up; it holds briefly and fades into Home, which is already rendered underneath.
 *
 * - Plays once per cold launch (not when the app comes back from the background). A tap skips it.
 * - Reduce Motion: the finished logo fades in and out without moving. VoiceOver: skipped, Home is announced at once.
 * - Built from an image and plain views with React Native's Animated (native driver): no new native module.
 */
const INK = '#0B0D10', TAN_WIDTH = 120, TAN_HEIGHT = 200;
/** Design units → points: the target is 60 × 100 units drawn 120 × 200 pt. */
const u = (v: number) => v * 2;
export const INTRO_TIMING = { turn: [135, 405], aZone: [630, 135], hit1: [900, 135], hit2: [1125, 135], wordmark: [1305, 315], fadeOut: [1800, 220] } as const;
let played = false;
/** Tests: whether the intro has already run in this launch. */
export const introPlayed = () => played;

export default function LaunchIntro() {
  const [done, setDone] = useState(played);
  const turn = useRef(new Animated.Value(0.02)).current, aZone = useRef(new Animated.Value(0)).current;
  const hit1 = useRef(new Animated.Value(0)).current, hit2 = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current, whole = useRef(new Animated.Value(1)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const native = Platform.OS !== 'web';

  const finish = (fast = false) => {
    running.current?.stop();
    Animated.timing(whole, { toValue: 0, duration: fast ? 150 : INTRO_TIMING.fadeOut[1], useNativeDriver: native }).start(() => { played = true; setDone(true); });
  };

  useEffect(() => {
    if (played) return;
    let cancelled = false;
    const ask = (q?: () => Promise<boolean>) => (q ? q.call(AccessibilityInfo).catch(() => false) : Promise.resolve(false));
    // React Native Web always reports a screen reader, so only a phone's answer counts.
    Promise.all([ask(AccessibilityInfo.isReduceMotionEnabled), native ? ask(AccessibilityInfo.isScreenReaderEnabled) : Promise.resolve(false)]).then(([reduceMotion, screenReader]) => {
      if (cancelled) return;
      if (screenReader) { played = true; setDone(true); return; }
      const at = (value: Animated.Value, [delay, duration]: readonly [number, number], easing = Easing.out(Easing.cubic)) =>
        Animated.timing(value, { toValue: 1, delay, duration, easing, useNativeDriver: native });
      if (reduceMotion) {
        // No movement: the finished logo, shown and faded.
        [turn, aZone, hit1, hit2, word].forEach(v => v.setValue(1)); whole.setValue(0);
        running.current = Animated.sequence([Animated.timing(whole, { toValue: 1, duration: 200, useNativeDriver: native }), Animated.delay(700)]);
      } else {
        running.current = Animated.parallel([
          at(turn, INTRO_TIMING.turn, Easing.out(Easing.back(1.2))), at(aZone, INTRO_TIMING.aZone),
          at(hit1, INTRO_TIMING.hit1), at(hit2, INTRO_TIMING.hit2), at(word, INTRO_TIMING.wordmark),
          Animated.delay(INTRO_TIMING.fadeOut[0]),
        ]);
      }
      running.current.start(({ finished }) => { if (finished && !cancelled) finish(); });
    });
    return () => { cancelled = true; running.current?.stop(); };
    // Runs once per launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) return null;
  const pop = (v: Animated.Value) => ({ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }] });
  return <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { opacity: whole }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Pressable testID="launch-intro" accessibilityLabel="Skip the intro" onPress={() => finish(true)} style={styles.center}>
      <Animated.View style={{ width: TAN_WIDTH, height: TAN_HEIGHT, transform: [{ scaleX: turn }] }}>
        <Image source={require('../../assets/logo/target.png')} style={{ width: TAN_WIDTH, height: TAN_HEIGHT }} accessibilityIgnoresInvertColors />
        <Animated.View style={[styles.aZone, { opacity: aZone }]} />
        <Animated.View style={[styles.hit, { left: u(26.5) - 7, top: u(39) - 7 }, pop(hit1)]} />
        <Animated.View style={[styles.hit, { left: u(33.5) - 7, top: u(46.75) - 7 }, pop(hit2)]} />
      </Animated.View>
      <Animated.View style={{ alignItems: 'center', gap: 2, opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
        <Text maxFontSizeMultiplier={TEXT_SCALE.bar} style={styles.psp}>PSP</Text>
        <Text maxFontSizeMultiplier={TEXT_SCALE.bar} style={styles.tagline}>PRACTICAL SHOOTING PARTNER</Text>
      </Animated.View>
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: INK, zIndex: 1000, elevation: 1000 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 },
  aZone: { position: 'absolute', left: u(20), top: u(27), width: u(20), height: u(36.25), backgroundColor: '#FF6A13' },
  hit: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: INK },
  psp: { fontFamily: fonts.displayHeavy, fontSize: 64, lineHeight: 64, color: '#F2F4F7' },
  tagline: { fontFamily: fonts.display, fontSize: 15, lineHeight: 18, letterSpacing: 2, color: '#C3C8D0' },
});
