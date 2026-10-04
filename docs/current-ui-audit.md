# Current UI Audit

## 1. Executive Summary

Source audit dated October 4, 2026. The current application is the Expo Router application in `mobile/`, entered through `expo-router/entry`. It provides local match/stage management, a physical stage editor, manual and automatic route planning, training sessions with imported-video annotation/analysis, and a read-only local profile. Route planning is an editor mode with sheets, not a separate navigation screen. Training is session based, not a drill catalog or live timer.

This is a source-based inventory. No browser, simulator, physical device, native build, or runtime tests were run. “Working” below means an implemented, connected source path, not device certification. Responsive concerns are code-based risks. Only this report is changed; no code, bug tracker, feature tracker, or changelog edits are made, as expressly requested.

## 2. Complete Navigation Tree

```text
Launch → StorageProvider opens/initializes local SQLite
  ├─ Opening saved data / storage error → Retry
  └─ Home /
      ├─ Stage Planner → Matches /planner
      │   ├─ Create Match / Match Settings sheet
      │   ├─ Duplicate match (stays on list)
      │   ├─ Delete match confirmation sheet
      │   └─ Open match → Stages /match?id=...
      │       ├─ Add Stage / Rename Stage sheet
      │       ├─ Duplicate stage (stays on list)
      │       ├─ Delete stage confirmation sheet
      │       └─ Open / create stage → Stage Designer /builder?id=...
      │           ├─ Stage Settings sheet
      │           ├─ Add Target full-screen modal
      │           ├─ Edit sheet → object fields / face cuts / wall ports / rounds
      │           ├─ Delete object confirmation sheet
      │           ├─ Plan sheet → loadout / targets / summary
      │           ├─ View sheet → top down / 2.5D / grid / route visibility
      │           │   ├─ Grid & snap sheet
      │           │   └─ Reset positions confirmation sheet
      │           ├─ Route mode
      │           │   ├─ Position creation / marker selection and drag
      │           │   ├─ Targets sheet → list assignment / canvas assignment mode
      │           │   ├─ Reload sheet → magazine assignment / position deletion
      │           │   ├─ Summary sheet
      │           │   │   ├─ Engagement setup inline form
      │           │   │   ├─ Recalculate assignments / engagement order
      │           │   │   └─ Waypoint order / ammunition / timing
      │           │   └─ AI PLAN sheet
      │           │       ├─ Manual / Auto / Auto + Manual sources
      │           │       ├─ Discover → read-only auto-position preview
      │           │       ├─ Generate → candidate cards / Why / Details
      │           │       ├─ View Route → read-only candidate preview
      │           │       └─ Use → replacement confirmation → editable route
      │           └─ Back → Stages; dirty document → exit modal
      ├─ Training /training
      │   ├─ New session form → recent-session history
      │   └─ Add / Import Video or Open analysis → Video Analysis modal
      │       ├─ Playback / close-up region selection / pose overlays
      │       ├─ Audio / movement / close-up analysis and cancellation
      │       ├─ Marker form / timeline / fusion evidence review
      │       ├─ Derived measurements / endpoint confirmation
      │       ├─ Compare to Plan inline section
      │       │   ├─ Select stage → link saved route snapshot
      │       │   ├─ Suggest mapping → accept / reject / manual remap
      │       │   └─ Manual mapping / results / remove link
      │       └─ Save analysis / contribute to profile / discard / close
      └─ Account / Profile /account (read only)

Compatibility route: /saved-stages → /planner
Orphan registered file route: /explore → starter Explore page
Separate legacy website: root index.html (no Expo navigation connection)
```

There is no mounted tab navigator. `_layout.tsx` mounts `Stack`, despite leftover `AppTabs` files. Builder hides its stack header and disables native swipe-back/full-screen back gestures. Other stack screens use the navigation header/back affordance. `/explore` exists as a file route, but no current app control links to it; direct URL/deep-link access is distinct from Home reachability.

| Screen | Route | Source under mobile/src/ | Mounted component | Entry and exit |
|---|---|---|---|---|
| Local storage gate | Before routes render | storage/StorageProvider.tsx | StorageProvider → Screen | Launch; initialization success reveals navigator; error has Retry |
| Home | `/` | app/index.tsx | Home | Launch/back; Stage Planner, Training, Account |
| Matches | `/planner` | app/planner.tsx | Matches | Home Stage Planner; header back; Open match |
| Stages | `/match?id=ID` | app/match.tsx | MatchRoute → MatchStages | Match Open/create; Back to Matches or stack back; Open/create stage |
| Stage Designer | `/builder?id=ID` | app/builder.tsx | BuilderRoute → LoadedBuilder → StageBuilder | Stage Open/create; custom Back to owning match, protected when dirty |
| Training | `/training` | app/training.tsx | Training | Home Training; stack back; analysis closes to same screen |
| Account | `/account` | app/account.tsx | Account | Home Account / Profile; stack back |
| Saved stages redirect | `/saved-stages` | app/saved-stages.tsx | SavedStages → Redirect | Old link; immediately replaces destination with Matches |
| Explore starter | `/explore` | app/explore.tsx | TabTwoScreen | Direct route only; header/navigation back where available |

Missing builder ID redirects to Matches. Invalid/deleted stage or failed match lookup gives a Stage Designer loading/error fallback with Back to Matches. Missing match ID displays “Choose a match from Matches.” Errors do not create a new document automatically.

## 3. Screen Inventory

### Home

Stack header “Home”; shared PRACTICAL / SHOOTING eyebrow and “Your next session” title; Stage Planner panel/action with two explanatory lines; Training panel/action with practice-history text; Account / Profile action. Buttons call `router.push`. No dashboard metrics, search, recent stages, or settings menu.

### Matches

Header “Matches”; page heading; + Create Match; loading/empty/error state and Retry; one panel per match showing name, target family, stage count, Open [name], Rename / Target family, Duplicate match, Delete match. `useFocusEffect` refreshes the repository list, newest updated first.

Create/Settings sheet: title and Done; auto-focused name input (100 characters), target-family radio group USPSA/PCSL/IDPA, existing-match explanation, Create Match or Save match, inline error. Blank trimmed names disable submission. Create defaults to USPSA and navigates to Stages after persistence. Settings change the default for future targets, preserving existing geometry. Duplicate writes immediately and refreshes the list; it does not open the copy. Delete sheet describes permanent deletion of all contained stages, with Keep match and Confirm delete match. Busy state disables list/write controls and blocks sheet dismissal through its close callback.

### Stages

Header “Stages”; page heading; Back to Matches; match name; family and stage count; + Add Stage; empty/loading/error message; per-stage panel with name, localized edited timestamp, Open [name], Rename stage, Duplicate stage, Delete stage.

Add/Rename sheet: Done, auto-focused name input (100 characters), Open Stage Designer or Apply name, inline error. Add creates/persists the default stage and empty plan before navigation. Delete sheet: permanent-delete question, Keep stage, Confirm delete stage. Duplicate adds “ (copy)” and stays in the current match. All mutations run through `run` and reload the list.

### Stage Designer

Physical layout, top to bottom:

1. Safe-area container; custom top bar: Back chevron, editable stage-name input, Save.
2. Mode/status row: STAGE EDITOR / ROUTE MODE / 2.5D PREVIEW / read-only preview labels; SAVED/UNSAVED and save feedback.
3. Dimensions/outside-items row with Stage Settings, except during candidate/discovery preview.
4. In top-down stage-edit mode: horizontal tool strip Select / Move, Pan, Add Target, Draw Wall, Draw Fault Line.
5. During placement/drawing: current preset/tool instructions, draft metrics where present, Done and drawing-specific controls.
6. Flexible canvas, minimum height 100; clipped ground/grid/objects, handles, route and snap overlays.
7. Conditional floating context strip inside canvas, bottom 8/left 8/right 8: selection actions or route-target assignment actions.
8. Top-down zoom row: minus, percent, plus, Fit, snap/route/read-only status.
9. Undo/Redo row outside canvas, except in read-only planner previews.
10. Inline edit-error text when present.
11. Bottom icon toolbar: Target, Edit, Route, Plan, View; route mode substitutes Position, Targets, Reload, AI PLAN, Summary, Exit.

Save is explicit; sheet Done normally closes the sheet and is not a database save. Detailed control behavior appears in sections 5–6.

### Training

Header/title; NEW SESSION panel: session/drill name (default “Practice session”), cycling Context button, cycling start-type button, Start Training. RECENT SESSIONS heading; empty state or panels with name/date, context/start type, existing notes, Add / Import Video, and one Open analysis action per attached video. Errors/read warnings follow the list. Starting training immediately creates a record; no timer or drill execution view appears.

### Video Analysis modal

Full-screen slide modal inside Training. Shared scrollable Screen: Close analysis; file/context/saved status; browser-lifetime message where applicable; checking/missing-file/player state; player and close-up controls; close-up review; audio panel; movement panel; marker form; timeline/fusion cards; derived measurements; Compare to Plan; profile contribution/save controls; messages; conditional Discard changes and close. It has no distinct router path.

