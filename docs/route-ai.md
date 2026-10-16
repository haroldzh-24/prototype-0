# On-device Route AI — October 5, 2026

## Architecture and ownership

ROUTE → ASK → Swift Foundation Models guided decision → TypeScript validation/reference resolution → `executeRouteAssistantCommand` → current facts/preview/clarification → local model formats facts → sheet. The interpreter has no document, storage, generic patch, geometry-solving or mutation API. Existing RouteSolver and RouteAssistant remain authoritative. No schema or persistence changes were made. Chat is memory-only, bounded to 24 messages with 1,200 characters per response and 600 per user request.

The local Expo module lives in `mobile/modules/route-ai` and follows the existing local training modules' autolinking structure. Its six asynchronous methods are `getAvailability`, `createSession`, `interpret`, `format`, `resetSession`, and `cancelGeneration`. React sees only serializable data through `RouteAIAdapter`. Swift holds sessions in an actor, serializes generation, limits bridge payloads, and retains only the active session. Guided generation uses `@Generable` and an `@Guide(.anyOf(...))` intent constraint. Formatting is a second model call with authoritative results and an instruction prohibiting arithmetic and invented facts.

## Availability and offline guarantee

`SystemLanguageModel.default.availability` is checked before session creation and each generation. `.available` → AVAILABLE; `.deviceNotEligible` → UNSUPPORTED_DEVICE; `.appleIntelligenceNotEnabled` → APPLE_INTELLIGENCE_NOT_ENABLED; `.modelNotReady` → MODEL_NOT_READY; unknown reasons → UNKNOWN. Older than iOS 26 → UNSUPPORTED_OS. Missing native module, web, and Android → NATIVE_UNAVAILABLE. The sheet explains the state and offers Check Again; normal route tools continue working.

Only `SystemLanguageModel.default` is instantiated. There are no HTTP clients, fetch calls, remote endpoints, API keys, cloud inference providers, permission requests, or network fallback in Route AI. Tests scan new production TypeScript and Swift sources for network primitives and test-mock imports. Development tooling/browser smoke uses localhost for bundling and browser control; these are not inference dependencies.

## Session lifecycle and context

Each controller has a unique instance identity and monotonic request IDs. Each request snapshots its stage ID and exact RouteAssistant revision, uses a unique native session ID, and owns an AbortController. Every async boundary verifies ownership, stage and exact revision before committing. A revision is a canonical full-content fingerprint, not a short hash. Only a short revision hint is sent to the model.

A fresh native session is created per request only after availability is confirmed, then reset on completion/error/cancellation. Clarification resumes the validated decision without interpreting again, using fresh execution ownership/session. The native actor serializes model generation with a retained Task and token; reset/cancel cancels the matching task and removes the session. Its serial gate remains held until that task exits, so a rapid retry may report SESSION_UNAVAILABLE rather than overlap two generations. All generation failures invalidate the session. Cancellation responsiveness and both compiler error-mapping paths still require an EAS build/device test.

Interpretation receives system instructions, compact current route metadata, at most four recent conversational messages (two turns), and the current request. UI messages are separate and capped at 24. Recent text is capped at 600 characters per message and cleared on context invalidation. The bridge payload is capped at 9,000 UTF-8 bytes by dropping oldest recent messages, then excess waypoint labels; total waypointCount remains accurate. Native rejects payloads over 10,000 bytes. Formatting receives only the current trusted tool result, bounded at 4,000 UTF-8 bytes; larger results explicitly ask for a narrower question. Route facts never come from transcript. Fresh sessions prevent native context growth; context-size and serious generation errors get a reset/recreate path through Retry.

## Decision schema, references and units

Supported intents: QUERY_ROUTE_SUMMARY, QUERY_DISTANCE, QUERY_WAYPOINTS, QUERY_WAYPOINT, QUERY_EXPLANATION, QUERY_BLOCKERS, QUERY_AREAS, QUERY_LONGEST_SEGMENT, QUERY_COMPARISON, MOVE_WAYPOINT, ADD_WAYPOINT, DELETE_WAYPOINT, REORDER_WAYPOINT, REPLAN, REPLAN_AVOIDING_AREA, UNDO, NEED_CLARIFICATION.

