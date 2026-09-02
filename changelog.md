# Changelog

Record completed features, changes, and bug fixes. Add new releases or updates above older entries.

## Unreleased

### Added

- A responsive 2D stage-planning area.
- Three labeled shooting-position blocks with mouse, touch, and pen dragging.
- Boundary checks that keep position blocks inside the stage.
- A button that returns all blocks to their starting positions.
- Simple, clean styling with a stage grid and clear drag states.
- Three draggable, cardboard-shaped target markers.
- Three draggable wall objects in horizontal and vertical orientations.
- Controls for adding and removing targets and walls during a session.
- Unique internal IDs for dynamically created targets and walls.

### Changed

- Added future stage-planning ideas to `features.md`.
- Extended boundary checking and reset behavior to targets and walls.
- Simplified the stage to one draggable block labeled `Start Position`.
- Reset now removes added objects, restores removed defaults, and returns every default object to its starting location.
- Reused the shared drag behavior for both default and newly created objects.

### Fixed

- Nothing yet.
