import { View, Text } from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useRepository } from '@/storage/StorageProvider';
import type { UserProfile } from '@/profile/model';
import { contextLabels, metricValue } from '@/training/presentation';
import { trainingContexts } from '@/training/observations';
import { Screen, ScreenHeader, Copy, Panel, DataRow, Loading, ErrorState, ui } from '@/ui/kit';
export default function Account() {
  const repo = useRepository(), [profile, setProfile] = useState<UserProfile>(), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => { let active = true; setError(''); repo.loadProfile().then(value => { if (active) { setProfile(value); setError(''); } }).catch(e => { if (active) setError(String(e)); }); return () => { active = false; }; }, [repo, attempt]));
  return <Screen safeTop header={<ScreenHeader back={() => router.dismissTo('/')} title="PROFILE" />}>{!profile && !error && <Loading label="Loading profile…" />}{!!error && <ErrorState title="Couldn’t load profile." detail={error} retry={() => setAttempt(value => value + 1)} />}<Panel><Copy>{profile?.displayName ?? 'Local shooter'}</Copy><Text style={ui.eyebrow}>LOCAL PROFILE</Text><Copy>On this device</Copy></Panel>
    {profile && <Panel><Text style={ui.eyebrow}>PERFORMANCE</Text>
      <View style={{ gap: 4 }}>
        <DataRow label="DRAW" value={metricValue(profile.performance.drawTime, 's')} />
        <DataRow label="RELOAD" value={metricValue(profile.performance.reloadTime, 's')} />
        <DataRow label="SPLIT" value={metricValue(profile.performance.averageSplitTime, 's')} />
        <DataRow label="MOVEMENT" value={metricValue(profile.performance.movementSpeed, 'in/s')} />
        <DataRow label="TRANSITION" value={metricValue(profile.performance.transitionTime, 's')} />
      </View>
      <DataRow label="Magazine capacity" value={profile.performance.magazineCapacity} />
      <DataRow label="Starting rounds" value={profile.performance.startingRounds} />
      <DataRow label="Chamber" value={profile.performance.chamberedRound ? 'Loaded' : 'Empty'} />
      <Copy>Stage loadouts are configured independently in each stage.</Copy></Panel>}
    {profile && <Panel><Text style={ui.eyebrow}>TRAINING DATA</Text>{!(profile.performanceObservations ?? []).length && <Copy>No samples yet. Review video measurements in Training and add eligible measurements to your profile.</Copy>}{trainingContexts.map(context => <DataRow key={context} label={contextLabels[context]} value={(profile.performanceObservations ?? []).filter(sample => sample.context === context).length + ' samples'} />)}</Panel>}
    {profile && <Panel><Text style={ui.eyebrow}>CALIBRATION</Text>{profile.calibrationContext ? <DataRow label="Active context" value={contextLabels[profile.calibrationContext]} /> : <Copy>No training calibration yet. Add eligible measurements from Video Results.</Copy>}</Panel>}
    <Panel><Text style={ui.eyebrow}>CLOUD SYNC</Text><Copy>Not available yet.</Copy></Panel>
  </Screen>;
}