Optional fields: waypointReference, secondWaypointReference, alternativeNumber, areaReference, absoluteXInches, absoluteYInches, distanceValue, distanceUnit, direction, clarificationText, and explicit rectangle bounds areaMinXInches/areaMinYInches/areaMaxXInches/areaMaxYInches. Runtime validation rejects unknown fields/intents, nonfinite numbers and coerced numeric strings. Direct model-computed movement deltas are not accepted. New waypoint and avoidance IDs are application-generated.

Reference resolution supports explicit IDs, labels, numbered waypoints, written ordinals through tenth, last waypoint and selected-point references. Duplicate labels or multiple candidates produce choices. “Near Wall 4” uses the fourth wall in stage object order and deterministic explanation links, rather than an arbitrary proximity threshold. If several waypoints explain a detour around the same wall, the user chooses. Missing selected IDs do not silently select another point.

Distance factors are TypeScript-owned: yards × 36, feet × 12, inches × 1. Geometry remains inches. Movement left/right changes stage X; up/down changes stage Y with up = negative Y. These follow the upper-left origin and are independent of zoom/pan. Forward/back and up-stage/down-stage ask for clarification because the application has no shooter-facing or stage-facing convention. Absolute positions and rectangle bounds must be explicitly supplied in inches; model arithmetic is forbidden.

## Queries, comparisons and edits

Distance/count/coordinates/areas/explanations/blockers/segments/comparisons query current RouteAssistant facts. Longest segment is selected by comparing existing EXPLAIN_SEGMENT query results; geometry calculations are not duplicated. Blockers query the direct Start-to-final-waypoint segment. PLAN passes solver evidence to the host, where an exact solver-input fingerprint prevents using obsolete alternatives. Alternative numbers are 1-based and refer to PLAN's Alternative 1/2; no current alternatives produces clarification rather than invented routes.

All edit decisions become existing typed commands. Add uses explicit coordinates and nearest-segment placement. Reorder is “before”; unsupported or incomplete requests clarify. Avoidance accepts explicit rectangular bounds or a configured polygon, constructed in TS and validated by the assistant. A configured area is still required: avoiding it may be impossible, and validation/solver failure is shown rather than silently removing that requirement.

## Preview, focus, acceptance and Save

Mutations remain interpret -> validate -> preview -> explicit Apply/Cancel. All new sends, including read-only questions, are blocked while a preview exists. Recalculate intentionally dismisses the old proposal before sending the original question through the same pipeline. Invalid/stale ghosts are hidden. View on Stage preserves a completed preview for inspection; ordinary closing cancels unfinished work.

StageViewport continues to show the current cyan route and the exact active preview as an amber dashed route. Highlight geometry and temporary avoidance remain ephemeral. Read-only highlights expire after 15 seconds. Stage changes, BUILD and backgrounding clear previews; manual route edits hide stale ghosts and leave a stale proposal available for Recalculate/Dismiss.

Apply has its own request ID and APPLYING state. Ownership and exact revision are checked after yielding and immediately before the host callback. Same-turn double taps are rejected. The host still accepts atomically against the latest history reference, validates current revision/original route/geometry, records normal document history, and requires explicit Save. An in-memory WeakSet recognizes deeply frozen previews actually issued by the executor: genuine REPLAN/REPLAN_AVOIDING_AREA previews reuse their validated solve. Deserialized/edited previews and all history-dependent or other commands are re-executed, preserving validation and undo safeguards. Nothing auto-applies or writes storage.

The fixed composer uses the existing keyboard-aware EditorSheet footer. Blank sends are rejected, input wraps with a maximum height, and typed Send clears the composer immediately. Busy/preview/unavailable states disable submission. Quick prompts call the identical controller.send pipeline. Stable message IDs tie the pending response to its request; completion/clarification replaces that placeholder, and cancellation/error marks it without removing completed conversation messages.

