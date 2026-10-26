# IDPA rules reference for PSP (stage planning and training)

Researched 2026-10-25. Primary source: **2026 IDPA Rulebook**, [RB] = <https://www.idpa.com/wp-content/uploads/2026/01/2026-IDPA-Rulebook-2.pdf>. Citations such as "§3.2.1.3" refer to that PDF.

- **VERIFIED**: read in the rulebook PDF's text. The PDF was read through a text-extraction fetch tool, in short quoted fragments. Images in the PDF could not be viewed (see "Not accessed").
- **SECONDARY**: from another source, which is named.
- **INTERPRETATION**: my reading of rule text. It is not a ruling; confirm it with an IDPA SO or MD before you rely on it.
- Unit conversions: 1 yd = 36 in, 1 ft = 12 in. The inch values in brackets are my conversions.

---

## 0. Top 10 facts the app should model (and may not yet)

The app currently orders engagements at a stop near to far (`routePlanner.ts` sort) and does not check cover use, fault lines, or exposure.

| # | Fact | Rule | Status |
|---|---|---|---|
| 1 | **Tactical priority is not plain near-to-far.** (a) Targets in the open have higher priority than targets available from cover. (b) Near-to-far applies only to targets *visible at the same time*. Distance is measured from the shooter's position, or from where the shooter is when first exposed to them. (c) Two targets in the open whose distances from the shooter differ by less than 2 yd [72 in] are equal threat, and the shooter may take them in any order. (d) From **vertical cover**, targets are engaged "as they become visible around the edge of cover", which is slicing the pie: angular order from the cover edge, not distance. | §3.2.1.2–3.2.1.5, §3.2.4.2 | VERIFIED |
| 2 | **Exposure to unengaged targets is restricted along the whole route, not only at stops.** The shooter may not advance across fault lines in a way that exposes them to unengaged targets (nested fault lines). At distant cover, being exposed to unengaged targets that belong to another position is penalized under §3.5.6. Reloads are allowed standing or moving only while the shooter is "not exposed to targets that are not fully engaged". | §3.6.7, §3.5.10.4, §3.5.10.2 | VERIFIED |
| 3 | **Position of Cover (PoC) geometry.** Each PoC has exactly one fault line, and it applies to all targets visible from that PoC. The fault line starts at the cover object and extends back 3–8 ft [36–96 in]. Marking material is no wider than 4 in. A window of 24 in or more is marked with fault lines; a window under 24 in gets a single fault line in its centre. A cover object without a fault line is not a valid PoC. No other way of measuring cover is used. | §3.6.4.1–3.6.4.5, §6.3.2, §6.3.5, §6.3.6 | VERIFIED |
| 4 | **Cover type decides where you shoot from.** Vertical cover means shooting from the side(s) of the PoC, and the shooter must stay within the fault lines. Horizontal cover means shooting over or under it. Low cover needs at least one knee on the ground, and if a stage requires low cover or prone, that must be the last position in the string. | §3.5.2, §3.5.3, §3.5.8, §3.5.9, §6.5.13 | VERIFIED |
| 5 | **Cover is mandatory when available.** A shooter may not cross or enter openings (doorways, open spaces) to engage targets. In a stage that has cover, no more than 6 shots may be required in the open. | §3.5.6, §1.2.3.6, §3.5.7.3, §6.5.26 | VERIFIED |
| 6 | **Steel closer than 10 yd [360 in] is a DQ.** Any planned shooting position, including a moving window, must be at least 360 in from every steel target. | §2.14, §5.4.1.4 | VERIFIED |
| 7 | **Muzzle safety model.** The 180° plane is "drawn through the centerline of the shooter's body, perpendicular to the centerline of the shooting bay" and "moves with the shooter". The stage may instead use **Muzzle Safe Points** (physical markers), and the stage description must say which applies. **Muzzle Exclusion Zones** are marked on doors, ports or windows the shooter must open, 6–12 in square. Pointing the muzzle at one while touching the handle is a DQ. None of these is modelled except the plane. | §2.9.1.1–2.9.1.3, §2.2.2, §6.2.1.6 | VERIFIED |
| 8 | **Numeric stage-design limits a validator can check.** At most 18 rounds per string. Required movement of at most 10 yd [360 in] between firing points and at most 20 yd [720 in] in total. Targets at most 20 yd [720 in] in scenario stages and 30 yd [1080 in] in standards stages. Head-sized or smaller targets at most 10 yd in scenario and 15 yd [540 in] in standards. At most 1 non-threat per 2 threats in a string (rounded up). Steel at most 25% of the shots in a string and at most 10% of the match. Cardboard at 10 yd or less must show at least 12 sq in of -0, with its smallest dimension at least 3 in. | §6.5.3, 6.5.4, 6.5.7, 6.5.8, 6.5.11, 6.5.12, 6.5.15, 6.5.22, 6.5.23 | VERIFIED |
| 9 | **Activated and disappearing targets.** A shooter "may not leave a PoC for an activated target until it is activated and engaged". An activated target may be engaged before, after or between static targets if static priority is kept. Once a disappearing target is gone, the shooter may advance. | §3.2.3.1–3.2.3.4, §3.2.4.1 | VERIFIED |
| 10 | **Scoring and penalties for drill logs.** Score = raw time + (points down × 1 s) + penalties. Cardboard zones are -0, -1, -3, and a miss is -5. Unlimited scoring keeps the best N hits. A hit on hard cover counts as a miss. Each hit on a non-threat (HNT) adds 5 s. Shoot-throughs: both hits count. Penalties: PE 3 s, FP 10 s, FTDR 20 s. There is **no Failure to Neutralize (FTN)**: it was removed in 2017. | §4.1.1–4.1.3, §4.7.4, §4.9, §4.11.2, §4.12.1.1, §5.1.1, §5.2.1, §5.3.1; FTN: SECONDARY [SSUSA 2017] | VERIFIED / SECONDARY |

