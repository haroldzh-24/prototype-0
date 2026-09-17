/** Estimates only, in seconds and inches/second; independent of physical stages. */
export type ShooterPerformanceProfile = {
  drawTime: number; reloadTime: number; averageSplitTime: number; transitionTime: number;
  movementSpeed: number; magazineCapacity: number; startingRounds: number; chamberedRound: boolean;
};
export type UserProfile = { id: string; displayName: string; identity: { provider: 'local' | 'apple'; subject: string | null }; performance: ShooterPerformanceProfile };
export const createLocalProfile = (): UserProfile => ({
  id: 'local', displayName: 'Local shooter', identity: { provider: 'local', subject: null },
  performance: { drawTime: 1.5, reloadTime: 2, averageSplitTime: 0.25, transitionTime: 0.4,
    movementSpeed: 120, magazineCapacity: 15, startingRounds: 15, chamberedRound: false },
});