### Account

Header/title; profile display name/loading/error; LOCAL ACCOUNT / ON THIS DEVICE; cloud/Apple sign-in planned text. Performance panel: Draw, Reload, Split stats; Transition, Movement (in/s), Magazine capacity, Starting rounds, Chamber rows; note that stage loadouts are independent. Optional active video calibration context. No editable profile fields, sign-in button, cloud toggle, account deletion, or observation-management controls.

### Explore and legacy website

Explore shows starter explanation, Expo documentation link, collapsible File-based routing, Android/iOS/web support, Images, Light/dark mode, Animations; web badge and image examples. Its “two screens” text is stale relative to the actual stack. It is not linked by current app UI.

Root `index.html` is an independent older website: header/instructions, canvas with Start Position/default targets/default walls, Add Target, Remove Target, Add Wall, Remove Wall, Reset Positions. `script.js` uses pointer dragging, adds at center, removes newest objects, resets defaults, constrains on resize; no persistence or connection to Expo. These controls must not be reported as current mobile toolbar actions.

## 4. Core User Workflows

| Workflow | Steps and actual result | Handler |
|---|---|---|
| Create match | Home → Stage Planner → Create Match → name/family → Create Match → Stages | Matches `edit`/`run`, `repo.createMatch` |
| Select/change family | Choose radio in Create/Settings; save. Add Target also has an instance-preset family picker | TargetFamilyPicker; updateMatch; AddMenu |
| Open match | Matches → Open [name] | router.push(`/match`, id) |
| Rename match | Rename / Target family → edit name → Save match | repo.updateMatch |
| Duplicate match | Duplicate match → new list entry; copied stages included | repo.duplicateMatch transaction |
| Delete match | Delete match → Confirm delete match; contained stages removed | repo.deleteMatch transaction |
| Create stage | Open match → Add Stage → name → Open Stage Designer | createDefaultStage/createPlan → repo.createStage |
| Open stage | Stage panel → Open [name] → load stage and owning match | LoadedBuilder |
| Rename stage | Rename stage → name → Apply name, or change designer top input then Save | repo.renameStage / StageBuilder.save |
| Duplicate stage | Duplicate stage → copy appears in same match | repo.duplicateStage |
| Delete stage | Delete stage → Confirm delete stage | repo.deleteStage |
| Save/reopen | Designer Save → saved feedback → Back → Open stage | repo.saveStage/loadStage |
| Unsaved exit | Back → Keep editing, Save, or Discard changes and close | usePreventRemove; pendingExit modal |
| Training record | Home → Training → name/context/start type → Start Training → history entry | Training.create → repo.saveTraining |
| Video workflow | History → Add / Import Video → file picker → analysis opens → annotate/review → Save analysis | importVideoAsset, VideoAnalysisEditor.save |

New stage is not blank: 480 × 360 inches (13.333… × 10 yards), one start, three cardboard targets and three walls. The empty plan has no magazines, no starting magazine, unloaded chamber and zero assigned target rounds; route is absent until entered. Default placed cardboard geometry is 18 × 30 inches, not necessarily the Add Target preset dimensions.

Exit-modal Save updates the saved snapshot but does not itself dispatch the pending exit. After saving, Close stage becomes available; Keep editing cancels departure. Browser reload/close uses a beforeunload warning when dirty. Unsaved process termination recovery is not implemented as autosave.

## 5. Stage Designer Detailed Flow

### Controls and editing

| What user sees/taps | What happens | Component/function |
|---|---|---|
| Stage Settings | Width/depth in yards; Apply dimensions validates boundary-only resize | StageSettings → resizeStage |
| Shrink with outside items | Lists affected objects/positions; Cancel resize or Keep resize; positions/sizes preserved | outsideStage/resizeStage |
| Outside-item action | Focuses viewport; selects object and opens Edit, or enters route/selects waypoint | StageBuilder onSelect callback |
| Add Target, upper or bottom toolbar | Full-screen family/preset modal, paper role toggle, dimensions/verification/reference text | AddMenu |
| Preset | Modal closes; persistent target placement mode, “Tap to place” instruction | choose → placement/switchTool |
| Stage tap in target mode | Adds fresh-ID target at exact physical tap; no grid snapping on initial placement | placeTarget |
| Repeated taps | Places same preset repeatedly until Done/tool change | StageViewport deliberateTap |
| Paper role | Scoring/no-shoot toggle; only paper becomes no-shoot, not steel | AddMenu |
| Select Start Position | Modal closes; existing start selected | AddMenu.selectStart |
| Object tap | Selects object; floating context and wheel/endpoints appear | DraggableObject responder grant |
| Object drag | Moves selected object; grid/alignment/bounds applied; one grouped history change | resolveMovement → moveObject |
| Move in context strip | Shows instruction to drag or use Edit for exact X/Y; does not change tool | setEditError |
| Rotate in context strip | Adds configured increment, or 15° fallback; target/segment specialized paths | rotate/applyEdit |
| Target rotation handle drag | Continuous free rotation about anchor, angle text; no rotation snapping | GeometryControls → rotateTarget |
| Edit | Sheet with numeric fields and type-specific sections | ObjectInspector |
| Numeric Apply changes | Parses yard decimals/fractions/degrees; applies changed fields atomically; notice/error | parseInspectorEdit/applyEdit |
| Duplicate | Copies object near original, selects copy; start disabled; wall ports get new IDs | applyObjectAction/duplicateObject |
| Delete | Confirmation sheet; removes object/planning references; start disabled | act/reconcilePlan |
| Deselect / empty tap | Clears selection and context/handles | setSelectedId |
| View → Reset Positions | Confirmation restores default document, clears route/target assignments; keeps loadout | act(reset) |

Preset inventory: USPSA Metric (CHL), IPSC Classic (CHL), Reduced USPSA (Action Target), USPSA 8-inch round plate, Mini Pepper Popper (Blue Steel); PCSL Practical, Mini Practical, Competition, K-Zone legacy, PCSL 8-inch round plate; IDPA Standard, Alternate, 8-inch round plate, 6-inch square plate. Paper/popper silhouettes are approximate; exact nominal plate geometry is not a course-legality certification. Preset dimensions/outlines are copied into each object.

Inspector fields: all objects X/Y/rotation; wall length/thickness/height/bottom elevation; fault line length, no elevation; targets face width/height (popper says Overall height)/bottom elevation; start width/depth. Paper/no-shoot adds Full, Upper Portion, Lower Portion, Left Portion, Right Portion buttons that apply immediately, physically removing material. Scoring objects add a separate Planned rounds input/Apply Planned Rounds. Targets retain saved family/preset identity; dimension edits create custom-sized instances.

Wall port section: count, instructions, Add Port, Remove Port, numbered port selectors; selected port Offset/Width/Height/Sill inputs in yards; Apply Port Changes. Add/remove applies immediately; dimensions require Apply. Ports must fit wall length/height, have positive opening size and unique IDs; overlapping ports are not prohibited by this validator. Top-down wall openings carry small numbered labels; 2.5D cuts openings through surfaces.

### Drawing, snapping and viewport

Draw Wall/Fault Line → tap start, then tap endpoint, or drag from start to endpoint. Release commits a nonzero segment and leaves the next draft anchored at the committed end. Continue tapping/dragging endpoints for connected segments. Done ends drawing; Cancel current segment removes draft only; Undo last segment removes the last segment in the current chain and restores its start anchor. Global Undo/Redo clears the current draft/chain before restoring document history.

Draft shows yards, formatted length, angle and snap rule. Wall defaults: 4-inch thickness, 72-inch height, no ports. Fault lines stay at ground elevation. Select a segment to show two 44 × 44 endpoint handles; drag edits endpoints. Inspector length/angle-only edits keep the start endpoint fixed. Combined numeric edits use the general object editor, so this fixed-start rule is conditional.

Default snap: enabled, 6-inch grid, alignment enabled, 3-inch physical tolerance, 15° rotation increment. View → Grid / Snap Settings: Snapping switch; grid 12/6/3 inches displayed in yards; alignment switch; Rotation 15/5/Free. Disabling snap disables subordinate options. Drawing has direct Snap ON/OFF. Object movement resolves grid then feasible alignment then bounds. Segment endpoint snapping prioritizes nearby segment endpoint, angle within 5° of a 45° multiple, then grid. Initial target placement, wheel rotation, target-only numeric rotation, route-marker dragging and exact typed X/Y do not share all these snapping behaviors.

Pan tool disables object interaction so one finger drags the viewport even over objects. Empty-space drag also pans in Select and target placement modes. Two fingers capture viewport pan/pinch, yielding from object/marker/handle drags; adding a second finger cancels a drawing draft. Zoom clamps to 50–300%; +/- changes by factor 1.25, Fit resets zoom 1/pan 0. Drawing intercepts one-finger empty-space drag, so use two fingers to pan/zoom while drawing.

