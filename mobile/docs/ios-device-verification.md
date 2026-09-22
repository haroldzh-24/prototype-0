# Phase 9A iOS verification

Status: **physical-device checks below have not been run**. Rebuild the iOS client: native analysis now requires synchronous prepare/release, cancellation hooks and transformed display-size metadata. Existing clients fail recoverably and retain manual editing. Record device model, iOS version, app build, media dimensions/orientation/codec and outcome for each failure.

## Device checklist

- [ ] Fresh launch, force-quit/relaunch, background/foreground; stored stages, sessions and profile remain readable.
- [ ] Stage: create, edit, save/reopen; double-tap Save; leave while saving; confirm no duplicate stage or navigation.
- [ ] Stage: auto-discover positions, edit geometry and verify discovery invalidation; generate AI plans; preview, return, accept and reopen a route.
- [ ] Video: import MOV/MP4 from Files/iCloud; play, seek and step; rotate/mirror source recordings; verify fractional timestamps against visible events. Delete the original source after import and reopen the durable copy.
- [ ] Missing/corrupt media: retain annotations, explain playback failure, retry/relink and leave. Cancel the picker, navigate away during import, discard an unsaved relink and test low-storage import failure.
- [ ] Audio: no track, unsupported/corrupt audio, short clip, delayed audio track, repeated runs, cancellation immediately and mid-decode, then retry. Verify progress and alignment with playback; inspect first-60-second truncation.
- [ ] Pose: portrait/landscape/mirrored/VFR video, no person, intermittent/multiple people, occlusion and long clip; verify overlay orientation, gaps, timestamps and bounded sample count.
- [ ] Close-up: draw boxes at all displayed video edges, including letterboxing; verify transformed portrait dimensions, hand/object tracking, tracking loss, camera motion and frame-size changes. No NaN or out-of-frame region reaches Vision.
- [ ] Lifecycle: rapidly tap different analysis buttons, cancel each detector, background during extraction, close/discard during extraction and reopen immediately. No simultaneous decoding, stale result application or permanently busy state; retry once the prior native job settles.
- [ ] Fusion: confirm/edit/reject evidence; rerun each detector and verify affected suggestions refresh while authoritative markers remain intact.
- [ ] Save/reopen: retain analysis, previews and confirmed markers; cancel/discard must not persist partial extraction. Repeat under memory pressure and low storage.
- [ ] Comparison: select saved plan, suggest mapping, preview route/timeline, accept individual/all, edit/reject; save/reopen. Edit confirmed markers and verify stale suggestions require regeneration. Live route edits must retain historical geometry.
- [ ] Profile: contribute reviewed observations, rebuild, relaunch and verify values persist. Edit/remove contributed evidence and verify its old contribution is withdrawn. Exercise a failed write and verify no partial profile/analysis update.
- [ ] Recovery: retry storage/media errors, continue manual annotation and leave the screen. Corrupt/unsupported saved records must remain unchanged and readable healthy sessions must remain listed.

## Code audit and changes

Audit started on branch `ai-route-planner` with the uncommitted Phase 8F-B work intact. Reviewed Expo configuration, both module package/config/podspec files, all three Swift modules, extraction adapters, player/import lifecycle, StageBuilder navigation, repository transactions and normalization, detector bounds and stale state.

