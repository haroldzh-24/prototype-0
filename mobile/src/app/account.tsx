import { View, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { useRepository } from '@/storage/StorageProvider';
import type { UserProfile } from '@/profile/model';
import { Screen, Copy, Panel, Stat, DataRow, ui } from '@/ui/kit';
export default function Account() {
  const repo = useRepository(), [profile, setProfile] = useState<UserProfile>(), [error, setError] = useState('');
  useEffect(() => { repo.loadProfile().then(setProfile).catch(e => setError(String(e))); }, [repo]);
  return <Screen title="ACCOUNT / PROFILE"><Panel><Copy>{profile?.displayName ?? (error || 'Loading...')}</Copy><Copy>LOCAL ACCOUNT / ON THIS DEVICE</Copy><Copy>Stages and training data stay on this device. Apple sign-in and cloud sync are planned for a later phase.</Copy></Panel>
    {profile && <Panel><Text style={ui.eyebrow}>PERFORMANCE BASELINE</Text>
      <View style={ui.statGroup}><Stat value={profile.performance.drawTime} unit="s" label="Draw" /><Stat value={profile.performance.reloadTime} unit="s" label="Reload" /><Stat value={profile.performance.averageSplitTime} unit="s" label="Split" /></View>
      <DataRow label="Transition" value={profile.performance.transitionTime + ' s'} />
      <DataRow label="Movement" value={profile.performance.movementSpeed + ' in/s'} />
      <DataRow label="Magazine capacity" value={profile.performance.magazineCapacity} />
      <DataRow label="Starting rounds" value={profile.performance.startingRounds} />
      <DataRow label="Chamber" value={profile.performance.chamberedRound ? 'Loaded' : 'Empty'} />
      <Copy>Stage loadouts are configured independently in each stage.</Copy></Panel>}
  </Screen>;
}
