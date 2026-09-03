USPSA Stage Planner/training metrics app — Prototype 0

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
