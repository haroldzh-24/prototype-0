# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Prototype 2 Phase 1

Home opens Stage Planner (New Stage / Saved Stages), Training and Account.
The builder uses an explicit Save button: name the stage, edit, save, and close.
Back navigation warns about unsaved edits. Changes are not automatically saved;
force-closing the app can lose edits since the last successful save.
Saved Stages supports rename, independent copies, and confirmed deletion.

`src/storage/repository.ts` owns parameterized SQL and schema initialization.
`practical-shooting.db` contains stages, training records and local profiles.
Each stage row stores the complete StageDocument and StagePlan in one versioned
JSON payload, so IDs, wall ports, partial faces and ammunition references remain
intact. Duplicate stages keep internal object IDs in a separate stage record.
Storage is local to this installation; there is no cloud backup or account sync.

Training has typed records, six starting types, timing segments and repository
save/list methods. Recording sessions and drills are deferred. Account displays
an independent performance baseline, currently estimates rather than measurements.
Route planning and Apple sign-in are intentionally deferred.

Checks (Node 22.13+; Node 24 recommended for built-in SQLite tests):

```sh
npm test
npm run typecheck
npx expo start
```

Start Expo once after adding routes to refresh `.expo/types/router.d.ts`.
Expo SQLite adds native code: create a new development/TestFlight build.
For web, Metro config supplies WASM support and cross-origin isolation headers.
Production web hosting must also send `Cross-Origin-Embedder-Policy: credentialless`
and `Cross-Origin-Opener-Policy: same-origin` (SQLite web support is experimental).
Web uses single-page output to avoid SDK 57 static-development worker bundling
errors. Configure hosting to serve `index.html` for app routes. A web exit handler
releases SQLite connections and opts out of page caching to avoid retained worker
file locks. Multiple simultaneously open browser tabs are not supported by the
experimental SQLite web backend.

`tests/browser-smoke.cjs` can check the running app using an isolated Chromium
profile with remote debugging port 9228 and an open app tab. Run it from `mobile`;
set `SMOKE_BASE_URL` if using a different local origin. It creates test stages in
that profile and saves a Home screenshot under `.expo/browser-home.png`.


## Canvas-first editor iteration (2026-09-21)

The builder uses a fixed Back / stage name / Save bar and Add / Edit / Route / Plan / View actions below a flexible canvas. Selection reveals an overlay action strip without changing viewport dimensions. EDIT opens the existing per-object fields and scoring-target rounds in a slide-up sheet. Delete and Reset ask for confirmation. Sheets close with Done, a backdrop tap, Android back, or accessibility escape; their forms scroll independently of the stage.

Pinch zoom is anchored at the two-finger midpoint and clamped to 50-300%. One-finger empty-canvas dragging pans in screen layout units. One-finger object dragging retains the existing physical/snap calculation; adding a second finger hands ownership to the canvas and stops object movement. Finger-count changes rebase before further movement. Fit resets zoom to 100% and pan to zero; screen layout then fits and centers the physical stage. Zoom/pan state is temporary and never enters saved documents or route distances.

ROUTE replaces the normal action bar with + Position / Assign / Reload / Summary / Exit route. Assignment and reload sheets show the selected position only. Summary contains order, distance, ammunition, warnings and profile timing. PLAN separates loadout/starting ammunition, target rounds and route summary. VIEW contains Top Down, 2.5D, grid/route visibility, Fit/reset and Grid/Snap settings.

Changed implementation files:

- Layout/theme: src/app/_layout.tsx, src/ui/kit.tsx, src/editor/FieldText.tsx.
- Editor: StageBuilder.tsx, StageViewport.tsx, viewportGestures.ts, EditorSheet.tsx, AddMenu.tsx, DraggableObject.tsx, ObjectInspector.tsx, WallPortsInspector.tsx, SnapControls.tsx, StageGrid.tsx, Stage25D.tsx, RouteOverlay.tsx (all under src/editor).
- Planning UI: src/planning/PlanningPanel.tsx and src/planning/RoutePanel.tsx.
- Verification: tests/viewport.test.cjs and tests/browser-smoke.cjs; project bugs.md, features.md, changelog.md and this README.

