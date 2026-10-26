# PCSL rulebook reference for PSP (stage planning and training)

Researched 2026-10-25 against PCSL General Rulebook **Version 2026-09-14**. Inches conversions in square brackets are my arithmetic, not rule text.

**Status tags**
- **VERIFIED**: read in the primary rulebook (https://rules.pcsleague.com).
- **SECONDARY**: from another source, which is named.
- **NOT FOUND**: I looked in the chapters listed in §9 and the rule text does not say it.

**Method caveat:** shell `curl` to rules.pcsleague.com was blocked by the session proxy. The pages were read through WebFetch, which returns a model summary with short verbatim quotes (copyright limits), not the raw page. Numbers were asked for explicitly and cross-checked with a second targeted fetch where they matter: 69 in, the 180 wording, zone values, and penalties. Quote wording before shipping UI copy that cites rule text.

Builds on `docs/target-preset-sources.md` and the "Rule grounding" table in `docs/route-planner-v2.md` (both reviewed 2026-10-22). Corrections to those docs are marked **[app doc]**.

---

## 0. Ten facts the app should model (and may not yet)

| # | Fact | Rule | App status (from reading code/docs) |
|---|---|---|---|
| 1 | **Steel minimum engagement distance**, measured from every reasonable engagement position/angle:<br>• pistol calibers or buckshot: 7 yd [252 in]<br>• rifle calibers and slugs: 50 yd [1800 in], or 40 yd [1440 in] if the steel has at least a 15° forward cant toward the shooter<br>• birdshot: 5 yd [180 in]<br>• Pistol Caliber 2-Gun rifle (PCC) steel: as close as 7 yd<br>Closer steel needs visual distance indicators that are noted in the WSB. Engaging steel inside the limit is a Stage DQ. | 1.8.1–1.8.3, 3.5.2, 9.2.4.2–9.2.4.3, 14.1 — VERIFIED | No steel-distance logic found in `mobile/src/planning`. |
| 2 | **Misses are counted per missing required hit, not per missed shot.**<br>• Paper requires 2 hits; steel and frangible require 1 (WSB may change).<br>• Max points per target = 5 × required hits.<br>• A T- or K-zone hit = 2 Alpha hits.<br>So A + A + a stray miss = 10 points with no Mike, and T + nothing = 10 with no Mike. | 11.3.1, 11.3.1.1, 11.3.2.1, 11.3.4 — VERIFIED | `drillLog.ts` `scoreRun` gives -10 for each shot tagged M and sums zones with no per-target cap or per-target required-hit logic. |
| 3 | **Zone values do not depend on power factor:** T 10, A 5, C 3, D 1. Power factor is only a division-eligibility floor (125 in PRAC/PCC/DP/DC). Unlike USPSA, there is no Major/Minor scoring. | 11.3.2.x, A.1.x, 4.5.2 — VERIFIED | `scoreRun` is already PF-free for PCSL. Keep the USPSA PF selector out of the PCSL UI. |
| 4 | **Shoot-throughs score normally into a different plane.**<br>• Paper and non-paper are never in the same plane.<br>• Same-plane overlapping paper scores only the visible portion.<br>• A hit touching several overlapping targets, including no-shoots, counts on each target. | 11.5.1–11.5.4, 11.4.6.2 — VERIFIED | **[app doc]** The planner's PCSL default (other faces and no-shoots occlude) is a conservative planning policy, not a PCSL rule. Label it that way. |
| 5 | **Wall geometry rules:**<br>• Walls always extend to the ground.<br>• Walls ≥ 69 in (measured from the base of both posts to the top of the field) extend to infinity.<br>• Posts sharing a base or mount, or clearly forming a joint or corner, count as solidly connected even with slight gaps.<br>• Mesh fields are still impenetrable.<br>• **Walls under 69 in: the rule text is silent.** USPSA explicitly says built height. | 9.1.1.2–9.1.1.5 — VERIFIED | The 69 in rule is modelled. Not seen: sealing joint and corner gaps, no sight lines under walls. "Shorter walls block only to their height" is an inference for PCSL. |
| 6 | **180 plane:**<br>• Default: perpendicular to the direction of the bay at the competitor's position. The WSB may set another "modified safety angle".<br>• Draw/reholster: hips must not point uprange, and there is a 3 ft [36 in] muzzle exclusion radius around the midpoint of the feet.<br>• The RM may declare Disallowed Actions (for example, a movement path or engagement angle). Committing one after it is declared is a Stage DQ. | 15.4.1, 15.4.2.1–15.4.2.2, 7.12.1–7.12.4 — VERIFIED | The configurable half-angle exists. No per-stage asymmetric angle, safe point or disallowed path/angle is stored. |
| 7 | **Wrong-position penalties depend on target type.**<br>• Default: any visible target may be engaged from anywhere in the shooting area unless the WSB restricts it.<br>• Paper not re-engaged correctly: misses + FTE.<br>• Paper re-engaged with indistinguishable holes: 1 procedural per target.<br>• Falling steel: automatic miss + FTE that cannot be fixed.<br>• Static steel: no effect; re-engage it.<br>• No-shoot hits always count. | 12.5.3–12.5.7 — VERIFIED | Area procedures exist. Planner and trainer warnings should differ for falling and static steel. |
| 8 | **Faults and bracing.**<br>• A fault is firing while touching the ground outside the area. Moving outside without firing is not penalized.<br>• Partly inside with no significant advantage: 1 procedural per target engaged.<br>• Fully outside or significant advantage: 1 per shot. Landing a jump counts as outside.<br>• Bracing on an object outside the area: 1 per shot.<br>• Bracing on a wall is allowed according to which posts and field are inside or bound the area. | 12.1–12.2, 7.9.2–7.9.6 — VERIFIED | Stops are kept inside areas. The per-target vs per-shot logic and the wall-bracing permissions are not modelled. |
| 9 | **Distance and size limits per target:**<br>• Pistol: max 50 yd [1800 in]; min 16 MOA "largest circular area" (8 in at 50 yd, 4 in at 25, 2 in at 12.5).<br>• PCC in Pistol Caliber 2-Gun: 100 yd [3600 in], 8 MOA.<br>• 2-Gun rifle: 200 yd [7200 in], 8 MOA.<br>• Rifle matches: 600 yd, 3 MOA. | 10.9.1–10.9.4 — VERIFIED | No check found. Implementing it is easy: target-to-firing-area distance plus the inscribed circle of the target face. |
| 10 | **Target mixing and legality per stage/match:**<br>• K-Zone may not be mixed with Practical in a match; it may not be used at Level 2+ or on classifier stages.<br>• Practical and Competition full-size may not both be used for one firearm type on one stage.<br>• One presentation (type + colour) may not serve mandatory engagements of different firearms on a stage.<br>• Prone requires a fully defined area of at least 4 ft × 8 ft [48 × 96 in]. | 9.2.1.1–9.2.1.4, 9.2.2.1–9.2.2.3, 10.1.4.1, 9.2.6.3 — VERIFIED | Presets exist. No stage-level legality lint. |

Also worth a warning flag: a round that hits the ground within 5 ft [60 in] of the competitor is a Match DQ. The exception is a shot at a legitimate target within 5 ft of the correct shooting area, for example low targets through a port (15.1.2, VERIFIED). Flag stages with targets inside 60 in of a firing area.

---

## 1. Edition

| Item | Value | Status |
|---|---|---|
| Title | PCSL General Rulebook | VERIFIED |
| Version | **2026-09-14**, "Effective when published" (PDF p. 6). No separate effective date. | VERIFIED (PDF) |
| Other dates | The PDF cover shows 2026-05-05. The web index says "Published May 5, 2026". Chapter pages carry no date (© 2026). | VERIFIED |
| Web edition | https://rules.pcsleague.com/ (chapters at `/rulebook/NN-*.html`) | VERIFIED |
| PDF | https://rules.pcsleague.com/pcsl-general-rulebook.pdf | VERIFIED |
| Changelog | https://rules.pcsleague.com/rules_changelog.html | VERIFIED |

Changelog:
- **Feb 2025:** first online release.
- **2026-02-06:** DP/DC divisions added, ACP removed, prone areas fully defined, hit-call clarifications.
- **2026-05-05:** markdown edition; divisions moved to Appendices A–D; Practical Irons, TenRoundIrons and Revo removed; renumbering.
- **2026-09-14:** wording of non-inert flagging and 180 rules changed (15.3.1, 15.3.1.1, 15.4.1).

The changelog's 2026-02-06 numbers (9.11.3, 9.14) predate the renumbering. The current equivalents appear to be 9.2.6.3 and 9.2.9 (my inference).

---

## 2. Targets (Ch. 10, https://rules.pcsleague.com/rulebook/10-targets.html)

### Paper
| Target | Rule | Text says | Status |
|---|---|---|---|
| Practical | 10.1.1 | Heading only. No text, dimensions or drawing. | VERIFIED |
| Mini Practical | 10.1.2 | Heading only. May be used for any firearm type regardless of other targets on the stage (9.2.2.2). | VERIFIED |
| Competition | 10.1.3 | Heading only | VERIFIED |
| K-Zone (legacy) | 10.1.4, 10.1.4.1 | Standard "until 2025". Level 1 only, "outside of classifier stages". K-Zone functions "identically to the T-Zone". | VERIFIED |
| Zones | 10.2.1 | "4 designated scoring zones (T, A, C, D), delineated by perforated lines" | VERIFIED |
| Colours | 10.2.2–10.2.4 | Brown side: handgun (and PCC in Pistol matches). White side: rifle. 10.2.3 also has a 2-Gun/PC2G clause on white paper and the PCC; the summary was ambiguous, so check the wording. Shotgun designation is set by the MD. | VERIFIED |
| Paper no-shoot | 10.3.1 | Solid red with a black X. The X may be omitted in white-only Rifle matches. | VERIFIED |
| Non-PCSL paper | 10.10.2.x | Disallowed at Level 1+ for Pistol, Rifle, 2-Gun and PC2G. All Level 1–4: paper "PCSL-only" (Ch. 3 level schedule). | VERIFIED |

**Dimensions:**
- The rule text states **no** dimension for any paper target, zone, T-zone or K-zone.
- The web chapter has **no drawings**; its only images are logos.
- I could not inspect the PDF past §10.9, so I can't say whether the PDF has figures (§9).
- The only numeric sizes are the 10.9 minimums and 2.10.3, which calls 3.375 in "the length of a standard overlay" (VERIFIED).
- SECONDARY ([CHL Practical](https://chltargets.com/pcsl-practical-target-2025-version-cb-100-target-pack-free-shipping/), [CHL Competition](https://chltargets.com/pcsl-competition-target-2025-version-cb-100-target-pack-free-shipping/)): both "approximately 18″ × 24″", A zone 6″ × 9″.
- CHL also says the Competition target is non-humanoid with smaller T/A/C/D zones than Practical. It also says there is "no official restriction on presenting this target at more aggressive angles", which implies something about Practical. I found **no presentation-angle rule** in Ch. 9/10.
- Do not store any of these as zone geometry.

### Steel and other
| Item | Rule | Content | Status |
|---|---|---|---|
| Falling/reactive steel | 10.4.1–10.4.4 | The MD picks steel that is little affected by wind and falls easily. Rotating steel that doesn't fall is prohibited at Level 2+ and discouraged at Level 1. Falling steel = 1 steel hit unless the WSB says otherwise. Non-falling reactive steel (e.g. spinner) has no default value; the WSB must define it. | VERIFIED |
| Static steel | 10.5.1 | One hit neutralizes; worth 1 steel hit unless the WSB says otherwise. | VERIFIED |
| Steel colours | 10.6.x | Handgun blue, rifle white. 3-Gun: handgun/birdshot yellow; birdshot-only grey or unpainted. Alternate colours only with a clear WSB (Level 1; Level 2 with written PCSL approval; PCSL-run). | VERIFIED |
| Frangibles | 10.7.1 | Usually clays; 1 steel hit. | VERIFIED |
| Steel/frangible no-shoot | 10.8.1–10.8.2 | Steel no-shoots are solid red (black X optional). Falling no-shoots must be knocked down by the competitor's gunfire to count. | VERIFIED |
| Poppers, plates | — | **No PCSL popper or plate definitions or dimensions.** "Plates" appears only as hardcover and no-shoot plates (9.2.4.2). Texas Star and Polish plate rack are mentioned only as moving-target examples (8.6.2.1). | NOT FOUND |
| Min size / max distance | 10.9.1–10.9.5 | See §0 #9. Shotgun/3-Gun: no limits. | VERIFIED |
| Non-standard targets | 10.10, 10.10.1.x | The WSB or match book must explain engagement and scoring; targets should be safe, consistent and efficient to score. | VERIFIED |

### Scoring values (Hit Factor)
| Hit | Value | Rule |
|---|---|---|
| T-zone ("Tango") / K-zone ("Kilo") | = 2 A hits (10) | 11.3.2.1 |
| A | 5 | 11.3.2.2 |
| C | 3 | 11.3.2.3 |
| D | 1 | 11.3.2.4 |
| Steel/frangible | 5 (one Alpha) unless the WSB says otherwise | 11.3.3 |
| Line breaks or touches the perforation | Higher zone | 11.4.6.1 |

All VERIFIED. **Which hits count** when paper has more hits than required (for example T + A) is **not stated**. The only "BEST hits" wording is the overtime rule, 11.9.5.

### Overlap, cover and hit evidence (all VERIFIED)
- **Same plane:** paper on the same sticks, sharing an edge, or overlapping (11.5.1). Paper and non-paper are never in the same plane (11.5.2).
- **Same-plane shoot-through:** only the visible portion scores, not the part covered by the overlapping target (11.5.3).
- **Different plane:** a shot through paper or a no-shoot "(excluding the hardcover portions, if any)" to another target scores normally (11.5.4).
- **Hard cover:**
  - Walls "simulate impenetrable barriers" (9.1.1). Shooting through a wall is never permitted, and suspected cheating can mean a Strike or Match DQ (9.1.1.5).
  - Barrels are impenetrable hard cover (9.1.2). Exception: steel visible from a legal position scores if a hit passes completely through the barrel edge (9.1.2.1).
  - If a barrel completely obscures steel, never shoot through it. The RM is called, no engagement is awarded, and a Strike or DQ is possible (9.1.2.1.1).
  - Hardcover portions of paper are mentioned in 11.5.4, but how they are marked is **not defined**.
- **Soft cover:** target sticks and wall supports are penetrable. Hits that pass completely through score, and they may not be used for support (9.1.4).
- **No-shoot caps:** paper or static-steel no-shoots have a maximum of 2 penalties per target. Falling-steel and frangible no-shoots have a maximum of 1 (11.3.5.1–11.3.5.2).
- **Falling steel hit:**
  - It counts if there is a clear hit and the impact centre is on the front face (11.4.4.2).
  - At Level 2–4, falling steel (except birdshot) must be painted before every shooter (11.8.2).
  - Unpainted steel must fall unless an RO sees a qualifying hit and calls "Hit!" (11.8.3).
  - Painted steel that is hit but doesn't fall is decided under 11.4.4.2 (11.8.4).
  - Steel that turns ≥ 45° without falling counts as hit; if no call is made, the shooter decides (11.8.5).
  - A hit on an activator that fails to work is range equipment failure: "Stop!" and a re-shoot (11.4.4.2, 11.8.3).
  - There is **no calibration-challenge procedure** (unlike USPSA App. C1). The RO team must keep steel calibrated (11.8.1).
- **Static steel hit:** any evidence of a partial strike on the front face counts (11.4.4.3). At Level 2–4 the steel is painted, gets an RO "Hit!", or signals hits as the WSB describes; at Level 1 this is a recommendation (11.6.1). An erroneous "Hit!" call still awards the hit (11.6.2).

---

## 3. Scoring and penalties (Ch. 11, 12)

- **Method:** Pistol, Rifle, 2-Gun and PC2G must use **Hit Factor**. Shotgun and 3-Gun may use HF or Time-Plus Points (11.1.1–11.1.2).
- **Hit Factor calculation:**
  - HF = stage points ÷ time, to 4 decimals. Stage points are never below 0 (11.2.2–11.2.3).
  - Stage % = HF ÷ division-high HF × 100.
  - Match points = stage % × the stage's maximum target points (11.2.4–11.2.5).
- **Par time:** shots up to +0.30 s score; later hits on a new target don't count; on paper, overtime shots cancel the BEST hits (11.9.1–11.9.5).

| Penalty | Hit Factor | Time-Plus | Rule |
|---|---|---|---|
| Miss (Mike) | -10 per missing required hit | +10 s per target engaged with no hits | 11.3.4 / 11.11.3 |
| No-shoot hit | -10 per hit (caps above) | **not stated** | 11.3.5 |
| Failure to Neutralize | — | +5 s per paper target hit but not neutralized | 11.11.2 |
| FTE (target not fired at, or no reasonable attempt) | 1 procedural + misses | +15 s, no Miss | 12.3–12.3.2 / 11.11.4 |
| Procedural (generic) | -10 each | +5 s | 11.3.6 / 11.11.5 |
| WSB may raise FTE count for high-value targets | n procedurals | — | 12.3.3 |
| Fault (outside area, partly in, no advantage) | 1 per target engaged | | 12.1.1 |
| Fault (fully outside, or significant advantage; jump landing) | 1 per shot | | 12.1.2, 12.1.3.1 |
| Bracing on outside object | 1 per shot | | 12.2, 7.9.6 |
| Wrong firearm | Miss + FTE (falling steel automatically; paper unless distinguishable or re-engaged; re-engaged indistinguishable = 1 per target); static steel no effect | | 12.4.3–12.4.6 |
| Wrong position | See §0 #7 | | 12.5 |
| Moving target shot before activation | 1 per shot (unless the WSB allows). Activation = moment the bullet strikes a falling activator, if it then falls and activates the target. | | 12.6.1–12.6.2 |
| Abandon firearm not in Safe Condition | 1 per occurrence (re-holstering = Stage DQ instead) | | 12.7 |
| Magazine over load-to limit | 1 per extra round (only magazines used) | | 12.8 |
| Disobeying WSB procedure | 1 per occurrence, or the WSB's custom penalty | | 12.10 |
| Custom penalty cap | ≤ 25 % of available stage points per infraction (HF) | | 12.9.2 |
| False start | No penalty; restart | | 7.13.1.1 |

All VERIFIED. There is no penalty listed for reloads or start-position faults (NOT FOUND).

---

## 4. Stage design (Ch. 7, 9, https://rules.pcsleague.com/rulebook/09-stage-design.html)

| Topic | Rule (VERIFIED unless marked) |
|---|---|
| Course types / round counts | **None in PCSL** (no short/medium/long, no per-position limit). The WSB shall state the scored round count per firearm (7.1.1). The level schedule lists "No" stage or round restrictions for Levels 1–4 (Ch. 3). |
| Walls | Two posts + field (9.1.1.1); extend to ground (9.1.1.2); ≥ 69 in → infinity (9.1.1.3); joints and corners connected (9.1.1.4); mesh or solid, never shoot through (9.1.1.5). Under 69 in: NOT FOUND. |
| Ports | "Walls may have ports constructed in their fields as shooting positions." Ports should be obviously open or blocked and need not be defined in the WSB (9.1.1.6). Port height and size: NOT FOUND. |
| Barrels | Hard cover; steel-edge exception (9.1.2–9.1.2.1.1) |
| Fault lines | Mark shooting-area limits and should be slightly raised (9.1.3). Minimum thickness 0.5 in on flat surfaces, 1.0 in on uneven ones (9.1.3.1–9.1.3.2). Rope allowed, no trip hazards (9.1.3.3–9.1.3.4). |
| Open rear | The last fault line on each side extends rearward at the same angle; RM approval needed (9.1.3.5). Going unsafely far back = "Stop!", Stage DQ and a Strike (9.1.3.5.1). |
| Shooting areas | Fault lines mark legal areas; the WSB need not say so (7.1.7.1). Visible targets may be engaged from anywhere inside unless the WSB restricts it (12.5.3). |
| Prone | Fully defined area of at least 4 ft × 8 ft [48 × 96 in], oriented toward the array. A raised platform of 12 in or more needs 30 in × 6 ft [30 × 72 in] (9.2.6.3–9.2.6.3.1). |
| Start position | The WSB states the competitor's start position and any off-body equipment (7.1.5). |
| Start condition defaults | Loaded and in Safe Condition. Handgun holstered, wrists below the belt, strong wrist below the backstrap, hands not touching the gun. Long gun: stock touching the belt, muzzle generally downrange (7.3.3.x). The competitor may always start unloaded unless the WSB forbids it (7.3.2). |
| Activated / moving | Penalty for shooting before activation (12.6). An activator hit that fails to activate = range equipment failure and re-shoot (11.4.4.2, 11.8.3, 8.4). Minor differences in a mover's resting position (Texas Star, Polish plate rack) are equivalent (8.6.2.1). Competitors must not activate or manipulate movers during walkthrough (4.4.2). |
| Disappearing targets | NOT FOUND (no rule on minimum exposure or scoring). |
| WSB contents | Round count per firearm; target types and counts per firearm; maximum points; par time; start position and equipment positions; start conditions; full procedure; uncommon elements with their penalty; safety notes. The WSB may not override general rules unless a rule allows it (7.1.1–7.1.10). |
| 180 / angles | §0 #6; 15.4. Targets must not entice dangerous engagement, including "180 traps" (9.2.5.2). |
| Safe impact | Targets must allow safe impact into berms from all legal positions, for shooters of all sizes, with ricochet considered (9.2.5.1). |
| Steel props | All strike-able steel (including hardcover and no-shoot plates) must be at or beyond the minimum distance "from every reasonable engagement angle" (9.2.4.2). |
| Target mixing | §0 #10 |
| DMT | Clearly marked or obvious; full points from a single hit (9.2.6.6, 9.2.6.6.2). Procedure in 7.5. |
| Abandonment | One location per firearm type (a combo box is enough; the holster is the default for a handgun). Re-slinging is invalid unless a DMT procedure applies. The muzzle must stay safe if bumped, must not flag anyone, and must point down if people can be in front (9.1.5.x, 9.2.6.4.x). |
| Other | No required loaded re-holstering (9.2.6.5). At least 1 RO must keep line of sight at all times (9.2.6.2). Props fixed; marking paint mandatory at Level 2+ for weight-held props (9.2.3.1). Hazards: sharp edges, lifted fault lines, debris (9.2.5.3). No obscure physical challenges (9.2.7.1). Optional obstacles need a WSB penalty (9.2.7.3). Pushing props to open shots = Stop, Strike and Stage DQ (7.9.3). |

---

## 5. Divisions and power factor

- **Power factor:** PF = bullet grains × average fps (at least 3 shots) ÷ 1000 (4.5.2).
- **Failing PF:** the competitor moves to the next more-open division with no PF minimum; if none fits, they shoot for no score (4.5.3–4.5.3.1).
- **No scoring effect** (§0 #3). All VERIFIED.

| Division | Rule | Caliber | Min PF | Load-to (at start) | Notes |
|---|---|---|---|---|---|
| Pistol COMP | A.1.1 | 9×19–.45 ACP, ≤1600 fps | none | 30 | |
| Pistol PRAC | A.1.2 | same | 125 | 20 | No comps or porting, no frame-mounted optics |
| PCC | A.1.3 | same | 125 | not listed | No coupled magazines or support devices |
| Defensive Practical (DP) | A.1.4 | same | 125 | 15 | Concealment (2.10); 34.0/29.0 oz; barrel 4.52/4.02 in (non-ported/ported) |
| Defensive Competition (DC) | A.1.5 | same | 125 | 20 | Concealment; 50.0/45.0 oz; 5.42/5.02 in |
| Rimfire Rifle / Pistol | A.2.1–A.2.2 | .22 LR / .22 Mag | none | unlimited | Recognized divisions |
| Rifle COMP | B.1.1 | 5.7×28 … .308; PCC allowed | none (PCC: 125) | not specified | Bipods/bags in Rifle and 3-Gun only, not 2-Gun |
| Rifle PRAC | B.1.2 | 5.45/5.56 … .308 | none | 30 | No brakes (suppressor-adapter exception), no support devices |
| Shotgun OPEN / MOD / PRAC / TAC | C.2.1–C.2.4 | 20–12 ga | — | MOD 13/12; PRAC 9/8; TAC 9/8 (chambered/empty) | |

- **Match-type division rules:** 2-Gun and 3-Gun divisions pair these per 3.4 and 3.7 (Appendix D not read). In PC2G the division is set by the handgun, and PRAC PCC magazines hold at most 30 (3.5.3–3.5.4.1).
- **Classification:**
  - **PCR** (PCSL Competitor Rating) assigns classifications and rankings; core divisions are always tracked (3.1.1.1, glossary).
  - PCR multipliers: Level 1 ×1, Level 2 ×3, Level 3 ×5, Level 4 ×10 ("subject to change").
  - Class tiers and the algorithm: NOT FOUND in the rulebook. pcsleague.us was not accessible.
  - SECONDARY ([Action Gunner, 2026-09-24](https://actiongunner.com/what-is-pcsl-complete-guide-to-2-gun-competition/)): PCR is built from affiliated results since 2025; Coachable and unaffiliated runs are not tracked.

---

## 6. Match structure (Ch. 3, 4, 5; VERIFIED)

- **Match types:** Pistol, Rifle, 2-Gun (handgun + rifle), Pistol Caliber 2-Gun (rifle = PCC), Shotgun, 3-Gun (3.2–3.7).
- **Levels:**
  - Level 0: unaffiliated.
  - Level 1: local; all types allowed.
  - Level 2: state/sectional; classifier stages at most 1 per 4 stages.
  - Level 3 (regional) and Level 4 (national): only 2-Gun, Pistol and Rifle, all Hit Factor; classifiers case by case.
- **Squadding:** fixed squads (missing your squad's time = DNF unless the RM approves) or open queues for one stage at a time (4.1–4.2).
- **Walkthrough:** allowed during open hours when nobody is shooting the stage (4.4.1). After "Make ready", the RO may allow a few steps to view targets through optics, but not to try prone or braced positions (5.1.1.3).
- **Commands:** Make ready → Are you ready? → Standby → start signal 1–4 s later → Unload and show clear → If clear, hammer down → Range is clear (5.1.1–5.1.8).
- **Results:** ranked by total match points (11.2.6). Arbitration period ≤ 1 h, then results are final (4.7).

---

## 7. Safety and DQ rules a planner should warn about

The app cannot verify any of these from plan geometry. Present them as reminders, not checks.

| Rule | Consequence | Planner relevance |
|---|---|---|
| Muzzle uprange of the 180 plane or WSB angle (15.4.1) | Match DQ | Warn on engagements near the plane and on routes that require turning uprange; store any WSB-modified angle. |
| Draw/reholster: hips not uprange; 3 ft muzzle exclusion radius (15.4.2) | (part of 15.4) | Start positions facing uprange need a note. |
| Flagging anyone with a non-inert firearm (15.3.1); exempt only at the moment of draw/reholster (15.3.2) | Match DQ | Not checkable; mention for tight wall turns and props. |
| Round over a backstop or berm (15.1.1) | Match DQ | Pairs with the vertical-angle limits already listed as unchecked. |
| Ground impact within 5 ft [60 in] unless at a legitimate target within 5 ft of the correct area (15.1.2) | Match DQ | Flag close and low targets. |
| Discharge while reloading or clearing a malfunction (15.1.3) | Match DQ | — |
| Finger in the trigger guard while clearly not engaging (moving, reloading) (14.4) | First: "Finger!" warning; then Stage DQ | Long movement legs. |
| Steel inside 1.8 distances (14.1); unsafe proximity with the wrong firearm or position (12.4.1, 12.5.1) | Stage DQ | §0 #1 |
| Dropped loaded firearm (15.2) / unloaded (14.2) | Match DQ / Stage DQ | — |
| Grounded firearm: stay within reach; no firing another gun (7.8, 14.7); multiple firearms at once (14.6) | Stage DQ | Multi-gun transitions. |
| Pushing props (7.9.3, 14.11); disallowed action (7.12.4); unsafe rear travel (9.1.3.5.1) | Stage DQ (+ Strike for props and rear travel) | Disallowed paths and angles (§0 #6). |
| Prone with an unverified holstered handgun (7.6, 14.5) | Stage DQ | Prone positions in 2-Gun. |
| Loose holster: 180 rule applies to the holstered gun, with the 3 ft radius (2.1.5) | Stop → 15.2 / 14.2 | — |
| Escalation: 2 Stage DQs = Match DQ (15.10); 2 Strikes = Match DQ (15.9) | — | — |

---

## 8. PCSL vs USPSA (where known)

USPSA sources:
- Verified this session: [1.2.1](https://rules.uspsa.org/uspsa/section/1.2), [2.2.3.2](https://rules.uspsa.org/uspsa/section/2.2), [4.3.1.5–4.3.1.6](https://rules.uspsa.org/uspsa/section/4.3), all edition 2026-09.
- From the app docs: 10.5.2, 9.1.5, App. B1.
- Rows marked * are from general knowledge and were not re-verified.

| Topic | PCSL | USPSA |
|---|---|---|
| Zones | T 10, A 5, C 3, D 1; no PF dependence | A 5/5, C 4/3, D 2/1 (Major/Minor); B scored as C |
| Course types | None; the WSB states round count | Short 1–12, Medium 13–20, Long ≥ 21 (≤ 32 at Level III+); ≤ 8 scoring hits per location or view |
| 180 reference | Perpendicular to the direction of the bay at the competitor's position, or a WSB angle | Median intercept of the backstop (10.5.2) |
| Walls < 69 in | Rule silent | Built height unless marked to infinity (2.2.3.2) |
| Shoot-throughs | Different plane scores normally (11.5.4) | Scoring areas of targets and no-shoots are impenetrable (9.1.5, per app doc) |
| Falling steel | Painted steel with a centred front-face hit counts even if it doesn't fall; turning 45° = hit; no calibration challenge | Must fall or overturn; poppers can be calibration-challenged; plates that don't fall = equipment failure (4.3.1.5–4.3.1.6) |
| Steel min distance | 7 yd pistol / 50 yd (40 yd canted) rifle | *USPSA uses different distances (not re-verified) |
| PF | Eligibility floor only (125) | *Scoring Major/Minor (165/125 for most divisions) |
| Hits counted | Not stated beyond 5 × required hits | *Best two hits per paper target |
| Multi-gun | 2-Gun, PC2G, Rifle, 3-Gun in the same rulebook; brown/white paper and blue/white steel by firearm | Pistol rulebook separate from Multigun |

---

## 9. Not accessed or not verified

**Access problems:**
- Shell `curl` to rules.pcsleague.com was rejected by the session proxy (403). Pages were read only through WebFetch summaries (see the method caveat at the top).
- **pcsleague.us** (official targets page, PCR information) is not on the allowlist, so it was not read.
- The **PDF** text was truncated at about §10.9, so PDF figures, if any, were not inspected.

**Chapters not read:** 6 (Coaching), 16 (Arbitration), Appendix D (3-Gun division modifications).

**Not stated in the rule text read:**
- Paper target or zone dimensions; popper or plate specifications.
- Port height and size; walls under 69 in.
- Disappearing targets.
- How hardcover on paper is marked.
- Which hits count beyond the required number.
- The Time-Plus no-shoot penalty.
- PCR class tiers.
- A presentation-angle limit for the Practical target (implied only by the CHL listing).
