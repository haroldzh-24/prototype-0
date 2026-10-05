# Application UI overhaul — October 5, 2026

## Final source cleanup

This is the current completion record. The October 4 baseline and individual segment records below are historical; their older test counts and partial browser results do not describe the final codebase. `current-ui-audit.md` remains the unchanged BEFORE snapshot.

All normal feature paths requested in the final pass were retraced through reachable screens, sheets, callbacks and draft/Save boundaries. No known source-fixable UI overhaul issue remains after this audit. This does not claim native-device verification or completion of separately planned features such as cloud sync, a canvas polygon editor, durable browser media, or improved analysis/planning models.

### Final presentation changes

- Shared headers wrap actions instead of requiring one fixed row. Training and Profile use the shared safe-top header and Back control without duplicate navigator headings. Shared actions constrain width, retain at least 44-point targets, and let text wrap; metric rows and target-family choices adapt to narrow screens.
- `ErrorState` supplies a user-facing error, optional Retry, and expandable technical Details. Library loads, Stage Designer startup, Profile and comparison stage loading have recovery paths. Failed reads do not produce an empty-state flash. Empty Profile training/calibration sections explain how to add samples; a reload sheet without magazines points to Loadout.
- Stage-name editing moved into the existing keyboard-safe scrolling sheet, still modifying only the unsaved stage draft. Stage and video dirty-close choices use that same infrastructure. Failed video Save feedback remains in the close sheet; failed event validation stays in the open event sheet with its draft intact. Sheet bodies shrink and scroll while Done stays outside the body. Modal slide/fade transitions were removed, avoiding animated sheet/video transitions for reduced-motion users.
- Preview omits Save. Route result/adoption/replacement retains the existing meaningful-route check, and alternatives remain collapsed initially. Waypoint terminology replaces route POINT/NODE wording where the entity is a waypoint; genuine engagement nodes and moving windows remain distinct. Comparison movement labels show Start/Waypoint names instead of persisted IDs. Candidate/Vanilla copy and normal ranking explanations were simplified or moved under Details.
- Firing areas open as a list; selecting an area reveals only its vertices. Target procedures and sampling remain explicitly disclosed. Area names are numbered presentation labels; stored IDs, coordinate parsing, rules and validation remain unchanged.
- Grid labels use short yard readings and skip crowded ticks according to zoom/font scale. Configured waypoint labels sit apart from the engagement circles; low-priority engagement labels are compact until selected. Moving overlays use the shared teal token. Selected waypoints retain a visible outline.
- Delete confirmations use Cancel/Delete, resets use explicit Reset labels, and discard/delete/reject/remove actions are visibly destructive where applicable. Video statuses distinguish selected/running, confirmed/completed, warning/review and error states with text and semantic colors. Duplicate close-up platform guidance was removed.
- Invisible object hit regions now reach at least 44 points even for thin walls/fault lines or small start areas; physical object dimensions and geometry are untouched. Fit/preview/snap controls retain minimum targets, switches have extra hit slop, handles have accessible instructions, and selected/disabled states are exposed where practical. Danger text uses a more readable muted red.

### Complete journey register

