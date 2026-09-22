# Phase 7A data inventory and model

Inspected before implementation: `profile/model.ts`, `training/model.ts`, training/account screens, repository persistence, `route.ts`, `shootingDifficulty.ts`, `ranking.ts`, and `planner.ts`.

## Existing data

- `ShooterPerformanceProfile`: draw time, reload time, average split, generic transition time (seconds), movement speed (inches/second), magazine capacity, starting rounds and chamber flag. Defaults are 1.5 / 2 / 0.25 / 0.4 seconds and 120 inches/second. These are prototype estimates, not measurements.
- Training: user/drill ID, drill name, timestamp, starting type, nullable total time, notes and free-form `{id,label,seconds}` segments. There is no distance, firing-interval count, target difficulty, movement type, sample quality or typed segment meaning. The recording screen is still a placeholder. Labels and total times cannot reliably calibrate these factors, so training records are not automatically consumed.
- The account screen is read-only. Profiles and training records are stored as JSON in SQLite; optional profile data survives the existing `saveProfile`/`loadProfile` path without migration.
- The route evaluator consumes the five existing timing scalars. It computes split intervals as rounds minus one per target, transitions as targets minus one per position, straight-line movement, draw and reload overlap. It has no first-shot acquisition cost per target, entry/exit cost, acceleration, transition angles or hit-probability model.
- Difficulty is currently `DISTANCE_ONLY`: horizontal inches / 36. It is an index, not an empirical performance prediction.

## Added observations and provenance

`timingEvidence` annotates existing timing fields with MANUAL or MEASURED provenance, optional sample count, standard deviation in the field's units, and measurement timestamp. It does not duplicate scalar values. MEASURED requires a positive integer sample count. Existing non-default scalars without metadata remain usable **unverified profile estimates**, with LOW confidence. Unannotated scalars equal to the seeded defaults are conservatively treated as generic: old storage cannot distinguish seed values from actual measurements. Explicit evidence can certify a measurement equal to a default.

`shootingObservations` stores aggregates of firing split time at a recorded difficulty value, tagged with `DISTANCE_ONLY`, sample count, optional variability and timestamp. This supports arbitrary observed difficulty values without inventing close/medium/far cutoffs. Future difficulty models must use a separate model tag; future transition-angle observations can extend the separate transition estimator. No such measurements are synthesized now.

Example optional data on an existing performance profile:

```ts
timingEvidence: { movementSpeed: { source: 'MEASURED', sampleCount: 8, standardDeviation: 6 } },
shootingObservations: [
  { difficultyModel: 'DISTANCE_ONLY', difficulty: 3, splitTime: 0.25, sampleCount: 8, standardDeviation: 0.03 },
  { difficultyModel: 'DISTANCE_ONLY', difficulty: 12, splitTime: 0.65, sampleCount: 8, standardDeviation: 0.08 },
]
```

These values are a schema example, not populated user data. New measurement entry/recording UI is future work.

## Deterministic calculation

Use a recorded point exactly, or linear interpolation between two recorded points. Outside the curve use the existing profile's validated baseline split estimate (or the seeded generic value). A single point only applies at that point. No distance slope or extrapolation is invented. Missing-range fallback can change comparisons materially and is reported on the result.

Duplicate difficulty aggregates may overlap samples; retain the highest sample-count record, breaking ties by split time, without summing their samples. Process at most 128 records. The weighted average of per-target estimated split times, weighted by actual firing intervals, is passed to the **unchanged route evaluator** as its existing average split input. All other factors use the validated profile or explicit generic defaults. There is no second timing or reload-overlap implementation.

Personalized ranking uses evaluator total / the existing time scale, plus existing backward-movement and ammunition-margin preferences. It does not add Balanced's generic distance/difficulty/position/complexity costs, nor charge reload time twice. Scores remain preference costs, not seconds. Other styles retain their original behavior. A batch falls back to Balanced only when no candidate has usable personalized data (or caller-supplied evaluated candidates lack personalization metadata). Generic estimates remain comparable to calibrated estimates in mixed-coverage batches; results expose the fallback.

The original evaluation remains on the candidate. Personalized results expose the separately evaluator-produced time and reload metrics. Accepted routes remain normal manual routes; their existing summary still uses the baseline scalar profile, not the route-specific curve adaptation. No route fields or persistence changes were introduced.

## Confidence and validation

- LOW: generic data, manual/unverified estimates, or sparse measurements.
- MEDIUM: at least one measured scalar with two or more samples, or at least two curve points each with two or more samples; other factors may fall back.
- HIGH: every timing scalar and at least two curve points have at least five samples and known standard deviation no greater than half the mean. Route difficulty outside the curve caps HIGH at MEDIUM; routes with no applicable personalization report LOW.

These are transparent completeness heuristics, not statistical accuracy guarantees. Timestamps are validated and retained but do not decay estimates: there is no hidden clock or claim of recency weighting. Old measurements and contextual mismatch remain limitations.

Reject nonfinite/negative/malformed data, zero/invalid sample counts, invalid timestamps and implausible values rather than silently clamping measurements. Broad corruption guards: movement 1–600 in/s; draw/reload 0.05–60 s; split/transition 0.03–10 s; difficulty 0–1000; samples 1–1,000,000; standard deviation 0–2 times the mean. Invalid factors fall back independently, and warnings identify rejected data. These bounds are software guards, not calibrated population statistics.

No video/audio analysis, automatic training inference, cloud sync, geometry changes or new route format is included.
