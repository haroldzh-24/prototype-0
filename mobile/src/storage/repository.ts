import { validOutline } from '../stage/targetShape';
import { validAttachment, validHardCovers } from '../stage/targetLayers';
import { isSegment, validSavedEndpoints } from '../stage/segments';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from '../planning/model';
import { isStageRoute } from '../planning/route';
import type { TrainingRecord } from '../training/model';
import { startingTypes } from '../training/model';
import { isLibraryObservation, libraryRunProblem, MAX_LIBRARY_RUNS, sessionLibraryObservations } from '../training/drillLibrary';
import { validMovementModel } from '../profile/movementModel';
import { validExpectations } from '../planning/expectedPoints';
import { drillRunProblem, MAX_RUNS_PER_SESSION } from '../training/drillLog';
import { createLocalProfile } from '../profile/model';
import type { UserProfile } from '../profile/model';
import { normalizeVideo, videoObservations } from '../training/videoAnalysis';
import { changeObservation, setManualOverride, trainingContexts, withPerformanceObservations, withVideoObservations } from '../training/observations';
import type { PerformanceObservation, TrainingContext } from '../training/observations';
import type { PowerFactor, TimingFactor } from '../profile/model';
import { isTargetFamily } from '../stage/targetFamily';
import { validDownrange } from '../stage/orientation';
import type { TargetFamily } from '../stage/targetFamily';
import type { Reconstruction } from '../diagramImport/model';
import { validateReconstruction } from '../diagramImport/model';

/** Small interface also allows repository tests against real SQLite on Node. */
export interface Database {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
}
export type Match = { id: string; name: string; targetFamily: TargetFamily; createdAt: string; updatedAt: string };
export type MatchSummary = Match & { stageCount: number };
export type StageSummary = { id: string; matchId: string; name: string; createdAt: string; updatedAt: string };
export type SavedStage = StageSummary & { document: StageDocument; plan: StagePlan };
type StageRow = StageSummary & { payload: string };
const nameOf = (name: string, kind = 'stage') => {
  const clean = name.trim();
  if (!clean || clean.length > 100) throw new Error(`Enter a ${kind} name between 1 and 100 characters.`);
  return clean;
};
/** Dimensions that must be strictly positive for each object type; zero-size objects break geometry and rendering. */
const POSITIVE_GEOMETRY: Record<StageDocument['objects'][number]['type'], readonly string[]> = {
  start: ['width', 'depth'], wall: ['length', 'thickness', 'height'], faultLine: ['length'],
  cardboardTarget: ['faceWidth', 'faceHeight'], noShootTarget: ['faceWidth', 'faceHeight'], steelPlate: ['faceWidth', 'faceHeight'], steelPopper: ['faceWidth', 'faceHeight'],
};
/**
 * Structural checks beyond the field-type checks in loadStage: positive dimensions, unique non-empty object IDs,
 * string, unique port IDs with positive openings, and a finite downrange when present. Returns a reason or null.
 */
export function savedDocumentProblem(d: StageDocument): string | null {
  const ids = new Set<string>(), portIds = new Set<string>();
  for (const o of d.objects) {
    const geometry = o.geometry as Record<string, number>;
    if (!POSITIVE_GEOMETRY[o.type].every(key => geometry[key] > 0)) return `Object ${o.id} has a zero or negative dimension.`;
    if (!o.id.trim() || ids.has(o.id)) return 'Object IDs must be non-empty and unique.';
    ids.add(o.id);
    if (o.type === 'wall') for (const port of o.ports) {
      if (typeof port.id !== 'string' || !port.id.trim() || portIds.has(port.id)) return 'Port IDs must be non-empty and unique.';
      if (!(port.width > 0 && port.height > 0)) return 'Port openings must have positive width and height.';
      portIds.add(port.id);
    }
  }
  if (d.downrangeDegrees !== undefined && !validDownrange(d.downrangeDegrees)) return 'Downrange must be a finite angle.';
  return null;
}

