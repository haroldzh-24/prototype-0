import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen, Copy, colors } from '@/ui/kit';
import { borders, spacing, touch, typography } from '@/ui/tokens';
import { useThemeMode } from '@/ui/theme';
import { useRepository } from '@/storage/StorageProvider';
import type { StageSummary } from '@/storage/repository';
import { analyzeLibraryRun } from '@/training/drillLibrary';
import { lastLibraryRun } from '@/training/drillDays';
import type { LastRun } from '@/training/drillDays';

/** Home: continue the last edited stage, open matches or training, and see the last drill at a glance. */
export default function Home() {
  useThemeMode();
  const repo = useRepository();
  const [recent, setRecent] = useState<StageSummary | null>(null), [lastRun, setLastRun] = useState<LastRun | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    // Both are conveniences: the screen works without them if storage is unavailable.
    Promise.resolve().then(() => repo.listStages()).then(stages => {
      if (active) setRecent([...stages].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null);
    }).catch(() => {});
    Promise.resolve().then(() => repo.listTraining('local')).then(sessions => {
      if (active) setLastRun(lastLibraryRun(sessions));
    }).catch(() => {});
    return () => { active = false; };
  }, [repo]));
  const score = lastRun ? analyzeLibraryRun(lastRun.run)?.score ?? null : null;
  const tile = { borderWidth: borders.strong, borderColor: colors.border, backgroundColor: colors.secondary, padding: spacing.lg, justifyContent: 'space-between' as const };
  return <Screen safeTop>
    <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 4, borderColor: colors.border, gap: 2 }}>
      <Text accessibilityRole="header" style={{ ...typography.title, fontSize: 56, lineHeight: 56, color: colors.text }}>PSP</Text>
      <Text style={{ ...typography.label, color: colors.text }}>Practical Shooting Partner</Text>
    </View>
    {recent && <View style={{ gap: spacing.sm }}>
      <Text style={{ ...typography.category, color: colors.text }}>CONTINUE</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={'Continue ' + recent.name} onPress={() => router.push({ pathname: '/builder', params: { id: recent.id } })}
        style={({ pressed }) => [tile, { minHeight: 84, opacity: pressed ? 0.7 : 1 }]}>
        <Text numberOfLines={2} style={{ ...typography.section, color: colors.text }}>{recent.name}</Text>
        <Copy>{'Edited ' + new Date(recent.updatedAt).toLocaleString()}</Copy>
      </Pressable>
    </View>}
    <Pressable accessibilityRole="button" accessibilityLabel="Open matches" onPress={() => router.push('/planner')}
      style={({ pressed }) => [tile, { backgroundColor: colors.primary, minHeight: 96, opacity: pressed ? 0.75 : 1 }]}>
      <Text style={{ ...typography.title, color: colors.onPrimary }}>MATCHES</Text>
      <Text style={{ ...typography.label, color: colors.onPrimary }}>Build stages · plan routes</Text>
    </Pressable>
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open training" onPress={() => router.push('/training')}
        style={({ pressed }) => [tile, { flex: 1, minHeight: 110, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={{ ...typography.section, color: colors.text }}>TRAINING</Text><Copy>Drills and your numbers</Copy>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push('/account')}
        style={({ pressed }) => [tile, { flex: 1, minHeight: 110, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={{ ...typography.section, color: colors.text }}>PROFILE</Text><Copy>Times, day and night</Copy>
      </Pressable>
    </View>
    {lastRun && <View style={{ gap: spacing.sm }}>
      <Text style={{ ...typography.category, color: colors.text }}>{'LAST DRILL · ' + lastRun.label.toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', borderWidth: borders.strong, borderColor: colors.border, minHeight: touch.primary }}>
        {[['TIME', lastRun.run.totalTime !== null ? lastRun.run.totalTime.toFixed(2) : '—'],
          ['HIT FACTOR', score?.hitFactor != null ? score.hitFactor.toFixed(2) : '—'],
          ['POINTS', score ? Math.round(score.percent * 100) + '%' : '—']].map(([label, value], i) =>
          <View key={label} style={{ flex: 1, padding: spacing.md, borderLeftWidth: i ? borders.strong : 0, borderColor: colors.border }}>
            <Text style={{ ...typography.category, color: colors.muted }}>{label}</Text>
            <Text style={{ ...typography.value, color: colors.text }}>{value}</Text>
          </View>)}
      </View>
    </View>}
  </Screen>;
}
