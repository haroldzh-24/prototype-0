import { Redirect } from 'expo-router';

/** Preserve old saved-stage links while routing management through Matches. */
export default function SavedStages() { return <Redirect href="/planner" />; }