View sheet: Top Down and 2.5D close sheet on switch; Grid ON/OFF, Route ON/OFF stay in sheet; Fit Stage / Reset View returns top down and closes; Grid / Snap Settings and Reset Positions replace sheet content. 2.5D is read-only, selected object outlined; View left/right yaw ±15°, Zoom out/in 0.5–3; initial yaw 45°. It has no interactive object selection, route overlay or free camera gesture. Camera state resets when preview remounts.

### Simultaneous UI density

Counts describe rendered controls, including disabled controls; horizontal tool-strip items may require scrolling. Canvas objects/markers and optional errors are additional.

| State | Approximate simultaneous controls |
|---|---|
| Select, nothing selected | 18: Back/Save, Settings, 5 upper tools, 3 zoom buttons, Undo/Redo, 5 bottom tools; name input/status rows extra |
| Add Target mode | About 19, plus preset/instruction; modal hidden after choice; no selected-object strip |
| Draw Wall | About 22, plus draft length/angle/snap text; Done, Undo last segment, Cancel current segment, Snap toggle |
| Draw Fault Line | Same layout/count as wall drawing |
| Target selected | About 24 plus name input, wheel ring/angle/handle; Deselect + Move/Rotate/Edit/Duplicate/Delete overlay canvas |
| Wall selected | About 24 plus two endpoint handles; inspector only visible after Edit |
| Route mode | About 14 before assignment context: Back/Save, Settings, 3 zoom, Undo/Redo, 6 bottom tools; selected marker plus overlays |

Opening a sheet replaces much of the canvas with up to 85% screen-height form; opening Add Target covers the entire screen. Selection context overlays the lower canvas rather than resizing it.

## 6. Route Planner Detailed Flow

### Entry, setup, manual route

Tap bottom Route → `enterRoute`: creates “Manual route” if absent, sets route mode/visibility, clears object selection, forces top down. This creation alone can mark the stage dirty. No setup wizard or separate route screen opens.

Initial manual setup is distributed: Plan → loadout for magazines/chamber/start magazine; Plan → targets for positive rounds; Route → Position for waypoints; marker drag to position; Targets to mark visibility/engagements; Reload to choose magazine; Summary to inspect order/ammunition/analysis. Route mode has no Plan/View toolbar buttons, so Exit is needed to access loadout/target-round/View settings, unless target rounds are edited later from an object's inspector.

Position adds a new fresh-ID P1/P2/etc. at stage center and selects it. New positions may overlap. Single-finger marker drag moves it with boundary clamping, no grid/alignment snap. Marker tap selects; selected label is shown in the zoom row. There is no numeric route X/Y editor, canvas tap-to-add point, insertion-on-segment, direct engagement-circle drag, or canvas-delete gesture.

Targets sheet for selected position: position label and read-only X/Y; editable label; instructions; Visible targets / tap on stage and Engaged targets / tap on stage; per scoring target label/rounds/current owner, Mark visible/remove, Engage here/Clear engagement; actions to remove missing target references; Delete position with inline Cancel/Confirm delete position. Engage here moves ownership from every other position and marks visible here. Visibility may exist at multiple positions. Toggling visibility also clears that target's engagement at this position, including moving assignment. Removing an engagement leaves visibility. Assignment canvas mode hides draggable route markers and displays 44-pixel target rings; floating Visible targets/Engaged targets/Done controls change/exit submode. Changing route mode or selected position cancels assignment mode.

Reload sheet repeats label/X/Y and editable label; RELOAD BEFORE ENGAGEMENT / current magazine; No reload here; one Reload [magazine] ([loaded] rounds) button per magazine; same position-delete block. Reload selection replaces that position's reload record. No magazine creation here. No visible moving/stationary reload-mode selector: manual reload buttons omit `mode`, meaning moving overlap by default. Accepted geometry candidates can preserve explicit stationary reloads, but choosing a magazine again creates the default-mode record.

Deleting a waypoint removes its reload assignment and target ownership attached to that waypoint; no automatic reassignment. Position selection ID can remain stale temporarily, disabling Targets/Reload until a real marker is chosen. Route name is edited in Summary, not on the canvas.

### Summary / “Route Analysis”

Actual sheet title is Route summary, with `RoutePanel(section="summary")`. Plan → summary renders the same component; there is no router screen named Route Analysis.

Top-to-bottom inventory:

1. Airsoft engagement analysis; Set up moving engagements or Edit firing areas and stage procedures.
2. Inline `EngagementSettings` when expanded.
3. Once rules exist: explanation of waypoint vs circle; Recalculate engagement assignments and order; stationary/moving-segment/node/coverage/movement counts.
4. Each derived node with kind, target A/B/C/etc. label/reason, Engage earlier/Engage later per target.
5. No-firing intervals, target alternatives (moving/stationary/no legal engagement), warnings, geometry-only explanation.
6. Provisional/estimated time, starting rounds, route-waypoint count stats.
7. Route name input; START → labels sequence; distance; magazine changes.
8. Per-waypoint select button; visible/engaged labels; incoming movement and available → required → remaining ammo; Earlier/Later waypoint-order buttons.
9. Warnings; timing breakdown Movement/Draw/Splits/Transitions/Reloads when available; legacy/configured-legality and reload-overlap explanation.

Setup form: Airsoft stage brief; USPSA/PCSL/IDPA buttons; Moving engagement allowed toggle; Travel outside firing areas toggle; safe direction degrees (0 right, 90 down, -90 up); safe half-angle; sample spacing inches (0.25–24); polygon corner textareas (X,Y yards per line), Remove area, Add whole-stage firing area; target selectors; selected target Stationary required; allowed-area toggles; Allow all configured areas except IDPA; prerequisite target toggles; Apply engagement settings; Cancel settings. Form is inline within the existing sheet, not a second modal. Whole-stage area starts with boundary corners and remains editable. Up to 32 areas/64 vertices each; boundaries count as outside. Fault lines do not infer the polygon or legal side. IDPA requires explicit per-target area selection. Defaults: USPSA, moving/travel allowed, safe direction -90°, half-angle 90°, 2-inch sampling, no firing areas.

Apply stores rules in the local route draft; it does not automatically suggest target assignments or save SQLite. Recalculate calls `suggestEngagements`, retaining waypoint geometry/reloads while replacing per-waypoint engaged/moving target IDs and augmenting visible IDs. It schedules legal moving windows where possible, then stationary arrival engagements with prerequisite ordering. Reload incoming segments suppress moving-fire scheduling. Existing manual Engage here assigns stationary intent by clearing moving IDs for that target. There is no independent manual “moving window editor”; allow-moving, stationary-only procedures and recalculation determine moving assignments.

Engage earlier/later reorders target IDs within their owning waypoint, not route geometry or target physical locations. It rejects a change that reduces legal coverage due to windows/procedures. Waypoint Earlier/Later separately changes path order. Geometry analysis derives from current route/stage on render; assignments require explicit recalculation after changes. There is no separate stale-analysis banner for these saved engagement assignments.

Moving fire has no calibrated time estimate: evaluator timing is null if any movingTargetIds exist; UI shows unavailable/`--`. Legacy routes simulate ammunition, straight-line movement and scalar profile timings, but do not verify geometry. Configured analysis checks explicit areas, safe-angle limits, projected wall visibility and point-path wall collision; it does not certify physical body/vertical port clearance or full competition rules.

### Overlays and duplicate representations

| Visual | Meaning / interaction |
|---|---|
| Cyan route segments | Start and ordered waypoints joined; manual path is not an obstacle-avoiding polyline solver |
| Legacy circular numbered markers | Position label/order; 44-pixel tap/drag target |
| Configured W1/W2 labels | Path waypoints, not required stops; underlying 44-pixel marker containers |
| Solid cyan circles | Derived stationary engagement nodes; 20 pixels; noninteractive |
| Dashed teal circles | Derived moving engagement nodes; noninteractive |
| Thick teal segment portions | Target-specific moving visibility windows; may overlap |
| Target arrows and A/B/C/D… | Engagement order within relevant grouping; labels extend beyond Z to AA etc.; arrows are derived, not editable objects |
| Target endpoint dots/labels | Legacy assignment connections; scoring-target labels also render in route overlay |
| Target assignment rings | Visible/engaged selection depending on submode; tappable |
| Candidate preview | Read-only path, direction arrows, START; moving reload path white; legacy preview markers may show R |
| Amber A1/A2 squares | Automatically discovered candidate positions; read-only |

The same waypoint appears as canvas marker, START sequence text, Summary row, selected position text in Targets/Reload, and candidate counts. Targets appear as physical silhouettes, labels/rings/arrows, assignment rows, node rows, and alternatives. Moving windows and nodes are related but distinct. Stationary nodes can coincide with waypoints. Engagement labels restart per applicable segment/stationary group; they are not persistent global target names. No overlay legend/visibility controls separately toggle windows, nodes, arrows or labels; View's Route toggle controls the route layer outside route mode, which forces its display while active.

### Automatic planning

AI PLAN opens `AutoPlannerPanel`: Position Source buttons MANUAL/AUTO/AUTO + MANUAL; explanation and source/manual/auto/search/target/coverage counts; conditional DISCOVER POSITIONS, PREVIEW AUTO POSITIONS, Discovery details/warnings; magazine count; Ruleset; Route Style; Backward Movement; Reload Strategy; status/message; GENERATE ROUTES; limited-search notice; up to three candidate cards.

