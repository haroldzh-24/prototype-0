# Phase 8E event fusion

`eventFusion.ts` is pure TypeScript. It consumes compact evidence, never native frames,
audio samples, or profiles. `VideoAnalysisResult.events` and detector runs remain raw
storage; fusion is an additive optional field. Older video records compute it on load.

Evidence contains an ID, original milliseconds, proposed event type, source, confidence,
detector family/version/run, optional duration, warnings, interpretation, timeline link,
and candidate metadata. Existing runs lack a separate durable run UUID, so their family
and `analyzedAt` identify the run; family/version/run/candidate index identify candidates.
Confirmed timeline events normalize as USER_CONFIRMED while retaining detector family.
Full detector diagnostics stay in their original runs. Previously attached confirmed
support retains compact evidence when its original run is replaced.

Clustering uses deterministic trusted-anchor-first, complete-link association: every
member must be compatible with every other member and within the smaller category
tolerance. No transitive chaining. Sharp events (shot, first shot, stimulus) use 35 ms;
reaction/movement onset/position exit use 180 ms; other events use 90 ms. The maximum
search range is 180 ms. Closest trusted anchors take precedence and never merge with
one another. Ties use evidence IDs.

Compatibility is explicit: equal known types associate, SHOT/FIRST_SHOT associate,
and REACTION/MOVEMENT_START associate. POSITION_EXIT remains distinct from movement
start. CUSTOM requires identical explicit interpretation; OBJECT_TRANSITION and
HAND_OBJECT_PROXIMITY cannot merge with semantic events or each other. UNKNOWN stays
separate. Current native outputs therefore have limited semantic overlap: fusion does
not relabel a generic close-up transition as a reaction, stop, shot, or gun action.

Trusted type/time always win. Otherwise timestamp estimation uses a confidence-weighted
median with one strongest representative per family (ties: timestamp, then ID), so
duplicate outputs cannot pull the center through voting. Original timestamps remain.
Confidence uses the strongest family score (LOW .35, MEDIUM .60, HIGH .82), then a
bounded independent-family agreement bonus. Temporal spread and type disagreement
reduce it; warning categories reduce it by up to .40 total. The HIGH threshold is .80.
Noisy audio, camera motion, occlusion/visibility/missing data and tracking loss are
recognized from warning codes and existing detector warning text. Warnings never
revoke explicit user confirmation. Missing modalities receive no bonus and an explicit
PARTIAL_MODALITIES explanation. Multiple runs of one family remain one vote and are
marked CONFLICTING_RUNS. Confidence is heuristic, not a calibrated probability.

Hypotheses store evidence IDs, families, spread, warnings, disagreement, deterministic
explanation codes, review state, algorithm/config versions and detector run references.
They contain no duplicated raw payloads. Different meanings/times remain separate;
compatible but imperfect agreement is explicitly flagged. Future cache versions are
recomputed with a FUSION_RECOMPUTED warning, while authoritative events remain intact.

The timeline shows raw/fused suggestions, confidence and modalities. Inspect expands
original timestamps, confidences, warnings, metadata and run/version references.
Confirm (including edited type/time) creates exactly one DERIVED, confirmed timeline
event with evidence references. It does not confirm the underlying detections. Editing
that reviewed event retains its explicit authority and original evidence. Rejection
records evidence IDs and leaves raw detections intact; rejected evidence is inspectable.
Trusted events expose attached support separately. Presentation and derived analysis
suppress covered redundant suggestions without deleting them from storage.

Independent detector reruns replace that detector's unconfirmed evidence via existing
merge functions, recompute compact fusion, retain unrelated raw runs and trusted events,
and retain archived confirmed support. Unaffected hypotheses keep stable content and
IDs, although the bounded pure pass recomputes them. Rejection applies to the reviewed
run; a new run can offer a new hypothesis. Deleting an authoritative event can expose
its raw suggestions again; reject those suggestions to dismiss them.

All limits are in FUSION_CONFIG: 1,600 evidence records, 32 members/support references
per hypothesis, 800 hypotheses, 180 ms search range. Overflow, invalid evidence,
duplicate IDs, stale references and run conflicts have deterministic warnings.
Conflicting duplicate IDs are excluded, not arbitrarily selected. Bounds can split a
dense cluster or leave overflow events as raw markers. Clustering is bounded quadratic
over compact records; no native or cloud work occurs here.

The calibration boundary is unchanged: confirmation -> authoritative event -> derived
measurement -> PerformanceObservation -> explicit contribution -> profile rebuild.
Fusion does not import or write ShooterPerformanceProfile. SQLite persists fusion in
the existing training JSON; no database migration or new native permissions are needed.

Remaining verification: physical-device review interactions/save/reopen and empirical
tolerance/confidence calibration. No browser automation, screenshots or iOS export
are part of this phase's validation.
