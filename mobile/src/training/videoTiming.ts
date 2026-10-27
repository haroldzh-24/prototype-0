/**
 * A drill run's video times itself (roadmap T2). The audio detector (audioDetection.ts) proposes timer beeps and
 * shot-like sounds; because the app knows the drill (how many shots, steel makeups), it can pick the run's shots out of
 * them: every beep starts a run, and the sounds until the next beep are its candidates. Your own shots are usually the
 * loudest sounds on your phone's microphone, so when there are more candidates than the drill has shots, the loudest
 * ones are kept and the rest are listed as ignored for you to check. Nothing here is saved until you accept the times.
 * Audio cannot tell whose shot it is: the times are proposals to check against the video.
 */
import { analyzeAudioFrames, AUDIO_ANALYSIS_CONFIG, detectShotCandidates, detectStimulusCandidates } from './audioDetection';
import type { AnalysisAudio, AudioAnalysisRun, AudioCandidate, AudioFeatureFrame } from './audioDetection';
import type { LibraryDrill } from './drillLibrary';

/** Sounds quieter than this share of your shots' typical peak are not counted as your shots. */
export const QUIET_SHARE = 0.35;
/** Steel runs keep makeups, up to this many past the drill's shots. */
const MAX_MAKEUPS = 10;

export type DrillTiming = {
  /** Video milliseconds of the beep that starts the run. */
  beepMs: number;
  /** Video milliseconds of the shots kept, in time order. */
  shotMs: number[];
  /** Shot-like sounds after this beep that were not kept (too quiet, or more than the drill has shots). */
  ignoredMs: number[];
  /** Seconds from the beep, as a shot timer lists them. */
  shotTimes: number[];
  expected: number;
  /** All the drill's shots were found (steel: at least the drill's shots). */
  complete: boolean;
};
export type DrillTimingResult = { runs: DrillTiming[]; problem: string | null; warnings: string[] };

const median = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const byTime = (a: AudioCandidate, b: AudioCandidate) => a.timestampMs - b.timestampMs;

/** `loudness`: how loud a candidate is; by default the detector's peak at its onset (see `timeDrillFromSound`). */
export function timeDrillFromAudio(audio: Pick<AudioAnalysisRun, 'candidates' | 'warnings'>, drill: LibraryDrill,
  loudness: (candidate: AudioCandidate) => number = c => c.metadata.peak): DrillTimingResult {
  const beeps = audio.candidates.filter(c => c.type === 'STIMULUS').sort(byTime);
  const sounds = audio.candidates.filter(c => c.type === 'SHOT').sort(byTime);
  const expected = drill.intervals.length;
  // The detector's own notes, minus the ones this step answers (which beep, dry-fire silence).
  const warnings = audio.warnings.filter(w => !/^Multiple possible stimuli|^No beep candidates|^No shot candidates/.test(w));
  if (!beeps.length) return { runs: [], warnings, problem: 'No timer beep found in the audio, so the times can’t be measured from it. Type the times from your timer.' };
  const runs: DrillTiming[] = [];
  beeps.forEach((beep, i) => {
    const start = beep.timestampMs + beep.metadata.durationMs, end = beeps[i + 1]?.timestampMs ?? Infinity;
    const candidates = sounds.filter(s => s.timestampMs > start && s.timestampMs < end);
    if (!candidates.length) return;
    // Your shots set the level: the typical peak of the loudest `expected` sounds.
    const loudest = [...candidates].sort((a, b) => loudness(b) - loudness(a));
    const level = median(loudest.slice(0, expected).map(loudness));
    const loud = loudest.filter(c => loudness(c) >= QUIET_SHARE * level);
    const keep = new Set(drill.makeups ? loud.slice(0, expected + MAX_MAKEUPS) : loud.slice(0, expected));
    const kept = candidates.filter(c => keep.has(c)), ignored = candidates.filter(c => !keep.has(c));
    runs.push({ beepMs: beep.timestampMs, shotMs: kept.map(c => c.timestampMs), ignoredMs: ignored.map(c => c.timestampMs),
      shotTimes: kept.map(c => Math.round(c.timestampMs - beep.timestampMs) / 1000), expected,
      complete: drill.makeups ? kept.length >= expected : kept.length === expected });
  });
  if (!runs.length) return { runs, warnings, problem: 'The beep was found but no shots after it (dry fire makes no shot sound). Type the times from your timer.' };
  return { runs, warnings, problem: null };
}

/** What to tell the shooter about one run's proposal. */
export function timingNotes(timing: DrillTiming, drill: LibraryDrill): string[] {
  const found = timing.shotMs.length, notes: string[] = [];
  if (!timing.complete) notes.push(`Found ${found} of the ${timing.expected} shots ${drill.name} has. Check the video and type the missing times, or record again.`);
  else if (drill.makeups && found > timing.expected) notes.push(`${found - timing.expected} extra shot${found - timing.expected === 1 ? '' : 's'} counted as makeups.`);
  if (timing.ignoredMs.length) notes.push(`${timing.ignoredMs.length} other sound${timing.ignoredMs.length === 1 ? ' was' : 's were'} ignored (quieter, or more than the drill's shots). Play the video to check.`);
  return notes;
}

export type Mark = { label: string; ms: number };
/** Video marks for a run: the beep, then each shot at its time from the beep. */
export function marksOf(beepMs: number, shotTimes: readonly number[]): Mark[] {
  return [{ label: 'BEEP', ms: beepMs }, ...shotTimes.map((t, i) => ({ label: 'SHOT ' + (i + 1), ms: beepMs + t * 1000 }))];
}

/** A shot's loudness: the highest peak in the 40 ms after its onset (the onset frame can catch only the start of it). */
export const SHOT_SPAN_MS = 40;
export function loudnessFrom(frames: readonly AudioFeatureFrame[]) {
  return (candidate: AudioCandidate) => {
    let peak = candidate.metadata.peak;
    for (const f of frames) if (f.timestampMs >= candidate.timestampMs - AUDIO_ANALYSIS_CONFIG.hopMs && f.timestampMs <= candidate.timestampMs + SHOT_SPAN_MS) peak = Math.max(peak, f.peak);
    return peak;
  };
}
/** The whole step from decoded sound to a proposal, reading the sound once. */
export async function timeDrillFromSound(audio: AnalysisAudio, drill: LibraryDrill, signal?: AbortSignal): Promise<DrillTimingResult> {
  const frames = await analyzeAudioFrames(audio, signal);
  const beeps = detectStimulusCandidates(frames), shots = detectShotCandidates(frames, beeps);
  const warnings = [...audio.warnings];
  if (audio.noAudio) warnings.push('Video has no audio track.');
  if (frames.filter(f => f.rms > AUDIO_ANALYSIS_CONFIG.loudRms).length > frames.length * AUDIO_ANALYSIS_CONFIG.noisyFrameFraction || frames.some(f => f.peak >= AUDIO_ANALYSIS_CONFIG.clippingPeak))
    warnings.push('Loud background or clipped audio may hide shots or create false ones.');
  warnings.push('Sound can’t tell whose shot it is: check the times against the video.');
  return timeDrillFromAudio({ candidates: [...beeps, ...shots], warnings }, drill, loudnessFrom(frames));
}