Manual source uses route positions and user visibility; Auto uses coarse discovered geometry positions; Combined keeps manual positions and deduplicates/adds automatic candidates. Discovery modifies transient `discoverySession` only. Preview Auto hides the sheet and exposes amber squares on a read-only pannable/zoomable stage; Back to planner restores it. Geometry edits invalidate discovery via geometry key; a stale warning requires rediscovery. Discovery is not persisted unless resulting positions become an accepted route.

Legacy Ruleset USPSA/IDPA/PCSL/Custom buttons are metadata only, explicitly identical general ammo/timing evaluation. Configured engagement rules replace these buttons with the saved stage-brief ruleset explanation. Styles: Minimum Movement / Harder Shooting, Balanced, More Movement / Easier Shooting, Personalized. Personalized shows confidence, factors used/fallback/warnings; unusable data falls back to Balanced. Backward Movement Avoid/Limited/Allowed and Reload Strategy Conservative/Balanced/Aggressive affect legacy ranking preferences, not hard movement constraints or new geometry. With engagement rules, final ranking instead sorts complete legal coverage by movement then stationary stops; visible style/preference controls do not change that geometry-first sorting contract.

Generate performs bounded local computation, not a network AI call. Status Ready/Generating/Results/No valid route/Error; generation controls disable while active. Positive rounds for every scoring target, valid ammo/start data and a useful position pool are necessary. Search caps include 12 positions, 64 targets, 16 magazines and 2,000 evaluations; configured geometry search has a 256-evaluation ceiling. No global optimality guarantee.

Each candidate card: candidate number/Best Evaluated, style or Airsoft / Geometry first, relative label, time/unavailable, yards/positions/reloads, average difficulty/ammo margin, configured stop/moving-segment/waypoint counts, auto/manual source counts, optional personalization/fallback, WHY THIS ROUTE expansion, DETAILS expansion, VIEW ROUTE, USE THIS ROUTE. Details include shooting difficulty total/average/max, loaded rounds remaining, minimum ammo margin, movement complexity, direction changes/reversals, estimated backward/sustained retreat, raw reload duration, available movement, overlap and additional reload time.

VIEW ROUTE leaves the current manual route untouched; hides sheet and stage-edit controls, permits pan/zoom, displays legend and Back to results. Back/hardware back exits preview. USE THIS ROUTE requests Cancel/Confirm replacement whenever `plan.route` exists; Route entry has already created one even if empty. Confirm deep-copies route/rules/positions/reloads into editable plan, selects first position, closes planner. It still requires designer Save. Input changes clear cards/expansions/pending confirmation; closing unmounts the panel and resets its local source/style settings when reopened. No persistent candidate library or multi-route selector exists.

### Control-effect classification

| Effect | Controls |
|---|---|
| Route geometry | Position, marker drag, Delete position, waypoint Earlier/Later, accepted candidate; changing physical Start changes origin |
| Rules/analysis inputs | Firing polygons, safe direction/half-angle, spacing, allowed movement/travel, target procedures |
| Target assignments/order | Mark visible, Engage here/Clear, canvas toggles, Recalculate, Engage earlier/later, accepted candidate |
| Ammo/timing inputs | Loadout, chamber/start designation, target rounds, reload magazine, profile contribution from Training |
| Candidate search/ranking only | Source, discover, style/backward/reload preferences; legacy ruleset is descriptive metadata |
| Visualization/transient state | Zoom/Fit/pan, preview, selected marker, grid/route visibility, Why/Details/discovery expansion |
| Persistent writes | Designer Save writes whole stage/plan; all route edits/Apply/Use/Done are draft-only beforehand |

Route summary contains authoring as well as analysis: stage-brief polygons/procedures, assignment recalculation/order, route name and waypoint order. These are editable inputs embedded in the analysis area, rather than pure results. This identifies the current responsibility mix without proposing relocation.

### Taps to major functions

Baseline: saved match/stage already exists, Home → Stage Planner → Open match → Open stage = 3 taps. Text entry, scrolling, drags, picker selections and prerequisite setup are excluded. Counts are minimum opening-path taps, not total completion effort.

| Function | From designer | From Home |
|---|---:|---:|
| Enter route | 1 | 4 |
| Add position | 2 | 5 |
| Targets or Reload for existing marker | Route + select marker + button = 3 | 6 |
| Canvas visible/engaged assignment mode | Previous + mode button = 4 | 7 |
| Route Summary | 2 | 5 |
| Engagement setup / edit | Route + Summary + setup = 3 | 6 |
| Recalculate, after rules configured | 3 | 6 |
| Engage earlier/later, after rules/assignments | 3 | 6 |
| Waypoint Earlier/Later | 3 | 6 |
| Delete existing position confirmation | Route + marker + Targets/Reload + Delete + Confirm = 5 | 8 |
| AI PLAN | 2 | 5 |
| Auto discovery | Route + AI PLAN + AUTO + Discover = 4 | 7 |
| Auto preview after discovery | Previous + Preview = 5 | 8 |
| Generate manual candidates, prepared inputs | Route + AI PLAN + Generate = 3 | 6 |
| View candidate after generation | 4 | 7 |
| Use candidate and confirm after generation | 5 | 8 |
| Save route edits | Top Save, 1 from any route canvas | 5 after entering route |
| Loadout from designer | Plan = 1 (default section; retained tab may add tap) | 4 |
| Target round list | Plan + targets = 2 | 5 |

## 7. Training Detailed Flow

Contexts cycle DRY_FIRE → LIVE_FIRE → PRESSURE_MATCH. These are stored classification/calibration contexts; there are no separate Dry Fire, Live Fire or Pressure/Match screens. Start types cycle Competition/Standard Holster, Level II/III Holster, Appendix, Low Ready, High Ready, Surrender Start. Session name is free text; `drillId` is null, totalTime null, notes empty, segments/videos empty at creation.

No reachable drill list/details, prescribed repetitions, start beep, real-time shot timer, score/zone hit logging, direct manual session-time/notes editor, session delete, or video delete. Existing notes can display, but new notes cannot be entered through this screen. Shot markers are timeline events, not scored target hits. History consists of recent sessions and linked video analysis.

### Video actions

Import uses a user-triggered document picker restricted to video files. Native copies/moves cache import into `training-videos/` in app documents; browser keeps a session object URL. Import persists an annotation session immediately, then opens its editor. Reopen selects Open analysis. Missing browser/native file preserves annotations and offers Relink original video; relink validates matching filename and saved size where known, then needs Save analysis. No camera capture, microphone recording or photo picker flow.

Player: native playback controls and custom Play/Pause; time/duration in ms; backward/forward nominal one-frame step when FPS known, otherwise 50 ms; seek-ms input/button; Add selected event at current time (pauses player). Failed player initialization exposes Retry playback and leaves annotation forms accessible. Metadata discovery can make the editor dirty without marker edits.

Close-up: select-region action pauses frame and intercepts video gestures; drag box; valid selection returns to normal controls; pre/post window inputs default 500/2000 ms, range 100–10,000; Run close-up analysis; cancel while running; Show/Hide overlay, next sample, sample status/confidence/event-window text. Review reports image-space displacement/path/velocity/variance/coverage/confidence, per-event pre/post behavior, residual/settle data and warnings. Suggestions are generic CUSTOM, not automatic gun/shot semantics.

Audio: Analyze/Re-analyze Audio, progress/cancel, count of candidates/matched markers/version, warnings. Movement: Analyze Movement, progress/cancel, sampled/unusable/matched counts, gross arm-motion phases and warnings. Both generate suggestions requiring review. Pose preview has Show/Hide pose overlay and Preview next saved pose sample; gaps are not interpolated and native full-screen playback lacks custom overlay. Jobs are mutually gated; backgrounding/unmount aborts them. Web extraction adapters always report rebuilt-iOS requirement; absent native modules also fail gracefully. iOS Swift/device execution remains unverified here.

Marker form: Event type expands all 18 types: STIMULUS, REACTION, HAND_ON_GUN, DRAW_COMPLETE, FIRST_SHOT, SHOT, TARGET_TRANSITION, MAG_RELEASE, MAG_ACCESS, MAG_INSERT, RELOAD_COMPLETE, MOVEMENT_START, MOVEMENT_STOP, POSITION_ENTRY, POSITION_EXIT, DRILL_END, CUSTOM, UNKNOWN. Milliseconds, optional target label, same-target string label, movement type, known movement distance in inches. Add marker at entered ms or Apply marker edit; Cancel marker edit. Manual markers are trusted immediately; detector confidence alone is not confirmation.

Timeline: confirmed movement bars, last-pose-run bars, raw/fused hypotheses and ordinary markers. Marker Preview seeks playback; Edit loads the upper form; Confirm event promotes suggestion; Delete event removes marker. Fusion cards show status/type/time/confidence/evidence families; Inspect evidence expands temporal spread/score/types/versions/warnings/source metadata/Preview; suggested hypotheses offer Confirm, Edit type/timestamp/Confirm edited event, Reject. Rejected evidence can be shown/hidden. Confirmed-event multi-source support remains inspectable. These review paths edit local analysis, not saved profile directly.