## Errors and performance

One authoritative typed lifecycle drives the sheet: IDLE, INTERPRETING, RESOLVING_REFERENCE, EXECUTING_QUERY, SOLVING, FORMATTING_RESPONSE, WAITING_FOR_CLARIFICATION, PREVIEW_READY, APPLYING, ERROR, CANCELLED. The compatibility phase string is derived by transition(), never an independent busy flag. UI labels are Understanding..., Checking route..., Replanning..., Writing response..., Applying...; no fake progress bars. CANCEL is available throughout busy work. TRY AGAIN is available for recoverable errors; unavailable states offer CHECK AGAIN, and technical information stays in Details.

One request owns assistant state. Duplicate Send, typed/quick-prompt races, duplicate clarification and double Apply are ignored. Cancellation invalidates ownership immediately, aborts pending waits, requests native Task cancellation/session reset, clears progress, and discards late results. send/choose return structured complete/preview/clarification/ignored/cancelled/stale/error outcomes. Failed formatting can preserve a fully validated proposal with a deterministic status; timeout/cancellation/staleness discards unfinished proposals. Current route history is never partially changed.

Timeout defaults are 60 seconds for session preparation and interpretation, 45 seconds for formatting, and 120 seconds for assistant execution/Apply scheduling. Timers are cleared on every exit. Timeouts show ROUTE AI TOOK TOO LONG with TRY AGAIN and release ownership/session; tests inject shorter limits. Time spent in a synchronous JS call is checked again after return: timers cannot preempt a busy JS thread.

The replaceable AssistantExecutor accepts immutable context, typed command, history and AbortSignal. The default executor yields 32 ms before every query/mutation/validation/comparison, letting the status render before expensive work. No ASK solve is called from render or an effect. **RouteSolver and route validation still run synchronously on the JS thread. This is scheduled asynchronous execution, not multithreading; interaction may still pause during a large solve, and Cancel cannot interrupt the CPU call itself.** Native interpretation/formatting use Swift async tasks and Foundation Models outside the JS solver, but exact OS scheduling/model performance is unverified. A worker/native executor can later replace this boundary without changing request ownership or route algorithms.

The assistant solver cache is memory-only, LRU, four entries, keyed by stage identity + exact route revision + canonical full solver inputs including temporary region IDs/polygons. Anonymous contexts bypass caching. Stage/revision/avoidance changes cannot hit old results. Returned values are cloned; cached data is frozen. Cached solves report zero new solve time. Genuine replan Apply avoids a second solve through the trusted frozen preview identity check. No SQLite changes.

Development diagnostics include interpretation, reference resolution, RouteAssistant CPU execution, solver, formatting and total request milliseconds, plus cancelled/stale counters. The controller exposes diagnostics.last (including error/cancel elapsed boundary times); cache exposes hits/misses. Timing source identifies mock, web or on-device; mock/browser data never certifies native performance. Sheet timing is gated by __DEV__, absent from normal production UI. Cancel does not erase completed messages.

Closing ASK cancels unfinished work. BUILD, stage identity change and unmount invalidate work; exact stage/revision checks also reject late results independently of effects. AppState inactive/background cancels generation/waits and clears proposals. Resume starts no work and never auto-applies. Manual edits invalidate active requests and clarification, while completed stale proposals offer controlled recalculation.

## Validation and test isolation

Verification commands from mobile: npm.cmd run typecheck; npm.cmd test; npx.cmd expo export --platform web --output-dir .expo/route-ai-hardening-export; node tests/route-ai-browser.cjs. Final verification: TypeScript passed; 711/711 tests passed (all original 682 retained plus 29 new tests); web export passed; 21 browser checks passed at all three widths; production export excludes mock/smoke strings. Swift was not compiled and native performance was not measured. All original 682 tests are retained; assertions expecting synchronous Apply/session IDs were updated to the new architecture. New tests cover IDs, duplicates, late results, cancellation at model/executor/formatter boundaries, stages/revisions, timeouts/retry, session reset, bounded context including multibyte text, preview policy, Apply races, lifecycle invalidation, cache correctness and avoiding duplicate Apply solving.

