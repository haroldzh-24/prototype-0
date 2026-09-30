# Target preset sources

Reviewed 2026-09-29. Registry: mobile/src/stage/targetPresets.ts. All stored dimensions and endpoints are inches, including fractions. Source units below are inches. Dimensions describe the target face, excluding stands and bases. The editor does not certify scoring zones, match legality, or cutting templates.

| Stable preset ID | Width × height (inches) | Status | Source |
| --- | --- | --- | --- |
| uspsa-metric-chl-v1 | 18.12 × 29.93 | Approximate contour; vendor overall size | [CHL Metric description](https://chltargets.com/uspsa-ipsc-cb-torso-cardboard-20-target-pack-free-shipping/) |
| uspsa-classic-chl-v1 | 18.12 × 22.84 | Approximate contour; vendor overall size | [CHL Classic description](https://chltargets.com/uspsa-ipsc-cb-classic-cardboard-60-target-pack/) |
| uspsa-reduced-at-v1 | 9.125 × 14.875 | Approximate contour; vendor reduced IPSC-CB size | [Action Target product listing](https://shop.actiontarget.com/) |
| pcsl-practical-2025-v1 | 18 × 24 | Supplier explicitly approximate; illustrative contour | [CHL Practical](https://chltargets.com/pcsl-practical-target-2025-version-cb-100-target-pack-free-shipping/) |
| pcsl-mini-practical-2025-v1 | 9 × 12 | Supplier explicitly approximate; illustrative contour | [CHL Mini Practical](https://chltargets.com/pcsl-mini-practical-target-scale-2025-version-cb-100-target-pack-free-shipping/) |
| pcsl-competition-2025-v1 | 18 × 24 | Supplier explicitly approximate; illustrative contour | [CHL Competition](https://chltargets.com/pcsl-competition-target-2025-version-cb-100-target-pack-free-shipping/) |
| pcsl-k-zone-legacy-v1 | 18 × 23 | Supplier approximate; legacy restrictions apply | [CHL K-Zone](https://chltargets.com/pcsl-cb-k-zone-100-target-pack-free-shipping/) |
| idpa-standard-2026-v1 | 18.125 × 30.75 | Rulebook overall dimensions; simplified contour | [IDPA 2026 p20](https://www.idpa.com/wp-content/uploads/2026/01/2026-IDPA-Rulebook-2.pdf) |
| idpa-alternate-2026-v1 | 18.125 × 30.75 | Rulebook overall dimensions; simplified contour | [IDPA 2026 p20](https://www.idpa.com/wp-content/uploads/2026/01/2026-IDPA-Rulebook-2.pdf) |
| uspsa-round-8-v1 | 8 × 8 | Verified nominal circle geometry; selected size within allowed range | [USPSA Appendix B3](https://uspsa.org/documents/rules/current/USPSA-Competition-Rules.pdf) |
| pcsl-round-8-v1 | 8 × 8 | Verified nominal circle geometry; chosen size, not a universal requirement | [PCSL targets](https://rules.pcsleague.com/rulebook/10-targets.html) |
| idpa-round-8-v1 | 8 × 8 | Verified nominal circle geometry; chosen size above minimum | [IDPA 2026 §4.12.8](https://www.idpa.com/wp-content/uploads/2026/01/2026-IDPA-Rulebook-2.pdf) |
| idpa-square-6-v1 | 6 × 6 | Verified nominal square geometry | [IDPA 2026 §4.12.9](https://www.idpa.com/wp-content/uploads/2026/01/2026-IDPA-Rulebook-2.pdf) |
| uspsa-mini-popper-bst-v1 | 8 × 28 | Approximate: published circle width/height; maximum outline width needs verification | [Blue Steel mini popper](https://www.bluesteeltargets.com/products/mini-pepper-popper-28) |

## Interpretation and unresolved data

- Paper/poppers deliberately use approximate status even when outer width/height is published. Polygon proportions are illustrative; no exact tracing or certified contour claim. Detailed shoulder cuts, corners and notch positions still need dimensioned drawings. Classic scoring dimensions (450 × 570 mm) are not substituted for outer cardboard. Reduced USPSA dimensions are from the named vendor, not half of another supplier's full-size target.
- CHL detailed target descriptions and generic product size metadata sometimes differ. This registry uses the detailed overall target description, never package Width/Height/Depth. The rulebook/vendor IDPA overall dimensions include the border, unlike inner scoring dimensions. [CHL corroborating IDPA page](https://chltargets.com/idpa-cardboard-target-official-idpa-targets/) lists 18 1/8 × 30 3/4; vendor variants exist.
- PCSL Practical, Mini Practical, Competition and legacy K-Zone are separate variants. [Official PCSL targets](https://www.pcsleague.us/targets) identifies current variants; the [current target rules](https://rules.pcsleague.com/rulebook/10-targets.html) restrict legacy K-zone use. Availability in this design palette does not assert eligibility for a particular event. PCSL paper no-shoots use red with an X.
- Popper 28-inch height and 8-inch circle are published; assuming the circle is the maximum overall silhouette width is approximate. Base dimensions are excluded. A dimensioned target-only drawing is still needed.
- Nominal round/square steel dimensions describe explicitly chosen geometry. They do not claim every physical product is manufactured to zero tolerance or that every family mandates that size.

## Persistence and rendering

Each new placed target saves presetId, targetFamily, geometry and its own outline snapshot. Reading a stage never looks up a preset to overwrite its saved geometry. Changing a match family changes only the Add Target default. Legacy targets keep existing dimensions; they are not retroactively identified as a verified preset. Explicit inspector dimension edits preserve preset provenance but produce a custom-sized instance.

The top-down editor displays a face diagram centered on the target anchor: both visible dimensions equal stored inches × viewport scale. Its minimum 44-point touch box and rotation wheel are editing controls, not physical geometry. 2.5D shows the saved contour upright; existing route/visibility calculations retain their prior conservative face-envelope model. No route-planning redesign is included.

New optional outline/preset/endpoint fields fit the existing schema-7 document. No database migration or rewriting of old stages is needed. Old segments derive endpoints from saved center, length and angle until edited. Save/reopen preserves new endpoints and fractional dimensions. Resize may leave endpoints outside the stage; loading preserves them for manual correction.
