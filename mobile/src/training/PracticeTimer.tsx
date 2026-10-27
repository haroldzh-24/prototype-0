import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Action, Copy, Notice, Segmented, ui } from '../ui/kit';
import { borders, colors, typography } from '../ui/tokens';
import { useThemeMode } from '../ui/theme';
import { ARMED_PATTERN, NO_BUZZ_HELP, parPattern, randomDelay, startPattern, strengths, timerPlan } from './practiceTimer';
import type { Strength, TimerEvent } from './practiceTimer';
import { after, keepAwake, now, playPattern } from './buzz';

type Phase = 'IDLE' | 'STANDBY' | 'GO' | 'PAR';
const FLASH = ['ON', 'OFF'] as const;
const s2 = (ms: number) => (ms / 1000).toFixed(2) + ' s';

/**
 * A start signal you can feel: press START, get set, and the phone buzzes 1–4 s later like the range officer's
 * timer, then twice at par. For dry fire (quiet, eyes on the target) and live fire with the phone in a pocket.
 * It does not hear your shots: times still come from your shot timer or the run's video.
 */
export default function PracticeTimer({ par, onRunningChange }: { par: number | null; onRunningChange?: (running: boolean) => void }) {
  useThemeMode();
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [strength, setStrength] = useState<Strength>('BURST'), [flash, setFlash] = useState<typeof FLASH[number]>('ON');
  const [elapsed, setElapsed] = useState(0), [summary, setSummary] = useState(''), [error, setError] = useState('');
  const pending = useRef<(() => void)[]>([]), ticker = useRef<(() => void) | null>(null), startedAt = useRef<number | null>(null);
  const running = phase !== 'IDLE';
  const cancelAll = () => { pending.current.splice(0).forEach(c => c()); ticker.current?.(); ticker.current = null; };
  // Leaving the sheet (or another drill) cancels every pending buzz and lets the screen lock again.
  useEffect(() => () => cancelAll(), []);

  const report = (message: string) => setError('The buzz didn’t play: ' + message);
  const tick = () => { if (startedAt.current !== null) setElapsed(now() - startedAt.current); ticker.current = after(50, tick); };

  function finish(text: string) {
    cancelAll(); startedAt.current = null; setPhase('IDLE'); setSummary(text); onRunningChange?.(false);
  }
  function start() {
    cancelAll(); setError(''); setSummary(''); setElapsed(0); startedAt.current = null;
    const delayMs = randomDelay(), plan = timerPlan(delayMs, par), chosen = strength;
    pending.current.push(keepAwake('psp-practice-timer'));
    pending.current.push(playPattern(ARMED_PATTERN, report).cancel);
    const fire = (e: TimerEvent) => {
      if (e.kind === 'start') {
        const played = playPattern(startPattern(chosen), report);
        pending.current.push(played.cancel); startedAt.current = played.sentAt; setPhase('GO'); tick();
      } else if (e.kind === 'par') {
        pending.current.push(playPattern(parPattern(chosen), report).cancel); setPhase('PAR');
      } else finish(par !== null ? `Start signal ${s2(delayMs)} after START, par ${par.toFixed(2)} s.` : `Stopped after ${s2(plan[1].atMs - delayMs)} (the limit).`);
    };
    for (const e of plan) pending.current.push(after(e.atMs, () => fire(e)));
    setPhase('STANDBY'); onRunningChange?.(true);
  }
  function stop() {
    const at = startedAt.current;
    finish(at === null ? 'Stopped before the start signal.' : `Stopped at ${s2(now() - at)} (your tap, not a shot time).`);
  }

  const lit = flash === 'ON' && (phase === 'GO' || phase === 'PAR');
  const fill = !lit ? colors.secondary : phase === 'GO' ? colors.primary : colors.caution;
  const ink = !lit ? colors.text : phase === 'GO' ? colors.onPrimary : colors.onCaution;
  const big = phase === 'IDLE' ? 'READY' : phase === 'STANDBY' ? 'STANDBY' : phase === 'GO' ? 'GO' : 'PAR';

  return <View style={{ gap: 12 }}>
    <Text style={ui.sectionTitle}>PRACTICE TIMER</Text>
    <Copy>{'Press START and get into your start position. The phone buzzes 1–4 s later, like the range officer’s start signal'
      + (par !== null ? `, and twice at your par (${par.toFixed(2)} s).` : '. Set a par time to get a second buzz at par.')}</Copy>
    <View accessible accessibilityLiveRegion="assertive" accessibilityLabel={big + (phase === 'GO' || phase === 'PAR' ? ', ' + s2(elapsed) : '')}
      style={{ minHeight: 132, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: fill, borderWidth: borders.strong, borderColor: colors.border, padding: 12 }}>
      <Text style={{ ...typography.title, fontSize: 44, lineHeight: 50, color: ink }}>{big}</Text>
      {(phase === 'GO' || phase === 'PAR') && <Text style={{ ...typography.value, color: ink, fontVariant: ['tabular-nums'] }}>{s2(elapsed)}</Text>}
    </View>
    <Text style={ui.eyebrow}>BUZZ</Text>
    <Segmented options={strengths} value={strength} disabled={running} onChange={v => setStrength(v as Strength)} />
    <Copy>{strength === 'BURST' ? 'Burst: five strong knocks in 0.2 s, easier to feel through clothing.' : 'Tap: one strong knock.'}</Copy>
    <Text style={ui.eyebrow}>SCREEN FLASH</Text>
    <Segmented options={FLASH} value={flash} disabled={running} onChange={v => setFlash(v as typeof FLASH[number])} />
    {running
      ? <Action title="STOP" variant="primary" accessibilityLabel="Stop the practice timer" onPress={stop} />
      : <Action title="START" variant="primary" accessibilityLabel="Start the practice timer" onPress={start} />}
    {!!summary && <Copy>{summary}</Copy>}
    {!!error && <Notice tone="warning">{error}</Notice>}
    <Copy>{'The timer doesn’t hear your shots. Log your times from your shot timer, or from the run’s video. ' + NO_BUZZ_HELP}</Copy>
  </View>;
}
