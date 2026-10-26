# USPSA Competition Rules: reference for stage planning and training (researched 2026-10-25)

**Edition:** USPSA Competition Rules, **Edition 2026-09, effective 2026-09-01** (live page header, read 2026-10-25). Official: https://rules.uspsa.org/uspsa · Change log: https://rules.uspsa.org/uspsa/changelog · Section URLs follow the pattern `https://rules.uspsa.org/uspsa/section/<n.n>`. Appendix URLs follow `https://rules.uspsa.org/uspsa/appendix/<id>`. **Vq**

**Status legend.** **V** = VERIFIED: read on rules.uspsa.org. **Vq** = VERIFIED, with the exact wording checked by quotation. **S** = SECONDARY (the source is named). Every rulebook page was read through a web-fetch tool that returns a model-written paraphrase. Numbers and key rules were then re-checked with exact quoted fragments (Vq). Treat plain V items as a faithful paraphrase, not as the exact wording.

Conversions to inches are mine (plain arithmetic): 23 ft = 276 in, 26 ft = 312 in, 10 ft = 120 in, 8 ft = 96 in, 6.5 ft = 78 in, 5 ft = 60 in, 3 ft = 36 in, 2 ft = 24 in, 5'9" = 69 in.

## Top 10 facts the app should model (likely not modeled yet)

Checked against `mobile/src/stage/model.ts`, `training/drillLog.ts` and the "not checked" list in `docs/route-planner-v2.md`.

