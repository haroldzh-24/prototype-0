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