Measurements: stimulus response, presentation, draw, split, magazine manipulation/access, complete reload, post-reload shot, movement, position transition, target transition, total drill time and shooting string time; completeness/warnings/counts. Confirm measurement endpoints confirms its underlying events, then recomputes analysis.

### Compare to Plan

COMPARE TO PLAN expands inline; lists saved stages from every match; select stage, then Link snapshot [saved route]. Snapshot records saved document/route and profile timing at link time. Unsaved designer edits and merely previewed candidates are unavailable here.

Read-only 260-pixel snapshot viewport with pan/pinch/Fit; SUGGEST MAPPING uses confirmed timing and route order. Up to three candidates show confidence/coverage/reasons, Accept all pending mappings, per-pair preview/select, Accept mapping, Reject mapping, Edit / manually remap, conflicts and unmatched items. Timeline/grouping changes make suggestions stale; generate again. Accepted mappings do not silently replace fixed conflicting mappings.

Manual mapping: choose MOVEMENT/POSITION/RELOAD/STRING/TOTAL; planned element; confirmed interval; Assign confirmed interval/Update mapping; Remove selected mapping. STRING/POSITION allow multiple fragments; selection previews starting timestamp. Results show planned/observed/delta, attributed movement/engagement/reload/residual delta, unmapped time, count-based coverage and per-element details. Planned full dwell is unavailable. Changed/deleted source stage warns but historical snapshot remains. Remove comparison link and mappings is immediate draft change; no recompare-current-route action or multiple comparisons per video.

Save analysis persists video and comparison. Add eligible measurements to profile saves atomically and activates that video's context calibration; repeat contribution replaces those samples. Supported contribution includes compatible response/draw/reload/labeled same-target split/movement with separately known physical distance, with eligibility enforced by observations. Changed evidence removes stale prior contribution on ordinary saves. Close while dirty shows an inline instruction; Save then Close, or Discard changes and close. No training-editor undo/redo or browser beforeunload guard is connected here.

### Camera / import status

| Function | Implementation status |
|---|---|
| Video import/manual annotation/playback UI | WORKING source path; playback depends on file/codec/platform |
| Audio/pose/close-up extraction | PARTIALLY IMPLEMENTED across platforms: custom iOS implementation, unavailable web adapters/native missing-module fallback |
| Plan comparison/mapping/fusion review | WORKING connected source paths; require suitable evidence/snapshot |
| Camera capture/live video/microphone recording | NOT REACHABLE; no current controls/adapter flow found |
| Stage-plan photo upload/image picker/reference image | NOT REACHABLE; no current UI found |
| OCR/automatic stage reconstruction | NOT REACHABLE; deferred idea, not a working upload or placeholder screen |
| Apple sign-in/cloud synchronization | PLACEHOLDER explanatory text only |
| Structured drill catalog/live training execution | NOT REACHABLE; session-name groundwork only |

## 8. Component Map

All paths below are relative to `mobile/src/`. Conditional means mounted/displayed when the associated screen/state is active.

| Parent → component | Rendering/activation | Important inputs/state and data affected |
|---|---|---|
| Layout → StorageProvider | Always before navigator | repository readiness/error; initializes SQLite/profile/migrations |
| App screens → ui/kit | Screen/Panel/Action/Copy/Stat/DataRow | Scrollable chrome; callbacks own data mutation |
| Matches/Stages → EditorSheet | Create/edit/delete conditional | editing/deleting/name/family/busy; immediate repository writes on submit |
| Matches/AddMenu → TargetFamilyPicker | Conditional radio group | family selection; match default or target preset family |
| StageBuilder → useDocumentHistory | Always mounted hook | stage/plan snapshots; setStage/setPlan, grouped history |
| StageBuilder → StageViewport | Top down only | stage, transform, tool, selection, snap, route/readOnly; gestures and stage/route callbacks |
| StageViewport → StageGrid/SnapGuides | Grid setting / drag feedback | Pure overlays; no persistent data |
| StageViewport → DraggableObject → TargetFace | Objects rendered top down | object geometry/preset/selection; dragging mutates StageDocument; TargetFace image pure |
| StageViewport → GeometryControls | Selected target/segment, editable Select mode | rotation/endpoints; stage mutations, history grouping |
| StageViewport → RouteOverlay → EngagementOverlay | Route visible/mode/preview; rules conditional | route markers/assignment taps; derived nodes/windows; callbacks mutate StagePlan.route |
| StageViewport → AutoPositionOverlay | Discovery preview only | candidate squares; no editing |
| StageBuilder → AddMenu | showAdd | family/role/preset; placement mode, no object until canvas tap |
| StageBuilder → ObjectInspector → WallPortsInspector | Edit panel/selected wall | draft numeric fields/face cuts/ports; StageDocument |
| StageBuilder → StageSettings | Settings panel | local width/depth/outside warning; boundary only |
| StageBuilder → SnapControls | Snap panel | ephemeral snap settings |
| StageBuilder → PlanningPanel | Plan loadout/targets | magazine forms/batch, chamber, mass/per-target rounds; StagePlan |
| StageBuilder → RoutePanel → EngagementPanel → EngagementSettings | Summary/assign/reload; setup expanded | route name/order/assignments/reloads/rules; local analysis |
| StageBuilder → AutoPlannerPanel → PlannerResultCard | aiPlan panel; cards after generation | source/config/discovery/results/preview/pending; no plan mutation until accepted |
| StageBuilder → Stage25D | viewMode 25d | local yaw/zoom; pure SVG projection |
| Training → VideoAnalysisEditor → Player | Selected video modal; asset available | draft TrainingVideo; metadata/playback/markers/analysis |
| Player → PoseOverlay/CloseUpOverlay | Overlay toggles/region-selection | time/display sample/normalized region; selection activates extraction |
| VideoAnalysisEditor → CloseUpReview/FusionReview | Run/hypothesis evidence present | diagnostics; fusion confirmation/rejection callbacks edit analysis |
| VideoAnalysisEditor → ExecutionComparisonReview → MappingSuggestionReview | Compare expanded/snapshot linked | snapshot/mappings/suggestions; stored in TrainingVideo after Save |
| Player → MediaPlayerBoundary | Player mounted | catches player initialization errors; Retry |

Unreachable from ordinary UI: `components/app-tabs.tsx` and `.web.tsx` are not imported by root layout; AnimatedIcon/AnimatedSplashOverlay and HintRow are starter leftovers without current home mounting. Explore-only ThemedText/ThemedView/Collapsible/ExternalLink/WebBadge are reachable via direct `/explore`, not normal navigation. `objectActions.objectPalette`/create branch and `operations.addObject/removeLastObject/rotateObject` are underlying older APIs, not current standalone palette/remove-last/rotate controls. Repository observation add/replace/remove/manual-override/rebuild methods have no Account UI controls. Root legacy website and `mobile/mobile/package.json` are not a second Expo route tree.

## 9. Interaction / Mode Map

| Mode | Entry/visual indication | Gesture availability | Exit/cancellation |
|---|---|---|---|
| Select / Move | Upper Select active | Tap/drag objects, background pan, pinch; handles when selected | Other tool clears selection/draft/chain |
| Pan | Upper Pan active | One-finger pan anywhere; pinch; objects disabled | Select/other tool |
| Add Target | Preset chosen; active upper Add Target + preset instruction | Deliberate tap places; drag pans; pinch; objects disabled | Done/other tool; opening sheet/modal resets tool |
| Draw Wall / Fault Line | Active tool + instruction/draft metrics | Tap/drag endpoints; pinch cancels draft; no one-finger pan | Done/tool change/sheet/route/preview/25d resets tool/draft/chain |
| Target selected / rotation | Highlight, context strip, wheel/angle | Drag object or wheel; pinch yields | Deselect/empty tap/tool/route; inspector separate |
| Segment selected / endpoint edit | Highlight + two handles | Drag body translates; drag endpoints reshapes | Deselect/tool/route |
| Route mode | ROUTE MODE; substituted toolbar/marker status | Stage objects disabled; route markers drag; background pan/pinch | Exit; assignment canceled on route-mode change |
| Visible/engaged assignment | Context tells which toggle; highlighted target rings | Target taps toggle; marker dragging hidden; background pan/pinch | Done/change selected position/route mode; Targets button resets before opening |
| Sheet open | Dim backdrop/title/Done | Scroll/edit sheet; underlying canvas blocked | Done/backdrop/back; usually drops unapplied form drafts |
| 2.5D | 2.5D PREVIEW and camera instructions | Camera buttons only; no stage editing gestures | View → Top Down/Route/Fit |
| Candidate/discovery preview | Read-only status + return button | Canvas pan/pinch/zoom; mutation gestures disabled | Return/custom Back/hardware Back; input changes reset preview |
| Video marker edit | EDIT MARKER; Apply/Cancel | Text editing, type selection; separate playback controls | Apply or Cancel edit |
| Close-up selection | Selection instructions; native controls disabled | Video-box drag intercepts player area | Valid box/cancel/seek |
| Detector job | Progress/cancel; analysis/save actions disabled | Some marker edits still possible; other jobs gated | Completion/error/cancel/background/unmount |
| Comparison mapping | Selected kind/element/interval | List taps; snapshot pan/pinch | Close section/kind switch/remove link |

