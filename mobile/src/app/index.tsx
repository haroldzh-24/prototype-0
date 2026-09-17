import { router } from 'expo-router';
import { Screen, Panel, Action, Copy } from '@/ui/kit';
import RecentStages from '@/storage/RecentStages';
export default function Home() { return <Screen title="YOUR NEXT SESSION">
  <Panel><Action title="Stage Planner →" onPress={() => router.push('/planner')} /><Copy>Build the stage. Prepare your loadout.</Copy>
    <Action title="New Stage" onPress={() => router.push('/builder')} /><Action title="Saved Stages" onPress={() => router.push('/saved-stages')} /></Panel>
  <Panel><Action title="Training →" onPress={() => router.push('/training')} /><Copy>Your practice history, in one place.</Copy></Panel>
  <RecentStages /><Action title="Account / Profile" onPress={() => router.push('/account')} />
</Screen>; }
