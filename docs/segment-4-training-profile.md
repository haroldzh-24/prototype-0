# Segment 4: Training and Profile — October 5, 2026

Training uses the established fixed ScreenHeader with + SESSION, then loading/error/empty state or RECENT SESSIONS library cards. There is one creation bottom sheet. Session overflow opens a contextual video sheet; no session-detail route was added.

Cards show a context badge, a two-line truncated session name, local date, start position and video count. Card tap opens the first existing video analysis, or video actions when there is no video. Overflow always provides ADD VIDEO and all videos, labeled Analysis saved for REVIEWED and Needs review for ANNOTATING. Import still persists immediately and opens the same VideoAnalysisEditor. No analysis editor code changed in this segment.

CREATE SESSION uses the shared Input (100-character UI limit), wrapping Segmented context/start selectors and primary action. Blank names show an inline error; trimmed names save through the same repository call immediately. Busy controls and operation-generation protection remain. Context labels map explicitly to unchanged enums, including Pressure / Match. Start labels are Competition Holster, Level II / III Holster, Appendix, Low Ready, High Ready and Surrender.

Profile uses the shared header, LOCAL PROFILE / On this device, PERFORMANCE metric rows, existing context sample counts under TRAINING DATA, optional CALIBRATION / Active context, and CLOUD SYNC / Not available yet. Metrics use shared tabular numerals; absent/nonfinite values show an em dash and stored zero remains zero. Defaults and calculations are unchanged. No sign-in action is shown.

## Source-level phone review

Reviewed 390x844, 375x667 and 320x568 using the existing screen/sheet styles. Screen horizontal padding leaves 358, 343 and 288 points respectively. Card text uses flex:1/minWidth:0 and two-line ellipsis; its separate overflow target is 44 points. All action/selector targets are at least 44 points. Selectors wrap, Profile rows shrink their value column, and no new fixed page width was introduced. Sheets are capped at 85% viewport height (about 717, 567 and 483 points before keyboard) and scroll internally. Shared Input and sheet retain keyboard handling; Screen and sheet retain safe-area insets. Source review found no new page-level horizontal overflow path at normal text size.

No browser or native layout execution was performed for this segment. Physical-device verification remains required for keyboard coverage of the creation action, large text/long unbroken names, sheet height with safe areas, selector wrapping at accessibility sizes, and sheet dismissal followed immediately by analysis/import. Native media import/playback and explicit Save/reopen require the existing device checklist. These are verification gaps, not confirmed regressions.

## Validation

Focused component tests exercise actual screen callbacks with host mocks: loading/empty/error/retry, creation/blank names/long names, both selector mappings, cards/video entry, Profile metrics/counts/calibration/cloud. They do not certify native layout. Full TypeScript and test results are recorded in changelog.md and test-results/segment-4-tests.txt.

Changed files: mobile/src/app/training.tsx, mobile/src/app/account.tsx, mobile/src/training/presentation.ts, mobile/tests/ui-reorganization.test.cjs, this report, bugs.md, features.md and changelog.md. Existing pre-Segment-4 working changes were preserved. No commit or push.
