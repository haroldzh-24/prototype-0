import { isTrustedEvent, sortEvents } from './videoModel';
import type { TimelineEvent } from './videoModel';

export const AUDIO_ANALYSIS_CONFIG = Object.freeze({
  version: 1, sampleRate: 16000, maxDurationMs: 60000, windowMs: 10, hopMs: 5,
  backgroundMs: 150, noiseFloor: 0.003, onsetRatio: 3, minPeak: 0.08,
  minCrest: 1.8, decayRatio: 0.65, decayMs: 35,
  shotRefractoryMs: 65, duplicateMs: 35, beepMinMs: 60, beepMaxMs: 1200,
  toneMinHz: 1000, toneMaxHz: 5000, toneStepHz: 50, toneRatio: 0.55,
  toneDriftHz: 100, highToneRatio: 0.8, highBeepRise: 6,
  localRiseRatio: 1.15, highShotRise: 8, highShotCrest: 3,
  loudRms: 0.15, noisyFrameFraction: 0.5, clippingPeak: 0.999,
  maxSuggestions: 200, yieldEveryFrames: 80,
});
export const AUDIO_DETECTOR_VERSION = 'local-audio-1';
export type AudioConfig = { readonly [K in keyof typeof AUDIO_ANALYSIS_CONFIG]: number };
export type AnalysisAudio = {
  samples: ArrayLike<number>; sampleRate: number; offsetMs: number;
  durationMs: number; warnings: string[]; noAudio?: boolean;
};
export type AudioFeatureFrame = {
  timestampMs: number; rms: number; peak: number; rise: number; crest: number;
  toneRatio: number; toneHz: number; peakMs: number;
};
export type AudioCandidate = {
  type: 'STIMULUS' | 'SHOT'; timestampMs: number; confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  metadata: { durationMs: number; peak: number; rise: number; toneRatio: number; toneHz: number };
};
export type AudioAnalysisRun = {
  detectorVersion: string; analyzedAt: string; config: AudioConfig;
  offsetMs: number; durationMs: number; candidates: AudioCandidate[]; warnings: string[];
  matches: { candidateIndex: number; eventId: string }[];
};
export function checkAudioCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Audio analysis cancelled.');
}

/** Pure deterministic frames. Offset is sample zero's position on the VIDEO timeline. */
export async function analyzeAudioFrames(audio: AnalysisAudio, signal?: AbortSignal,
  config: AudioConfig = AUDIO_ANALYSIS_CONFIG): Promise<AudioFeatureFrame[]> {
  checkAudioCancelled(signal);
  if (audio.sampleRate !== config.sampleRate || !Number.isFinite(audio.offsetMs) || audio.offsetMs < 0
    || !Number.isFinite(audio.durationMs) || audio.durationMs <= 0 || audio.durationMs > config.maxDurationMs || !audio.samples
    || !Number.isInteger(audio.samples.length) || audio.samples.length > config.sampleRate * config.maxDurationMs / 1000
    || audio.samples.length < 0 || audio.samples.length > Math.ceil(audio.durationMs * audio.sampleRate / 1000)
    || !Array.isArray(audio.warnings) || audio.warnings.some(w => typeof w !== 'string')) throw new Error('Malformed or unsupported analysis audio.');
  if (!audio.samples.length && !audio.noAudio) throw new Error('Decoded audio is empty.');
  const size = Math.round(config.windowMs * audio.sampleRate / 1000), hop = Math.round(config.hopMs * audio.sampleRate / 1000);
  const frames: AudioFeatureFrame[] = [], history = Math.ceil(config.backgroundMs / config.hopMs);
  const frequencies: { hz: number; coefficient: number }[] = [];
  for (let hz = config.toneMinHz; hz <= config.toneMaxHz; hz += config.toneStepHz)
    frequencies.push({ hz, coefficient: 2 * Math.cos(2 * Math.PI * hz / audio.sampleRate) });
  for (let start = 0; start < audio.samples.length; start += hop) {
    if (frames.length % config.yieldEveryFrames === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0)); checkAudioCancelled(signal);
    }
    const count = Math.min(size, audio.samples.length - start);
    let energy = 0, peak = 0, peakIndex = 0;
    for (let j = 0; j < count; j++) {
      const value = audio.samples[start + j];
      if (!Number.isFinite(value) || Math.abs(value) > 1.01) throw new Error('Malformed PCM samples.');
      energy += value * value;
      if (Math.abs(value) > peak) { peak = Math.abs(value); peakIndex = j; }
    }
    const rms = Math.sqrt(energy / count);
    let toneRatio = 0, toneHz = 0;
    if (rms >= config.noiseFloor) for (const frequency of frequencies) {
      let a = 0, b = 0;
      for (let j = 0; j < count; j++) { const next = audio.samples[start + j] + frequency.coefficient * a - b; b = a; a = next; }
      const ratio = 2 * (a * a + b * b - frequency.coefficient * a * b) / (count * energy);
      if (ratio > toneRatio) { toneRatio = Math.min(1, ratio); toneHz = frequency.hz; }
    }
    const background = frames.slice(-history).map(f => f.rms).sort((a, b) => a - b);
    const baseline = Math.max(config.noiseFloor, background[Math.floor(background.length / 2)] ?? 0);
    frames.push({ timestampMs: audio.offsetMs + start * 1000 / audio.sampleRate, rms, peak,
      rise: rms / baseline, crest: peak / Math.max(rms, config.noiseFloor), toneRatio, toneHz,
      peakMs: audio.offsetMs + (start + peakIndex) * 1000 / audio.sampleRate });
  }
  return frames;
}