**Conflict with an existing doc.** `docs/target-preset-sources.md` cites "IDPA 2026 p20" for the 18.125 × 30.75 in overall size of the IDPA Standard and Alternate targets.

- The rulebook **text** has neither "18 1/8" nor "30 3/4" (or 30.75). Its pages 19–20 have no target names, captions or dimension labels in the text layer.
- If those numbers appear on p20, they are in an image I could not view.
- The only corroboration is the CHL vendor page already cited in that doc.
- The rulebook text also never names an "Alternate" target.
- Recommendation: relabel both presets as vendor-sourced or "drawing only (unverified)".

---

## 1. Edition, effective date, URL

| Item | Value | Status |
|---|---|---|
| Title | "2026 IDPA Rulebook – Competition and Equipment Rules of the International Defensive Pistol Association, Inc."; "Ver. 2026" | VERIFIED (title page) |
| Dates | "Adopted 10/26/96, amended 1/1/26". No separate effective-date line. | VERIFIED |
| Revision | The search index gives the PDF title as "2026.2 IDPA Rulebook". IDPA posted "2026 IDPA Rule Changes (v2 of 2026 rulebook)", and the file name ends "-2". This is version 2 of the 2026 book. | SECONDARY (search index; the IDPA page itself was blocked) |
| Effective | "effective January 15" (2026) | SECONDARY ([gunstuff.tv](https://gunstuff.tv/idpa-uspsa-and-ipsc-release-major-rule-updates-for-2026-practical-shooting-competitions/)) |
| Newer edition? | Searches on 2026-10-25 found no 2027 rulebook and no later 2026 revision. | SECONDARY (absence in search) |
| Companion docs | Classification is in the Match Administration Rules (§9); start conditions are in the Equipment Appendix (§2.8). [2026 Match Admin](https://www.idpa.com/wp-content/uploads/2026/01/2026%20Match%20Admin-2.pdf), [2026 Equipment Appendices](https://www.idpa.com/wp-content/uploads/2026/01/2026%20Eq%20Append-2.pdf) | VERIFIED pointers; contents NOT accessed |
| Sections (start pages) | 1 Founding concepts (p2); 2 Safety (p4); 3 Shooting (p10); 4 Scoring (p16); 5 Penalties (p23); 6 Stage design (p25); 7 PPDS (p28); 8 Equipment (p29); 9 Classification, pointer only (p36); 10 Appeals (p37) | VERIFIED (TOC) |

Changes the 2026 book is reported to make (SECONDARY, gunstuff.tv):

- §2.2.3: a non-functional manual safety is a DQ.
- §2.9.1.3: muzzle exclusion zones refined.
- §3.2.1.5: priority updated.
- BUG capacity changed.

---

## 2. Approved targets

| Target | Scoring | Dimensions stated as numbers in the text | Rule | Status |
|---|---|---|---|---|
| Official IDPA cardboard (threat) | Zones are scored "as marked, as -0, -1, -3, and a miss is -5". It has an upper (head) and a lower (body) -0 zone. "Head" means above the neckline; "body" means below it. One target may not be split into separately scored areas. | **None.** Overall and zone sizes are not stated in the text, so any figure would come from a drawing or a vendor. | §4.12.1, §4.12.1.1, §4.10.1–4.10.4, §6.5.9 | VERIFIED |
| Cardboard with reduced area | The non-scoring area is painted a high-contrast colour, leaving a 3/8 in non-scoring perimeter. | 3/8 in perimeter | §4.12.1.2 | VERIFIED |
| Cardboard with hard cover (cut away or painted black) | Hard cover covers "no more than half of the original target size for scenario stages" | ≤ ½ of the target | §4.12.1.3 | VERIFIED |
| Cardboard with the -0 cut out | Stationary only; "may be shot starting within 3 yards or less" | 3 yd | §4.12.1.5 | VERIFIED |
| Non-threat | Marked with "a pair of normal sized open hands of contrasting color". Scored -5 per hit regardless of zone, and each HNT adds 5 s. The rules state this twice; I read it as one 5 s per hit (INTERPRETATION). | none | §4.8.1, §4.11.1–4.11.2, §4.12.1.1 | VERIFIED |
| Popper / Pepper Popper (full or mini) | -0 if it falls, -5 if it stands | **min height 24 in, min width 8 in** | §4.12.2 | VERIFIED |
| Steel "legs" | -0 if it falls, -5 if it stands; the calibration zone is the upper ½ | **≥ 3 in wide, ≥ 15 in tall** | §4.12.3 | VERIFIED |
| IDPA Reactive Target (clothed cardboard over a -0 steel plate) | -0 if it falls, -5 if it stands; the cardboard is not scored; not counted in the steel ratio | none | §4.12.4 | VERIFIED |
| Popper behind paper (activator) | The popper is not scored. It must be visible above or below the cardboard from every position the target may be shot from. | none | §4.12.5, §4.12.6 | VERIFIED |
| Round plate | stationary | **≥ 6 in diameter** | §4.12.8 | VERIFIED |
| Square plate | stationary | **≥ 6 in square** | §4.12.9 | VERIFIED |
| Other plate | stationary | **≥ 28.3 sq in; smallest dimension ≥ 3 in** | §4.12.10 | VERIFIED |
| Clay pigeon | stationary; not calibrated | none | §4.12.11 | VERIFIED |

More target rules (all VERIFIED):

- Moving steel and moving clay pigeons are not allowed (§4.12.12).
- Disallowed targets include bowling pins, Texas Star, plate racks, dueling trees, the IDPA Practice Target, and tombstone and coffin poppers (§4.13).
- Cardboard targets may move (§4.12.1.1). A disappearing target is one that at rest shows no -0 or -1 area (§4.12.1.4).
- Simulated hard cover is black (§4.7.3). Simulated walls are impenetrable from the ground to infinity unless the course of fire says otherwise (§4.7.2).
- Painted threat or non-threat indicators are not hard cover. Indicators made of impenetrable material are hard cover (§4.7.6, §4.7.7).
- All threat indicators carry equal threat and do not change priority (§4.8.3).

---

## 3. Scoring and penalties

| Item | Value | Rule | Status |
|---|---|---|---|
| Stage score | Raw time + points down × 1 s + penalties. Limited scoring works the same way. | §4 intro, §4.1.3, §4.2.1 | VERIFIED |
| Unlimited scoring | Shoot as needed; the best N required hits score (for example the best 3). Too few shots: the unfired rounds count as misses **and** a PE. | §4.1.1, §4.1.2 | VERIFIED |
| Limited scoring | Exactly the stated number of shots. Extra shots: 1 PE per string, and one of the best hits is taped over. | §4.2.1, §4.2.2 | VERIFIED |
| Miss | -5 points [5 s] | §4.12.1.1 | VERIFIED |
| Hit on hard cover | A full-diameter hole in hard cover counts as a miss on the target. Soft cover: the hit counts. | §4.7.4, §4.7.5 | VERIFIED |
| Shoot-through | Penalty for the non-threat hit **and** credit for the threat hit; the reverse also applies; "All target shoot through hits count." | §4.9 | VERIFIED |
| HNT | +5 s per hit | §4.11.2 | VERIFIED |
| Procedural Error (PE) | +3 s per infraction, one per type of infraction. Applies to: not following the stage description's shooting actions; breaking "a rule of the game"; conduct violations. | §5.1.1–5.1.2 | VERIFIED |
| Specific PEs in the text | engaging while faulting the line (§3.6.4.4, §3.6.5.1); body-then-head order broken (one PE, §3.2.2.2); leaving behind a loaded magazine or loading device (§3.4.8); first finger violation (§2.6.1.1) | as listed | VERIFIED |
| Priority / cover breaches | No penalty is written into §3.2.1 or §3.5.6. They fall under PE §5.1.1.2 (INTERPRETATION). The 2025 rulebook listed "Not engaging targets in tactical priority" as a PE. | §5.1.1.2 | SECONDARY ([Wikipedia](https://en.wikipedia.org/wiki/International_Defensive_Pistol_Association), citing the 2025 book) |
| Flagrant Penalty (FP) | +10 s. For deliberately breaking a rule for more than a 3 s advantage, or using equipment for an obvious scoring advantage. Examples: SHO/WHO shot freestyle, not going prone when required, overloaded magazines. MD approval required. | §5.2.1–5.2.3 | VERIFIED |
| Failure To Do Right (FTDR) | +20 s for gross unsportsmanlike conduct. MD approval required. Makes the shooter ineligible for some awards. | §5.3.1–5.3.3 | VERIFIED |
| Failure to Neutralize (FTN) | **Not in the 2026 rulebook** (term search). It was removed in 2017; formerly 5 s. | — | VERIFIED absence; history SECONDARY ([SSUSA 2017](https://ssusa.org/content/new-look-for-idpa)) |
| DQ | Unsafe handling, unsportsmanlike conduct, steel under 10 yd, intentional shots at non-targets. MD confirms. | §5.4.1–5.4.2 | VERIFIED |
| Stage DNF | Start but cannot finish: scored as found, misses and penalties included. "If no shots are fired, a 0.01 second raw time" is recorded. Declining a stage = stage DNF, and any stage DNF = match DNF. | §4.3.1, §4.4.1 | VERIFIED |
| Steel calibration | Sanctioned-match steel is calibrated; challenge procedure in §4.16 | §4.16 | VERIFIED (headings) |

---

## 4. Cover and stage rules (planner core)

### 4.1 Definitions

| Term | Rule text (short) | Rule | Status |
|---|---|---|---|
| Cover | "a position where a shooter can engage targets with a portion of their upper and lower body behind an object such as a wall" | §1.2.4.3 | VERIFIED |
| Hard cover | Stops bullets; hits on it or through it are not scored | §3.5.1 | VERIFIED |
| Vertical / horizontal cover | Shoot from the side(s) of the PoC / over or under it | §3.5.2, §3.5.3 | VERIFIED |
| Concealment / soft cover | "hidden from sight"; a penetrable barrier | §3.5.4 | VERIFIED |
| In the open | Engaging with no cover or concealment | §3.5.5 | VERIFIED |
| Vision barrier | Soft cover that blocks the view; may not be hard cover; hides "surprise" targets that are engaged in the open; "no slicing the pie around a vision barrier" | §6.5.27.1–6.5.27.3, §3.5.10.3 | VERIFIED |
| Non-threat as cover | "provide no cover or concealment to a shooter" | §6.5.27.5 | VERIFIED |
| String of fire | A section of the course of fire started by a start signal | §1.2.4.2 | VERIFIED |

### 4.2 Using cover

| Rule | Text (short) | Status |
|---|---|---|
| §3.5.6 | "When cover is available it must be used while engaging targets," unless forced into the open. "Shooters may not cross or enter any openings … to engage targets." | VERIFIED |
| §3.5.7.1–3.5.7.4 | Cover situations: no cover in the stage (reloads allowed in the open); all targets from cover; starting in the open (up to 6 shots, stationary or moving to the first PoC); moving between PoCs (at most 6 shots on "surprise" targets behind a vision barrier) | VERIFIED |
| §6.5.26 | In a stage with cover, no target in the open may require more than 6 shots while out of cover; more than one such engagement per stage is allowed | VERIFIED |
| §3.3.1 | In the walkthrough the SO indicates "the vision barriers and points of cover for each target and fault lines". This matches the app's per-target allowed areas. | VERIFIED |

### 4.3 Limited/unlimited "vantage", tactical sequence, tactical order

| Term | Finding | Status |
|---|---|---|
| Limited / Unlimited **vantage** | **Not in the 2026 text** (term search of §1–§8.7). The only "Limited/Unlimited" is **scoring** (§4.1, §4.2). | VERIFIED absence |
| Tactical **sequence** | Not in the 2026 text; removed in 2017 ("The Tactical Sequence method … is also gone") | VERIFIED absence; SECONDARY ([SSUSA 2017](https://ssusa.org/content/new-look-for-idpa)) |
| "In tactical order" | Not found. The 2026 wording is "All targets must be engaged in tactical priority, including all targets engaged 'in the open'". | §3.2.1.1 VERIFIED |
| Tactical priority | "engaged by their order of threat"; see Top 10 #1 | §3.2.1–3.2.1.5 VERIFIED |
| Slicing the pie | Not named as a method. §3.2.1.4 (engage targets as they appear around the edge of vertical cover) describes it; it is banned around vision barriers. | §3.2.1.4, §6.5.27.2 VERIFIED |
| Equal priority | Penalties do not apply to the shooter's choice of order among equal-priority targets | §3.2.4.2 VERIFIED |
| Re-engaging | Allowed elsewhere in the stage without breaking muzzle safe points, and freestyle once the requirement is met | §3.2.4.3, §3.2.4.4 VERIFIED |
| "Engaged" | Cardboard: the required shots have been fired at the visible target. Reactive: at least 1 round fired. Paper over an activator: shots on the paper. | §3.2.2.1–3.2.2.4 VERIFIED |

### 4.4 Fault lines and positions of cover

All VERIFIED:

- **§3.6.1 / §6.3.1:** fault lines mark the limit of a PoC or of a shooting position.
- **§3.6.3:** faulting means touching the ground or another object on the far side of the line.
- **§3.6.4.1–3.6.4.5:** one line per PoC, valid for every target visible from it; the line starts at the cover object and runs back 3–8 ft [36–96 in]; no line, no valid PoC; engaging while faulting is a PE; no other measurement methods.
- **§3.6.5:** fault lines may also limit movement when shooting in the open; faulting there is a PE.
- **§3.6.6:** a line may end at an object, such as a barrel.
- **§3.6.7:** fault lines "are not cover themselves". They restrict advancing toward unengaged targets that are exposed.
- **§6.3.2–6.3.6:**
  - markings are consistent and no wider than 4 in;
  - they outline the area where a shooter "may safely engage all available targets from that position";
  - windows of 24 in or more have fault lines; windows under 24 in have one centre line.
- **§3.5.10.4:** engaging from distant cover beyond the end of a fault line is not in itself a penalty, but exposure to another position's unengaged targets is.

### 4.5 Reloads

All VERIFIED:

- **Reload types (§3.4.1–3.4.3):** emergency, loaded-chamber, and tactical (removed magazine retained).
- **When a reload starts and ends (§3.4.4–3.4.5):** it starts at magazine release or when a revolver cylinder opens; it ends when the magazine is seated and the slide is in battery.
- **When reloading is allowed:**
  - In stages with cover, reload standing or moving "as long as they are not exposed to targets that are not fully engaged" (§3.5.10.2).
  - If the gun runs empty in the open, reload there or move on (§3.5.10.1).
  - In a stage with no cover, reloads are allowed in the open (§3.5.7.1).
- **No loading device with ammunition may be left behind (§3.4.8):** this is a PE. Exception: staged magazines, if the shooter does not leave that position (§3.4.8.1). A dropped loaded magazine is not penalized if it is retrieved before the last shot (§3.4.9).
- **Reloads may not be mandated (§6.5.24):** mandated reloads or topping off are done off the clock.
- **Principle (§1.2.4.1):** "reloading behind cover, and limiting the number of rounds per string".

### 4.6 Shooting while moving; courses of fire

All VERIFIED:

- **Shooting on the move is allowed.** No rule forbids it. §3.5.7.3 explicitly allows required shots while moving to the first PoC, and §2.6.1 requires the finger outside the guard "while moving (unless engaging targets)".
- **Stage types (§6.1.1.1, §6.1.2.1):**
  - Scenario stages represent a civilian self-defence situation.
  - Standards stages test fundamentals, may use limited or unlimited scoring, and need no scenario.
  - Sanctioned matches may have at most 2 standards stages.
- **Round counts:**
  - The stage description states the minimum round count and whether scoring is limited or unlimited (§6.2.1.7).
  - At most 18 rounds per string (§6.5.11).
  - Only one paper target in a string may require a different shot count (§6.5.6).
- **Hand usage (§3.9):** freestyle, SHO, WHO, retention (at most 1 yd, §6.5.19).
  - SHO targets at most 10 yd (§6.5.18).
  - WHO targets at most 7 yd (§6.5.20).
  - WHO never requires a weak-hand draw, a weak-hand-only reload, or retention (§3.9.3, §6.5.21).
- **No memory stages, blind stages, or movable non-threats (§6.5.5, §6.5.10).**

### 4.7 Stage design limits

All VERIFIED. Inches are my conversions.

| Limit | Value | Rule |
|---|---|---|
| Match shots within 15 yd [540 in] | ≥ 75% | §6.5.2 |
| Max target distance, scenario / standards | 20 yd [720] / 30 yd [1080] | §6.5.3, §6.5.4 |
| Head-sized or smaller targets, max distance | 10 yd scenario / 15 yd standards | §6.5.22 |
| Cardboard at 10 yd or less | ≥ 12 sq in of -0 visible; smallest dimension ≥ 3 in | §6.5.23 |
| Steel share | ≤ 25% of the shots in a string; ≤ 10% of the match | §6.5.7, §6.5.8 |
| Rounds per string | ≤ 18 | §6.5.11 |
| Required movement | ≤ 10 yd [360] between firing points; ≤ 20 yd [720] in total | §6.5.12 |
| Low cover / prone | must be the last position of the string | §6.5.13 |
| Non-threats | ≤ 1 per 2 threats per string, rounded up | §6.5.15 |
| Shots in the open (stage with cover) | ≤ 6 per engagement | §6.5.26, §3.5.7.3 |
| Activator behind a scoring target | must trigger from the upper or lower -0; otherwise the -0 that does not trigger it is marked hard cover | §6.5.9 |
| Painted hard cover | not over the path of a moving target | §6.5.17 |
| Stage boundaries | defined and physically marked (rope, tape, cones) | §6.4 |
| Targets | only official or approved targets | §6.5.1 |

### 4.8 The 180, muzzle safe points, exclusion zones

All VERIFIED:

- **Three indicator types (§2.9.1).**
- **Muzzle Safe Point (§2.9.1.1):** "a physical and clearly visible marker such as a traffic cone or stake in the ground".
- **180° plane (§2.9.1.2):** quoted in Top 10 #7. Breaking the 180 while drawing from or holstering into a muzzle-rearward holster, when facing downrange, "is not an infraction".
  - App note: the plane is defined against the **bay centerline**. `downrangeDegrees` must represent that line.
- **Muzzle Exclusion Zone (§2.9.1.3):** on doors, ports or windows the shooter is required to open; 6–12 in square. Pointing the muzzle at the zone while touching the handle is a DQ.
- **DQ (§2.2.2):** pointing past muzzle safe points or past the 180 plane, whichever the stage uses.
- **The stage description must say which applies (§6.2.1.6).**

### 4.9 Start position and conditions

| Rule | Text (short) | Status |
|---|---|---|
| §3.7.1 | After "Standby", the shooter's position "may not be changed prior to the start signal", except for head movements | VERIFIED |
| §3.7.2 | Default: "stand erect with the body relaxed and hands resting naturally at sides for pistol". PCC default: facing downrange at low ready, shouldered, muzzle about 45° down or at a PCC marker | VERIFIED |
| §3.7.3–3.7.4 | Wrong start position: if an SO caused it, a mandatory reshoot with no penalty; otherwise the shooter must ask before targets are scored | VERIFIED |
| §6.2.2.4, §6.2.2.6, §6.2.2.6.1 | The stage description may set the gun's start condition and position, the magazine positions, and the shooter's start position. A PCC must not start facing up range. | VERIFIED |
| §2.2.7 | Drawing while facing up range is a DQ, so an up-range start with a holstered gun means the shooter turns before drawing | VERIFIED |
| §2.8 | Start conditions: "Refer to Equipment Appendix" | VERIFIED pointer; the appendix itself was **not accessed** |

### 4.10 What the stage description must specify

| § | Required content | Status |
|---|---|---|
| 6.2.1.1 | Scenario or standards | VERIFIED |
| 6.2.1.2 | Start position | VERIFIED |
| 6.2.1.3 | Firearm condition (loaded, unloaded, downloaded) and location | VERIFIED |
| 6.2.1.4 | Procedure | VERIFIED |
| 6.2.1.5 | "all possible points of cover and fault lines" | VERIFIED |
| 6.2.1.6 | 180 rule or muzzle safe points | VERIFIED |
| 6.2.1.7 | Minimum round count; limited or unlimited scoring | VERIFIED |
| 6.2.1.8 | Whether a concealment garment is **not** required | VERIFIED |
| 6.2.1.9 | A descriptive diagram | VERIFIED |
| 6.2.2 | The description cannot override the rulebook or forbid legal actions. Exceptions: safety at the range's limits, garment option, rounds in the gun (up to division capacity), start condition and positions, PCC prop fit, shooter start position, and a standards drill with at most two required shooting actions per string. | VERIFIED |

---

## 5. Divisions, power factor, classification

| Division | Capacity (§8.1.3) | Min PF (§8.3.4) |
|---|---|---|
| SSP | 15* | 125 |
| ESP | 10 | 125 |
| CO | 10 | 125 |
| CDP | 8 | 165 |
| CCP | 10 | 105 |
| REV, stock / enhanced | 6 | 105 / 155 |
| BUG-S / BUG-R | 8 / 5 | 105 |
| PCC | 30* | 135 |

Division notes:

- **Status:** all VERIFIED. There are eight divisions, and none competes against another (§8.1.1.1).
- **Specialty divisions:** REV, BUG and PCC are optional specialty divisions at Tier 1–3 sanctioned matches. Tier 1 may allow .22 rimfire (SPD, §8.2.9).
- **Asterisk (\*):** capacity may be lowered for local law.
- **Gear rules:** per-division gear rules are in Appendices A1–A7 and B, which I did not access.
- **Power factor:** bullet grains × fps ÷ 1000, decimals dropped (§8.3.4.6). The ammunition passes if 2 of 3 rounds meet the PF (§8.3.5.1.1).

Classification:

- §9 says only that classification rules are in the Match Administration Rules (VERIFIED pointer).
- Classes: Novice, Marksman, Sharpshooter, Expert, Master, Distinguished Master. DM is earned at Nationals. The classifier is the 5×5 (25 rounds at 10 yd) (SECONDARY: [Athlon, modified 2026-02-10](https://athlonoutdoors.com/article/idpa-5x5-classifier/)).
- Thresholds: not verified.

---

## 6. Match structure (brief)

- **Hierarchy:** match → stages (scenario or standards, at most 2 standards per sanctioned match) → strings, each started by a start signal (§6.1, §1.2.4.2). VERIFIED.
- **When a course of fire runs:** from "Range Is Hot" to "Range is Clear" (§5.5.2–5.5.3). The full command sequence is in §2.12. VERIFIED.
- **Walkthroughs:** one group walkthrough led by the SO. There are no individual walkthroughs, no air gunning, and no sight pictures inside stage boundaries (§3.3.1–3.3.4, §1.2.3.5). VERIFIED.
- **Range and gear:** sanctioned matches run cold, though hot bays are allowed (§2.11). The same firearm is used for every stage (§1.2.3.7). Reshoots happen only for stage equipment failure or SO interference (§3.8). VERIFIED.
- **Tiers:** Tier 1–5 definitions, stage and round minimums are in the Match Admin rules. NOT accessed.

---

## 7. Safety and DQ warnings for the planner (warn only; do not certify)

All VERIFIED unless marked. The planner can check geometry only. It cannot see muzzle direction during movement, reloads or the draw.

| Warn when | Rule |
|---|---|
| A firing position is under 10 yd [360 in] from any steel | §2.14, §5.4.1.4 |
| An engagement direction is near or beyond the 180 plane, or past a muzzle safe point. Flag it as "check stage brief" when the brief uses safe points. | §2.2.2, §2.9.1 |
| A route opens a door, port or window (possible exclusion zone) | §2.9.1.3 |
| A required shot is at a target on the ground within 2 yd [72 in]. This is allowed only for a low target within 2 yd. | §2.2.4.3 |
| A shot line passes over a berm. Plan view cannot check this. | §2.2.4.4 |
| An up-range start with a holstered draw, or any route that implies drawing while facing up range | §2.2.7, §6.2.2.6.1 |
| Long movement between positions. Remind: finger outside the guard while moving unless engaging (PE, then DQ on a second offence). | §2.6.1 |
| A plan implies sweeping any person, including yourself. The only exception is your own body below the belt while drawing or holstering. | §2.2.1, §2.2.1.1 |
| Discharges during reload or malfunction clearance, or while switching hands. These are shooter actions; the route cannot check them. | §2.2.4.5, §2.2.4.7 |
| Dropping a firearm within stage boundaries | §2.3.2 |

Do not claim compliance with any of these rules. A plan-view check is not a ruling (AGENTS.md).

---

## Not accessed or not verified

- **Blocked (IDPA pages, robots.txt):**
  - [IDPA Match Rules page](https://www.idpa.com/idpa-match-rules/)
  - [2026 Rule Changes (v2)](https://www.idpa.com/2026-idpa-rule-changes-v2-of-2026-rulebook/)
  - [2026 Rule Documents Update](https://www.idpa.com/2026-idpa-rule-documents-update/)
  - the 2026 Equipment Appendices PDF (start conditions, division gear)
  - the 2026 Match Administration Rules PDF (classification, tiers)
  - Rulebook Continuing Education Vol 1
- **Blocked (direct PDF download):** the session proxy refused the download (403), and Chrome was not connected. **Images in the rulebook were not viewed:** target drawings, any zone or overall dimensions shown only in figures, and the holster Figures 1–3.
- **Not verified:** the 2026 effective date (Jan 15 is SECONDARY); exact v2 change list; classification thresholds; tier definitions; default start conditions; the IDPA Alternate target and the 18.125 × 30.75 in size cited in `target-preset-sources.md`.
- **Quote fidelity:** the rule text above is short quoted fragments returned by an extraction tool, so some long rules are quoted only in part. Check exact wording against the PDF before quoting it in the app.

[RB]: https://www.idpa.com/wp-content/uploads/2026/01/2026-IDPA-Rulebook-2.pdf
[SSUSA 2017]: https://ssusa.org/content/new-look-for-idpa