| Journey | Final reachable path and evidence |
| --- | --- |
| Home / libraries | Home → Stage Planner → Matches → create/open/edit/duplicate/delete Match → Stages → name-only creation/open/rename/duplicate/delete Stage. Source callbacks and automated library tests retained; browser exercises creation, CRUD, navigation and long names. |
| BUILD | Stage Designer → Select → contextual Edit/Rotate/Endpoints/Duplicate/Delete; Add → family/preset/Info → repeated placement → Done; Draw → wall/fault line → local segment undo/cancel/Done; object inspector → geometry/dimensions/rounds/face cuts/advanced → Apply; wall → Ports → select/add/remove/edit opening → Apply; More → dimensions/grid/snap/loadout/rounds/history/2.5D; explicit Save and dirty exit. Source and component tests retraced all branches; both existing browser suites cover gestures/history/inspectors/preview/Save/reopen. |
| ROUTE | Plan → readiness/prerequisites → Route Settings → ruleset/movement/firing-area selection/vertices/safety/target procedures/advanced → Generate → error/review or best result → alternatives/Preview/Use/replacement → Edit → add/move/delete/reorder waypoint → Targets/visibility/engagement/order → Reload → node/window details → Overlay Layers → Analyze → Save. Source callbacks and existing route tests retain the original calculations and adoption boundary. Browser verifies Plan/settings/result/preview/adoption, waypoint targets/reloads, analysis and explicit saving. |
| TRAINING / VIDEO | Training → Create Session → context/start choices → list/card/session video actions → Add Video → import/failure/missing-original/relink/manual fallback → Analysis Timeline/precision/event editor → Analyze audio/movement/close-up and cancellation → suggested/fused evidence review → Results/endpoints → Compare → stage/snapshot link → mapping suggestions/accept/reject/manual editing/results → explicit Save/dirty close/profile contribution. All branches retraced from source and component/state tests. Browser covers all four tasks and event validation using an intentionally unsupported media fixture; real AV playback/extraction is not claimed. |
| PROFILE | Local Profile → Performance → context-separated Training Data → Calibration/empty guidance → factual unavailable Cloud Sync. Focus refresh and failed-read Retry retained; source, state tests and browser review cover this path. |

Normal navigation exposes no Explore/starter tab, demo theme, Expo starter copy or legacy standalone planner. Harmless orphan files remain. Explicit Save, StageDocument/StagePlan, schemas, SQLite, ownership, persistence, route/geometry/training/profile calculations and native permissions were not redesigned.

### Final validation

- `npm.cmd run typecheck`: passed. `npm.cmd test`: **570 passed, zero failed**, preserving the original 567 tests and adding three real UI regressions for event-sheet validation, Profile Retry and failed Matches loading/Retry. Existing UI expectations were updated for the deliberately changed copy and preview behavior.
- Expo web export: passed to `mobile/.expo/final-ui-export`.
- `mobile/tests/browser-smoke.cjs`: passed, including pan/pinch/drag, inspector/history, 2.5D, route assignment/reload/analysis/layers, Save/reopen/reload, dirty exit, stage CRUD, Training and Profile.
- `mobile/tests/designer-browser-smoke.cjs`: passed at 390×844, including repeated placement protections, connected drawing, local/global undo, rotation wheel, endpoint/numeric editing and Save/reload.
- `mobile/tests/final-ui-browser.cjs`: **150 checks passed** across 25 surfaces at **390×844, 375×667 and 320×568**, covering all mandatory surfaces plus route preview/targets/reload/event-error surfaces. Each normal and doubled-browser-text check has no page-level horizontal overflow; video Save remains visible. Doubled DOM text is supplemental browser stress, not native Dynamic Type verification. Long match/stage/waypoint names and filenames are intentional fixture data.
- Local screenshots and the exact layout matrix are under `mobile/.expo/final-*.png` and `mobile/.expo/final-ui-layout.json`; test logs are `final-ui-tests.log` and `final-ui-regression.log` there. Browser evidence is from the isolated test database, not user data. One early navigation timeout required restarting that isolated browser; subsequent full suites including Save/reload passed. No layout failure was inferred from that timeout, and no storage fix was made.
- No dated unresolved bug or feature is more than one month old as of October 5, 2026. Undated legacy entries cannot be aged reliably.

### Remaining native UI verification only

Real iOS notch/home-indicator and sheet safe areas; focused-input scrolling and action reachability with software/hardware keyboards; native Dynamic Type/font rendering; gesture handoff and crowded invisible hit regions; physical touch feel; VoiceOver focus, labels, modal escape and selection announcements; native navigation/hardware-back and modal transition behavior; AV playback/precision seeking, extraction/cancellation, real detector review data, rotated overlays and device Save/reopen/relink. These require actual native-device evidence. Existing browser OPFS teardown and media durability limitations remain separate tracked platform/storage issues outside this UI-only pass.

### Files changed by this final pass

