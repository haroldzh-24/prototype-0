USPSA Stage Planner/training metrics app — Prototype 0

## Mobile release candidate

The feature-frozen 1.0.0 RC1 app is in [mobile](mobile/README.md). It includes local Matches/Stages, stage editing, manual PATH/ENGAGE/REVIEW, document import and calibrated manual reconstruction. Automatic diagram geometry detection is **EXPERIMENTAL**; manual reconstruction remains available when detection fails. Existing training and analysis tools are retained; data is local with no cloud backup.

See [release notes](mobile/docs/release-candidate.md) for automated validation and limitations, and [the current hardware checklist](mobile/docs/rc-hardware-validation.md) for unverified native behavior. A JavaScript export does not certify a signed TestFlight build. The original class prototype description below is historical.

## What It Does
This is a prototype for a 2D USPSA stage-planning and training application.

The current prototype allows users to:
- Move targets, walls, and the starting position around a stage
- Add and remove stage objects
- Reset objects to their original positions

This prototype is part of a larger project intended to help shooters digitally plan stages and movement as well as track performance metric.

## Bug / Fix

For the debugging portion of the assignment, I broke the Reset Positions button by removing the event listener connecting the button to the reset function.

The rest of the application continued to work, but pressing Reset no longer did anything.

I fixed the issue by reconnecting the button to the `resetStage()` function and tested it to confirm that the objects returned to their starting positions.

## Future Direction
Future versions may include:
- Saved stage layouts
- ai automated fastest suggested Movement paths, planned reloads
- Rotatable objects
- More detailed stage configuration
- set training drills and video upload capabilities with ai wireframe that analyzes where shooter and speed up for performance
