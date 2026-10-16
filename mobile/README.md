# Mobile release candidate — 1.0.0 RC1

Feature frozen as of October 15, 2026. The native app is the demonstration target. Automated validation does not certify an installable or device-tested release.

The app includes local Matches → Stages, the stage editor and target presets, manual PATH/ENGAGE/REVIEW, document-first PDF/image/paper import, calibration and editable reconstruction overlays. Existing route, training, timing and ammunition tools remain available. Data stays in local SQLite; there is no cloud backup or sync. Save editor changes before leaving or force-closing; undo history is session-local.

Automatic diagram geometry detection is **EXPERIMENTAL**, opt-in, and tested with synthetic diagrams only. It proposes editable candidates; it does not reliably recognize vendor icons, read dimensions, or infer target size. Manual reconstruction remains available after detection errors or cancellation. Perspective/isometric references do not become metrically accurate plans. Only explicitly accepted, classified, calibrated elements are added to the editor; then use the editor's Save action. Existing stage objects and manual route data are preserved.

## Local validation

From this directory, use Node 24 (the tests use node:sqlite) and the committed lockfile:

```sh
npm ci
npm test
npm run typecheck
npx expo install --check
npx expo config --type introspect
npx expo-modules-autolinking resolve --platform apple
npx expo export --platform ios --output-dir .expo/rc-ios
```

Use `npx expo start --dev-client` with a freshly rebuilt development client. Expo Go does not contain the local Swift modules. See [release notes](docs/release-candidate.md) for actual validation results and [the single hardware checklist](docs/rc-hardware-validation.md) for unfinished checks.

## Native release configuration

Expo SDK 57 / React Native 0.86.3 / React 19.2.3; iOS minimum 16.4. Production EAS pins `macos-tahoe-26.5-xcode-26.6`, the documented SDK 57 image. React Native builds from source as configured. [SDK requirements](https://docs.expo.dev/versions/v57.0.0/) and [EAS images](https://docs.expo.dev/build-reference/infrastructure/).

Marketing version remains **1.0.0**, bundle ID `com.haroldzh24.mobile`, EAS project `87b6f255-2d2a-4bc6-ad18-578ae3e2f64b`. Production uses store distribution, remote build versions and automatic build-number increments. Do not reset the remote build number. “RC1” is a release label, not a changed Apple version string.

When ready to build: `eas build --platform ios --profile production`. Submission is a separate action: `eas submit --platform ios --profile production`. Neither action was performed during this audit. Apple membership, signing credentials, App Store Connect app ownership/record, privacy declarations and TestFlight acceptance remain unverified. Submission configuration is interactive; account/app IDs have not been invented.

Camera permission is requested only for Photograph paper. Files import uses the document picker; no broad photo-library, microphone, location or background permission was added. The document module uses PDFKit, Vision, CoreImage and UIKit; training uses AVFoundation/Vision, and optional on-device route assistance requires compatible iOS 26 hardware. Unsupported native capabilities must leave manual workflows usable.

Documents are limited to 50 MB; native image headers are limited to 80 megapixels and page derivatives to 2048 pixels. PDFs must be unlocked, readable and at most 500 pages. Originals are retained separately from geometry, including preparation failures. Recognition consumes bounded 1024-pixel rasters and can still require noticeable processing time on older phones. Memory pressure, native decoding and cancellation latency require hardware validation. Web remains experimental, including its unresolved SQLite worker/OPFS reload behavior.

[Import workflow](docs/stage-diagram-import.md) · [Experimental detection and synthetic evaluation](docs/diagram-recognition.md)
