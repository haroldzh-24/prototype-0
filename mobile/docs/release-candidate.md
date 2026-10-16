# 1.0.0 RC1 release notes — October 15, 2026

Feature-frozen candidate for a local iPhone demonstration. Stage editing, PATH/ENGAGE/REVIEW, document import/manual reconstruction, SQLite and existing training/legacy analysis are retained. No schema reset, route recommendation feature or recognition expansion was introduced.

## Release hardening

- Detection is explicitly **EXPERIMENTAL** and opt-in. Failures explain the manual fallback and cannot commit proposals automatically. Three UI callback regressions cover oversized, unsupported and interrupted raster errors, retained manual overlays, retry/edit availability and absence of stage writes.
- Native decoding validates image header dimensions before thumbnail creation (maximum 80 megapixels), finite PDF page bounds and finite/nonempty perspective-correction output. Invalid preparation preserves the already imported original reference. These are defensive code fixes, not evidence of native runtime testing.
- The import modal has keyboard avoidance and a flex-bounded scroll area for small iPhones. The profile's incomplete cloud-sync placeholder now states that storage is local.
- Expo SDK 57 compatibility patches are aligned. Production EAS explicitly uses store distribution and pins `macos-tahoe-26.5-xcode-26.6`. Version 1.0.0, bundle ID, project ID and remote automatic build-number increments remain intact. [Expo's current image reference](https://docs.expo.dev/build-reference/infrastructure/) supports this choice.

## Automated validation

Final validation after compatibility/transitive updates:

| Check | Result |
| --- | --- |
| Full test suite | **786/786 passed**, 0 failed/skipped; 783 baseline + 3 recovery cases |
| TypeScript | Passed |
| Expo SDK compatibility | Dependencies up to date |
| Installed dependency tree | npm ls passed |
| Introspected Expo config / Apple autolinking | Passed; local diagram, route and training modules resolved |
| iOS Hermes export | Passed; 4.7 MB bytecode bundle in .expo/rc-ios |
| git diff --check | Passed |
| Dependency security audit | Not clean: 30 advisories remain; see below |
| Swift/native build, TestFlight, physical iPhone | **Not performed** |

Logs are under .expo/rc-tests.log, rc-typecheck.log, rc-sdk-check.log, rc-config.log, rc-autolinking.log and rc-ios.log (generated, ignored). The full suite includes SQLite close/reopen, additive reconstruction, route/engagement persistence, undo/redo and UI callback regressions. These are automated checks, not force-close or gesture testing on iOS. A Hermes export validates JavaScript, not Swift compilation, code signing, app launch or device memory.

RC validation was repeated on October 15 against the existing working tree: 786 tests passed with no failures, cancellations or skips; TypeScript and dependency compatibility passed. The sandbox initially blocked the online SDK check and Hermes executable; both were rerun with approved access. No feature development or recognition expansion was needed for this verification.

Configuration inspection resolves the DiagramImport and existing local native modules, camera explanation, app identity and assets. No new permission was added. Dev-client configuration includes development local-network access; production signing, entitlement/privacy validation and the final archive remain build-time checks. Files import requires no broad photo-library permission; camera is user initiated.

## Dependency advisory review

The targeted transitive updates removed the critical `shell-quote` advisory and patchable `http-cache-semantics`/`brace-expansion` advisories without changing SDK. npm still reports **30 advisories (18 high, 12 moderate)** through the SDK/tooling tree, including `braces`, `node-forge`, `uuid` and runtime `decode-uri-component` via router query parsing. A clean security audit is not claimed. npm proposes incompatible SDK upgrades/downgrades for these; no forced fix or untested override was applied during the feature freeze. Review upstream fixes and untrusted deep-link exposure before wider distribution. This is a remaining release risk, separate from a passed test suite and device qualification.

## Remaining release gates and limitations

A signed EAS/Xcode build and physical installation have **not** been performed. Apple signing/account access, App Store Connect record/privacy declarations, TestFlight upload/acceptance and fresh/upgrade install remain unverified. Use the [single hardware checklist](rc-hardware-validation.md); no box has been marked complete. Persistence after a real process termination, crowded gestures/pinch interruptions, small-screen safe areas/keyboards, VoiceOver, native media decoding, image orientation, memory and background cancellation remain important device checks.

Automatic geometry detection has synthetic-only evaluation, including two unknown false candidates in an annotation fixture. No real printout or stage-builder recognition accuracy is established. Semantic templates, OCR/dimension reading, automatic units/projection inference and Android preparation are unsupported/deferred. Paper symbols do not establish physical scale; reconstruction requires explicit calibration/classification/acceptance. Manual reconstruction remains available if detection is unsupported or fails. Existing objects and manual routes are not overwritten.

Source files are limited to 50 MB, PDFs to 500 unlocked/readable pages, native source images to 80 megapixels, derivatives to 2048 pixels and recognition rasters to 1024 pixels. Limits reduce work but do not prove safe memory usage for all native codecs/PDFs. Native synchronous decoder cancellation is best effort. Missing files and low-storage recovery require device checks. Local data has no cloud backup; unsaved edits/undo history do not survive app termination. Experimental web retains its unresolved SQLite worker/OPFS reload issue and is not the RC demonstration target.

September 9–10 device checks and September 9 dense-snapping assessment are over one month overdue and remain open in the consolidated checklist. Older reports retain historical test counts and are superseded by this release record.

## Files changed for RC preparation

- Runtime: `src/diagramImport/DiagramImportScreen.tsx`, `modules/diagram-import/ios/DiagramImportModule.swift`, `src/app/account.tsx`.
- Compatibility/build: `package.json`, `package-lock.json`, `eas.json`.
- Tests: `tests/ui-reorganization.test.cjs` (three recovery cases; experimental button label updated).
- Documentation: `README.md`, this file, `docs/rc-hardware-validation.md`, `docs/ios-device-verification.md`, `docs/route-planner-iphone-checklist.md`, `docs/stage-diagram-import.md`, `docs/diagram-recognition.md`, root `bugs.md`, `features.md`, `changelog.md`.

The workspace already contained route/import/recognition changes before this release audit; those were preserved. This list identifies the RC preparation edits, not every uncommitted file.
