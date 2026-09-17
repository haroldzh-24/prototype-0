import type { StageDocument } from '../stage/model';
import type { StagePlan } from '../planning/model';
import type { TrainingRecord } from '../training/model';
import { startingTypes } from '../training/model';
import { createLocalProfile } from '../profile/model';
import type { UserProfile } from '../profile/model';

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
    return { ...summary, document: data.document, plan: data.plan };
  }
  private payload(document: StageDocument, plan: StagePlan) { return JSON.stringify({ version: 1, document, plan }); }
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
  listTraining(userId: string) { return this.db.getAllAsync<{ payload: string }>('SELECT payload FROM training WHERE userId = ? ORDER BY occurredAt DESC', userId).then(rows => rows.map(row => JSON.parse(row.payload) as TrainingRecord)); }
  async saveTraining(record: TrainingRecord) {
    if (!record.id || !record.userId || !Object.hasOwn(startingTypes, record.startingType) || !Number.isFinite(Date.parse(record.occurredAt)) ||
      (record.totalTime !== null && (!Number.isFinite(record.totalTime) || record.totalTime < 0)) || record.segments.some(s => !Number.isFinite(s.seconds) || s.seconds < 0)) throw new Error('Invalid training record.');
    await this.db.runAsync('INSERT INTO training (id, userId, occurredAt, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET userId=excluded.userId, occurredAt=excluded.occurredAt, payload=excluded.payload', record.id, record.userId, record.occurredAt, JSON.stringify(record));
  }
  async loadProfile(): Promise<UserProfile> {
    const row = await this.db.getFirstAsync<{ payload: string }>('SELECT payload FROM profiles WHERE id = ?', 'local');
    if (!row) throw new Error('Local profile unavailable.');
    return JSON.parse(row.payload);
  }
  async saveProfile(profile: UserProfile) { await this.db.runAsync('UPDATE profiles SET payload = ? WHERE id = ?', JSON.stringify(profile), profile.id); }
}
