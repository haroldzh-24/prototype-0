import { Text, View } from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useRepository } from '@/storage/StorageProvider';
import type { UserProfile } from '@/profile/model';
import { EYE_HEIGHT_LIMITS, feetAndInches, readEyeHeight, readShootingHand, writeEyeHeight, writeShootingHand } from '@/profile/devicePrefs';
import { contextLabels, PLAN_PRACTICE_DEFAULT, practiceAdjectives, practiceButtons, practiceOfButton } from '@/training/presentation';
import { trainingContexts } from '@/training/observations';
import type { Side } from '@/training/movementPhases';
import { Screen, ScreenHeader, Copy, Panel, Action, Loading, ErrorState, Notice, Segmented, ui } from '@/ui/kit';
import { setThemePreference, themePreference } from '@/ui/theme';
import type { ThemePreference } from '@/ui/theme';
import { useThemeMode } from '@/ui/theme';

/**
 * Profile is settings: appearance, power factor, the practice type your plans use, shooting hand and eye height for
 * WALK. Your measured numbers have one home, Training · YOUR NUMBERS, linked from here.
 */
export default function Account() {
  useThemeMode();
  const repo = useRepository(), [profile, setProfile] = useState<UserProfile>(), [error, setError] = useState('');
  const [saveError, setSaveError] = useState(''), [practiceError, setPracticeError] = useState('');
  const [attempt, setAttempt] = useState(0);
  // Kept on this phone, not in the profile: they work even when the profile can't be read.
  const [hand, setHandState] = useState<Side>(readShootingHand), [eye, setEye] = useState(readEyeHeight);
  const setHand = (next: Side) => { setHandState(next); writeShootingHand(next); };
  useFocusEffect(useCallback(() => { let active = true; setError(''); repo.loadProfile().then(value => { if (active) { setProfile(value); setError(''); } }).catch(e => { if (active) setError(String(e)); }); return () => { active = false; }; }, [repo, attempt]));
  const practice = profile?.calibrationContext ?? PLAN_PRACTICE_DEFAULT;
  const measured = (profile?.performanceObservations ?? []);
  return <Screen safeTop header={<ScreenHeader back={() => router.dismissTo('/')} title="PROFILE" />}>
    {!profile && !error && <Loading label="Loading profile…" />}
    {!!error && <ErrorState title="Couldn’t load profile." detail={error} retry={() => setAttempt(value => value + 1)} />}
    <Panel><Copy>{profile?.displayName ?? 'Local shooter'}</Copy><Text style={ui.eyebrow}>LOCAL PROFILE</Text><Copy>On this device</Copy></Panel>
    <Panel><Text style={ui.eyebrow}>APPEARANCE</Text>
      <Segmented options={['SYSTEM', 'DAY', 'NIGHT']} value={themePreference().toUpperCase()} onChange={v => setThemePreference(v.toLowerCase() as ThemePreference)} />
      <Copy>Day is built for full sun at the range. Night is easier on the eyes indoors and after dark. System follows the phone.</Copy></Panel>
    {profile && <Panel><Text style={ui.eyebrow}>POWER FACTOR</Text>
      <Segmented options={['MINOR', 'MAJOR']} value={(profile.powerFactor ?? 'minor').toUpperCase()} onChange={v => {
        const powerFactor = v === 'MAJOR' ? 'major' as const : 'minor' as const, previous = profile;
        setProfile({ ...profile, powerFactor }); setSaveError('');
        // A failed save puts the old choice back and says so here (not as a failed profile load).
        repo.setPowerFactor(powerFactor).catch(e => { setProfile(previous); setSaveError('Couldn’t save the power factor: ' + String(e)); });
      }} />
      {!!saveError && <Notice tone="error">{saveError}</Notice>}
      <Copy>Scores C and D hits in drills (USPSA Appendix B1: minor A 5, C 3, D 1; major A 5, C 4, D 2).</Copy></Panel>}
    {profile && <Panel><Text style={ui.eyebrow}>PRACTICE TYPE FOR PLANS</Text>
      <Segmented options={practiceButtons(trainingContexts)} value={contextLabels[practice].toUpperCase()} onChange={label => {
        const next = practiceOfButton(trainingContexts, label), previous = profile;
        if (!next || next === practice) return;
        setProfile({ ...profile, calibrationContext: next }); setPracticeError('');
        // The planner's values are rebuilt from this practice type's runs; a failed save puts the old choice back.
        repo.setPracticeType(next).then(() => repo.loadProfile()).then(setProfile)
          .catch(e => { setProfile(previous); setPracticeError('Couldn’t save the practice type: ' + String(e)); });
      }} />
      {!!practiceError && <Notice tone="error">{practiceError}</Notice>}
      <Copy>{`Your plans use your ${practiceAdjectives[practice]} runs. Runs of other practice types are kept in YOUR NUMBERS for comparison.`}</Copy>
      <Copy>{'Measurements so far: ' + trainingContexts.map(c => `${contextLabels[c].toLowerCase()} ${measured.filter(o => o.context === c).length}`).join(' · ')}</Copy></Panel>}
    <Panel><Text style={ui.eyebrow}>SHOOTING HAND</Text>
      <Segmented options={['RIGHT', 'LEFT']} value={hand === 'left' ? 'LEFT' : 'RIGHT'} onChange={v => setHand(v === 'LEFT' ? 'left' : 'right')} />
      <Copy>Used to break down your draw and reload from a run’s video.</Copy></Panel>
    <Panel><Text style={ui.eyebrow}>EYE HEIGHT FOR WALK</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Action title="−" accessibilityLabel="Lower eye height" disabled={eye <= EYE_HEIGHT_LIMITS[0]} onPress={() => setEye(writeEyeHeight(eye - 1))} />
        <Text style={[ui.dataValue, { flex: 1, textAlign: 'center' }]}>{`${feetAndInches(eye)} · ${eye} in`}</Text>
        <Action title="+" accessibilityLabel="Raise eye height" disabled={eye >= EYE_HEIGHT_LIMITS[1]} onPress={() => setEye(writeEyeHeight(eye + 1))} />
      </View>
      <Copy>{`How high WALK puts your eyes in the stage editor (${EYE_HEIGHT_LIMITS[0]}–${EYE_HEIGHT_LIMITS[1]} in).`}</Copy></Panel>
    <Panel><Text style={ui.eyebrow}>YOUR NUMBERS</Text>
      <Copy>Draw, splits, transitions, reloads and moves from your drills, and what your plans use.</Copy>
      <Action title="YOUR NUMBERS" accessibilityLabel="Open your numbers in Training" onPress={() => router.push({ pathname: '/training', params: { show: 'numbers' } })} /></Panel>
    <Panel><Text style={ui.eyebrow}>CLOUD SYNC</Text><Copy>Data is stored on this device. Cloud sync is not included in this release.</Copy></Panel>
  </Screen>;
}