Physical iPhone acceptance checklist (pending; Windows has no iOS simulator/device access):

1. At 50%, 100%, and 300%, drag every object kind and route marker, including rotated thin objects and overlapping markers. The page and native navigation must stay still until release.
2. Pinch on empty space and starting directly on an object/marker. Lift either finger first, continue panning, then drag again. No jump or unintended object movement should occur.
3. Zoom/pan, open/dismiss sheets, rotate the phone and press Fit. Save/reopen and confirm physical dimensions, coordinates, ammunition and route distances remain correct.
4. Check inspector/port/round/magazine fields with the iPhone keyboard; Done, backdrop dismissal, VoiceOver and home-indicator spacing. Check all action targets at the smallest supported phone size and with larger text.
5. Check route assignments, reloads, reorder/delete confirmation and summary; switch Top Down/2.5D and grid/route visibility.
6. Confirm native edge/full-screen swipe-back is disabled throughout Builder, including between gestures. Test the explicit Back button with saved and unsaved stages; cancel/save/discard. Verify other routes retain normal swipe navigation. Confirm native launch never installs browser unload handlers.

Validation: 104 automated tests (97 retained + 7 viewport tests). TypeScript and iOS production Hermes export passed. The updated browser smoke test passed at 390 x 844: touch pan/pinch/object drag and object-to-pinch handoff, fixed canvas bounds, all ADD tiles, inspectors, preview, loadout, route assignment/reload/summary, visibility controls, save/reopen, unsaved guard, stage CRUD, Training and Account. Screenshots were inspected. git diff --check passed. Browser touch emulation is supplementary and does not certify native iOS responder behavior.

Development server logs also contained a web-only SQLite pagehide teardown error involving SharedArrayBuffer; the final smoke passed. Investigation is tracked in bugs.md, and storage code is unchanged.


## Companion-app visual refinement (2026-09-21)

This pass changes presentation only. Shared tokens live in src/ui/tokens.ts; original toolbar symbols live in src/ui/ToolIcon.tsx. The platform's native sans-serif is retained, with 22px/600 primary titles, 16px/500 section titles, 13px regular body copy, 12px/500 action labels, 10px uppercase categories and 25px/500 metric values. Main navigation uses normal case; category/readout labels remain compact uppercase.

Colors: background #0A0A0A; primary surface #171717; secondary surface #212121; selected surface #2A2A2A; divider #333333; primary text #F1F1F1; secondary text #9B9B9B; muted text #696969; accent #28BFE8; danger #B84B4B. Thin separators and flat surfaces replace enclosing card borders. Cyan is limited to active states, Save, route mode and selection/snap feedback.

The Builder uses a small Back chevron and Save text action. Toolbars use 22px original line symbols with 10px labels, retaining accessible action names and at least 44px touch targets. Route mode uses Position / Targets / Reload / Summary / Exit. The panels, existing ADD silhouettes, previews and controls are restyled in place; no Port Wall creation behavior or other new feature was added.

Route, ammo and profile metrics display existing values in number/label groups and aligned rows. Physical object/material colors and the existing generated 2.5D scene colors remain intentionally unchanged; some secondary-screen/category copy retains uppercase wording. No image assets, fonts or dependencies were added. The reference image was absent from the attachment, so the written brief supplied the visual direction.

Protected models, storage, coordinate/viewport math, gestures and callbacks are unchanged from the start of this visual pass. Safe areas, panel dismissal, explicit Back, usePreventRemove, browser guards and Builder-only disabled swipe-back remain intact. Automated checks: TypeScript and all 104 tests pass. Physical iPhone visual checks remain pending in features.md.
