# Rulebook references

Researched 2026-10-25 for what PSP needs to model, with section citations:

| File | Rulebook | Edition read |
| --- | --- | --- |
| [uspsa.md](uspsa.md) | USPSA Competition Rules | Edition 2026-09, effective 2026-09-01 |
| [pcsl.md](pcsl.md) | PCSL General Rulebook | Version 2026-09-14 |
| [idpa.md](idpa.md) | IDPA Rulebook | 2026, version 2 (amended 1/1/26) |

**How they were made.** Each item is marked VERIFIED (read in the rulebook) or SECONDARY (another source, named). The rulebook pages were read through a web tool that returns paraphrases with short quotes, not raw text; numbers and key rules were re-checked by exact quotation. Check the wording against the rulebook before quoting it in the app. Dimensions are recorded only where the rule text states them as numbers; figures that exist only in drawings were not measured.

**What the app uses from them.** See [gap-list.md](gap-list.md) for what is implemented and what is planned. Implemented so far: steel minimum distances in the planner and engagement analysis, drill scoring penalties, and the editor's stage check (`mobile/src/rules/stageCheck.ts`).

Re-check these files when a rulebook changes edition. USPSA posts a change log at https://rules.uspsa.org/uspsa/changelog and PCSL at https://rules.pcsleague.com/rules_changelog.html.