export function detectStimulusCandidates(frames: AudioFeatureFrame[], config: AudioConfig = AUDIO_ANALYSIS_CONFIG): AudioCandidate[] {
  const result: AudioCandidate[] = [];
  for (let i = 0; i < frames.length; i++) {
    const first = frames[i];
    if (first.toneRatio < config.toneRatio || first.rms < config.noiseFloor * config.onsetRatio) continue;
    let end = i;
    while (end + 1 < frames.length && frames[end + 1].toneRatio >= config.toneRatio
      && Math.abs(frames[end + 1].toneHz - first.toneHz) <= config.toneDriftHz) end++;
    const durationMs = frames[end].timestampMs - first.timestampMs + config.hopMs;
    if (durationMs >= config.beepMinMs && durationMs <= config.beepMaxMs && first.rise >= config.onsetRatio) {
      result.push({ type: 'STIMULUS', timestampMs: first.timestampMs,
        confidence: first.toneRatio > config.highToneRatio && first.rise > config.highBeepRise ? 'HIGH' : 'MEDIUM',
        metadata: { durationMs, peak: first.peak, rise: first.rise, toneRatio: first.toneRatio, toneHz: first.toneHz } });
    }
    i = end;
  }
  return result;
}

export function detectShotCandidates(frames: AudioFeatureFrame[], beeps: AudioCandidate[], config: AudioConfig = AUDIO_ANALYSIS_CONFIG): AudioCandidate[] {
  const result: AudioCandidate[] = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], previous = frames[i - 1];
    if (f.peak < config.minPeak || f.rise < config.onsetRatio || f.crest < config.minCrest
      || f.toneRatio >= config.toneRatio || (previous && f.rms < previous.rms * config.localRiseRatio)) continue;
    if (beeps.some(b => f.peakMs >= b.timestampMs - config.windowMs && f.peakMs <= b.timestampMs + b.metadata.durationMs + config.windowMs)) continue;
    const decay = frames.slice(i + 1, i + 1 + Math.ceil(config.decayMs / config.hopMs));
    if (!decay.some(d => d.rms < f.rms * config.decayRatio)) continue;
    if (result.length && f.peakMs - result[result.length - 1].timestampMs < config.shotRefractoryMs) continue;
    result.push({ type: 'SHOT', timestampMs: f.peakMs,
      confidence: f.rise >= config.highShotRise && f.crest >= config.highShotCrest ? 'HIGH' : 'MEDIUM',
      metadata: { durationMs: config.decayMs, peak: f.peak, rise: f.rise, toneRatio: f.toneRatio, toneHz: f.toneHz } });
  }
  return result;
}

/** Replace only unconfirmed audio suggestions; never mutate manual/confirmed evidence. */
export function mergeAudioDetections(existing: TimelineEvent[], run: AudioAnalysisRun, durationMs: number | null) {
  const retained = existing.filter(e => e.source !== 'AUDIO_DETECTED' || isTrustedEvent(e));
  const matches: AudioAnalysisRun['matches'] = [];
  const suggestions: TimelineEvent[] = [];
  run.candidates.forEach((candidate, index) => {
    if (durationMs !== null && candidate.timestampMs > durationMs) return;
    const match = retained.find(e => isTrustedEvent(e) && (e.type === candidate.type || candidate.type === 'SHOT' && e.type === 'FIRST_SHOT')
      && Math.abs(e.timestampMs - candidate.timestampMs) <= run.config.duplicateMs);
    if (match) { matches.push({ candidateIndex: index, eventId: match.id }); return; }
    let id = `audio:${run.detectorVersion}:${candidate.type}:${candidate.timestampMs}`;
    while (retained.some(e => e.id === id) || suggestions.some(e => e.id === id)) id += ':new';
    suggestions.push({ id, type: candidate.type, timestampMs: candidate.timestampMs, source: 'AUDIO_DETECTED',
      confirmed: false, confidence: candidate.confidence,
      metadata: { audio: { detectorVersion: run.detectorVersion, analyzedAt: run.analyzedAt, ...candidate.metadata } } });
  });
  return { events: sortEvents([...retained, ...suggestions], durationMs), run: { ...run, matches } };
}