- Shared UI: `mobile/src/ui/kit.tsx`, `mobile/src/ui/tokens.ts`, `mobile/src/ui/TargetFamilyPicker.tsx`.
- Screens: `mobile/src/app/{_layout,planner,match,builder,training,account}.tsx`.
- Editor: `mobile/src/editor/{EditorSheet,StageBuilder,ObjectInspector,WallPortsInspector,DraggableObject,GeometryControls,StageGrid,SnapControls,StageSettings,Stage25D,RouteOverlay,EngagementOverlay}.tsx`.
- Planning presentation: `mobile/src/planning/{AutoPlannerPanel,RoutePanel,RouteAnalysis,EngagementPanel,EngagementDetails,EngagementSettings,PlanningPanel,PlannerResultCard}.tsx`, `plannerUI.ts`. Resize correction labels and route warnings use human object/waypoint labels and current navigation names.
- Video/training presentation: `mobile/src/training/{VideoAnalysisEditor,ExecutionComparisonReview,MappingSuggestionReview,FusionReview}.tsx`, `presentation.ts`.
- Verification: `mobile/tests/{browser-smoke,designer-browser-smoke,final-ui-browser,ui-reorganization.test,plannerUI.test}.cjs`.
- Documentation: `docs/ui-overhaul.md`, `bugs.md`, `features.md`, `changelog.md`. Earlier segment edits were preserved; `docs/current-ui-audit.md` was not edited. No commit or push.

## Historical baseline and segment records

The before snapshot remains in `current-ui-audit.md`. This pass extends the October 4 canvas-first reorganization and preserves BUILD → SELECT / ADD / DRAW / More and ROUTE → PLAN / EDIT / ANALYZE / More.

## Design system

`mobile/src/ui/tokens.ts` defines dark background, charcoal surfaces, cyan activity, teal movement, amber warnings, muted red danger, text and divider colors; spacing steps are 4 / 8 / 12 / 16 / 24 / 32. Typography uses 22-point screen titles, 15-point section titles, 13-point body, 12-point labels, 10-point categories and 25-point tabular metrics. Stage material colors remain independent.

The shared kit provides Action variants (primary, secondary, quiet, destructive), Screen, Panel, Copy, Section, EmptyState, Loading, Notice, Segmented, Stat and DataRow. Actions retain 44-point minimum heights and disabled accessibility. Segmented controls wrap on small screens and announce selection. Screen supports a fixed header, keyboard avoidance, scrolling and side/bottom safe areas. Navigation supplies top safe area on ordinary screens; Home opts into Screen's top safe area and video supplies its own top-safe header.

LibraryCard keeps separate card-body Open and overflow Actions hit regions, with stronger title/category hierarchy. EditorSheet retains a scrolling body, safe-area bottom and keyboard handling; Done is quiet. Closing a sheet does not save the stage. Existing sheets continue their existing draft/apply semantics.

## Navigation and major surfaces

| Surface | Primary action | Changes |
| --- | --- | --- |
| Home | Stage Planner | Compact launch dashboard, stronger planner emphasis, Training and Profile paths; no duplicate Home navigation header |
| Matches | + Match | Shared loading/empty states, primary creation, stronger card titles; Edit/Duplicate/Delete remain in overflow |
| Stages | + Stage | Prominent match name, quieter back action, deliberate empty/loading states; existing stage ownership and actions retained |
| Stage Designer | Save | Existing canvas-first layout and tools preserved; tighter status spacing and semantic error color; stage-name input already appears as text |
| Route Plan | Generate Route / Use Route | Primary actions and actual activity state; existing readiness/prerequisite/configuration flow preserved |
| Alternatives | Use this route | Movement emphasized; source counts, profile factors and planning method moved into Details |
| Route Analysis | Read results | Tabular overview metrics and amber warnings, existing sequence/ammunition/timing retained |
| Training | + Session | Creation moves into a sheet; explicit context and starting-position choices replace cycling; loading and empty states, video-empty guidance |
| Video Analysis | Save | Fixed top-safe Save/Close, task sections, event sheet, explicit dirty-close choices |
| Profile | Read performance | Intentional local/read-only identity, performance and context-separated sample counts, compact unavailable cloud status; refresh on focus |

Normal navigation has no entry to Explore, starter tabs or the legacy root website. Those files remain outside this application's ordinary navigation.

## Video tasks and state

TIMELINE shows trusted/manual events and event editing. ANALYZE shows audio/movement controls, close-up selection/overlay/review, unconfirmed suggestions and fusion review. COMPARE retains the existing stage-link/snapshot/mapping review. RESULTS shows derived measurements, completeness, warnings and explicit profile contribution.

