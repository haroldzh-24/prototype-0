# Phase 8A: local video annotation

## Checkout baseline

The supplied checkout contains Phase 7A's `ShooterPerformanceProfile`, evidence validation and personalized route adapter. Training had only an untyped `TrainingRecord` and a placeholder screen. There were no drill definitions, typed observations, training contexts or calibrator to reuse. This phase adds a small `PerformanceObservation`/`calibrateObservations` bridge to those existing scalar fields and evidence guards. It does not add another profile, database or planner.

## Ownership and persistence

`TrainingRecord.videos` owns `{ session, analysis }` entries in the existing SQLite training JSON payload. Existing records without videos/context still load. Each session identifies the training record and optional drill, context, imported asset, duration, optional FPS, timestamps, analysis status and version. The UI accepts a drill/session name; there is no invented drill catalog.

Native: the user-initiated system document picker makes a temporary cache copy, which is moved into `Paths.document/training-videos`. Only a relative asset reference goes in SQLite, so a changed iOS app-container path is not baked into saved data. No upload or camera/microphone/library/background permission is requested. Playback uses Expo 57 `expo-video`; background playback and picture-in-picture are disabled. New native modules require a rebuilt development client/application binary.

Web: the file stays a browser-local object URL for the page session; metadata and analysis still persist in SQLite. After page reload, the editor explains that the original file must be reselected. Relinking requires matching filename/size and the user choosing the original recording; this is not a cryptographic identity check. Missing, inaccessible and unsupported files preserve annotations.

Version 1 is attached to both video and result. `normalizeVideo` is the future migration boundary: it currently accepts v1, revalidates events and rebuilds derived caches; unknown versions reject without rewriting saved data. Cached `eligible` flags and timings are never trusted for contribution. Training and profile updates use one SQLite transaction; failed writes roll back both. Serialized Training writes avoid overlapping transactions.

## Timeline and derivation

All event and segment coordinates are finite nonnegative milliseconds from video start, bounded by duration when available. Profile seconds and player seconds cross named conversion helpers. Frame helpers require positive FPS; the player steps by nominal frame duration when available and 50 ms otherwise. Nominal FPS is not exact indexing for variable-frame-rate media and native seeking is not guaranteed frame-exact.

Events retain source (`MANUAL`, audio, pose, vision, derived), confidence and an independent user-confirmation flag. Editing machine markers clears confirmation. Target/string labels, movement type, known movement distance and notes are optional metadata.

Pairing consumes one opener per metric and stops at stimulus/drill boundaries. It derives reaction, presentation, response-to-first-shot, split, release-to-insert, access-to-insert, release-to-reload-complete, reload-complete-to-shot, movement start/stop, position exit/entry, transition-marker-to-shot, and stimulus-to-drill-end. Repeated/missing/reversed/equal-time endpoints warn or leave partial coverage. Reload, movement, target changes and manual strings prevent across-boundary splits. The 2R2 fixture produces two splits in two strings, not a false reload-gap split.

Movement segments retain duration/type/confidence. Distance is never inferred from pixels; only explicitly supplied drill/stage distance can produce movement speed. Shot groups retain the event IDs and boundary reason. Completeness describes annotated coverage, not proof that all real-world events were found.

## Profile integration

An explicit Add to profile action converts eligible intervals to structured observations with `VIDEO_ANALYSIS`, video/session IDs, version and event provenance. Both endpoints must be manual or user-confirmed; high machine confidence alone is insufficient. Unknown-duration clips cannot contribute. Current compatible mappings:

- Holster stimulus-to-first-shot -> `drawTime` (ready starts remain diagnostic).
- Magazine release-to-reload-complete -> `reloadTime` (raw duration; the existing evaluator still owns moving-reload overlap).
- Consecutive shots with explicit same-target/string metadata -> `averageSplitTime`.
- Movement start/stop with known inches -> `movementSpeed` in inches/second.

Other subintervals remain diagnostic. A transition-marker-to-shot interval is not assumed to equal the profile's shot-to-shot transition time. No difficulty curve is fabricated from unlabeled video.

Calibration calculates deterministic means, sample counts and population standard deviation, applying existing Phase 7A guards. The explicit contribution context becomes active; DRY_FIRE, LIVE_FIRE and PRESSURE_MATCH samples are not pooled. Existing evidence confidence logic remains authoritative, so one confirmed event pair is still a low-sample estimate. Unmeasured factors retain the pre-video baseline. Repeat contribution replaces the video's samples. Saving edited/deleted evidence removes stale observations and rebuilds affected timings; it does not silently add new samples. The pre-video baseline is retained to restore a factor when its last video sample is withdrawn. Non-timing profile fields and shooting curves remain intact.

## Workflow and follow-up

Training -> create/name a session and select context/start type -> import video -> select event type -> scrub/play/pause/step -> place marker -> edit/delete/confirm -> review intervals and completeness -> save -> explicitly contribute eligible measurements. Save/discard protects closing the editor with pending changes.

No pose, skeleton, hand, weapon, recoil, audio-shot, target-recognition, cloud processing or stage reconstruction is implemented. Future detectors should propose source-tagged events through this same model, followed by review. Physical-device playback/picker/seek/restart verification, durable browser media storage and automatic detection remain follow-up work; automated tests do not certify native interactions.

API references checked before implementation: [Expo 57](https://docs.expo.dev/versions/v57.0.0/), [Video](https://docs.expo.dev/versions/v57.0.0/sdk/video/), [DocumentPicker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/), [FileSystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/).

## Changed files

- `mobile/src/app/training.tsx`
- `mobile/src/app/account.tsx`
- `mobile/src/training/model.ts`
- `mobile/src/training/videoModel.ts`
- `mobile/src/training/videoAnalysis.ts`
- `mobile/src/training/observations.ts`
- `mobile/src/training/VideoAnalysisEditor.tsx`
- `mobile/src/training/videoAssets.ts`
- `mobile/src/training/videoAssets.web.ts`
- `mobile/src/training/videoAnalysis.md`
- `mobile/src/profile/model.ts`
- `mobile/src/storage/repository.ts`
- `mobile/tests/videoAnalysis.test.cjs`
- `mobile/app.json`
- `mobile/package.json`
- `mobile/package-lock.json`
- `bugs.md`
- `features.md`
- `changelog.md`

Verification: TypeScript once, full suite once; 231 passing tests including 32 new video tests. Native interaction remains unverified; no browser automation or export was run.