Production web/Android use unavailableAdapter, never a mock. The production native wrapper has no mock imports or feature toggles; source guard tests and a production-export scan enforce this. The isolated browser entry imports mocks only for tests and bundles the actual sheet/controller/history/viewport without SQLite. Its host now exercises the same guarded async Apply API as StageBuilder. Browser tests cover 390x844, 375x667 and 320x568: composer visibility/no horizontal overflow, query, clarification, ghost/zoom, cancel, apply/dirty/explicit Save, undo, stale recalculation, unavailability, immediate composer clear, disabled busy input, duplicate prevention and late-result cancellation. Browser keyboard simulation does not certify physical iOS keyboard or Dynamic Type.

Artifacts: mobile/.expo/route-ai-hardening-tests.txt, route-ai-browser-report.json, route-ai-*.png, route-ai-hardening-export, route-ai-autolinking.json (CLI diagnostic output), route-ai-app-config.json. All are ignored local artifacts.

## Exact native rebuild and device checklist

Windows cannot compile/test Swift Foundation Models. On a Mac:

1. Use Xcode 26.4+ (Expo SDK 57 requirement), Node 22.13+ and the existing project's dependencies. With Xcode 27, the conditional Swift 6.4 error mapping handles `LanguageModelError` on iOS 27; Xcode 26 retains the iOS 26 `GenerationError` cases. Both build paths need verification. The new pod uses Swift 5 language mode with these modern compilers.
2. From `mobile`, run `npm ci`, then `npx expo prebuild --platform ios` (do not use `--clean` on an existing customized native project).
3. Run `npx pod-install`. Confirm local RouteAI autolinking and FoundationModels weak linkage in the Pods build. No new runtime permissions/entitlements or credentials are needed.
4. Run `npx expo run:ios --device`, select a supported physical Apple Intelligence iPhone on iOS 26+, sign with the existing app team, and install the rebuilt development client. Expo Go does not contain this module. Alternatively open the generated `.xcworkspace` in Xcode and build to the device.
5. Enable Apple Intelligence and wait for its model to finish downloading. Open a stage with Start and a route, switch to ROUTE, tap ASK. Repeat once in airplane mode after models are ready.
6. Test the seven requested factual questions, especially waypoint reasons/wall names, required areas, longest segment and Alternative 2 after PLAN generation. Compare facts with deterministic route metrics.
7. Test move by yards/feet/inches, absolute add, delete, reorder, replan and an explicit avoid rectangle. Check preview/current paths independently of zoom/pan. Verify ambiguous references require a choice and forward/back clarifies.
8. Test Cancel, Apply, UNSAVED, normal document undo/redo, assistant undo, stale recalculation after manual changes, Save/reopen and stage changes while generation is running. Confirm no old session result reaches another stage.
9. Verify unsupported iOS/device, Apple Intelligence off, model downloading, unsupported language, refusal, large-context recovery, missing native module and background/navigation during a request. Route tools must keep working.
10. Test keyboard, safe areas, Dynamic Type, VoiceOver, 44-point targets and sheet-to-canvas inspection on a small phone. Record real interpretation/format/assistant/solver latency and inspect memory during repeated requests. No native timings are available from Windows.

## Known limits

No streaming, persistent chat, cloud fallback, orientation inference or new canvas avoidance-region drawing. Context lists the first 24 waypoints; explicit numbering resolves beyond that deterministically, but very large requests/fact sets may need narrower questions. The model starts a fresh native transcript each turn with up to two recent turns supplied as bounded data; unresolved pronouns still clarify. Near-wall resolution relies on semantic detour evidence. Model-formatted prose can still be imperfect; displayed preview metrics and validation are deterministic. Native compilation, actual guided-generation accuracy, availability transitions, real model errors, gesture/keyboard behavior and physical-device latency remain unverified until the checklist is run.

