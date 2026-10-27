/**
 * Practice timer and buzz tests: the phone's haptic engine as a start signal you can feel.
 *
 * Pure logic only (no React, no native calls) so it can be tested in Node. `buzz.ts` plays the patterns;
 * `PracticeTimer.tsx` and `BuzzTest.tsx` are the screens.
 */

/** What to check when nothing is felt: iOS skips haptics silently in these cases (Expo Haptics docs, SDK 57). */
export const NO_BUZZ_HELP = 'No buzz? iPhones skip haptics in Low Power Mode, with System Haptics off (Settings → Sounds & Haptics), and while the camera is open.';
/** USPSA 8.3.3 and PCSL 5.1: the start signal comes 1–4 s after "Standby". */
export const START_DELAY = { minMs: 1000, maxMs: 4000 } as const;
/** A tap sooner than this after the signal is a guess, not a reaction (the usual cut-off in reaction-time studies). */
export const ANTICIPATION_MS = 100;
/** No tap this long after the signal: the signal was missed. */
export const MISS_AFTER_MS = 1500;
/** Valid trials (reacted or missed) in one reaction block; guesses are redone, up to the attempt cap. */
export const BLOCK_TRIALS = 10;
export const BLOCK_MAX_ATTEMPTS = 20;
/** The pocket test: buzzes at random moments over a minute, at least this far apart. */
export const POCKET_WINDOW_MS = 60_000;
export const POCKET_MIN_GAP_MS = 4_000;

export type Strength = 'BURST' | 'TAP';
export const strengths: readonly Strength[] = ['BURST', 'TAP'];
/** What the reaction test signals with. */
export type Cue = 'BUZZ' | 'SCREEN' | 'BOTH';
export const cues: readonly Cue[] = ['BUZZ', 'SCREEN', 'BOTH'];
export const cueLabels: Record<Cue, string> = { BUZZ: 'BUZZ ONLY', SCREEN: 'SCREEN ONLY', BOTH: 'BUZZ + SCREEN' };
export type Place = 'FRONT_POCKET' | 'BACK_POCKET' | 'JACKET';
export const pocketPlaces: readonly Place[] = ['FRONT_POCKET', 'BACK_POCKET', 'JACKET'];
export const placeLabels: Record<Place, string> = { FRONT_POCKET: 'Front pocket', BACK_POCKET: 'Back pocket', JACKET: 'Jacket' };

/** One haptic impact in a pattern. `heavy` is the strongest the iPhone's impact feedback offers. */
export interface Pulse { atMs: number; style: 'heavy' | 'light' }

/**
 * iPhone impact feedback is one short knock (tens of milliseconds). A BURST is five heavy knocks 40 ms apart, which
 * feels like one 0.2 s buzz; a TAP is a single knock. The par signal is the start pattern twice, so the two can't be confused.
 */
export function startPattern(strength: Strength): Pulse[] {
  return strength === 'TAP' ? [{ atMs: 0, style: 'heavy' }] : [0, 40, 80, 120, 160].map(atMs => ({ atMs, style: 'heavy' as const }));
}
export function parPattern(strength: Strength): Pulse[] {
  const one = startPattern(strength), gap = 320;
  return [...one, ...one.map(p => ({ ...p, atMs: p.atMs + gap }))];
}
/** A light knock when the timer is armed, so you know the press registered without looking. */
export const ARMED_PATTERN: readonly Pulse[] = [{ atMs: 0, style: 'light' }];

/** The pocket test ends with three bursts (always bursts, the strongest), which are not counted. */
export const END_PATTERN: readonly Pulse[] = [0, 320, 640].flatMap(at => startPattern('BURST').map(p => ({ ...p, atMs: p.atMs + at })));
/** Time to put the phone away before the pocket test's minute starts. */
export const POCKET_LEAD_MS = 5_000;

/**
 * When a tap landed. The touch event's own timestamp is used when it is on the same clock as `now()` (both count from
 * the phone's boot on iOS): it excludes the time the tap waited for JavaScript. Otherwise the time it was handled.
 */
export function tapTime(eventTimestamp: number | undefined, handledAt: number): number {
  return typeof eventTimestamp === 'number' && Number.isFinite(eventTimestamp) && eventTimestamp <= handledAt && handledAt - eventTimestamp < 250
    ? eventTimestamp : handledAt;
}

/** A random number source's value forced into [0, 1); anything unusable counts as 0. */
const unit = (v: number) => Number.isFinite(v) ? Math.min(Math.max(v, 0), 1 - Number.EPSILON) : 0;

/** A random start delay within [min, max] ms. `rng` returns [0, 1). */
export function randomDelay(rng: () => number = Math.random, minMs: number = START_DELAY.minMs, maxMs: number = START_DELAY.maxMs): number {
  return Math.round(minMs + unit(rng()) * (maxMs - minMs));
}

