# Project Instructions

Practical Shooting Partner (app name on device: PSP) is a stage-planning and training app for competitive practical shooters (USPSA, PCSL, IDPA). It started as a class prototype; it is now a real product. Keep it reliable and working.

The app lives in `mobile/` (Expo / React Native, TypeScript). The root `index.html`, `script.js` and `styles.css` are the original web prototype, not the app.

## Product direction (in priority order)

1. Reliable stage planning: the stage editor and stage data model must be dependable.
2. Route Planner V2: a deterministic geometry planner (`planRoute(stageSnapshot, options)`) that covers all required targets with the fewest necessary shooting positions and least unnecessary movement, and reports infeasibility instead of guessing.
3. Training data: drill runs store individual hit coordinates, not just scores.
4. AI explains computed results and real app data; it never invents positions, dimensions, scores, routes, rule interpretations or performance data.

Keep these as separate modules with explicit interfaces. The geometry planner must not depend on camera, shooter-profile, timing or scoring code.

## Established decisions

- Organization is Match → Stages. Each match has a target family (USPSA, PCSL, IDPA).
- Geometry is stored and calculated in inches with full fractional precision; the UI shows yards. Convert only through `mobile/src/stage/measurements.ts`.
- Every stage has a downrange direction (`downrangeDegrees`, default 270 = up the screen). Read it with `stageDownrange()`.
- Target presets must come from verified sources (rulebooks or manufacturer specs), recorded in `docs/target-preset-sources.md`. Never guess regulation dimensions.
- A route that looks plausible is not proof of safety or rule compliance. Never present a simplified angle check as 180-degree compliance; report uncertainty explicitly.

## When making changes

- Inspect the existing code before proposing a rewrite; preserve working behaviour.
- Do not make unrelated changes. Explain major changes clearly.
- Add or update tests for every fix and feature (`cd mobile && npm test`), and keep `npm run typecheck` passing.
- Never claim something is fixed or verified on a device without evidence.
- Ask before destructive or consequential actions: deleting significant code, rewriting Git history, force-pushing, changing signing credentials, production builds or App Store submissions.
- Keep bugs.md updated with bugs and fixes.
- Keep features.md updated with planned features.
- Move completed features and fixes into changelog.md.
- Remind me about bugs or features that have been unresolved for more than one month.
