import { router } from 'expo-router';
import { Screen, Action } from '@/ui/kit';
import RecentStages from '@/storage/RecentStages';
export default function Planner() { return <Screen title="STAGE PLANNER"><Action title="+ New Stage" onPress={() => router.push('/builder')} /><Action title="Saved Stages" onPress={() => router.push('/saved-stages')} /><RecentStages /></Screen>; }