/** A par time typed in seconds: a number in (0, 600], or null for blank or anything else. */
export function parseParSeconds(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 && v <= 600 ? v : null;
}

export type TimerEventKind = 'start' | 'par' | 'done';
export interface TimerEvent { atMs: number; kind: TimerEventKind }
/** With a par, the timer finishes 1.5 s after the par signal; without one it runs as a stopwatch until STOP or this cap. */
export const STOPWATCH_CAP_MS = 120_000;
export const AFTER_PAR_MS = 1500;

/** When each signal fires, counted from pressing START. */
export function timerPlan(delayMs: number, parSeconds: number | null): TimerEvent[] {
  const events: TimerEvent[] = [{ atMs: delayMs, kind: 'start' }];
  if (parSeconds !== null && Number.isFinite(parSeconds) && parSeconds > 0) {
    const parAt = delayMs + Math.round(parSeconds * 1000);
    events.push({ atMs: parAt, kind: 'par' }, { atMs: parAt + AFTER_PAR_MS, kind: 'done' });
  } else events.push({ atMs: delayMs + STOPWATCH_CAP_MS, kind: 'done' });
  return events;
}

/** Times of the pocket test's buzzes: one in each equal slot of the window, kept `minGapMs` apart. */
export function pocketPlan(count: number, rng: () => number = Math.random, windowMs = POCKET_WINDOW_MS, minGapMs = POCKET_MIN_GAP_MS): number[] {
  const n = Math.max(1, Math.floor(count)), slot = windowMs / n;
  if (slot <= minGapMs) throw new Error('Too many buzzes for the window.');
  return Array.from({ length: n }, (_, i) => Math.round(i * slot + minGapMs / 2 + unit(rng()) * (slot - minGapMs)));
}
/** 4 to 8 buzzes, so the count can't be guessed. */
export function pocketCount(rng: () => number = Math.random) { return 4 + Math.floor(unit(rng()) * 5); }

export type TrialOutcome = 'REACTED' | 'EARLY' | 'MISSED';
export interface ReactionTrial { cue: Cue; strength: Strength; outcome: TrialOutcome; reactionMs: number | null; at: string }
export interface PocketTrial { strength: Strength; place: Place; sent: number; felt: number; at: string }

/**
 * Judge one attempt. `signalAt` is when the signal was sent (null if the tap came before it); `tapAt` is when the
 * tap landed (null if none came). Both on the same clock, in ms.
 */
export function judgeTrial(signalAt: number | null, tapAt: number | null): { outcome: TrialOutcome; reactionMs: number | null } {
  if (signalAt === null) return { outcome: 'EARLY', reactionMs: null };
  if (tapAt === null) return { outcome: 'MISSED', reactionMs: null };
  const ms = tapAt - signalAt;
  if (ms < ANTICIPATION_MS) return { outcome: 'EARLY', reactionMs: null };
  if (ms > MISS_AFTER_MS) return { outcome: 'MISSED', reactionMs: null };
  return { outcome: 'REACTED', reactionMs: Math.round(ms) };
}

/** A block is over after BLOCK_TRIALS reacted-or-missed trials, or BLOCK_MAX_ATTEMPTS attempts in all. */
export function blockDone(trials: readonly ReactionTrial[]): boolean {
  return trials.filter(t => t.outcome !== 'EARLY').length >= BLOCK_TRIALS || trials.length >= BLOCK_MAX_ATTEMPTS;
}

