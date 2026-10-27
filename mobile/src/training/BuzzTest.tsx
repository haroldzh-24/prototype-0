import { useEffect, useRef, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Action, Copy, Notice, Segmented, ui } from '../ui/kit';
import { borders, colors, typography } from '../ui/tokens';
import { useThemeMode } from '../ui/theme';
import { readPref, writePref } from '../ui/prefsStore';
import { BLOCK_TRIALS, END_PATTERN, NO_BUZZ_HELP, MISS_AFTER_MS, POCKET_LEAD_MS, POCKET_WINDOW_MS, blockDone, cueLabels, cues, judgeTrial, parseResults, placeLabels, pocketCount,
  pocketLine, pocketPlaces, pocketPlan, pocketStats, randomDelay, reactionStats, resultsReport, serializeResults, startPattern, statsLine, strengths, tapTime } from './practiceTimer';
import type { BuzzResults, Cue, Place, ReactionTrial, Strength } from './practiceTimer';
import { after, deviceInfo, keepAwake, now, playPattern } from './buzz';

export const RESULTS_KEY = 'psp.buzzTest';
type Mode = 'IDLE' | 'REACTION' | 'POCKET' | 'POCKET_COUNT';
type TrialPhase = 'WAIT' | 'SIGNAL' | 'PAUSE';

/**
 * Two short experiments with the phone's haptics, for deciding how the practice timer should signal:
 * - Reaction: phone in hand, tap the pad the moment you feel the buzz (or see the screen). 10 trials per block.
 * - Pocket: phone put away; it buzzes 4–8 times at random over a minute; afterwards you say how many you felt.
 * Results are kept on the phone and can be shared as text.
 */