Mode state is mostly visible in buttons/status/instructions, but snap exceptions, moving intent, remembered Plan tab and the distinction between waypoint/engagement counts require additional context. Selection is single-object/single-waypoint; no lasso or multi-select. Stage name, viewport, snapping and UI modes are outside stage/plan undo history. Planner previews retain a Save button that saves the current document, not the displayed candidate.

## 10. Gesture Map

| Screen/object | Gesture | Result | Mode/conflict |
|---|---|---|---|
| All lists/sheets | Tap button/input; vertical swipe | Action/focus/scroll | Sheet captures input, canvas blocked |
| Designer upper tools | Horizontal swipe | Scroll tool strip | Different from canvas pan |
| Designer stage object | Tap / single drag | Select / move | Only Select, editable top down; child owns gesture |
| Designer empty canvas | Tap | Deselect, place target, or draw endpoint | Meaning changes by tool; target tap under 500 ms and ≤6 px movement |
| Designer empty canvas | Single drag | Pan or draw segment | Drawing tool owns drag; placement drag does not place |
| Designer canvas | Two-finger drag / pinch | Pan / zoom around touch centroid | Parent captures; child drag yields; drawing draft canceled |
| Selected target wheel | Handle drag | Continuous target rotation | Handle vs object drag; no two-finger rotation gesture |
| Selected wall/fault-line endpoint | Handle drag | Endpoint reshape | Can overlap object/neighbor hit regions; pinch yields |
| Route marker | Tap / drag | Select / move waypoint | Route mode only; no snap; overlapping center markers compete |
| Route assignment target ring | Tap | Toggle visible or engaged | Drag beyond 6 px/multitouch cancels tap; no marker drag in this submode |
| Candidate/discovery/snapshot | Drag/pinch | View navigation only | Overlays pass through; editing blocked |
| Editor sheet backdrop | Tap | Close sheet | Unapplied input draft can be lost |
| Video native controls | Scrub/playback/platform controls | Playback seeks/toggles | Platform-owned; disabled while close-up selecting |
| Video close-up overlay | Drag box | Normalized region selection | Competes with ScrollView/native playback; selecting captures area |
| Navigation | Header back / Android hardware back | Leave screen or dismiss modal/preview | Builder guarded; native swipe-back disabled there |
| Legacy website objects | Pointer drag | Pixel-position object move | Separate website, no Expo mode/history |

No app-authored long-press, double-tap, fling action, two-finger target rotation, swipe-to-delete, or keyboard shortcut handler was found in the reachable feature UI. Native video/navigation gestures remain platform-owned and untested.

## 11. Persistence / Data Flow

SQLite file `practical-shooting.db`, initialized through StorageProvider; tables matches/stages/training/profiles; local profile ID `local`. Initialization gates every screen. Writes are serialized; multi-record match duplication/deletion, migrations and training/profile contribution use transactions.

| UI action | State/data path |
|---|---|
| Match create/settings | local name/family → repository validation → matches insert/update → list reload/navigation |
| Stage create | name + current match family → default document/empty plan → stages insert with matchId/payload → builder load |
| Place object | viewport coordinates → physical point → placeTarget/addSegment → history.setStage → reconcilePlan → dirty snapshot |
| Select/edit object | selection ID → context/inspector → parsing/validated operation → stage/history; scoring round edits separately change plan |
| Delete/reset | applyObjectAction → stage + reconciled plan; reset explicitly clears route/engagements → history |
| Stage save | JSON dirty comparison of name/stage/plan → repo.saveStage → updated payload/time → saved snapshot/feedback |
| Route edit/save | marker/assignment/rules/reload callbacks → history.setPlan route → dirty → same designer Save; no separate route table |
| Route analysis | current geometry + plan + route + loaded profile → evaluateRoute/analyzeEngagements → derived warnings/ammo/time/overlays; Recalculate explicitly stores new assignment IDs |
| Auto planning | stage/plan/profile + transient source/discovery/config → generate/evaluate/rank → transient cards → accepted deep copy into plan → Save |
| Training save/import | new record or imported video → repo.saveTraining → normalized JSON training payload → history refresh |
| Video edits | events/detector evidence → analyzeVideo → draft video measurements/fusion → Save analysis training transaction |
| Profile contribution | eligible confirmed observations → contributeTrainingVideo → training + context profile update atomically; evidence changes withdraw obsolete contribution |
| Plan comparison | saved-stage selection → historical snapshot/profile inputs → manual/suggested mappings → video draft → Save analysis |

Stage payload wrapper version 1, StageDocument schemaVersion 7/coordinateSystem inches, route version 1. Unsupported/damaged stages are rejected without rewriting stored payload. Standalone old stages are associated with Imported Stages match without changing document payload/IDs/timestamps. Optional legacy endpoints derive from center/length/rotation; optional route/target family/preset/outline fields remain compatible where validators permit. Damaged training rows are skipped with warnings while raw stored data stays untouched.

Persistent: match/stage names/family, geometry/ports/cuts/presets, plan ammo/rounds/route positions/order/assignments/moving IDs/rules/reloads; sessions/video annotations/evidence/comparisons/profile contributions. Ephemeral: selection, viewport, snapping/grid/route visibility, current tool/placement/draft/chain, sheet/tab state, history, planner config/results/discovery/previews, video playback/overlay state. There is no cloud synchronization. Browser media access expires on page reload even though annotations persist.

## 12. Feature Reachability Matrix

VISIBLE = directly exposed on its host screen; HIDDEN = requires a sheet/mode/expansion/selection; PARTIAL = platform or model limitation; UNREACHABLE = no normal current entry; PLACEHOLDER = visible explanation without working action. Home tap counts assume saved match/stage/session/video where required; parentheses identify extra prerequisites.

| Feature | Screen | Entry point | Taps from Home | Status |
|---|---|---|---:|---|
| Matches list | Matches | Stage Planner | 1 | VISIBLE |
| Create match | Matches | Create Match sheet | 2 | VISIBLE |
| Match name/family | Matches | Rename / Target family | 2 | HIDDEN |
| Duplicate/delete match | Matches | Row actions; delete confirm extra | 2 / 3 | VISIBLE |
| Stage list | Stages | Open match | 2 | VISIBLE |
| Add stage/name | Stages | Add Stage | 3 | VISIBLE |
| Rename/duplicate/delete stage | Stages | Row actions; delete confirm extra | 3 / 3 / 4 | VISIBLE |
| Designer | Designer | Open stage | 3 | VISIBLE |
| Save/name/undo/redo | Designer | Top input/Save; lower history row | 3 to see, 4 action | VISIBLE |
| Dimensions/outside correction | Designer | Stage Settings | 4 | HIDDEN |
| Preset family/role/add target | Designer | Target modal | 4 (preset 5, placement 6) | HIDDEN |
| Draw wall/fault line | Designer | Upper tools | 4 | VISIBLE |
| Select/move/pan/zoom | Designer | Canvas/tools/zoom row | 3–4 | VISIBLE |
| Rotation wheel/endpoints | Designer | Select object | 4 | HIDDEN |
| Numeric geometry/face cuts | Designer | Select → Edit | 5 | HIDDEN |
| Wall ports | Designer | Select wall → Edit | 5 | HIDDEN |
| Object duplicate/delete | Designer | Select → action; confirm delete | 5 / 6 | HIDDEN |
| Grid/route visibility/2.5D | Designer | View | 4 (switch 5) | HIDDEN |
| Snap settings | Designer | View → Grid / Snap Settings | 5 | HIDDEN |
| Reset default document | Designer | View → Reset → Confirm | 6 | HIDDEN |
| Loadout/chamber/start magazine | Designer | Plan | 4 | HIDDEN |
| Batch magazines | Designer | Plan → Batch Magazine Editor | 5 | HIDDEN |
| Individual/mass target rounds | Designer | Plan → targets → mass if needed | 5 / 6 | HIDDEN |
| Manual route mode | Designer | Route | 4 | VISIBLE |
| Add route point | Route | Position | 5 | VISIBLE |
| Labels/visibility/engagements | Route | Select marker → Targets | 6 | HIDDEN |
| Canvas target assignment | Route | Targets → assignment mode | 7 | HIDDEN |
| Reload magazine | Route | Select marker → Reload | 6 | HIDDEN |
| Explicit reload-mode editor | Route | No mode control | — | UNREACHABLE |
| Delete route position | Route | Targets/Reload → Delete → Confirm | 8 | HIDDEN |
| Route summary/name/order/ammo | Route | Summary | 5 | HIDDEN |
| Moving/stationary configuration | Route | Summary → setup | 6 | HIDDEN |
| Firing polygons/procedures | Route | Inline setup | 6+ target/area choices | HIDDEN |
| Assignment recalc/engagement order | Route | Summary actions after setup | 6 | HIDDEN |
| Manual moving-window editor | Route | No independent editor | — | UNREACHABLE |
| Calibrated moving-fire timing | Route | Summary unavailable notice | 5 | PARTIAL |
| Automatic candidates | Route | AI PLAN → Generate | 6 prepared | HIDDEN |
| Auto discovery/preview | Route | AI PLAN → AUTO → Discover/Preview | 7 / 8 | HIDDEN |
| Candidate details/why/view | Route | Generated card actions | 7 prepared | HIDDEN |
| Accept candidate | Route | Use → Confirm | 8 prepared | HIDDEN |
| Legacy competition ruleset enforcement | Route | AI PLAN Ruleset buttons | 6 | PLACEHOLDER |
| Training history/new session | Training | Home Training | 1 | VISIBLE |
| Context/start-type choice | Training | Cycling buttons | 2+ cycles | VISIBLE |
| Drill catalog/details/live timer/hit score | Training | No controls | — | UNREACHABLE |
| Import video | Training | Add / Import Video | 2 + picker | VISIBLE |
| Video editor/playback/markers | Video Analysis | Open analysis | 2 | HIDDEN |
| Audio/movement/close-up extraction | Video Analysis | Analyze buttons/region selection | 3+ | PARTIAL |
| Fusion/measurement confirmation | Video Analysis | Evidence/endpoint actions | 3+ | HIDDEN |
| Plan link | Video Analysis | Compare → stage → Link | 5 | HIDDEN |
| Mapping suggestions | Video Analysis | Compare → Suggest after link | 4 linked | HIDDEN |
| Manual mapping/results | Video Analysis | Compare → kind/element/interval | 3+ | HIDDEN |
| Save analysis/profile contribution | Video Analysis | Bottom actions | 3 | HIDDEN |
| Profile baseline | Account | Home Account / Profile | 1 | VISIBLE |
| Profile manual observation editor | Account | Repository API only | — | UNREACHABLE |
| Apple sign-in/cloud | Account | Planned text | 1 | PLACEHOLDER |
| Camera/image/reference/OCR/reconstruction | None | No current entry | — | UNREACHABLE |
| Starter Explore | Explore | Direct file route only | — | UNREACHABLE |
| Old saved-stage link | Redirect | `/saved-stages` | — | UNREACHABLE |
| Starter tabs/animation/hint | None | Not mounted | — | UNREACHABLE |
| Original standalone HTML planner | Root website | Open root index.html separately | — | UNREACHABLE |

