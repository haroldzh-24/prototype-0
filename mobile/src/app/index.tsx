import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, Copy, colors } from '@/ui/kit';
import LibraryCard from '@/ui/LibraryCard';
export default function Home() { return <Screen safeTop>
  <View style={{ paddingVertical: 24, gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '600', letterSpacing: 1 }}>PRACTICAL{'\n'}SHOOTING</Text>
    <Copy>Plan your next stage. Prepare for your next session.</Copy>
  </View>
  <LibraryCard name="STAGE PLANNER" detail="Build stages and plan routes" disabled={false} open={() => router.push('/planner')} />
  <LibraryCard name="TRAINING" detail="Review sessions and video" disabled={false} open={() => router.push('/training')} />
  <LibraryCard name="PROFILE" detail="Local performance data" disabled={false} open={() => router.push('/account')} />
</Screen>; }
