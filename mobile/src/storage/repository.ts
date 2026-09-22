import type { StageDocument } from '../stage/model';
import type { StagePlan } from '../planning/model';
import { isStageRoute } from '../planning/route';
import type { TrainingRecord } from '../training/model';
import { startingTypes } from '../training/model';
import { createLocalProfile } from '../profile/model';
import type { UserProfile } from '../profile/model';
import { normalizeVideo, videoObservations } from '../training/videoAnalysis';
import { changeObservation, setManualOverride, trainingContexts, withPerformanceObservations, withVideoObservations } from '../training/observations';
import type { PerformanceObservation, TrainingContext } from '../training/observations';
import type { TimingFactor } from '../profile/model';

/** Small interface also allows repository tests against real SQLite on Node. */
export interface Database {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
}
export type StageSummary = { id: string; name: string; createdAt: string; updatedAt: string };
export type SavedStage = StageSummary & { document: StageDocument; plan: StagePlan };
type StageRow = StageSummary & { payload: string };
const nameOf = (name: string) => {
  const clean = name.trim();
  if (!clean || clean.length > 100) throw new Error('Enter a stage name between 1 and 100 characters.');
  return clean;
};
export class Repository {
  private trainingWrites: Promise<unknown> = Promise.resolve();
  constructor(private db: Database, private newId: () => string) {}
  async initialize() {
    const version = await this.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) > 1) throw new Error('This database requires a newer app version.');
    await this.db.execAsync(`PRAGMA journal_mode = WAL;
      BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS stages (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS training (id TEXT PRIMARY KEY, userId TEXT NOT NULL, occurredAt TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      PRAGMA user_version = 1;
      COMMIT;`);
    const profile = createLocalProfile();
    await this.db.runAsync('INSERT OR IGNORE INTO profiles (id, payload) VALUES (?, ?)', profile.id, JSON.stringify(profile));
  }
  listStages() { return this.db.getAllAsync<StageSummary>('SELECT id, name, createdAt, updatedAt FROM stages ORDER BY updatedAt DESC, id'); }
  async loadStage(id: string): Promise<SavedStage> {
    const row = await this.db.getFirstAsync<StageRow>('SELECT * FROM stages WHERE id = ?', id);
    if (!row) throw new Error('Stage no longer exists.');
    const { payload, ...summary } = row;
    const data = JSON.parse(payload);
    if (data.version !== 1 || data.document?.schemaVersion !== 7 || data.document?.coordinateSystem !== 'inches' || !Array.isArray(data.document.objects) || !data.plan?.loadout || !data.plan?.engagements)
      throw new Error('Unsupported or damaged stage data. The saved copy has not been changed.');
    if (data.plan.route !== undefined && !isStageRoute(data.plan.route)) throw new Error('Unsupported or damaged route data. The saved copy has not been changed.');
    return { ...summary, document: data.document, plan: data.plan };
  }
  private payload(document: StageDocument, plan: StagePlan) {
    if (plan.route !== undefined && !isStageRoute(plan.route)) throw new Error('Invalid route data.');
    return JSON.stringify({ version: 1, document, plan });
  }
  async createStage(name: string, document: StageDocument, plan: StagePlan): Promise<string> {
    const id = this.newId(), now = new Date().toISOString();
    await this.db.runAsync('INSERT INTO stages (id, name, createdAt, updatedAt, payload) VALUES (?, ?, ?, ?, ?)', id, nameOf(name), now, now, this.payload(document, plan));
    return id;
  }
  async saveStage(id: string, name: string, document: StageDocument, plan: StagePlan) {
    const result = await this.db.runAsync('UPDATE stages SET name = ?, updatedAt = ?, payload = ? WHERE id = ?', nameOf(name), new Date().toISOString(), this.payload(document, plan), id);
    if (!result.changes) throw new Error('Stage no longer exists.');
  }
  async renameStage(id: string, name: string) {
    const result = await this.db.runAsync('UPDATE stages SET name = ?, updatedAt = ? WHERE id = ?', nameOf(name), new Date().toISOString(), id);
    if (!result.changes) throw new Error('Stage no longer exists.');
  }
  async duplicateStage(id: string) {
    const stage = await this.loadStage(id);
    return this.createStage(stage.name.slice(0, 93) + ' (copy)', stage.document, stage.plan);
  }
  async deleteStage(id: string) { await this.db.runAsync('DELETE FROM stages WHERE id = ?', id); }
  listTraining(userId: string) { return this.db.getAllAsync<{ payload: string }>('SELECT payload FROM training WHERE userId = ? ORDER BY occurredAt DESC', userId).then(rows => rows.map(row => this.normalizeTraining(JSON.parse(row.payload)))); }
  private normalizeTraining(record: TrainingRecord): TrainingRecord {
    if (!record.id || !record.userId || !Object.hasOwn(startingTypes, record.startingType) || !Number.isFinite(Date.parse(record.occurredAt)) ||
      (record.totalTime !== null && (!Number.isFinite(record.totalTime) || record.totalTime < 0)) || record.segments.some(s => !Number.isFinite(s.seconds) || s.seconds < 0)) throw new Error('Invalid training record.');
    if (record.context !== undefined && !trainingContexts.includes(record.context)) throw new Error('Invalid training context.');
    if (record.videos === undefined) return record;
    if (!Array.isArray(record.videos)) throw new Error('Invalid training videos.');
    const videos = record.videos.map(normalizeVideo), ids = new Set<string>();
    for (const video of videos) {
      if (ids.has(video.session.id) || video.session.trainingSessionId !== record.id || video.session.drillId !== record.drillId
        || (record.context && video.session.context !== record.context)) throw new Error('Video does not belong to this session/context.');
      ids.add(video.session.id);
    }
    return { ...record, videos };
  }
  saveTraining(record: TrainingRecord): Promise<void> { return this.writeTraining(record); }
  /** Explicit contribution is atomic with annotation persistence, and idempotent by measurement ID. */
  contributeTrainingVideo(record: TrainingRecord, videoId: string): Promise<void> { return this.writeTraining(record, videoId); }
  private writeTraining(input: TrainingRecord, contributeId?: string): Promise<void> {
    const work = this.trainingWrites.then(async () => {
      const record = this.normalizeTraining(input);
      const selected = record.videos?.find(v => v.session.id === contributeId);
      if (contributeId && (!selected || record.userId !== 'local')) throw new Error('Video unavailable for local profile contribution.');
      await this.db.execAsync('BEGIN TRANSACTION;');
      try {
        const profile = await this.loadProfile();
        const valid = (record.videos ?? []).flatMap(v => videoObservations(v, record.startingType));
        const observations = (profile.performanceObservations ?? []).filter(o => o.source !== 'VIDEO_ANALYSIS' || o.trainingSessionId !== record.id
          || valid.some(v => v.id === o.id && v.evidenceKey === o.evidenceKey));
        const remaining = selected ? observations.filter(o => o.source !== 'VIDEO_ANALYSIS' || o.videoId !== selected.session.id) : observations;
        const next = selected ? [...remaining, ...videoObservations(selected, record.startingType)] : remaining;
        if (selected || next.length !== (profile.performanceObservations ?? []).length) {
          const updated = withVideoObservations(profile, next, selected?.session.context ?? profile.calibrationContext ?? 'LIVE_FIRE');
          await this.persistProfile(updated);
        }
        await this.db.runAsync('INSERT INTO training (id, userId, occurredAt, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET userId=excluded.userId, occurredAt=excluded.occurredAt, payload=excluded.payload', record.id, record.userId, record.occurredAt, JSON.stringify(record));
        await this.db.execAsync('COMMIT;');
      } catch (error) { await this.db.execAsync('ROLLBACK;'); throw error; }
    });
    this.trainingWrites = work.catch(() => {});
    return work;
  }
  async loadProfile(): Promise<UserProfile> {
    const row = await this.db.getFirstAsync<{ payload: string }>('SELECT payload FROM profiles WHERE id = ?', 'local');
    if (!row) throw new Error('Local profile unavailable.');
    const profile: UserProfile = JSON.parse(row.payload);
    if (profile.performanceObservations === undefined && !profile.calibrationInputs && !profile.videoCalibrationBase) return profile;
    const rebuilt = withPerformanceObservations(profile, profile.performanceObservations ?? [], profile.calibrationContext ?? 'LIVE_FIRE', false);
    rebuilt.calibrationWarnings = [...new Set([...(profile.calibrationWarnings ?? []), ...(rebuilt.calibrationWarnings ?? [])])].sort();
    return rebuilt;
  }
  private async persistProfile(profile: UserProfile) { await this.db.runAsync('UPDATE profiles SET payload = ? WHERE id = ?', JSON.stringify(profile), profile.id); }
  private updateProfile(change: (profile: UserProfile) => UserProfile): Promise<void> {
    const work = this.trainingWrites.then(async () => { await this.persistProfile(change(await this.loadProfile())); });
    this.trainingWrites = work.catch(() => {}); return work;
  }
  saveProfile(profile: UserProfile): Promise<void> {
    return this.updateProfile(() => profile.calibrationInputs || profile.performanceObservations || profile.videoCalibrationBase
      ? withPerformanceObservations(profile, profile.performanceObservations ?? []) : profile);
  }
  addObservation(observation: PerformanceObservation) { return this.updateProfile(p => changeObservation(p, { operation: 'add', observation })); }
  replaceObservation(observation: PerformanceObservation) { return this.updateProfile(p => changeObservation(p, { operation: 'replace', observation })); }
  removeObservation(id: string) { return this.updateProfile(p => changeObservation(p, { operation: 'remove', id })); }
  setManualOverride(factor: TimingFactor, value: number | null) { return this.updateProfile(p => setManualOverride(p, factor, value)); }
  rebuildProfile(context?: TrainingContext) { return this.updateProfile(p => withPerformanceObservations(p, p.performanceObservations ?? [], context ?? p.calibrationContext ?? 'LIVE_FIRE')); }
}