All tasks use the original `video` draft and save boundary. Changing tabs does not persist data. Task views stay mounted but hidden to retain child drafts and ongoing detector jobs. The player stays mounted across task switches. Save and dirty-close choices are outside the ScrollView. Dirty Close offers Save changes, Discard changes and close, and Keep editing. Failed Save keeps the editor open. Browser missing-file relinking and annotation-only fallback remain available. Compare exposes linked stage/route and totals first, with mapping editing, suggestion pairs and timing details progressively revealed.

Existing playback/seek/mark controls remain available. Raw evidence and measurement endpoints retain their review/confirmation actions. Event draft fields remain local until Apply; sheet Done closes that draft surface. No autosave was added.

## Preserved contracts and journey trace

No route generation, candidate ranking, engagement calculation, physical geometry/conversion, schema, repository, ownership, StageDocument/StagePlan, detector, profile-calculation or persistence code was rewritten. Stage saving, history and dirty exit remain explicit. Existing saved dimensions and IDs remain intact.

1. Home → Matches → Match → Stage → Build/Edit → Save → Back → reopen: original ownership/navigation callbacks and `saveStage` boundary retained.
2. Stage → Route → Plan prerequisites → Generate → Use → Edit → Analyze → Save → reopen: original discovery, adoption/replacement, edit and evaluator callbacks retained; no tab action persists the document.
3. Training → New Session → Add/Import Video → Timeline → Analyze/review → Results → header Save: same import, analysis, evidence and repository writes; context/start selection is explicit.
4. Video → Compare → link stage → suggest/review mapping → header Save: existing ExecutionComparisonReview stays mounted and writes into the same video draft.

No required feature was intentionally removed. A new polygon canvas editor remains deferred; the existing coordinate fallback remains reachable in Route Settings.

## Responsive verification and limitations

Browser touch smoke uses `mobile/tests/browser-smoke.cjs`, with SMOKE_WIDTH/SMOKE_HEIGHT and an isolated Chromium profile. It captures Home, Matches, Stages, Designer, Training, New Session and Profile and checks page width. Native text scaling, keyboard behavior, media codecs and detectors cannot be certified by browser emulation. Detailed results are recorded after the final runs below.

## Exact physical-phone checklist

- Test at 390 × 844, 375 × 667 and 320 × 568 equivalent logical sizes; repeat with larger accessibility text and long match/stage/video/target names.
- Check top notch, bottom home indicator, title wrapping, every 44-point hit region, sheet maximum height, scrolling and Done reachability.
- Open every text field with the keyboard, including stage name, session name, object dimensions, route rules/polygon coordinates and event timestamps; confirm submit/close remains reachable.
- Create match/stage; repeatedly place targets, draw connected walls/faults, undo a segment, cancel draft, rotate, drag endpoints, undo/redo edits, Save, close and relaunch.
- Switch BUILD/ROUTE; configure loadout/rounds/rules; generate, preview, adopt, compare alternatives, edit/order/reload and review Analysis; toggle every map layer and selected engagement arrows; Save and reopen.
- Check 2.5D as a read-only preview, zoom/fit and return to Build without data changes.
- Create sessions in all contexts and starting positions; import MP4/MOV; verify denied/cancelled picker and unavailable/missing-file fallbacks.
- Switch all video tasks while editing; add/edit/delete/confirm events and fused hypotheses; verify state survives task switches and Save/reopen.
- Run audio, pose and close-up on iOS; verify actual progress/cancel/background cleanup, portrait/landscape/mirror overlays, close-up region selection and native playback/seek.
- Compare → link → suggest mappings → accept/reject/manual edit → Save/reopen; verify historical snapshot and changed/deleted-stage warnings.
- Contribute eligible measurements explicitly; return to Profile and confirm refresh and separated contexts. Test failed Save, dirty Close → Keep editing, Save changes and Discard.
- Rebuild native modules and follow `mobile/docs/ios-device-verification.md` for low memory/storage, codec failures and relaunch persistence.