export default function BuzzTest() {
  useThemeMode();
  const [results, setResultsState] = useState<BuzzResults>(() => parseResults(readPref(RESULTS_KEY)));
  const resultsRef = useRef(results); resultsRef.current = results;
  const saveResults = (update: (current: BuzzResults) => BuzzResults) => {
    const next = update(resultsRef.current); resultsRef.current = next; setResultsState(next); writePref(RESULTS_KEY, serializeResults(next));
  };
  const [mode, setMode] = useState<Mode>('IDLE');
  const [cue, setCue] = useState<Cue>('BUZZ'), [strength, setStrength] = useState<Strength>('BURST');
  const [place, setPlace] = useState<Place>('FRONT_POCKET'), [pocketStrength, setPocketStrength] = useState<Strength>('BURST');
  const [block, setBlock] = useState<ReactionTrial[]>([]), [trialPhase, setTrialPhase] = useState<TrialPhase>('WAIT'), [last, setLast] = useState('');
  const [remaining, setRemaining] = useState(0), [felt, setFelt] = useState(0), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const timers = useRef<(() => void)[]>([]), awake = useRef<(() => void) | null>(null);
  const signalAt = useRef<number | null>(null), blockRef = useRef<ReactionTrial[]>([]), phaseRef = useRef<TrialPhase>('WAIT');
  const pocketSent = useRef(0), settings = useRef({ cue, strength, place, pocketStrength });
  const cancelTimers = () => { timers.current.splice(0).forEach(c => c()); };
  const release = () => { cancelTimers(); awake.current?.(); awake.current = null; };
  useEffect(() => () => release(), []);
  const report = (m: string) => setError('The buzz didn’t play: ' + m);
  const setPhase = (p: TrialPhase) => { phaseRef.current = p; setTrialPhase(p); };

  // Reaction test.
  function startBlock() {
    release(); settings.current = { cue, strength, place, pocketStrength }; blockRef.current = []; setBlock([]); setLast(''); setMessage(''); setError('');
    awake.current = keepAwake('psp-buzz-test'); setMode('REACTION'); nextTrial();
  }
  function nextTrial() {
    cancelTimers(); signalAt.current = null; setPhase('WAIT');
    timers.current.push(after(randomDelay(Math.random, 1500, 4000), signal));
  }
  function signal() {
    const { cue: c, strength: s } = settings.current;
    signalAt.current = c === 'SCREEN' ? now() : playPattern(startPattern(s), report).sentAt;
    setPhase('SIGNAL');
    timers.current.push(after(MISS_AFTER_MS + 50, () => record(judgeTrial(signalAt.current, null))));
  }
  function tap(eventTimestamp?: number) {
    const handled = now();
    if (phaseRef.current === 'PAUSE') return;
    record(judgeTrial(signalAt.current, tapTime(eventTimestamp, handled)));
  }
  function record(result: ReturnType<typeof judgeTrial>) {
    cancelTimers();
    const { cue: c, strength: s } = settings.current;
    const trial: ReactionTrial = { cue: c, strength: s, ...result, at: new Date().toISOString() };
    const trials = [...blockRef.current, trial]; blockRef.current = trials; setBlock(trials);
    setLast(result.outcome === 'REACTED' ? `${result.reactionMs} ms` : result.outcome === 'EARLY' ? 'EARLY' : 'MISSED');
    if (blockDone(trials)) {
      saveResults(r => ({ ...r, reaction: [...r.reaction, ...trials] }));
      release(); setMode('IDLE');
      const stats = reactionStats(trials)[0];
      setMessage('Block saved. ' + (stats ? statsLine(stats) : ''));
      return;
    }
    setPhase('PAUSE');
    timers.current.push(after(1000, nextTrial));
  }
  function stopBlock() { release(); setMode('IDLE'); setMessage(blockRef.current.length ? 'Stopped: a block is saved only when it finishes.' : ''); }

  // Pocket test.
  function startPocket() {
    release(); settings.current = { cue, strength, place, pocketStrength }; setMessage(''); setError(''); setFelt(0);
    const times = pocketPlan(pocketCount()), s = pocketStrength, ends = POCKET_LEAD_MS + POCKET_WINDOW_MS;
    pocketSent.current = times.length;
    awake.current = keepAwake('psp-buzz-test'); setMode('POCKET');
    for (const t of times) timers.current.push(after(POCKET_LEAD_MS + t, () => playPattern(startPattern(s), report)));
    timers.current.push(after(ends, () => { playPattern(END_PATTERN, report); release(); setMode('POCKET_COUNT'); }));
    const started = now();
    const countdown = () => { const left = ends - (now() - started); setRemaining(Math.max(0, left)); if (left > 0) timers.current.push(after(250, countdown)); };
    countdown();
  }
  function savePocket() {
    const { pocketStrength: s, place: p } = settings.current, sent = pocketSent.current;
    saveResults(r => ({ ...r, pocket: [...r.pocket, { strength: s, place: p, sent, felt, at: new Date().toISOString() }] }));
    setMode('IDLE'); setMessage(`The phone sent ${sent} buzz${sent === 1 ? '' : 'es'}; you felt ${felt}.`);
  }

  const reaction = reactionStats(results.reaction), pocket = pocketStats(results.pocket), busy = mode !== 'IDLE';
  const lit = trialPhase === 'SIGNAL' && settings.current.cue !== 'BUZZ';
  const reacted = block.filter(t => t.outcome !== 'EARLY').length;
  // The trial on the pad: the one just finished while paused, unless it was early (then it is redone).
  const trialNumber = Math.min(reacted + (trialPhase === 'PAUSE' && block.at(-1)?.outcome !== 'EARLY' ? 0 : 1), BLOCK_TRIALS);

  return <View style={{ gap: 12 }}>
    <Text style={ui.sectionTitle}>BUZZ TEST</Text>
    <Copy>Two quick experiments that show how well you notice the phone’s buzz, so you can choose how the timer signals.</Copy>

    <Text style={ui.eyebrow}>REACTION · PHONE IN HAND</Text>
    <Copy>{`Hold the phone and rest a thumb near the pad. Tap the pad the moment you get the signal. ${BLOCK_TRIALS} trials, each 1.5–4 s after the last.`}</Copy>
    <Segmented options={cues.map(c => cueLabels[c])} value={cueLabels[cue]} disabled={busy} onChange={label => setCue(cues.find(c => cueLabels[c] === label)!)} />
    {cue !== 'SCREEN' && <Segmented options={strengths} value={strength} disabled={busy} onChange={v => setStrength(v as Strength)} />}
    {mode === 'REACTION' ? <>
      {/* The raw touch (responder grant), not Pressable: a press inside a scroll view can be held back to tell it from a scroll. */}
      <View accessible accessibilityRole="button" accessibilityLabel="Reaction pad: tap when you get the signal"
        onStartShouldSetResponder={() => true} onResponderGrant={e => tap((e?.nativeEvent as { timestamp?: number } | undefined)?.timestamp)}
        onAccessibilityTap={() => tap()}
        style={{ minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: borders.strong, borderColor: colors.border, backgroundColor: lit ? colors.primary : colors.secondary }}>
        <Text style={{ ...typography.title, fontSize: 40, lineHeight: 46, color: lit ? colors.onPrimary : colors.text }}>{lit ? 'TAP' : trialPhase === 'PAUSE' ? last : 'WAIT…'}</Text>
        {trialPhase === 'PAUSE' && last === 'EARLY' && <Text style={ui.copy}>Too early: wait for the signal.</Text>}
        <Text style={[ui.copy, lit && { color: colors.onPrimary }]}>{`Trial ${trialNumber} of ${BLOCK_TRIALS}`}</Text>
      </View>
      <Action title="STOP" accessibilityLabel="Stop the reaction test" onPress={stopBlock} />
    </> : <Action title={`START ${BLOCK_TRIALS} TRIALS`} disabled={busy} accessibilityLabel="Start a reaction test block" onPress={startBlock} />}

    <Text style={ui.eyebrow}>POCKET · PHONE PUT AWAY</Text>
    <Copy>Press START, put the phone away within 5 s and carry on. Over the next minute it buzzes a few times at random. A long triple buzz ends the test: don’t count that one.</Copy>
    <Segmented options={pocketPlaces.map(p => placeLabels[p].toUpperCase())} value={placeLabels[place].toUpperCase()} disabled={busy}
      onChange={label => setPlace(pocketPlaces.find(p => placeLabels[p].toUpperCase() === label)!)} />
    <Segmented options={strengths} value={pocketStrength} disabled={busy} onChange={v => setPocketStrength(v as Strength)} />
    {mode === 'POCKET' ? <>
      <Notice>{remaining > POCKET_WINDOW_MS ? `Put the phone away: starting in ${Math.ceil((remaining - POCKET_WINDOW_MS) / 1000)} s` : `Counting… ${Math.ceil(remaining / 1000)} s left`}</Notice>
      <Action title="STOP" accessibilityLabel="Stop the pocket test" onPress={() => { release(); setMode('IDLE'); setMessage('Pocket test stopped; nothing saved.'); }} />
    </> : mode === 'POCKET_COUNT' ? <>
      <Text style={ui.copy}>How many buzzes did you feel, not counting the long one at the end?</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Action title="−" accessibilityLabel="Fewer buzzes felt" disabled={felt <= 0} onPress={() => setFelt(felt - 1)} />
        <Text style={[ui.dataValue, { minWidth: 40, textAlign: 'center' }]}>{felt}</Text>
        <Action title="+" accessibilityLabel="More buzzes felt" disabled={felt >= 12} onPress={() => setFelt(felt + 1)} />
      </View>
      <Action title="SAVE" variant="primary" accessibilityLabel="Save how many buzzes you felt" onPress={savePocket} />
    </> : <Action title={`START POCKET TEST (${pocketStrength})`} disabled={busy} accessibilityLabel="Start the pocket test" onPress={startPocket} />}

    {!!message && <Notice tone="success">{message}</Notice>}
    {!!error && <Notice tone="warning">{error}</Notice>}

    <Text style={ui.eyebrow}>YOUR RESULTS</Text>
    {reaction.length || pocket.length ? <>
      {reaction.map(s => <Copy key={s.cue + (s.strength ?? '')}>{statsLine(s)}</Copy>)}
      {pocket.map(p => <Copy key={p.place + p.strength}>{pocketLine(p)}</Copy>)}
      <Copy>Times run from the moment the app sends the signal to your tap, so they include the phone’s own delay.</Copy>
      <Action title="SHARE RESULTS" disabled={busy} accessibilityLabel="Share the buzz test results as text"
        onPress={() => { Share.share({ message: resultsReport(results.reaction, results.pocket, deviceInfo()) }).catch(e => setError(String(e))); }} />
      {confirmClear ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Action title="KEEP" onPress={() => setConfirmClear(false)} />
        <Action title="CLEAR RESULTS" variant="destructive" onPress={() => { saveResults(() => ({ version: 1, reaction: [], pocket: [] })); setConfirmClear(false); setMessage(''); }} />
      </View> : <Action title="CLEAR" variant="quiet" disabled={busy} accessibilityLabel="Clear the buzz test results" onPress={() => setConfirmClear(true)} />}
    </> : <Copy>No results yet.</Copy>}
    <Copy>{NO_BUZZ_HELP}</Copy>
  </View>;
}