export interface ReactionStats {
  cue: Cue; strength: Strength | null; reacted: number; early: number; missed: number;
  medianMs: number | null; meanMs: number | null; sdMs: number | null; fastestMs: number | null; slowestMs: number | null;
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Results grouped by signal (and buzz strength where a buzz was involved), in a fixed order. */
export function reactionStats(trials: readonly ReactionTrial[]): ReactionStats[] {
  const groups = new Map<string, ReactionTrial[]>();
  for (const t of trials) {
    const key = t.cue === 'SCREEN' ? 'SCREEN' : t.cue + ':' + t.strength;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const order = ['BUZZ:BURST', 'BUZZ:TAP', 'BOTH:BURST', 'BOTH:TAP', 'SCREEN'];
  return order.filter(k => groups.has(k)).map(k => {
    const list = groups.get(k)!, ms = list.flatMap(t => t.reactionMs !== null ? [t.reactionMs] : []);
    const mean = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
    const sd = ms.length > 1 && mean !== null ? Math.sqrt(ms.reduce((a, b) => a + (b - mean) ** 2, 0) / (ms.length - 1)) : null;
    const [cue, strength] = k.split(':') as [Cue, Strength | undefined];
    return { cue, strength: strength ?? null, reacted: ms.length, early: list.filter(t => t.outcome === 'EARLY').length, missed: list.filter(t => t.outcome === 'MISSED').length,
      medianMs: ms.length ? median(ms) : null, meanMs: mean, sdMs: sd, fastestMs: ms.length ? Math.min(...ms) : null, slowestMs: ms.length ? Math.max(...ms) : null };
  });
}

export interface PocketStats { strength: Strength; place: Place; tests: number; sent: number; felt: number }
export function pocketStats(trials: readonly PocketTrial[]): PocketStats[] {
  const out: PocketStats[] = [];
  for (const t of trials) {
    const row = out.find(r => r.strength === t.strength && r.place === t.place);
    if (row) { row.tests++; row.sent += t.sent; row.felt += Math.min(t.felt, t.sent); }
    else out.push({ strength: t.strength, place: t.place, tests: 1, sent: t.sent, felt: Math.min(t.felt, t.sent) });
  }
  return out;
}

export const groupLabel = (s: { cue: Cue; strength: Strength | null }) => s.cue === 'SCREEN' ? 'Screen only' : `${s.cue === 'BOTH' ? 'Buzz + screen' : 'Buzz only'} (${s.strength === 'TAP' ? 'tap' : 'burst'})`;
export function statsLine(s: ReactionStats): string {
  if (s.medianMs === null) return `${groupLabel(s)}: no reactions yet` + (s.early || s.missed ? ` (${s.early} early, ${s.missed} missed)` : '');
  return `${groupLabel(s)}: median ${Math.round(s.medianMs)} ms, mean ${Math.round(s.meanMs!)}${s.sdMs !== null ? ' ± ' + Math.round(s.sdMs) : ''} ms, `
    + `fastest ${s.fastestMs} ms · ${s.reacted} reacted, ${s.early} early, ${s.missed} missed`;
}
export const pocketLine = (p: PocketStats) => `${placeLabels[p.place]}, ${p.strength === 'TAP' ? 'tap' : 'burst'}: felt ${p.felt} of ${p.sent} (${Math.round(p.felt / p.sent * 100)}%) over ${p.tests} test${p.tests === 1 ? '' : 's'}`;

/** Plain-text results to share or paste into a write-up. Only measured numbers; nothing is estimated. */
export function resultsReport(reaction: readonly ReactionTrial[], pocket: readonly PocketTrial[], device: { model: string | null; os: string | null }, when = new Date()): string {
  const lines = [`PSP buzz test · ${when.toISOString().slice(0, 10)}` + (device.model ? ` · ${device.model}` : '') + (device.os ? ` · ${device.os}` : '')];
  const r = reactionStats(reaction);
  if (r.length) {
    lines.push('', 'Reaction time, phone in hand, tap on the signal (from the moment the app sends it):');
    r.forEach(s => lines.push('- ' + statsLine(s)));
    lines.push(`Under ${ANTICIPATION_MS} ms counts as early (a guess); over ${MISS_AFTER_MS} ms as missed.`);
  }
  const p = pocketStats(pocket);
  if (p.length) {
    lines.push('', 'Pocket test, buzzes at random moments over a minute:');
    p.forEach(s => lines.push('- ' + pocketLine(s)));
  }
  if (!r.length && !p.length) lines.push('', 'No results yet.');
  return lines.join('\n');
}

/** Saved results (device preference); anything unreadable is dropped rather than failing the screen. */
export interface BuzzResults { version: 1; reaction: ReactionTrial[]; pocket: PocketTrial[] }
export const RESULTS_CAP = 400;
export function parseResults(text: string | null): BuzzResults {
  const empty: BuzzResults = { version: 1, reaction: [], pocket: [] };
  if (!text) return empty;
  try {
    const data = JSON.parse(text);
    if (!data || data.version !== 1) return empty;
    const reaction = Array.isArray(data.reaction) ? data.reaction.filter((t: ReactionTrial) => t && cues.includes(t.cue) && strengths.includes(t.strength)
      && ['REACTED', 'EARLY', 'MISSED'].includes(t.outcome) && (t.reactionMs === null || (typeof t.reactionMs === 'number' && Number.isFinite(t.reactionMs)))
      && (t.outcome === 'REACTED') === (t.reactionMs !== null)) : [];
    const pocket = Array.isArray(data.pocket) ? data.pocket.filter((t: PocketTrial) => t && strengths.includes(t.strength) && pocketPlaces.includes(t.place)
      && Number.isInteger(t.sent) && t.sent > 0 && Number.isInteger(t.felt) && t.felt >= 0) : [];
    return { version: 1, reaction: reaction.slice(-RESULTS_CAP), pocket: pocket.slice(-RESULTS_CAP) };
  } catch { return empty; }
}
export const serializeResults = (r: BuzzResults) => JSON.stringify({ version: 1, reaction: r.reaction.slice(-RESULTS_CAP), pocket: r.pocket.slice(-RESULTS_CAP) });