- Registration: Expo autolinking resolves TrainingAudioModule, TrainingPoseModule and TrainingCloseUpModule to the expected local pods. Podspecs target iOS 16.4 and include the Swift sources/frameworks. No permission or app-config change was needed. The [Expo module lifecycle API](https://docs.expo.dev/modules/module-api/) and the installed SDK declarations were checked for background/destroy hooks. Swift/Xcode are unavailable here; resolution does not certify compilation.
- Audio: fixed cancellation arriving before worker registration by reserving synchronously. Reader cancellation, background/destroy cleanup and progress are now exposed. PCM stays bounded to mono 16 kHz / 60 seconds; packet presentation timestamps preserve video-start alignment, delayed tracks and silence gaps. Existing no-track/codec/error paths remain recoverable.
- Vision: added prepared-job release, job-owned cleanup, background/destroy cancellation, generator cancellation and checks after frame decode. Close-up tracking drops its observation/registration reference on frame-size changes and validates finite tracked rectangles. Existing preferred-transform application, actual returned frame timestamps, confidence gates, person/hand limits and autorelease pools remain.
- Display geometry: the installed expo-video iOS `Records/Tracks.swift` returns `naturalSize`. Close-up selection now obtains the preferred-transform display rectangle from native metadata, instead of treating raw portrait track dimensions as displayed dimensions. Unsupported clients disable region selection rather than guessing. No video frame extraction is needed for this metadata lookup.
- JS lifecycle: shared native extraction reservation blocks cross-detector/double-tap runs and remains held until native work settles. Abort discards late results. Synchronous operation generations guard imports, saves, relinks and snapshot linking against repeated taps and unmounted completions. App backgrounding aborts analysis. Player initialization has a local recovery boundary; invalid playback times are ignored. Unsaved imported relinks are cleaned up without deleting a successfully persisted media reference.
- Data safety: timeline inputs are bounded before sort/fusion; native URI/region guards reject malformed requests; overlay geometry handles unavailable dimensions. Training listing reports damaged rows while preserving their bytes and healthy legacy sessions. Stage nested geometry and malformed profile structure fail before rendering. Unknown video-level payload fields are omitted on normalization; existing audio/pose/close-up validators retain bounded metadata rather than PCM/raw frames.
- SQLite: training/profile writes already shared a queue and rollback. Stage writes now join that queue, preventing an unrelated stage write from being rolled back inside a failed training transaction. No schema migration or automatic reset of saved data was introduced.
- Stale-state audit: geometry-key discovery invalidation, historical route snapshots, trusted timeline mapping fingerprints, detector-run fusion regeneration and withdrawal of changed video observations remain in place. Existing regression coverage exercises them. Dirty-video serialization is memoized by video identity instead of repeated on progress renders.

## Remaining limits

No device, simulator, Swift compiler or full native build was run. AVFoundation codec behavior, cancellation latency inside an in-flight synchronous image/Vision request, transformed display selection, physical memory pressure and background transitions still require the checklist. Native cancellation is best effort; retry may wait for the current request to settle. Damaged historical sessions are preserved and reported but cannot be automatically repaired. Browser media remains session-only; its existing web-storage teardown investigation remains open. No dated unresolved tracker item exceeds one month as of 2026-09-22; undated legacy ideas cannot be aged reliably.

## Automated result

TypeScript passed once. The full suite ran once: **447 tests, 444 passed, 3 failed**. All 19 new hardening tests passed. The failures were existing pose/close-up adapter mocks without the new `release` method; those mocks were corrected and now assert release, but were not rerun because this phase allowed only one suite run. Final mock verification remains pending. No production TypeScript changed after its successful check.

## Files changed in Phase 9A

- Root trackers: `bugs.md`, `features.md`, `changelog.md`.
- Native: `mobile/modules/training-audio/ios/TrainingAudioModule.swift`; `mobile/modules/training-pose/ios/TrainingPoseModule.swift`, `TrainingCloseUpModule.swift`.
- Screens/storage: `mobile/src/app/training.tsx`, `mobile/src/editor/StageBuilder.tsx`, `mobile/src/storage/repository.ts`.
- Under `mobile/src/training/`: `ExecutionComparisonReview.tsx`, `VideoAnalysisEditor.tsx`, `MediaPlayerBoundary.tsx`, `nativeAnalysisJob.ts`, `operationGate.ts`, `videoDisplaySize.ts`, `videoDisplaySize.web.ts`, `extractAnalysisAudio.ts`, `extractAnalysisAudio.web.ts`, `extractPose.ts`, `extractCloseUp.ts`, `videoAssets.ts`, `videoAnalysis.ts`, `videoModel.ts`, `poseModel.ts`, `closeUp.ts`.
- Tests: `mobile/tests/deviceHardening.test.cjs`, `mobile/tests/poseDetection.test.cjs`, `mobile/tests/closeUp.test.cjs`.
- Documentation: `mobile/docs/ios-device-verification.md`.

Other dirty files from Phase 8F-B were already present at audit start and remain intact.