const canonicalById = (list: readonly PerformanceObservation[]) => JSON.stringify([...list].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const validPar = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 600;
function validDrillPars(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).filter(([k, v]) => k.length > 0 && k.length <= 200 && validPar(v)).slice(0, 500));
}
export class Repository {
  private trainingWrites: Promise<unknown> = Promise.resolve();
  trainingReadWarnings: string[] = [];
  private serializeWrite<T>(action: () => Promise<T>): Promise<T> {
    const work = this.trainingWrites.then(action);
    this.trainingWrites = work.catch(() => {}); return work;
  }
  constructor(private db: Database, private newId: () => string) {}
  private async transaction<T>(work: () => Promise<T>): Promise<T> {
    await this.db.execAsync('BEGIN IMMEDIATE;');
    try { const result = await work(); await this.db.execAsync('COMMIT;'); return result; }
    catch (error) { await this.db.execAsync('ROLLBACK;'); throw error; }
  }
  async initialize() {
    return this.serializeWrite(async () => {
    const version = await this.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) > 2) throw new Error('This database requires a newer app version.');
    await this.db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await this.transaction(async () => {
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS stages (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS training (id TEXT PRIMARY KEY, userId TEXT NOT NULL, occurredAt TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, name TEXT NOT NULL, targetFamily TEXT NOT NULL CHECK(targetFamily IN ('USPSA', 'PCSL', 'IDPA')), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);`);
    const columns = await this.db.getAllAsync<{ name: string }>('PRAGMA table_info(stages)');
    if (!columns.some(column => column.name === 'matchId'))
      await this.db.execAsync('ALTER TABLE stages ADD COLUMN matchId TEXT REFERENCES matches(id) ON DELETE CASCADE;');
    // Additive reference storage; never migrate or rewrite the inch-based stage/plan payload.
    await this.db.execAsync(`CREATE TABLE IF NOT EXISTS diagram_imports (
      stageId TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
      id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(stageId, id));`);
    const standalone = await this.db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM stages WHERE matchId IS NULL OR matchId = ''");
    if (standalone?.count) {
      const now = new Date().toISOString();
      await this.db.runAsync('INSERT OR IGNORE INTO matches (id, name, targetFamily, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', 'imported-stages', 'Imported Stages', 'USPSA', now, now);
      // Association only: leave IDs, timestamps and the entire payload untouched.
      await this.db.runAsync("UPDATE stages SET matchId = ? WHERE matchId IS NULL OR matchId = ''", 'imported-stages');
    }
    await this.db.execAsync(`CREATE INDEX IF NOT EXISTS stages_matchId ON stages(matchId);
      CREATE TRIGGER IF NOT EXISTS stages_require_match_insert BEFORE INSERT ON stages
      WHEN NEW.matchId IS NULL OR NOT EXISTS (SELECT 1 FROM matches WHERE id = NEW.matchId)
      BEGIN SELECT RAISE(ABORT, 'Stage must belong to an existing match.'); END;
      CREATE TRIGGER IF NOT EXISTS stages_require_match_update BEFORE UPDATE OF matchId ON stages
      WHEN NEW.matchId IS NULL OR NOT EXISTS (SELECT 1 FROM matches WHERE id = NEW.matchId)
      BEGIN SELECT RAISE(ABORT, 'Stage must belong to an existing match.'); END;
      CREATE TRIGGER IF NOT EXISTS stages_touch_match_insert AFTER INSERT ON stages
      BEGIN UPDATE matches SET updatedAt = NEW.updatedAt WHERE id = NEW.matchId; END;
      CREATE TRIGGER IF NOT EXISTS stages_touch_match_update AFTER UPDATE ON stages
      BEGIN UPDATE matches SET updatedAt = NEW.updatedAt WHERE id = NEW.matchId; END;
      CREATE TRIGGER IF NOT EXISTS stages_touch_match_delete AFTER DELETE ON stages
      BEGIN UPDATE matches SET updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.matchId; END;
      PRAGMA user_version = 2;`);
    const profile = createLocalProfile();
    await this.db.runAsync('INSERT OR IGNORE INTO profiles (id, payload) VALUES (?, ?)', profile.id, JSON.stringify(profile));
    });
    // Runs saved by an older version get the measurements this version derives (e.g. hit shares). Never blocks start-up.
    try { await this.syncLibraryObservations(); } catch { /* the next save of each session derives them */ }
    });
  }
  /** Re-derives every session's library measurements; writes the profile only when they differ from the stored ones. */
  private async syncLibraryObservations() {
    const rows = await this.db.getAllAsync<{ id: string; payload: string }>('SELECT id, payload FROM training WHERE userId = ?', 'local');
    const derived: PerformanceObservation[] = [], unreadable = new Set<string>();
    for (const row of rows) {
      try { derived.push(...sessionLibraryObservations(this.normalizeTraining(JSON.parse(row.payload)))); }
      catch { unreadable.add(row.id); }
    }
    const profile = await this.loadProfile();
    const stored = profile.performanceObservations ?? [];
    // Sessions that can't be read keep whatever they contributed before.
    const replaceable = stored.filter(o => o.id.startsWith('lib:') && !(o.trainingSessionId && unreadable.has(o.trainingSessionId)));
    if (canonicalById(replaceable) === canonicalById(derived)) return;
    const next = [...stored.filter(o => !replaceable.includes(o)), ...derived];
    await this.persistProfile(withPerformanceObservations(profile, next, profile.calibrationContext ?? 'LIVE_FIRE', false));
  }
  listMatches() {
    return this.db.getAllAsync<MatchSummary>('SELECT m.*, COUNT(s.id) AS stageCount FROM matches m LEFT JOIN stages s ON s.matchId = m.id GROUP BY m.id ORDER BY m.updatedAt DESC, m.id');
  }
  async loadMatch(id: string): Promise<Match> {
    const match = await this.db.getFirstAsync<Match>('SELECT * FROM matches WHERE id = ?', id);
    if (!match) throw new Error('Match no longer exists.');
    return match;
  }
  async createMatch(name: string, targetFamily: TargetFamily): Promise<string> {
    const clean = nameOf(name, 'match');
    if (!isTargetFamily(targetFamily)) throw new Error('Choose USPSA, PCSL or IDPA.');
    const id = this.newId(), now = new Date().toISOString();
    await this.serializeWrite(() => this.db.runAsync('INSERT INTO matches (id, name, targetFamily, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', id, clean, targetFamily, now, now));
    return id;
  }
  async updateMatch(id: string, name: string, targetFamily: TargetFamily) {
    const clean = nameOf(name, 'match');
    if (!isTargetFamily(targetFamily)) throw new Error('Choose USPSA, PCSL or IDPA.');
    const result = await this.serializeWrite(() => this.db.runAsync('UPDATE matches SET name = ?, targetFamily = ?, updatedAt = ? WHERE id = ?', clean, targetFamily, new Date().toISOString(), id));
    if (!result.changes) throw new Error('Match no longer exists.');
  }
  async deleteMatch(id: string) {
    await this.serializeWrite(() => this.transaction(async () => {
      await this.loadMatch(id);
      await this.db.runAsync('DELETE FROM stages WHERE matchId = ?', id);
      await this.db.runAsync('DELETE FROM matches WHERE id = ?', id);
    }));
  }
  async duplicateMatch(id: string): Promise<string> {
    return this.serializeWrite(() => this.transaction(async () => {
      const match = await this.loadMatch(id), copyId = this.newId(), now = new Date().toISOString();
      await this.db.runAsync('INSERT INTO matches (id, name, targetFamily, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', copyId, match.name.slice(0, 93) + ' (copy)', match.targetFamily, now, now);
      const stages = await this.db.getAllAsync<StageRow>('SELECT * FROM stages WHERE matchId = ? ORDER BY id', id);
      for (const stage of stages) {
        const stageId = this.newId();
        await this.db.runAsync('INSERT INTO stages (id, matchId, name, createdAt, updatedAt, payload) VALUES (?, ?, ?, ?, ?, ?)', stageId, copyId, stage.name, now, now, stage.payload);
        await this.copyDiagramImports(stage.id, stageId);
      }
      return copyId;
    }));
  }
  listStages(matchId?: string) {
    return matchId === undefined
      ? this.db.getAllAsync<StageSummary>('SELECT id, matchId, name, createdAt, updatedAt FROM stages ORDER BY updatedAt DESC, id')
      : this.db.getAllAsync<StageSummary>('SELECT id, matchId, name, createdAt, updatedAt FROM stages WHERE matchId = ? ORDER BY updatedAt DESC, id', matchId);
  }
  async loadStage(id: string): Promise<SavedStage> {
    const row = await this.db.getFirstAsync<StageRow>('SELECT * FROM stages WHERE id = ?', id);
    if (!row) throw new Error('Stage no longer exists.');
    const { payload, ...summary } = row;
    let data;
    try { data = JSON.parse(payload); } catch { throw new Error('Unsupported or damaged stage data. The saved copy has not been changed.'); }
    if (!data || data.version !== 1 || data.document?.schemaVersion !== 7 || data.document?.coordinateSystem !== 'inches' || !Array.isArray(data.document.objects) || !data.plan?.loadout || !data.plan?.engagements)
      throw new Error('Unsupported or damaged stage data. The saved copy has not been changed.');
    const d = data.document;
    const geometryFields = { start: ['width', 'depth', 'height'], wall: ['length', 'thickness', 'height'], faultLine: ['length'],
      cardboardTarget: ['faceWidth', 'faceHeight'], noShootTarget: ['faceWidth', 'faceHeight'], steelPlate: ['faceWidth', 'faceHeight'], steelPopper: ['faceWidth', 'faceHeight'] };
    if (!d.stage || ![d.stage.width, d.stage.depth].every(n => Number.isFinite(n) && n > 0)
      || d.objects.length > 2000 || d.objects.some((o: StageDocument['objects'][number]) => !o || typeof o.id !== 'string'
        || !o.position || o.position.space !== 'stage' || ![o.position.x, o.position.y, o.position.z, o.rotation].every(Number.isFinite)
        || !o.geometry || !Object.values(o.geometry).every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
        || !['start', 'wall', 'faultLine', 'cardboardTarget', 'noShootTarget', 'steelPlate', 'steelPopper'].includes(o.type)
        || ('presetId' in o && o.presetId !== undefined && (typeof o.presetId !== 'string' || !o.presetId.trim()))
        || ('outline' in o && o.outline !== undefined && !validOutline(o.outline))
        || (isSegment(o) && !validSavedEndpoints(o))
        || ('targetFamily' in o && o.targetFamily !== undefined && !isTargetFamily(o.targetFamily))
        || !geometryFields[o.type].every(k => Object.hasOwn(o.geometry, k))
        || o.type === 'wall' && (!Array.isArray(o.ports) || o.ports.some(p => !p || ![p.offset, p.width, p.height, p.sill].every(Number.isFinite)))
        || (o.type === 'cardboardTarget' || o.type === 'noShootTarget') && (!o.faceCut || !['full', 'upper', 'lower', 'left', 'right'].includes(o.faceCut.preset)
          || (o.attachment !== undefined && !validAttachment(o.attachment)) || (o.hardCover !== undefined && !validHardCovers(o.hardCover))))
      || !Array.isArray(data.plan.loadout.magazines) || data.plan.loadout.magazines.some((m: StagePlan['loadout']['magazines'][number]) =>
        !m || typeof m.id !== 'string' || ![m.capacity, m.startingRounds].every(n => Number.isFinite(n) && n >= 0)))
      throw new Error('Unsupported or damaged stage data. The saved copy has not been changed.');
    if (savedDocumentProblem(d)) throw new Error('Unsupported or damaged stage data. The saved copy has not been changed.');
    if (data.plan.route !== undefined && !isStageRoute(data.plan.route)) throw new Error('Unsupported or damaged route data. The saved copy has not been changed.');
    // Planned hits are optional: malformed entries are dropped rather than blocking the stage.
    const { expectations: savedExpectations, ...planRest } = data.plan;
    const expectations = validExpectations(savedExpectations);
    return { ...summary, document: data.document, plan: expectations ? { ...planRest, expectations } : planRest };
  }
  private payload(document: StageDocument, plan: StagePlan) {
    if (plan.route !== undefined && !isStageRoute(plan.route)) throw new Error('Invalid route data.');
    if (plan.expectations !== undefined && Object.keys(plan.expectations).length !== Object.keys(validExpectations(plan.expectations) ?? {}).length) throw new Error('Invalid planned hits.');
    // Never write a document that loadStage would refuse to reopen.
    const problem = savedDocumentProblem(document);
    if (problem) throw new Error(problem);
    return JSON.stringify({ version: 1, document, plan });
  }
  async createStage(name: string, document: StageDocument, plan: StagePlan, matchId: string): Promise<string> {
    const id = this.newId(), now = new Date().toISOString();
    const clean = nameOf(name), payload = this.payload(document, plan);
    await this.serializeWrite(async () => {
      await this.loadMatch(matchId);
      await this.db.runAsync('INSERT INTO stages (id, matchId, name, createdAt, updatedAt, payload) VALUES (?, ?, ?, ?, ?, ?)', id, matchId, clean, now, now, payload);
    });
    return id;
  }
  async saveStage(id: string, name: string, document: StageDocument, plan: StagePlan) {
    const result = await this.serializeWrite(() => this.db.runAsync('UPDATE stages SET name = ?, updatedAt = ?, payload = ? WHERE id = ?', nameOf(name), new Date().toISOString(), this.payload(document, plan), id));
    if (!result.changes) throw new Error('Stage no longer exists.');
  }
  async renameStage(id: string, name: string) {
    const result = await this.serializeWrite(() => this.db.runAsync('UPDATE stages SET name = ?, updatedAt = ? WHERE id = ?', nameOf(name), new Date().toISOString(), id));
    if (!result.changes) throw new Error('Stage no longer exists.');
  }
  async duplicateStage(id: string) {
    return this.serializeWrite(() => this.transaction(async () => {
      const stage = await this.loadStage(id), copyId = this.newId(), now = new Date().toISOString();
      await this.db.runAsync('INSERT INTO stages (id, matchId, name, createdAt, updatedAt, payload) VALUES (?, ?, ?, ?, ?, ?)', copyId, stage.matchId, stage.name.slice(0, 93) + ' (copy)', now, now, this.payload(stage.document, stage.plan));
      await this.copyDiagramImports(id, copyId);
      return copyId;
    }));
  }
  private copyDiagramImports(from: string, to: string) {
    return this.db.runAsync('INSERT INTO diagram_imports (stageId, id, payload) SELECT ?, id, payload FROM diagram_imports WHERE stageId = ?', to, from);
  }
  /** Valid drafts only; a single damaged draft no longer hides the stage's other references. */
  async loadDiagramImports(stageId: string): Promise<Reconstruction[]> {
    return (await this.loadDiagramImportsReport(stageId)).drafts;
  }
  /** Valid drafts plus the IDs of saved rows that could not be read (left unchanged on disk). */
  async loadDiagramImportsReport(stageId: string): Promise<{ drafts: Reconstruction[]; damagedIds: string[] }> {
    const rows = await this.db.getAllAsync<{ id: string; payload: string }>('SELECT id, payload FROM diagram_imports WHERE stageId = ? ORDER BY id', stageId);
    const drafts: Reconstruction[] = [], damagedIds: string[] = [];
    for (const row of rows) {
      try { const draft = JSON.parse(row.payload); validateReconstruction(draft); drafts.push(draft); }
      catch { damagedIds.push(row.id); }
    }
    return { drafts, damagedIds };
  }
  /** Removes one saved reference (valid or damaged) from a stage. Files are cleaned up by the caller. */
  async deleteDiagramImport(stageId: string, id: string): Promise<void> {
    await this.serializeWrite(() => this.db.runAsync('DELETE FROM diagram_imports WHERE stageId = ? AND id = ?', stageId, id));
  }
  /**
   * Every document path referenced by any saved draft on any stage. Originals are shared when stages are duplicated,
   * so a file may be deleted only when no draft anywhere still references it.
   */
  async diagramAssetPathsInUse(): Promise<Set<string>> {
    const rows = await this.db.getAllAsync<{ payload: string }>('SELECT payload FROM diagram_imports');
    const paths = new Set<string>();
    for (const row of rows) {
      try {
        const draft = JSON.parse(row.payload) as Reconstruction;
        for (const asset of [draft.source, draft.page?.asset, draft.rectified?.asset, draft.aligned?.asset]) if (asset?.path) paths.add(asset.path);
      } catch {
        // A damaged row might still reference files: keep everything it mentions.
        for (const match of row.payload.matchAll(/diagram-imports\/[A-Za-z0-9._-]+/g)) paths.add(match[0]);
      }
    }
    return paths;
  }
  async saveDiagramImport(stageId: string, draft: Reconstruction): Promise<void> {
    validateReconstruction(draft);
    const payload = JSON.stringify(draft);
    if (payload.length > 2_000_000) throw new Error('Reconstruction draft is too large.');
    await this.serializeWrite(async () => {
      await this.loadStage(stageId);
      const count = await this.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM diagram_imports WHERE stageId = ? AND id != ?', stageId, draft.id);
      if ((count?.count ?? 0) >= 20) throw new Error('This stage already has 20 document references. Delete one to save another.');
      await this.db.runAsync('INSERT INTO diagram_imports (stageId, id, payload) VALUES (?, ?, ?) ON CONFLICT(stageId, id) DO UPDATE SET payload = excluded.payload', stageId, draft.id, payload);
    });
  }
  async deleteStage(id: string) { await this.serializeWrite(() => this.db.runAsync('DELETE FROM stages WHERE id = ?', id)); }
  async listTraining(userId: string) {
    const rows = await this.db.getAllAsync<{ id: string; payload: string }>('SELECT id, payload FROM training WHERE userId = ? ORDER BY occurredAt DESC', userId);
    const records: TrainingRecord[] = [], warnings: string[] = [];
    for (const row of rows) {
      try { records.push(this.normalizeTraining(JSON.parse(row.payload))); }
      catch { warnings.push(`Saved session ${row.id} could not be opened. Its original data has not been changed.`); }
    }
    this.trainingReadWarnings = warnings; return records;
  }
  private normalizeTraining(record: TrainingRecord): TrainingRecord {
    if (!record || typeof record.id !== 'string' || !record.id || typeof record.userId !== 'string' || !record.userId
      || typeof record.drillName !== 'string' || typeof record.notes !== 'string'
      || !Object.hasOwn(startingTypes, record.startingType) || !Number.isFinite(Date.parse(record.occurredAt)) ||
      (record.totalTime !== null && (!Number.isFinite(record.totalTime) || record.totalTime < 0))
      || !Array.isArray(record.segments) || record.segments.length > 2000 || record.segments.some(s => !s || !Number.isFinite(s.seconds) || s.seconds < 0)) throw new Error('Invalid training record.');
    if (record.context !== undefined && !trainingContexts.includes(record.context)) throw new Error('Invalid training context.');
    if (record.runs !== undefined) {
      if (!Array.isArray(record.runs) || record.runs.length > MAX_RUNS_PER_SESSION) throw new Error('Invalid drill runs.');
      const runIds = new Set<string>();
      for (const run of record.runs) {
        const problem = drillRunProblem(run);
        if (problem || runIds.has(run.id)) throw new Error(problem ?? 'Duplicate drill run.');
        runIds.add(run.id);
      }
    }
    if (record.libraryRuns !== undefined) {
      if (!Array.isArray(record.libraryRuns) || record.libraryRuns.length > MAX_LIBRARY_RUNS) throw new Error('Invalid drill library runs.');
      const runIds = new Set<string>();
      for (const run of record.libraryRuns) {
        const problem = libraryRunProblem(run);
        if (problem || runIds.has(run.id)) throw new Error(problem ?? 'Duplicate drill library run.');
        runIds.add(run.id);
      }
    }
    if (record.videos === undefined) return record;
    if (!Array.isArray(record.videos) || record.videos.length > 100) throw new Error('Invalid training videos or video count exceeds the supported limit.');
    const videos = record.videos.map(normalizeVideo), ids = new Set<string>();
    for (const video of videos) {
      if (ids.has(video.session.id) || video.session.trainingSessionId !== record.id || video.session.drillId !== record.drillId
        || (record.context && video.session.context !== record.context)) throw new Error('Video does not belong to this session/context.');
      ids.add(video.session.id);
    }
    return { ...record, videos };
  }
  saveTraining(record: TrainingRecord): Promise<void> { return this.writeTraining(record); }
  /**
   * Deletes one training session and, in the same transaction, withdraws every profile measurement contributed from
   * it. Video files are app-owned copies; the caller removes them after this commits.
   */
  deleteTraining(id: string): Promise<void> {
    const work = this.trainingWrites.then(async () => {
      await this.db.execAsync('BEGIN TRANSACTION;');
      try {
        const profile = await this.loadProfile();
        const observations = profile.performanceObservations ?? [];
        const remaining = observations.filter(o => o.trainingSessionId !== id);
        if (remaining.length !== observations.length)
          await this.persistProfile(withVideoObservations(profile, remaining, profile.calibrationContext ?? 'LIVE_FIRE'));
        await this.db.runAsync('DELETE FROM training WHERE id = ?', id);
        await this.db.execAsync('COMMIT;');
      } catch (error) { await this.db.execAsync('ROLLBACK;'); throw error; }
    });
    this.trainingWrites = work.catch(() => {});
    return work;
  }
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
        const withVideo = selected ? [...remaining, ...videoObservations(selected, record.startingType)] : remaining;
        // Library runs are the source of truth for their measurements: re-derive them on every save, so editing or
        // deleting a run (or switching off "count toward my profile") updates the profile in the same transaction.
        const library = sessionLibraryObservations(record);
        const next = [...withVideo.filter(o => !isLibraryObservation(o, record.id)), ...library];
        // Stored observations come back sorted by id; compare in the same order so an unchanged session writes nothing.
        const libraryChanged = canonicalById((profile.performanceObservations ?? []).filter(o => isLibraryObservation(o, record.id))) !== canonicalById(library);
        if (selected || libraryChanged || next.length !== (profile.performanceObservations ?? []).length) {
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
    let profile: UserProfile;
    try { profile = JSON.parse(row.payload); }
    catch { throw new Error('Damaged profile data. The saved copy has not been changed.'); }
    if (!profile || profile.id !== 'local' || !profile.performance
      || !['drawTime', 'reloadTime', 'averageSplitTime', 'transitionTime', 'movementSpeed', 'magazineCapacity', 'startingRounds']
        .every(k => { const n = profile.performance[k as keyof UserProfile['performance']]; return typeof n === 'number' && Number.isFinite(n) && n >= 0; })
      || profile.performanceObservations !== undefined && !Array.isArray(profile.performanceObservations))
      throw new Error('Damaged profile data. The saved copy has not been changed.');
    // Optional settings: anything malformed reads as unset rather than blocking the profile.
    if (profile.powerFactor !== undefined && profile.powerFactor !== 'minor' && profile.powerFactor !== 'major') delete profile.powerFactor;
    if (profile.drillPars !== undefined) profile.drillPars = validDrillPars(profile.drillPars);
    // The move fit is derived; a damaged saved copy is dropped (a rebuild below recomputes it from the measurements).
    if (profile.performance.movementModel !== undefined) {
      const model = validMovementModel(profile.performance.movementModel);
      if (model) profile.performance.movementModel = model; else delete profile.performance.movementModel;
    }
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
  setPowerFactor(powerFactor: PowerFactor) {
    if (powerFactor !== 'minor' && powerFactor !== 'major') return Promise.reject(new Error('Invalid power factor.'));
    return this.updateProfile(p => ({ ...p, powerFactor }));
  }
  /** Par time for one drill-library variant (`variantKey`); null clears it. */
  setDrillPar(key: string, seconds: number | null) {
    if (typeof key !== 'string' || !key || key.length > 200 || seconds !== null && !validPar(seconds)) return Promise.reject(new Error('Invalid par time.'));
    return this.updateProfile(p => {
      const drillPars = { ...validDrillPars(p.drillPars) };
      if (seconds === null) delete drillPars[key]; else drillPars[key] = seconds;
      return { ...p, drillPars };
    });
  }
  setManualOverride(factor: TimingFactor, value: number | null) { return this.updateProfile(p => setManualOverride(p, factor, value)); }
  rebuildProfile(context?: TrainingContext) { return this.updateProfile(p => withPerformanceObservations(p, p.performanceObservations ?? [], context ?? p.calibrationContext ?? 'LIVE_FIRE')); }
}