## 13. Friction and Redundancy

Conceptual hierarchy versus rendered prominence:

| Screen | Primary / secondary / advanced | Current prominence |
|---|---|---|
| Home | Enter planner/training / profile | Planner/training panels prominent; profile plain action |
| Matches/Stages | Open/create / rename / duplicate/delete | Every record renders four full actions; destructive/administrative actions consume similar space to Open |
| Designer | Build/move/place / save/history/settings / precision/route/loadout/preview | Upper and lower tools simultaneously; advanced Route/Plan/View share bottom weight with Target/Edit |
| Route | Construct path/assign / reload/order/save / analysis/procedures/AI | Six bottom tools; setup hidden in Summary; analysis authoring precedes summary stats |
| Training | Create/review session / import / detector/mapping/profile work | Start Training looks like execution start; video editor dominates actual functionality |
| Video Analysis | Review timeline / save / detectors/comparison/calibration | Save below potentially very long evidence/results; no sticky save/navigation |
| Account | Read baseline / future identity | Read-only data plus planned cloud explanation; no management controls |

| Location | Current behavior | Why it creates friction |
|---|---|---|
| Matches/Stages lists | Four actions for every row; lists fully mapped rather than virtualized | Long histories require repeated scrolling past administration controls |
| Designer tools | Add Target above and Target below; Edit in context and bottom bar | Duplicate entry points consume simultaneous space |
| Designer Move | Button only displays an instruction in error/message area | Label implies a state/action; result is informational |
| Drawing | Local Undo last segment plus global Undo; Done plus Cancel current segment | Similar terms operate on different scopes; completed versus pending geometry matters |
| Snap | Global rotation options, fixed 45° drawing attraction, free wheel/numeric target rotation, unsnapped route markers | Same “snap” status does not predict every edit behavior |
| Sheet Done | Closes form while Apply/Save actions live inside | Draft text can be dropped; Done is not persistence |
| Route first entry | Creates empty route; candidate adoption then requires replacement confirmation | First-time automatic setup still encounters replacement language |
| Route toolbar | No loadout/round editor access while route mode active | Planning prerequisites require Exit → Plan → return Route |
| Route Summary | Engagement authoring/target rows precede basic route totals | Basic results can be below many advanced controls |
| Route setup | Polygon coordinates typed by hand; fault lines are separate geometry | Two representations of course boundary must stay aligned manually |
| Targets/Reload | Both contain label editor and position deletion | Same point management repeated in unrelated-looking sheets |
| Route selection | Points added at center; configured W labels have no selected border | Overlapping points/weak selection contrast can complicate selection; physical behavior untested |
| Assignment | Visibility toggle clears local engagement as well | A visibility edit can remove intended firing assignment |
| Route terminology | Position, waypoint, engagement node, stop, moving segment, Summary/Route Analysis | Similar words describe distinct persisted and derived entities |
| Engagement display | Windows, path, nodes, target arrows/letters/labels share canvas | Dense scenes can overlap; labels have fixed widths, no collision avoidance |
| Route overlay visibility | Route ON/OFF unavailable in route toolbar; no per-layer controls | Cannot independently suppress dense arrows/windows while editing route |
| AI panel | Many full button groups/counts/warnings; configured geometry still displays style preferences | Large vertical burden; displayed preferences differ from geometry-first ranking contract |
| Candidate preview | Save remains top-right while candidate is read-only | Save persists manual plan, not previewed candidate; acceptance is separate |
| Training contexts/start types | Cycling rather than list selection | User must cycle through unseen choices to reach desired context/start |
| Start Training | Only persists empty session | No immediate timing/execution feedback suggested by action name |
| Video editor | Native controls plus Play/Pause/step/seek; generic evidence/version/ID text | Duplicate playback surfaces and developer-like provenance compete with review tasks |
| Video save | Bottom of a long scroll; dirty Close writes inline instruction | Save/discard can require scrolling away from current review context |
| Video timeline | Edit opens form earlier in page without scrolling it into view | User may need to find editing fields manually |
| Comparison | Snapshot + candidate mappings + manual lists + detail results | Many representations of same element/interval; IDs are exposed in details |
| Account refresh | Uses mount-time useEffect, unlike list focus refresh | Existing mounted profile screen can retain pre-contribution values on refocus |
| Documentation | Historical “not implemented” statements remain in source READMEs | Documentation names/status alone would misrepresent reachable functionality |

These are observed source behaviors or identified layout risks, not a proposed redesign. No confirmed device defect is inferred solely from a risk.

## 14. Responsive / Phone Concerns

- Manifest requests portrait orientation; no breakpoint-driven phone/tablet layout in feature UI. Designer uses flexible canvas and safe-area edges on all sides; canvas is not inside a ScrollView.
- Top controls/status/tool/drawing/history/bottom rows take vertical space; canvas minimum 100 can compete with small-height windows. Adding drawing instructions changes canvas height; selected context deliberately overlays instead.
- Editor bottom toolbar has five/six flex children, minWidth 44, no horizontal scroll. Six controls require at least 264 units plus padding; tiny windows/large text can overflow or wrap within labels. Upper designer strip is horizontally scrollable, so not all five tools necessarily visible.
- Most actions/inputs and target/route/handle hitboxes are at least 44 high. Segment bodies use scaled physical thickness plus hitSlop 10, so thin-line selection can remain difficult at low zoom. Derived 20-pixel engagement circles and amber squares are noninteractive, not undersized buttons.
- Target visual scale remains physical while interactive box is at least 44; neighboring targets can have overlapping hit areas. Selected wheel radius at least 42; circle/angle and endpoint handles near edges can be clipped by canvas overflow hidden.
- Absolute overlays: selection context bottom 8 across canvas; route labels width 100, node labels 110; arrow labels/port labels positioned beyond shapes. No collision avoidance; panned/off-edge annotations clip.
- Inspector/port fields wrap, minWidth 120/flexBasis 40%; selectors and action rows vary in wrapping behavior. Some route/order and family rows have no wrap. Long translated text, target names and text scaling were not measured.
- Shared Screen scrolls and has bottom padding 60, but no explicit SafeAreaView or KeyboardAvoidingView. Navigator handles header; full-screen Video Analysis uses this shared Screen directly, so modal top safe-area/keyboard coverage needs native verification.
- EditorSheet maxHeight 85%, scrollable body, fixed header, bottom/left/right safe area, iOS keyboard padding and drag-to-dismiss keyboard. Backdrop dismisses; form submit is within scrolling body. AddMenu is full-screen safe-area and scrollable.
- Top stage-name TextInput has no keyboard avoidance in designer. Unsaved-exit modal is centered with padding 24, without scrolling/keyboard avoidance/safe-area wrapper; short height/keyboard may crowd it.
- Video display fixed 220 high; comparison canvas fixed 260 high; firing polygons minHeight 110. Long video/evidence/results screens scroll, but control grouping is not responsive to available video height.
- iPhone-specific source: editor swipe-back disabled; EditorSheet uses iOS keyboard padding; custom AVFoundation/Vision module requirements. No physical-device behavior was tested in this audit.
- Existing tracker reports web SQLite teardown/OPFS exclusive-handle investigation. This can gate startup/browser verification; it is not evidence of an iOS layout/storage defect.