## Framework references checked for this implementation

- [Expo SDK 57 reference and supported build tools](https://docs.expo.dev/versions/v57.0.0/)
- [Expo Modules async API](https://docs.expo.dev/modules/module-api/)
- [Apple system-model availability and sessions](https://developer.apple.com/documentation/FoundationModels/generating-content-and-performing-tasks-with-foundation-models)
- [Apple guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation)
- [Apple legacy generation errors and Xcode 27 migration](https://developer.apple.com/documentation/foundationmodels/languagemodelsession/generationerror)
- [Apple current language-model errors](https://developer.apple.com/documentation/foundationmodels/languagemodelerror)
- [Swift 6.4 / Xcode 27 compatibility](https://docs.swift.org/latest/documentation/the-swift-programming-language/compatibility/)

## File inventory for this change

This hardening pass changes:

- mobile/src/planning/routeAI/controller.ts, types.ts, nativeAdapter.ts, RouteAISheet.tsx
- mobile/src/editor/StageBuilder.tsx
- mobile/src/planning/routeAssistant/context.ts, types.ts, executor.ts, preview.ts
- mobile/src/planning/routeAssistant/solverCache.ts (new)
- mobile/modules/route-ai/ios/RouteAIModule.swift
- mobile/tests/routeAI.test.cjs, ui-reorganization.test.cjs, route-ai-browser-entry.tsx, route-ai-browser.cjs
- docs/route-ai.md, bugs.md, features.md, changelog.md

Pre-existing uncommitted solver/assistant/UI work is preserved. No route algorithms, UI redesign, cloud inference, SQLite schema, app permissions, commits or pushes were added.

## Windows / EAS readiness and next commands

Static inspection: public Expo config resolves; local Apple autolinking resolves RouteAI.podspec and RouteAIModule. Existing development/preview profiles use internal distribution; existing project ID and bundle identifier are present. No config change was necessary. The pod retains deployment target iOS 16.4 and weak FoundationModels linkage; model code is guarded at iOS 26.0, allowing older supported iOS to run the rest of the app. SDK 57 requires Xcode 26.4+ on the remote image. Confirm that version in EAS logs; do not raise the app minimum to iOS 26. Native Expo async/throws closures and bridge outputs were statically reviewed, not compiled on Windows.

From Windows PowerShell:

```powershell
Set-Location 'C:\Users\brrrr\OneDrive\Desktop\prototype-0\mobile'
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest device:create
npx.cmd eas-cli@latest build --platform ios --profile development
npx.cmd expo start --dev-client
```

Use an Apple Developer account for signing and register the physical phone through device:create. Follow the EAS build installation link on that phone. If a standalone internal build is preferred, use npx.cmd eas-cli@latest build --platform ios --profile preview instead of development (no Metro needed). A commit is not required by this project's EAS config; do not accept any incidental commit prompt. EAS performs prebuild/CocoaPods/Xcode on its remote macOS builder; Windows cannot perform local iOS compilation. These commands are instructions only; no paid/remote build was submitted during this task.

Device-only checks remaining: Swift compilation with the selected SDK/compiler, module linkage on iOS 16.4 through 25 and supported iOS 26+, actual availability transitions, guided interpretation accuracy, Task cancellation responsiveness and rapid retry, error/context recovery, real native performance and peak memory, interaction during synchronous large solves, stage/navigation/background interruptions at every phase, ghost/Apply/Save/reopen correctness, keyboard/large text/safe areas/VoiceOver. Enable Apple Intelligence and wait for model download; repeat in airplane mode. Browser/mock timings are not native measurements.

References: [Expo EAS iOS build process](https://docs.expo.dev/build-reference/ios-builds/), [Expo SDK 57 requirements](https://docs.expo.dev/versions/v57.0.0/), [Expo async module API](https://docs.expo.dev/modules/module-api/), [Apple LanguageModelSession](https://developer.apple.com/documentation/FoundationModels/LanguageModelSession).
