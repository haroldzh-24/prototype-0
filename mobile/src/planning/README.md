# Manual route planning

`StagePlan.route` is optional so Phase 1 saved stages remain valid. `StageDocument`
and its schema are unchanged. A route owns its ID/name, ordered positions (array
order), target-ID visibility/engagement references and reloads keyed by position.
The repository validates route shape and saves it in the existing plan payload.
Stale target/magazine references remain available for explicit warnings and repair.

`evaluateRoute` derives typed movement segments, ammo states and estimated timing
from the current document, plan and saved shooter profile. Derived data is not
cached in SQLite: moving START/targets, editing the loadout, or changing profile
values must not leave stale results after reopening. Position coordinates are
ground-level inches and use the existing viewport conversion helpers.

Visibility may overlap, but the UI moves a target's intended engagement to exactly
one position. Round counts come only from `StagePlan.engagements`. Missing/zero
counts and unengaged shootable targets warn. Target deletion does not silently
remove route references; the route panel offers removal of missing assignments.

Ammo starts with the designated magazine's actual loaded rounds plus the explicit
chamber flag. Each manually selected reload occurs before that position's shots,
retains at most one chamber round and discards the previous magazine. A magazine
cannot be reused. Insufficient engagements warn and consume only available rounds;
subsequent results remain provisional. No reloads are inserted automatically.

Timing adds straight-line distance / movement speed, one draw if shots are planned,
(rounds - 1) splits for each target, transitions between targets within each position,
and successful reloads. It does not model target difficulty, first-shot acquisition
after movement, obstacles, acceleration or overlapping movement/reloads. Invalid
profile timing values disable timing while retaining distance and ammo results.

Route markers appear only in Top Down route mode. Stage editing and 2.5D continue
to use the same physical document. Reset clears the route and engagement counts,
retaining the loadout. Automatic generation and visibility solving are deferred.

## Automatic ranking (Phase 3)

Use `generateCandidates(context, config)`, then map candidates through
`evaluateCandidate(context, candidate)` and pass those to `rankCandidates`.
Generation warnings (including SEARCH_LIMIT) remain on the generation result;
callers must retain those alongside ranking warnings. No route is applied or saved.
The default returns up to five diverse results; options allow `maxResults` and
`diversity: false`. The legacy callback override retains its original unfiltered
behavior. Lower scores win; stable input order breaks ties. Each result includes
requested/effective style, rank, metrics, original candidate, warnings and additive
reason contributions. Compare contributions between candidates to explain ranking.

All heuristic constants are in `RANKING_CONFIG`. Fixed scales are 10 seconds,
120 movement inches and 10 total difficulty points. Minimum Movement emphasizes
travel and position count; Easier Shooting emphasizes total engagement difficulty;
Balanced combines evaluator time, travel, difficulty, positions, reloads and turns.
Difficulty remains a per-target distance proxy (one point per yard), not seconds.
Missing timing disables time terms across the batch so missing data is not rewarded.
Insufficient ammunition is excluded; other evaluator warnings remain visible.
The normal input is the generator's feasible, complete candidates.

Personalized currently always falls back to Balanced: even a valid current
ShooterPerformanceProfile has no difficulty-dependent shooting calibration.
Average split time cannot establish the extra time this shooter needs for harder
shots. PROFILE_FALLBACK explicitly reports this missing capability. Existing
profile timing is still used honestly through the evaluator.

Movement facing is the coherent mean of unit bearings to targets engaged at the
position being left (mean length at least 0.85). START, empty positions, coincident
targets and ambiguous/dispersed bearings supply no facing. A segment of at least
12 inches more than 120 degrees away is approximate backward travel. This is
rotation invariant, not based on screen axes; actual body orientation is unknown.
Turns of at least 60 degrees and reversals of at least 120 degrees add complexity.
Sub-foot moves are ignored for direction classification. Consecutive retreat
segments accumulate; the first 36 inches are the Limited short-retreat allowance.
Avoid costs eight points per retreat yard. Limited costs one plus six per yard
beyond the allowance. Allowed adds no backward-specific scoring cost. Metrics
still report backward complexity for explanation. No preference makes travel illegal.

Ammo margin means the minimum evaluator balance after any position, including
the finish; rounds remaining means the final loaded balance (not unused magazines).
Arrival rounds are measured before arrival reloads. Conservative targets three
spare rounds, Balanced one, Aggressive zero; capped reserve deficits and arrival
risk favor earlier safe reloads without rewarding unlimited unused ammunition.
Aggressive puts greater weight on actual additive reload seconds. All results warn
that moving-reload overlap is not modeled. Reload choices come from generation.

Diversity greedily retains the lowest score, then suppresses routes with the same
ordered position IDs (within 12 inches), identical reload plans and at most 20%
different target ownership. Different subsets/orders/reloads survive; small changes
in assignments on larger stages can be suppressed. Visibility-only and cosmetic
changes do not create diversity. No optimality, collision or automatic visibility
guarantee is added; the search remains bounded and the evaluator unchanged.