No native test is claimed. Gesture handoff, large text, short-screen keyboard coverage, native media overlays and bottom-sheet dismissal remain the main device-only review items.

## Changed-file register

- Shared system: `mobile/src/ui/tokens.ts`, `kit.tsx`, `LibraryCard.tsx`.
- Main screens: `mobile/src/app/_layout.tsx`, `index.tsx`, `planner.tsx`, `match.tsx`, `training.tsx`, `account.tsx`.
- Designer: `mobile/src/editor/EditorSheet.tsx`, `StageBuilder.tsx`.
- Route presentation: `mobile/src/planning/AutoPlannerPanel.tsx`, `PlannerResultCard.tsx`, `RouteAnalysis.tsx`.
- Video presentation: `mobile/src/training/VideoAnalysisEditor.tsx`, `ExecutionComparisonReview.tsx`, `MappingSuggestionReview.tsx`.
- Verification: `mobile/tests/ui-reorganization.test.cjs`, `browser-smoke.cjs`.
- Documentation: `docs/ui-overhaul.md`, `bugs.md`, `features.md`, `changelog.md`.

Generated browser screenshots and test output are local ignored artifacts under `mobile/.expo`; Expo export is under `mobile/dist`. No commit or push was made.

## Verification results

- TypeScript: passed. Automated suite: 548 passing, zero failures (seven added regressions; existing tests preserved). Tests exercise selectors, shared accessibility/touch sizing, Profile contexts, video draft/tab/header Save, failed dirty-close Save and progressive mapping review, alongside the existing stage/route/persistence suites.
- Expo web export: passed. No native build/device test was performed.
- 390 × 844: the existing full browser journey passed canvas gestures, inspector/history, preview, loadout, route edits/analysis/layers, explicit Save/reopen/reload, dirty exit, stage CRUD, Training creation and Profile. Video playback/detectors and plan comparison media were traced from source and state-tested, not tested end-to-end with a real browser video.
- 375 × 667: Home/Matches/Stages/Designer captures and page-width checks passed; canvas/route editing, Save and in-app reopen proceeded. Full smoke stopped after `Page.reload` with a blank page. Training/Profile/new-session layout verification at this size remains incomplete.
- 320 × 568: Home/Matches/Stages/Designer captures and page-width checks passed; canvas/route editing, Save and in-app reopen proceeded. Full smoke stopped after reload at “Opening your saved data…”. Training/Profile/new-session layout verification at this size remains incomplete.
- Additional fresh-target/context browser review attempts encountered storage startup and CDP navigation timeouts. These failures do not establish a native layout defect or a storage fix. The temporary failed runner was removed; the existing parameterized browser smoke remains available.
- Collected Expo logs also show `SharedArrayBuffer is not defined` during the existing StorageProvider pagehide/closeSync callback. That teardown evidence is recorded in bugs.md; the callback and storage semantics were left unchanged.
- Visually inspected the 375-point Designer and 320-point Home screenshots. Larger text, native keyboard/safe areas, real media and every conditional sheet still require the physical-phone checklist above.
- Source journey tracing retained all four requested paths; no required existing feature was intentionally made inaccessible. Existing SQLite teardown/OPFS issues remain in bugs.md. No dated unresolved tracker item is more than one month old as of October 4, 2026; undated legacy entries cannot be aged reliably.

To repeat browser smoke, launch the isolated debug browser and Expo server, then run from mobile: `node tests/browser-smoke.cjs`. Set `SMOKE_BASE_URL`, `SMOKE_WIDTH` and `SMOKE_HEIGHT` for the intended server/viewport. The test uses only the isolated test database and creates test matches/stages/sessions.


## Segment 1 completion ? October 5, 2026

Home uses two-line branding and three tappable launch cards. Matches/Stages opt out of duplicate stack headers and use ScreenHeader with back and creation actions. Shared name fields, semantic errors, overflow rows, status badges and delete confirmations use the same kit; long card names truncate at two lines. Existing data operations are retained. TypeScript and all 548 automated tests passed. Browser checks covered five surfaces at 390 ? 844, 375 ? 667 and 320 ? 568 with no page-level horizontal overflow. Native keyboard/safe-area/dismissal checks remain open, as does the existing browser storage teardown investigation.
