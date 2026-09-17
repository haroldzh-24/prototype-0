import { useEffect, useState } from 'react';
import { useRepository } from '@/storage/StorageProvider';
import type { UserProfile } from '@/profile/model';
import { Screen, Copy, Panel } from '@/ui/kit';
export default function Account() {
  const repo = useRepository(), [profile, setProfile] = useState<UserProfile>(), [error, setError] = useState('');
  useEffect(() => { repo.loadProfile().then(setProfile).catch(e => setError(String(e))); }, [repo]);
  return <Screen title="ACCOUNT / PROFILE"><Panel><Copy>{profile?.displayName ?? (error || 'Loading...')}</Copy><Copy>LOCAL ACCOUNT / ON THIS DEVICE</Copy><Copy>Stages and training data stay on this device. Apple sign-in and cloud sync are planned for a later phase.</Copy></Panel>
    {profile && <Panel><Copy>PERFORMANCE BASELINE / ESTIMATES</Copy><Copy>Draw {profile.performance.drawTime}s / Reload {profile.performance.reloadTime}s</Copy><Copy>Split {profile.performance.averageSplitTime}s / Transition {profile.performance.transitionTime}s</Copy><Copy>Movement {profile.performance.movementSpeed} in/s</Copy><Copy>Magazine {profile.performance.magazineCapacity} / Starting rounds {profile.performance.startingRounds} / Chamber {profile.performance.chamberedRound ? 'loaded' : 'empty'}</Copy><Copy>Stage loadouts are configured independently in each stage.</Copy></Panel>}
  </Screen>;
}