1. **The freestyle rule limits per-target procedures.** USPSA courses may not dictate position, location or stance, and may not require mandatory reloads ([1.1.5](https://rules.uspsa.org/uspsa/section/1.1)). Designers may specify *where or when* arrays are engaged, or use shooting boxes, only in these cases: Level I short and medium courses ([1.1.5.1](https://rules.uspsa.org/uspsa/section/1.1)), Standard Exercises and Classifiers ([1.1.5.2](https://rules.uspsa.org/uspsa/section/1.1)), and Speed Shoot arrays in any order ([1.2.2.3](https://rules.uspsa.org/uspsa/section/1.2)). The app's "engage from these areas" and "engage after" procedures should warn on long courses and at Level II and above. **V / Vq (1.2.2.3)**
2. **At most 8 scoring hits from any single location or view.** Medium and long courses (and short courses with more than 8 hits) must not let all targets be shot from one location or view ([1.2.1.1–1.2.1.3](https://rules.uspsa.org/uspsa/section/1.2)). Location means both feet moved. A new view needs a vision barrier ([glossary](https://rules.uspsa.org/uspsa/glossary)). Default hits are 2 per paper target and 1 per steel target ([9.5.1](https://rules.uspsa.org/uspsa/section/9.5)). The planner could count the required hits visible from each candidate position. **Vq**
3. **Course type depends on round count.** Short: 1–12. Medium: 13–20. Long: 21 or more, and at most 32 at Level III and above. Standard Exercise: at most 24, with strings of 6 or fewer (12 with a mandatory reload). Speed Shoot: at most 16 from a single location. Shoot-off: at most 9, with one mandatory reload ([1.2](https://rules.uspsa.org/uspsa/section/1.2)). Minimum rounds is a required briefing item ([3.2.1](https://rules.uspsa.org/uspsa/section/3.2)). **Vq**
4. **Steel distance.** Firing at a metal target from less than 23 ft (276 in) is a DQ. The distance is measured from the target face to the nearest part of the body touching the ground ([10.5.16](https://rules.uspsa.org/uspsa/section/10.5)). Fault lines that limit the approach to metal must be at least 26 ft (312 in) away, and the 23 ft minimum also applies to **metal hard cover** ([2.1.3](https://rules.uspsa.org/uspsa/section/2.1)). The planner should exclude or flag positions within 276 in of any steel face, and the editor should flag areas closer than 312 in. **Vq**
5. **Cover semantics.** Every prop, wall and barrier is hard cover unless the briefing calls it "soft cover" ([9.1.6](https://rules.uspsa.org/uspsa/section/9.1)). Shots pass through soft cover and score or are penalized ([4.1.4.2](https://rules.uspsa.org/uspsa/section/4.1)). A barrier under 69 in can be *marked* as extending to infinity ([2.2.3.2](https://rules.uspsa.org/uspsa/section/2.2)). **Target sticks and barrier supports are neither hard nor soft cover** ([9.1.7](https://rules.uspsa.org/uspsa/section/9.1)). Shots through a barrier are allowed only at designated ports or openings ([2.2.3.3](https://rules.uspsa.org/uspsa/section/2.2)). The app needs a per-wall soft-cover flag and a "treat as infinite" flag. **Vq**
6. **Minimum A-zone visibility.** On a USPSA target, hard cover and overlapping no-shoots must leave visible **at least 25% of the lower A-zone, or the entire upper A-zone**. On a half-size USPSA target, at least 50% of the lower A-zone must stay visible. For IPSC targets the minimum is shown only in a diagram ([B1](https://rules.uspsa.org/uspsa/appendix/B1), [4.2.5](https://rules.uspsa.org/uspsa/section/4.2)). For poppers, at least 50% of the calibration zone (100% for mini poppers) must be available somewhere in the course ([4.3.1.5](https://rules.uspsa.org/uspsa/section/4.3)). The app's visible fraction covers the whole face, not the A-zone. Zone and calibration-zone geometry exist **only as drawings**. **Vq**
7. **Fault-line semantics.** Fault lines are part of the shooting area ([2.2.1.2](https://rules.uspsa.org/uspsa/section/2.2)). **Rearward (uprange) fault lines extend to infinity** unless the briefing says otherwise ([2.2.1.3](https://rules.uspsa.org/uspsa/section/2.2)). **Off-limits lines** are a separate object: at least 24 in high, at least 24 in from any fault line, and crossing one zeroes the stage ([2.2.1.5](https://rules.uspsa.org/uspsa/section/2.2)). The briefing may require competitors to stay inside the fault lines for the whole course ([1.1.5.5](https://rules.uspsa.org/uspsa/section/1.1)). **Vq**
8. **Penalty math for drill logs.** Paper scores its best 2 hits, and steel must fall. A miss, a no-shoot hit and a procedural are each −10 (twice the 5-point maximum hit). No-shoot hits have no cap. Failure to shoot at a target costs 1 procedural plus the misses. Hit factor = (points − penalties) ÷ time to 2 decimals ([9.2.2.1](https://rules.uspsa.org/uspsa/section/9.2), [9.4](https://rules.uspsa.org/uspsa/section/9.4), [10.1.2](https://rules.uspsa.org/uspsa/section/10.1)). `scoreRun` currently does not apply misses or no-shoots. **Vq**
9. **Activated and disappearing targets.** A target that shows a legal portion of the A-zone before activation or at rest, or that keeps appearing and disappearing, always draws miss and failure-to-shoot penalties. Otherwise it is a disappearing target and draws none, unless it was never activated ([9.9.1–9.9.3](https://rules.uspsa.org/uspsa/section/9.9)). The app has no activator, mover or swinger objects. **Vq**
10. **Target-set legality.** USPSA and IPSC cardboard types may not be mixed in one stage, not even as no-shoots ([4.2.1](https://rules.uspsa.org/uspsa/section/4.2)). Plates are allowed only at Level I and II, and never as the only targets ([4.3.1.4](https://rules.uspsa.org/uspsa/section/4.3)). Frangible targets are banned ([4.4.1](https://rules.uspsa.org/uspsa/section/4.4)). Scoring IPSC targets may lean no more than about 45° from vertical ([2.1.8.4](https://rules.uspsa.org/uspsa/section/2.1)). Virginia Count and Fixed Time allow paper targets only ([9.2.3.2](https://rules.uspsa.org/uspsa/section/9.2)). It is my inference, not verified, that the app's `uspsa-metric` preset is the "USPSA target" and `uspsa-classic` is the "IPSC target". Confirm against the B1 drawings before enforcing the no-mix rule. **Vq / inference flagged**

## 1. Edition, URLs, recent changes

| Item | Detail | Status |
| --- | --- | --- |
| Current edition | "Edition 2026-09 · effective 2026-09-01". Pages B1, D9 and 6.1 also carry the 2026-09 stamp. Search-engine caches still show "Edition 2026-03 · effective 2026-03-01", an earlier edition. | Vq |
| Change log | Lists board changes approved 1/26/2026, plus an NROI ruling dated 9/7/2026 (compensator definition, App. A3). It states no effective date. The ruling's date falls after the edition's effective date, so the log may run ahead of the edition. | V |
| Changes relevant to the app | Speed Shoots may require mandatory reloads (1.1.5.2). The stay-within-fault-lines option now applies at all levels (1.1.5.5). Once a strong or weak hand requirement starts, it applies for the rest of the stage (1.1.5.6). The briefing must say "freestyle" (3.2.1). Metal no-shoots may take the shape of authorized targets (4.1.3). Multiple sight pictures are allowed (8.7.1). 9.9.1 now points to App. B1 for visibility. | V |
| PDF | `https://uspsa.org/documents/rules/current/USPSA-Competition-Rules.pdf` is cited in `target-preset-sources.md`. I did not open it this session. | — |

## 2. Approved targets

Only targets in Appendix B may be used, and cardboard must be official USPSA-licensed ([4.1.1](https://rules.uspsa.org/uspsa/section/4.1)). **V**

| Target | Scoring (Major / Minor) | Dimensions **stated in rule text** | Source | Status |
| --- | --- | --- | --- | --- |
| USPSA target, full size | A 5/5, C 4/3, D 2/1. "the B zone on all USPSA targets is now scored as a C hit" | None. Dimensions appear in drawings only. | [B1](https://rules.uspsa.org/uspsa/appendix/B1) | Vq |
| IPSC target, full size | Same values | None (drawings only) | B1 | V |
| Half-size USPSA and half-size IPSC | Same values. Approved at all levels and may be mixed with full-size targets of the same type. | None (drawings only) | B1, [4.2.1.1](https://rules.uspsa.org/uspsa/section/4.2) | V |
| USPSA Popper, USPSA Mini-Popper, IPSC Popper, IPSC Mini-Popper, Colt Speed Steel | "All Poppers – Scoring value: 5 points (Minor and Major)" | Only "Measurement tolerance on Poppers +/- 1/4 inch". Shape and the shaded calibration zone appear in drawings only. | [B2](https://rules.uspsa.org/uspsa/appendix/B2) | Vq |
| Metal plate, round | 5 (Major and Minor) | 8 in diameter minimum, 12 in maximum, ±1/4 in | [B3](https://rules.uspsa.org/uspsa/appendix/B3) | Vq |
| Metal plate, square or rectangular | 5 | 6 in each side minimum, 12 in maximum, ±1/4 in | B3 | Vq |
| Even-sided polygon plate (e.g. hexagon) | 5 | 6 to 12 in measured flat to flat (not point to point), ±1/4 in | B3 | Vq |
| Plates in general | Must be "constructed and set up to fall and not turn sideways". Level I and II only, and never the only targets ([4.3.1.4](https://rules.uspsa.org/uspsa/section/4.3)). | — | B3 | Vq |
| Synthetic falling plates ("self-sealing") | Level I only, and must meet B3 sizes | — | [4.4.2](https://rules.uspsa.org/uspsa/section/4.4) | Vq |
| Frangible (clays, tiles) | **Not authorized** | — | [4.4.1](https://rules.uspsa.org/uspsa/section/4.4) | Vq |
| Cardboard no-shoot | −10 for each hit visible on its scoring area ([9.4.2](https://rules.uspsa.org/uspsa/section/9.4)). Needs a distinguishable non-scoring border ([4.2.2.1](https://rules.uspsa.org/uspsa/section/4.2)). | Same target types as scoring cardboard (4.2.1) | 4.1.3 | Vq |
| Metal no-shoot | −10 for each full- or partial-diameter hit on the face, "regardless of whether or not it is designed to fall" ([9.4.3](https://rules.uspsa.org/uspsa/section/9.4)). No non-scoring border. Takes "the general size and shape of authorized targets". | — | [4.1.3](https://rules.uspsa.org/uspsa/section/4.1) | Vq |

- **App presets:** `uspsa-round-8-v1` (8 in) is the B3 minimum. The rule text gives **no** popper dimensions, so the popper presets stay vendor-sourced (as already recorded). Mini poppers need 100% of the calibration zone available (4.3.1.5).
- **Colors ([4.1.2](https://rules.uspsa.org/uspsa/section/4.1), 4.1.3):** the cardboard scoring area is brown or tan. Each metal scoring target is one color, preferably white, and never black, red or green. No-shoots use one unique color per material for the whole match. **V / Vq**
- **4.1.5:** one intact target may not represent two or more targets, by tape, paint or any other means. **V**
- **4.2.3:** a cardboard target never takes more than 12 hits before it is scored and patched. **V**

### Overlap, partial hiding, hard and soft cover

| Rule | Content | Status |
| --- | --- | --- |
| [4.1.4.1](https://rules.uspsa.org/uspsa/section/4.1) | Cover that hides all or part of a target is hard cover. It should preferably be real, impenetrable material. "Whole cardboard targets must not be used solely as hard cover." | Vq |
| [4.1.4.2](https://rules.uspsa.org/uspsa/section/4.1) | Soft cover only obscures. Shots through it score on targets and are penalized on no-shoots. Scoring zones behind it stay wholly intact. A target behind soft cover must be visible through it, or partly visible around or over it. | Vq |
| [4.2.4](https://rules.uspsa.org/uspsa/section/4.2) | A partially hidden cardboard target is simulated in one of three ways: actually hidden, cut away (with a replacement non-scoring border across the cut), or painted or taped a single contrasting color. | V |
| [4.2.5](https://rules.uspsa.org/uspsa/section/4.2) + B1 | Hard cover and overlapping no-shoots must not completely hide the highest zone. Minimums: 25% of the lower A-zone or the entire upper A-zone (USPSA target), 50% of the lower A-zone (half-size USPSA), IPSC per diagram. | Vq |
| 4.2.1.1 | Half-size targets may not be mounted on full-size no-shoots, and may not serve as no-shoots on full-size targets. | V |
| [4.2.6](https://rules.uspsa.org/uspsa/section/4.2) | In Virginia Count and Fixed Time, overlapping targets must be separated by hard cover or a no-shoot, so that one bullet cannot make two scoring hits. | V |
| [9.1.5–9.1.5.4](https://rules.uspsa.org/uspsa/section/9.1) | Scoring areas of targets and no-shoots are impenetrable. A bullet that passes wholly through a paper scoring area does not score on the target behind. If it then hits steel, it is range equipment failure (REF) and a reshoot. A bullet that passes partially through counts on the next target. | V |
| [9.1.5.1.1](https://rules.uspsa.org/uspsa/section/9.1) | Where targets touch and overlap, the part of the under-target covered by the over-target's scoring area "and its perforations is deemed to be non-existent". | Vq |
| [9.1.6–9.1.6.4](https://rules.uspsa.org/uspsa/section/9.1) | A bullet that passes wholly through hard cover does not score on paper. If it then knocks down steel, it is REF. Partially through: paper counts, fallen steel counts, and a metal no-shoot counts as a penalty. | V / Vq (9.1.6) |
| [9.1.7](https://rules.uspsa.org/uspsa/section/9.1) | Target sticks and barrier supports are neither hard nor soft cover. Hits through them count. | Vq |
| [9.5.2.1](https://rules.uspsa.org/uspsa/section/9.5) | "Touching the line scores higher" does not apply to areas overlapped by another target or by hard cover. | V |

### Steel: when it counts, and calibration

| Situation | Result | Rule | Status |
| --- | --- | --- | --- |
| Scoring steel | Must be shot and **fall or overturn** to score. At least one round each. | [4.3.1.5](https://rules.uspsa.org/uspsa/section/4.3), [9.5.1](https://rules.uspsa.org/uspsa/section/9.5) | Vq |
| Falls from a hit on its support, or falls or moves early | REF and reshoot | 4.3.1.5, [4.6.1](https://rules.uspsa.org/uspsa/section/4.6) | Vq |
| Popper hit but standing | Competitor chooses: (a) shoot it again (counts as a hit, scored as shot); (b) leave it (miss); (c) leave it and challenge calibration. No one may touch it while a challenge is pending. | [C1 #6](https://rules.uspsa.org/uspsa/appendix/C1) | V |
| Calibration challenge | Range Master inspects, then shoots from as near the competitor's spot as possible. A hit anywhere on the face that does not drop it, or a first shot above the zone, fails calibration and the competitor reshoots. A hit on or below the zone that drops it (twice, per C1 7d) means the popper was properly calibrated, and the competitor's shot is scored a miss. Needs visible evidence of a hit (4.3.1.5 #3). | C1 #7 | V |
| Initial calibration | Calibration ammunition makes 115.0–125.0 PF (9x19 recommended). One hit in the calibration zone, fired from the shooting position **farthest** from the popper, must drop it. | C1 #2, #5 | V |
| Plate hit but standing | Not calibrated. REF and reshoot after repair. If hit again and it falls before the RO stops the competitor, it scores. | 4.3.1.6, 4.3.1.6.1 | Vq / V |
| Metal no-shoot hit, not falling | Still penalized. Not a REF. | 4.3.1.8 | V |
| Repaint | Hit steel is repainted after each competitor. Level I is encouraged but not required to; an unpainted popper can be challenged. | 4.3.1.7, 4.3.1.7.1 | V |

## 3. Scoring

| Method | Time / shots | Score | Limits | Rule | Status |
| --- | --- | --- | --- | --- | --- |
| Comstock | Unlimited time (stops on the last shot), unlimited shots | Hit factor = (highest-value stipulated hits − penalties) ÷ time (2 decimals). The top hit factor gets the stage's maximum points, and others scale below it. | Any course | [9.2.2](https://rules.uspsa.org/uspsa/section/9.2) | Vq |
| Virginia Count | Unlimited time, limited shots | Same hit-factor calculation | Paper only. Standard Exercises, Classifiers, Speed Shoots, short and medium courses only. | 9.2.3 | Vq |
| Fixed Time | Limited time, limited shots | Net points, not factored | Paper only, preferably disappearing targets. Same course types as Virginia Count. No miss or failure-to-shoot penalties. | 9.2.4 | Vq / V |
| Stage and match points | — | Calculated to 4 decimals | — | 9.2.5, 9.2.6 | V |

- **Required hits ([9.5.1](https://rules.uspsa.org/uspsa/section/9.5)):** unless the briefing says otherwise, paper takes at least 1 round with the best 2 hits scoring, and steel takes at least 1 round and must fall. **Vq**
- **Hit rules (9.5):** a hit touching a line scores the higher zone (9.5.2). A hit on both a target and a no-shoot scores and is penalized (9.5.3). Radial tears do not count (9.5.4). Enlarged holes count only with a grease ring or crown (9.5.5). The minimum score is 0 (9.5.6). Shots through the back of a target do not count (9.5.8). A hit must pass fully through (9.5.9). **V**
- **Virginia Count and Fixed Time extras ([9.4.5–9.4.6](https://rules.uspsa.org/uspsa/section/9.4)):** each extra shot is 1 procedural, and only the specified number of best hits count. Each extra hit is 1 procedural; hits on hard cover or no-shoots are not extra hits. Stacked shots cost 1 procedural per saved transition unless the briefing allows them. Fixed Time overtime: a shot more than 0.30 s after the set time is penalized at that shot's maximum value. **V**
- **Official time:** only the RO's timer counts. A faulty timer means a reshoot. A start signal with no shot fired is "DNF": zero time and zero score ([9.10](https://rules.uspsa.org/uspsa/section/9.10)). **V**

| Penalty | Value | Rule | Status |
| --- | --- | --- | --- |
| Miss | 2 × the target's maximum hit, so −10. None on Fixed Time or disappearing targets. | [9.4.4](https://rules.uspsa.org/uspsa/section/9.4) | Vq |
| No-shoot hit (paper or metal) | −10 per hit, **no cap** | 9.4.2, 9.4.3 | Vq |
| Procedural | 2 × the maximum hit, so −10 each | [10.1.2](https://rules.uspsa.org/uspsa/section/10.1) | Vq |
| Failure to shoot at a target | 1 procedural per target, plus its misses | 9.5.7, [10.2.7](https://rules.uspsa.org/uspsa/section/10.2) | Vq |
| Firing while touching outside the fault lines | 1 per occurrence. Becomes per shot at the affected targets if it gives a significant advantage. Moving outside without firing is not penalized. | [10.2.1, 10.2.1.1](https://rules.uspsa.org/uspsa/section/10.2) | Vq |
| Firing fully outside (both feet out) | Counts as a significant advantage: 1 per shot until one foot is back inside with nothing touching outside | 10.2.1.2 | Vq |
| Breaking the briefing's procedure | 1 per occurrence, or 1 per shot with a significant advantage. Wrong shot counts are scored as misses or extra shots, not as procedurals. | 10.2.2, 10.2.2.1 | V |
| Missed mandatory reload | 1 per shot fired after the required point, until a reload | 10.2.4 | V |
| Creeping or moving at the start | 1 | 10.2.6 | V |
| Strong- or weak-hand-only violation | 1 per shot | 10.2.8 | V |
| Cooper tunnel | 1 per piece of material that falls | 10.2.5 | V |
| Shooting a target before activation (Level I, when the briefing forbids it) | 1 per shot, capped at the available hits | [9.9.4](https://rules.uspsa.org/uspsa/section/9.9) | V |
| Leaving the fault lines when the briefing says stay inside | A per-shot procedural for targets engaged after leaving. Drop steps, and inadvertent steps back to the same spot, are allowed. | [1.1.5.5](https://rules.uspsa.org/uspsa/section/1.1) | V |
| Cap on per-shot penalties | No more than the scoring hits the competitor could have made | 10.2.3 | V |
| Crossing an off-limits line | Stage scored zero | 2.2.1.5 | Vq |
| Steel that does not fall | See the steel table. A popper left standing without a challenge is a miss (−10). | C1 #6 | V |
| Special penalty for injury | At least 1 procedural, up to 20% of points as shot | 10.2.10.2 | V |

## 4. Stage and course design

**Course types:** see Top 10 #3. Level II and above may have at most 1 Speed Shoot per 5 stages, and Speed Shoots may hold at most 20% of match points ([1.2.2.3.1](https://rules.uspsa.org/uspsa/section/1.2)). Classifiers are USPSA-published and must be set up exactly as published (1.2.2.2). **V**

**Freestyle ([1.1.5](https://rules.uspsa.org/uspsa/section/1.1)):** competitors engage targets "as and when visible". Barriers and conditions may still guide where competitors go. Strong- or weak-hand-only: a short course may require it for the whole stage, with weak-hand-only limited to 8 rounds. Medium and long courses may require it only for the last 6 shots or fewer. A PCC is never fired one-handed (1.1.5.3). Strong-hand and weak-hand segments need movement and freestyle engagement between them (1.1.5.4). A Forbidden Action may not be used to control movement, such as cutting a corner; designers must use barriers, vision barriers or off-limits lines instead ([2.3.1.1](https://rules.uspsa.org/uspsa/section/2.3)). **V**

| Element | Rule text | Rule | Status |
| --- | --- | --- | --- |
| Barrier height | Barriers 5'9" (69 in) or taller "go from ground to infinity". Shorter ones go only to their built height, unless the briefing says otherwise. A shorter barrier treated as infinite "must be marked accordingly". | [2.2.3.2](https://rules.uspsa.org/uspsa/section/2.2) | Vq |
| Barrier as a plane | A solid plane and hard cover, unless designated soft cover. No shooting through it except at designated ports or openings. Full-diameter hits through it do not score, and steel knocked down that way is REF. | 2.2.3.3 | Vq |
| Barrier supports | Treated as non-existent. They may not be used for support while shooting. Wall feet, legs and braces may never be used for support. | 2.2.3.4, 10.2.1 | V / Vq |
| Ports | The rule text gives no port dimensions or heights. A failed port or opening is range equipment failure (4.6.1). | 2.2.3.3, [4.6.1](https://rules.uspsa.org/uspsa/section/4.6) | V |
| Obstacles to surmount | At most 6.5 ft (78 in). Over 3 ft (36 in) needs scaling aids. Holstering before climbing cannot be required. | 2.2.2–2.2.2.4 | V |
| Fault-line material | At least 0.75 in thick on hard, clear ground. Rising at least 1.5 in recommended on turf, sand or gravel. Fixed firmly. | 2.2.1.1 | Vq |
| Shooting area | The surface inside shooting boxes, fault lines, walls or other barriers. **Fault lines are part of it.** Planks or platforms may be the whole shooting area if at least 1.5 in high, marked and stable. A shooting box is 4 connected fault lines (glossary). | 2.2.1.2 | Vq |
| Rear fault lines | At least 3 ft (36 in) long recommended. Extend rearward to infinity unless the briefing says otherwise. At a prone position, a rear line must be at least 8 ft (96 in) from the forward line. | 2.2.1.3, 2.2.1.4 | Vq |
| Touching outside | Touching the ground, or an object completely outside the lines, while firing is penalized. An object partly inside may be used whole. Raised parts may be marked as shooting area using legal fault lines. | 10.2.1 | Vq |
| Off-limits lines | Must be in the briefing. Rope or tape at least 2 ft (24 in) high, at least 2 ft (24 in) from any fault line or box. Crossing zeroes the stage. The lines extend through RO openings. | 2.2.1.5 | Vq |
| Common firing line | At least 5 ft (60 in) between competitors | 2.1.7 | V |
| Tunnels | Entry, exit and shooting limits must be clearly marked. Drawing or holstering inside a tunnel is a DQ (10.5.4). | 2.2.4 | V |
| Target presentation | Static scoring IPSC targets (and IPSC movers at rest) no more than about 45° from vertical. No-shoots at any angle. The rule does not say whether the angle is lean or in-plane rotation. | [2.1.8.4](https://rules.uspsa.org/uspsa/section/2.1) | Vq |
| Appearing targets | Should be hidden before activation. If not entirely hidden, they may be shot at any time. At Level I, the briefing must list targets that must be activated before they are engaged. | 2.1.8.5, 2.1.8.5.1 | V |
| Movers | Must be demonstrated to every competitor equally. Early activation or failure to reset is REF. "Swinger" has no specific rule in the text I read. | [3.2.4](https://rules.uspsa.org/uspsa/section/3.2), 4.6.1–4.6.2 | V |
| Target placement | Avoid shoot-throughs. Mark stand positions. Limit steel splatter onto nearby paper. | 2.1.8–2.1.8.3 | V |

**Start positions and conditions ([8.1](https://rules.uspsa.org/uspsa/section/8.1), [8.2](https://rules.uspsa.org/uspsa/section/8.2), [8.3](https://rules.uspsa.org/uspsa/section/8.3)).** Rulebook items are **V**.
- The start position is the location, shooting position and stance the briefing prescribes (glossary). The competitor may face any direction unless the briefing states otherwise (8.2.2.1). Starting in the wrong position means a reshoot (8.2.2).
- Between "Standby" and the start signal, the competitor may not handle the gun, ammunition or loading devices (8.2.3). A stage may never require a weak-hand draw (8.2.4) or re-holstering after the start (8.2.5). A PCC may never be required to start on the weak side or facing uprange while held (8.2.3.1, 8.2.4.1).
- Ready conditions depend on the gun type (8.1.1–8.1.2). The briefing may set different ones (8.1.3). A gun placed on a surface may not be propped by outside objects unless the briefing allows it (8.1.6).
- The start signal follows "Standby" within 1–4 s (8.3.3).

**Required Written Stage Briefing contents ([3.2.1](https://rules.uspsa.org/uspsa/section/3.2)), Vq:** scoring method; targets (type and number); minimum number of rounds; firearm ready condition; start position ("should be demonstrated by a Range Officer"); time starts (audible or visual); procedure ("if not specified strong hand or weak hand only, then the stage is freestyle"). The WSB is read verbatim to each squad (3.2.2). It must also state, when they apply: off-limits lines (2.2.1.5); Forbidden Actions (2.3.1.1d); soft cover (9.1.6); rear fault lines that are not infinite (2.2.1.3); a non-default number of hits (9.5.1); targets that must be activated first (Level I, 2.1.8.5.1); stay-within-fault-lines (1.1.5.5); permitted stacked shots (9.4.5.3); other ready conditions (8.1.3); directions declared unsafe (10.4.1); objects that may not be climbed (10.3.7). **V**

**Safety-related design:** courses must ensure safe angles of fire, considering ricochets, backstops and side berms ([2.1.2](https://rules.uspsa.org/uspsa/section/2.1)). Targets must be arranged so that "as and when visible" shooting does not break safe angles (2.1.4). Steel distances are in Top 10 #4. Berms are off-limits (2.1.9). **V**

## 5. Divisions, power factor, classification

Power factor = bullet weight (gr) × average velocity (fps) ÷ 1000, with decimals dropped. Failing the Major floor means the whole match is rescored as Minor. Failing the Minor floor means no score ([C2 #36, #39, #40](https://rules.uspsa.org/uspsa/appendix/C2)). **V**

| Division | Major / Minor floor | Major min. caliber | Optics | Capacity / magazine | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Open | 165 / 125 | None (112 gr minimum bullet for Major) | Yes, comp allowed | No limit. Magazine at most 171.25 mm. | [D1](https://rules.uspsa.org/uspsa/appendix/D1) | V |
| Limited | 165 / 125 | .40 / 10mm / .357 SIG | No | No limit. Magazine 141.25 mm (171.25 single-stack). | [D2](https://rules.uspsa.org/uspsa/appendix/D2) | V |
| Limited-10 | 165 / 125 | .40 / 10mm / .357 SIG | **"permitted: Yes"** in the 2026-09 table. Older editions said no, and the change log does not mention this; confirm. | 10 rounds after the start | [D3](https://rules.uspsa.org/uspsa/appendix/D3) | Vq |
| Production | Minor only, 125 | — | No | 15 rounds after the start | [D4](https://rules.uspsa.org/uspsa/appendix/D4) | V |
| Single Stack | 165 / 125 | .40 / 10mm / .357 SIG | No | 8 rounds Major, 10 Minor. Gun at most 45 oz. | [D5](https://rules.uspsa.org/uspsa/appendix/D5) | V |
| Revolver | 165 / 125 | None | No | 6 shots before reload (Major), 8 (Minor) | [D6](https://rules.uspsa.org/uspsa/appendix/D6) | V |
| Carry Optics | Minor only, 125 | — | Required, slide-mounted | Magazine 141.25 mm. Gun at most 59 oz. | [D7](https://rules.uspsa.org/uspsa/appendix/D7) | V |
| PCC | "125 (Minor Scoring Only)" | — | Yes | No limit | [D8](https://rules.uspsa.org/uspsa/appendix/D8) | Vq |
| Limited Optics | Major "Not Applicable" / 125. Older editions allowed Major; confirm. | — | Required, slide-mounted | Magazine 141.25 mm (171.25 single-stack) | [D9](https://rules.uspsa.org/uspsa/appendix/D9) | Vq |

**Classification:** **S** ([USPSA Club Resources](https://clubs.uspsa.org/classification-and-activity/classification-systems/uspsa-classification-system); [USPSA announcement, 2025-03-28](https://uspsa.org/announcement/967)). Classes are GM 95–110%, M 85–94.9, A 75–84.9, B 60–74.9, C 40–59.9, D below 40 (the page says "2 to 40%"), as a percentage of the classifier's High Hit Factor. Classification uses the best 6 of the most recent 8 scores, with at least 4 for an initial class (that page is inconsistent on this). The cap is 110% of the High Hit Factor (since 2025-04-02). The rulebook itself says only that classifiers are USPSA-published courses ([1.2.2.2](https://rules.uspsa.org/uspsa/section/1.2), V).

## 6. Match structure (brief)

- **Terms ([6.1](https://rules.uspsa.org/uspsa/section/6.1)):** a string is a separately timed part of a stage; a stage is one string unless it is a Standard Exercise. A stage is "a separately timed and scored component of a match". A match has at least 2 stages. **V**
- **Levels ([A1](https://rules.uspsa.org/uspsa/appendix/A1)):** I, II, III and Nationals. Recommended minimum rounds 28 / 75 / 150 / 150. Recommended minimum stages 2 / 5 / 8 / 8. Recommended minimum competitors 10 / 50 / 120 / 120. A chronograph is mandatory at Level III and Nationals. "Classifier stages allowed": 8 / 1 / 2 / N/A, as read. **Vq**
- **Divisions** are scored separately (6.2.1). Recognition needs 5 competitors (recommended) at Level I and II, and 10 (mandatory) at Level III and Nationals ([A2](https://rules.uspsa.org/uspsa/appendix/A2)). Categories: Lady, Junior, Senior, Super Senior, Distinguished Senior, Military, Law. **V**
- **Squads:** the rulebook sets no squad size ([6.5](https://rules.uspsa.org/uspsa/section/6.5)). Changes are announced at the squad briefing (2.3.2). The WSB is read verbatim to each squad, and walkthrough time is equal for all (3.2.2, 3.2.4). A competitor absent at their scheduled time may not shoot that stage without approval; the stage scores 0 (6.5.1). **V**

## 7. Safety warnings for a route planner (DQ categories)

DQ categories: accidental discharge ([10.4](https://rules.uspsa.org/uspsa/section/10.4)), unsafe gun handling ([10.5](https://rules.uspsa.org/uspsa/section/10.5)), unsportsmanlike conduct (10.6), impairment (10.7). Also a DQ: committing a Forbidden Action, and climbing an object the briefing marks as not for climbing ([10.3.6, 10.3.7](https://rules.uspsa.org/uspsa/section/10.3)). **V** (10.6 and 10.7 titles only)

| Warn about | Rule | What a plan-view app can and cannot say | Status |
| --- | --- | --- | --- |
| Muzzle "further than 90 degrees from the median intercept of the backstop" (uprange if there is no backstop), loaded or not, **at any time** during the course | 10.5.2 | The app checks only engagement directions in plan view. Muzzle direction while moving, reloading or turning is not checked. Warn on retreats, uprange movement and deep side angles. | Vq |
| Exception: while drawing or holstering, facing downrange, a loaded muzzle may point uprange only within a 3 ft (36 in) radius of the feet | 10.5.6 | Shooter technique; not geometry | Vq |
| Firing at steel from less than 23 ft (276 in) | 10.5.16 | The app can check this exactly against firing-area geometry | Vq |
| Finger outside the trigger guard during movement. Movement is more than one step (both feet), or a change between standing, kneeling, prone, etc. | 10.5.10, 8.5.1, glossary | Remind on every leg; cannot be checked | Vq / V |
| A shot during movement, other than while shooting at targets | 10.4.6 | Relevant to shoot-on-the-move legs | V |
| A shot over a backstop or berm, or into a direction the briefing declares unsafe | 10.4.1 | Vertical angles and berms are not modeled; say so | V |
| A shot striking the ground within 10 ft (120 in), except when shooting at cardboard closer than 10 ft | 10.4.2 | Could flag low steel or close low targets; height data exists only in part | Vq |
| Sweeping any person; dropping a gun; drawing or holstering in a tunnel; holstering or placing a loaded gun without the safety on | 10.5.5, 10.5.3, 10.5.4, 10.5.11 | Not geometric; only general warnings (staged guns, tunnels) | V |
| Off-limits line crossed (zero for the stage, not a DQ) | 2.2.1.5 | Needs an off-limits object | Vq |

Do not present any of these as compliance checks. Only 10.5.16 and the plan-view angle of each engagement are geometric checks the app can make.

## Not accessed or not verified

- **Raw rulebook text.** `curl` to rules.uspsa.org was blocked by the session proxy (403). All pages were read through WebFetch, which returns paraphrases; key rules were checked by exact quotation (Vq). The pages for section 12.1 and Appendix B4 were refused by the fetch allowlist. I do not know whether a B4 or B5 exists; none was linked from B1–B3.
- **Diagrams.** The B1 cardboard zone dimensions, the B2 popper shapes and calibration zones, the B1 IPSC minimum-visibility figures and the 9.5.2.1 illustration are images only. Per instructions, I did not measure or estimate them.
- **Not opened:** the official PDF, sections 10.6 and 10.7 (titles only), 9.3, 9.6–9.8, 5.1–5.5, 2.4–2.6.
- **To confirm:** Limited-10 optics "Yes" and Limited Optics "Major Not Applicable" (both differ from older editions and are not in the change log); A1 Level I "Classifier stages allowed: 8"; which app preset corresponds to the "USPSA target" and which to the "IPSC target".
- **Classification** is SECONDARY: it comes from USPSA club pages, not the rulebook.