export async function detectAudio(audio: AnalysisAudio, signal?: AbortSignal, analyzedAt = new Date().toISOString()): Promise<AudioAnalysisRun> {
  const frames = await analyzeAudioFrames(audio, signal);
  const beeps = detectStimulusCandidates(frames), shots = detectShotCandidates(frames, beeps);
  const candidates = [...beeps, ...shots].sort((a, b) => a.timestampMs - b.timestampMs || a.type.localeCompare(b.type));
  const warnings = [...audio.warnings, 'Audio cannot identify the shooter. Review nearby shooters, echoes and impacts before confirming.'];
  if (audio.noAudio) warnings.push('Video has no audio track.');
  if (!beeps.length) warnings.push('No beep candidates found.');
  if (!shots.length) warnings.push('No shot candidates found; this is normal for dry fire.');
  if (beeps.length > 1) warnings.push('Multiple possible stimuli: choose the correct beep for this drill.');
  if (frames.filter(f => f.rms > AUDIO_ANALYSIS_CONFIG.loudRms).length > frames.length * AUDIO_ANALYSIS_CONFIG.noisyFrameFraction
    || frames.some(f => f.peak >= AUDIO_ANALYSIS_CONFIG.clippingPeak))
    warnings.push('Loud background or clipped audio may hide shots or create false candidates.');
  if (candidates.length > AUDIO_ANALYSIS_CONFIG.maxSuggestions) warnings.push('Suggestion limit reached; only the earliest candidates are shown.');
  return { detectorVersion: AUDIO_DETECTOR_VERSION, analyzedAt, config: { ...AUDIO_ANALYSIS_CONFIG },
    offsetMs: audio.offsetMs, durationMs: audio.durationMs,
    candidates: candidates.slice(0, AUDIO_ANALYSIS_CONFIG.maxSuggestions), warnings, matches: [] };
}

/** Persist only bounded diagnostic metadata, never decoded PCM or feature arrays. */
export function validateAudioRun(run: AudioAnalysisRun | undefined): AudioAnalysisRun | undefined {
  if (run === undefined) return undefined;
  if (!run || run.detectorVersion !== AUDIO_DETECTOR_VERSION || !Number.isFinite(Date.parse(run.analyzedAt))
    || JSON.stringify(run.config) !== JSON.stringify(AUDIO_ANALYSIS_CONFIG)
    || !Number.isFinite(run.offsetMs) || run.offsetMs < 0 || !Number.isFinite(run.durationMs) || run.durationMs <= 0
    || run.durationMs > AUDIO_ANALYSIS_CONFIG.maxDurationMs || !Array.isArray(run.candidates)
    || run.candidates.length > AUDIO_ANALYSIS_CONFIG.maxSuggestions || !Array.isArray(run.warnings)
    || run.warnings.length > 20 || run.warnings.some(w => typeof w !== 'string' || w.length > 500)
    || !Array.isArray(run.matches) || run.matches.length > run.candidates.length) throw new Error('Unsupported or damaged audio analysis metadata.');
  for (const c of run.candidates) {
    if (!c || !['STIMULUS', 'SHOT'].includes(c.type) || !['LOW', 'MEDIUM', 'HIGH'].includes(c.confidence)
      || !Number.isFinite(c.timestampMs) || c.timestampMs < run.offsetMs || c.timestampMs > run.offsetMs + run.durationMs
      || !c.metadata || ['durationMs', 'peak', 'rise', 'toneRatio', 'toneHz'].some(key => {
        const value = c.metadata[key as keyof AudioCandidate['metadata']];
        return typeof value !== 'number' || !Number.isFinite(value) || value < 0;
      }))
      throw new Error('Invalid audio candidate.');
  }
  if (run.matches.some(m => !m || !Number.isInteger(m.candidateIndex) || m.candidateIndex < 0
    || m.candidateIndex >= run.candidates.length || typeof m.eventId !== 'string')) throw new Error('Invalid audio match.');
  return { detectorVersion: run.detectorVersion, analyzedAt: run.analyzedAt, config: { ...AUDIO_ANALYSIS_CONFIG },
    offsetMs: run.offsetMs, durationMs: run.durationMs, candidates: run.candidates.map(c => ({ type: c.type,
      timestampMs: c.timestampMs, confidence: c.confidence, metadata: { durationMs: c.metadata.durationMs,
        peak: c.metadata.peak, rise: c.metadata.rise, toneRatio: c.metadata.toneRatio, toneHz: c.metadata.toneHz } })),
    warnings: [...run.warnings], matches: run.matches.map(m => ({ candidateIndex: m.candidateIndex, eventId: m.eventId })) };
}
