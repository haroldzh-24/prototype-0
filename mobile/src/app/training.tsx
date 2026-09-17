import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRepository } from '@/storage/StorageProvider';
import type { TrainingRecord } from '@/training/model';
import { Screen, Copy, Panel, Action } from '@/ui/kit';
export default function Training() {
  const repo = useRepository(), [records, setRecords] = useState<TrainingRecord[]>([]), [message, setMessage] = useState('');
  useFocusEffect(useCallback(() => { let active = true; repo.listTraining('local').then(rows => { if (active) setRecords(rows); }).catch(e => { if (active) setMessage(String(e)); }); return () => { active = false; }; }, [repo]));
  return <Screen title="TRAINING"><Copy>RECENT SESSIONS</Copy>{!records.length && <Panel><Copy>No training sessions yet.</Copy></Panel>}{records.map(record => <Panel key={record.id}><Copy>{record.drillName || 'Practice session'} / {new Date(record.occurredAt).toLocaleString()}</Copy><Copy>{record.notes}</Copy></Panel>)}
    <Action title="Start Training" onPress={() => setMessage('Session recording and drills are coming in a later phase. No session has been started.')} />{!!message && <Copy>{message}</Copy>}
  </Screen>;
}