## 15. Current Visual Language

| Attribute | Current feature UI |
|---|---|
| Background/surfaces | #0A0A0A background, #171717 panel, #212121 secondary, #2A2A2A selected; navigator content #090B0C |
| Text | #F1F1F1 main, #9B9B9B muted, #696969 subdued |
| Accents | #28BFE8 cyan; danger #B84B4B; borders #333333 |
| Typography | Title 22/28 weight 600; section 16/22 500; body 13/19 400; label 12/16 500; category 10/14 with tracking; stats 25/31 tabular numerals |
| Panels | Flat dark rectangles, subtle top hairline, 16 padding, 12 gap; few rounded corners |
| Buttons | Secondary filled rectangles/bottom hairline, ≥44 high; disabled opacity 0.4; pressed opacity or selected surface depending component |
| Inputs | Dark secondary surface, bottom border, 44 minimum; some inspector inputs radius 2 |
| Toolbar | Custom 22-pixel line icons, decorative; 10/14 muted labels; active cyan/selected surface; 54 minimum tool height |
| Selection | Cyan outlines/borders, selected surface; family includes checkmark; route assignment rings change fill/border |
| Modals | Sheet dim #0009, bottom-aligned slide/85%; target full-screen; exit fade dim #000b; analysis full-screen slide |
| Stage material | Brown paper, white no-shoot (PCSL red), muted gray-teal steel, green-gray walls, ochre fault lines/port labels |
| Analysis colors | Teal movement/circles #148578; cyan route; amber suggestions/discovery; purple pose; teal confirmed evidence; white reload preview |
| Spacing/radii | Common 4/6/8/12/16 gaps, 8/12/16 padding; radii 2/3/4 for fields/start/squares, circular 22 route marker, 6 handle dot |

Inconsistencies: errors sometimes danger red, sometimes ordinary muted/body text; selected-state patterns vary across family radios, context tools and configured waypoint labels; shared Action full-width versus PlanningPanel/inspector align-start controls; multiple shades of cyan/teal identify different concepts without a universal legend; native video controls differ from custom chrome; orphan Explore uses separate theme/light-dark starter system; root legacy site uses light Arial/card/border styles. Shared Screen converts supplied uppercase titles to sentence case, while category/instruction headings frequently remain uppercase.

## 16. Important Constraints for a Redesign

- Preserve current route entry paths and saved-stage redirect, stage-ID loading and owning match back destination; file-route existence does not imply a visible tab.
- Preserve SQLite/schema/payload compatibility, stable match/stage/object/port/magazine/route IDs, match ownership/cascade isolation, byte-preserving Imported Stages migration and damaged-record protection.
- Physical coordinates are inches internally; upper-left origin, X right/Y down/Z up; UI lengths generally yards, video time milliseconds, profile time seconds/movement inches per second. Viewport pan/zoom cannot alter physical geometry.
- Targets are upright faces with stored width/height/outline/family/preset/cut; approximate vendor outlines are not scoring zones. Do not replace saved dimensions with current preset defaults.
- Start cannot be duplicated/deleted; stage resize preserves objects, asks before keeping outside items and provides manual correction. Segment endpoint compatibility and fixed-start length/angle editing must survive.
- Preserve wall ports' local offset, sill/elevation/dimensions and unique IDs; 2.5D is visualization, not proof of occlusion/body clearance.
- Preserve deliberate repeated placement, draw chaining/draft cancellation/local segment undo, endpoint/wheel manipulation, exact numeric editing, multi-touch yielding, grouped history and dirty-exit guards. History includes stage/plan but not name/view state.
- Route path waypoints, stationary nodes, moving windows and engagement order are separate. Nodes/windows/arrows are derived; editable route positions/order/visible/engaged/moving target IDs/rules/reloads must remain represented.
- Preserve single engagement ownership, multi-position visibility, ammunition/chamber/start-magazine simulation, reload timing overlap, stationary-mode data even where current UI lacks its selector, and unassigned/missing-reference warnings.
- Firing polygons/procedures are explicit physical inputs independent of drawn fault lines; safe-angle/IDPA area requirements and current model limits must not be silently inferred away.
- Preserve manual route versus discovery/candidate preview separation, confirmation/adoption, normal editing after adoption, bounded search/fallback/unavailable timing and geometry-first ranking. “AI PLAN” currently runs local deterministic computation.
- Keep explicit Save boundaries clear: sheet Apply/Done, candidate adoption and route exit do not themselves persist designer data. No autosave currently exists.
- Training remains local session/video evidence; manual/confirmed evidence differs from raw detector confidence. Preserve review/confirmation/rejection/provenance, eligibility and context-separated profile contribution/withdrawal.
- Comparison snapshots fix historical document/route/profile inputs; preserve multi-string/multi-fragment mappings, stale suggestion guards and changed/deleted-stage warnings. Video does not recognize stage coordinates or target identity.
- Native dependencies include Expo SQLite, document picker/filesystem, video/image and custom TrainingAudio/TrainingPose/TrainingCloseUp iOS modules. Maintain unavailable-module/codec/missing-file fallback, cancellation/background cleanup and annotations even without playable media.
- Browser video URLs are temporary; historical annotations persist and need original-file relink. No camera/image import/reconstruction/cloud feature can be assumed from the current UI.

### Validation and inspected-source register

Reachable ordinary routes found: `/`, `/planner`, `/match?id=...`, `/builder?id=...`, `/training`, `/account`; compatibility `/saved-stages` redirects; `/explore` direct-only. All conditional feature views/sheets are enumerated above. Unmounted/direct-only components and APIs are listed in section 8.

Inspected source files (some supporting files inspected through targeted symbol/field sections): root `AGENTS.md`, `bugs.md`, `features.md`, `index.html`, `script.js`, `styles.css`; `mobile/AGENTS.md`, `mobile/package.json`, `mobile/app.json`, `mobile/mobile/package.json`; every `mobile/src/app/*.tsx`; `ui/{kit,tokens,ToolIcon,TargetFamilyPicker}`; `editor/{StageBuilder,StageViewport,Stage25D,StageSettings,AddMenu,EditorSheet,ObjectInspector,WallPortsInspector,GeometryControls,DraggableObject,TargetFace,RouteOverlay,EngagementOverlay,AutoPositionOverlay,SnapControls,inspectorFields,objectActions,useDocumentHistory,history,viewportGestures,designerTools,browserGuards}`; `planning/{RoutePanel,PlanningPanel,EngagementPanel,EngagementSettings,AutoPlannerPanel,PlannerResultCard,route,model,engagements,positionSources,plannerUI,candidateGeneration,planner,ranking}`; `stage/{defaults,coordinates,operations,segments,snapping,ports,targetPlacement,targetPresets,targetFace}`; `storage/{StorageProvider,repository}`; `profile/model`; `training/{model,observations,videoModel,VideoAnalysisEditor,ExecutionComparisonReview,MappingSuggestionReview,FusionReview,CloseUpReview,CloseUpOverlay,MediaPlayerBoundary,videoAssets,videoAssets.web,extractPose,extractPose.web,extractCloseUp,extractCloseUp.web,extractAnalysisAudio,extractAnalysisAudio.web}`; starter `components/app-tabs.tsx`/`.web.tsx`. File and symbol searches also covered the source tree, module filenames and source README statements to check absent camera/image/gesture entries. Native Swift implementation and lower-level detector/geometry algorithms were not exhaustively line-reviewed; this report traces their UI contracts/adapters, not scientific accuracy.

Uncertainty: physical touch/rendering/keyboard/codec behavior; Swift compilation/extraction accuracy/performance; actual device saved-data contents; deep-link behavior in installed build; small-screen/text-scaling overflow; browser startup/SQLite worker behavior. This source audit does not resolve those runtime questions or claim tests passed. Existing documentation/test records were not treated as this audit's test execution.

Tracker age reminder: no dated unresolved item inspected is more than one month old as of October 4, 2026 (earliest dated current follow-ups are September 9). Undated legacy entries cannot be aged reliably. Web storage teardown and native gesture/analysis/device verification remain unresolved follow-ups, without modifying their trackers.

Report: `docs/current-ui-audit.md`. Validation performed: source/navigation/callback/state/persistence tracing and final file-change scope inspection only.
