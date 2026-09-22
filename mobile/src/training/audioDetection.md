# Phase 8B local audio suggestions

The inspected Expo 57 stack includes expo-video, document-picker and file-system. Video exposes playback/tracks, not offline decoded PCM. Native iOS must not use browser AudioContext. A small local Expo module (`modules/training-audio`) uses Apple's AVAssetReader and AVAssetReaderTrackOutput. Expo autolinking discovers it without an npm dependency or app-manifest change. Build a new iOS client; Expo Go, old clients, Android and web report extraction unavailable and retain manual editing. No microphone/media-library permission, recording, upload or cloud service is involved.

References consulted: [Expo 57](https://docs.expo.dev/versions/v57.0.0/), [Video API](https://docs.expo.dev/versions/v57.0.0/sdk/video/), [local modules](https://docs.expo.dev/modules/get-started/), [module API](https://docs.expo.dev/modules/module-api/), [AVAssetReaderTrackOutput](https://developer.apple.com/documentation/avfoundation/avassetreadertrackoutput).

## Extraction and time

Decode the first audio track into mono float PCM at 16 kHz on a dedicated native queue, capped at the first 60 seconds. Multiple tracks and truncation warn. PCM buffers are placed by their presentation timestamps relative to video zero, preserving track delay and packet gaps as silence. Negative priming samples are trimmed. Native sample-zero offset is therefore explicitly 0; the detector also supports fractional nonzero offsets. Placement precision is one sample (0.0625 ms); this is coordinate precision, not guaranteed acoustic onset accuracy or frame-accurate player seeking.

Only one native job runs at a time. Cancellation is checked between decoded buffers; JS also checks before extraction returns and between feature batches. Closing the editor aborts and discards pending results. Save/contribution waits for analysis; marker editing stays available. Extraction errors leave the previous run and events intact. A queued native call cancelled before it starts can still finish its bounded decode, but its result is discarded. Missing, unsupported, invalid-duration and failed decode states surface as recoverable messages.

The bounded native PCM buffer is at most 960,000 floats (3.84 MB), plus bridge/JS representation overhead. PCM is not stored in component state or SQLite. No temporary audio files are created. Feature processing yields every 80 frames and releases its arrays when finished.

## Deterministic detector

`AUDIO_ANALYSIS_CONFIG` centralizes sample rate, duration, 10 ms windows / 5 ms hops, thresholds, tone frequencies, limits and deduplication. Frames contain video-start milliseconds, RMS, peak and its sample time, rise relative to a 150 ms rolling median background, crest factor, strongest Goertzel tone and normalized tone energy. Tonal scans cover 1–5 kHz in 50 Hz steps, not one assumed timer frequency.

Beep candidates require 60–1200 ms sustained tonal energy, stable nearby frequency and onset above background. All plausible beeps remain candidates; multiple stimuli warn. Beep onset accuracy is approximately a window, depending on the envelope and noise.

Shot candidates require peak, relative energy rise, sharp local onset, crest factor and decay within 35 ms. Sustained tones and intervals around detected beeps are excluded. Shot timestamps use the peak sample within the onset frame. Confidence is a heuristic HIGH/MEDIUM rating, not a probability or shooter identity. Clipping, compression, automatic gain, speech, impacts, long echoes and adjacent shooters can produce misses/false positives. No detections is valid, particularly in dry fire.

A 65 ms refractory window retains the first impulse and suppresses close echo/ringing peaks. This preserves tested 80 ms consecutive shots. Shots closer than 65 ms may merge, and echoes later than 65 ms can survive: neither can be reliably disambiguated with this heuristic. Manual/confirmed SHOT or FIRST_SHOT within 35 ms suppresses a SHOT candidate; STIMULUS matches only STIMULUS. Matches are recorded. Up to 200 earliest suggestions are retained with a limit warning.

## Review, derivation and persistence

Explicit Analyze Audio starts extraction. Amber AUDIO SUGGESTION rows show type/source/confidence; preview seeks to the stored timestamp, edit changes type/time and revokes detector confirmation, confirm uses `confirmEvent`, delete rejects. There is no automatic confirmation or background calibration. To calibrate splits, the user must still label same-target evidence.

The existing `analyzeVideo` engine derives a first-shot role from the earliest trusted shot after a trusted stimulus, retaining SHOT and FIRST_SHOT as distinct event types. It also derives string duration alongside splits and existing total-drill intervals. Unconfirmed SHOT/STIMULUS suggestions do not disrupt reviewed timings. Existing explicit FIRST_SHOT suggestions can still display provisional, ineligible intervals. Observation normalization re-derives eligibility, and the existing explicit profile contribution action remains required; this detector never calls profile APIs.

Optional `audioRun` metadata extends analysis version 1 compatibly. It includes detector version, timestamp, complete versioned config, analyzed duration/offset, bounded original candidates with confidence/features, warnings and deduplication matches. Each generated marker also retains original detector provenance. Diagnostic candidates describe the last run, not current approval state; timeline events are authoritative after review/deletion. Save/reopen and normalization validate and preserve metadata without PCM/features. Unknown detector/config versions reject rather than silently migrate. Reruns replace unconfirmed audio events only; confirmed/manual/other-source events survive. Rejected unconfirmed candidates can return on a later explicit rerun.

## Device verification still required

Windows cannot compile or run AVFoundation. TypeScript/synthetic tests and autolinking inspection do not certify native decode. Rebuild on macOS/EAS, then verify imported MP4/MOV AAC, stereo downmix, delayed audio tracks, fractional packet timestamps, silent/no-track/corrupt assets, unsupported codecs, clipping, long clips, cancel/close, native memory/latency, real timer frequencies, rapid shots/echoes and review/save/reopen/profile contribution on iPhone. Playback seeking remains subject to Expo/native decoder precision. No pose, weapon tracking, vision, route comparison or cloud processing is included.
