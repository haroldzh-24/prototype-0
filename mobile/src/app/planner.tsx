import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, Action, Copy } from '@/ui/kit';
import RecentStages from '@/storage/RecentStages';
import { useRepository } from '@/storage/StorageProvider';
import { createPlan } from '@/planning/model';
import { createDefaultStage } from '@/stage/defaults';

export default function Planner() {
	const repo = useRepository(), [creating, setCreating] = useState(false), [error, setError] = useState('');
	async function createNewStage() {
		if (creating) return;
		setCreating(true); setError('');
		try {
			const id = await repo.createStage('Untitled stage', createDefaultStage(), createPlan());
			router.push({ pathname: '/builder', params: { id } });
		} catch (cause) {
			console.error('Unable to create new stage', cause);
			setError(`Unable to create a new stage: ${String(cause)}`);
		} finally { setCreating(false); }
	}
	return <Screen title="STAGE PLANNER"><Action title={creating ? 'Creating...' : '+ New Stage'} disabled={creating} onPress={() => void createNewStage()} />{!!error && <Copy>{error}</Copy>}<Action title="Saved Stages" onPress={() => router.push('/saved-stages')} /><RecentStages /></Screen>;
}
