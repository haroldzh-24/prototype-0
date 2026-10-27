# Practice timer with a buzz start, and the buzz test (batch 23)

Added 2026-10-27. Code: `mobile/src/training/practiceTimer.ts` (logic), `mobile/src/training/buzz.ts` (phone side), `mobile/src/training/PracticeTimer.tsx`, `mobile/src/training/BuzzTest.tsx`. Tests: `mobile/tests/practiceTimer.test.cjs` and the timer and buzz-test cases at the end of `mobile/tests/ui-reorganization.test.cjs`. New native modules: `expo-haptics` (needs a new phone build); `expo-keep-awake` was already linked through `expo` and is now declared. No permission is needed for either.

## Why haptics

A drill starts on a beep. At home in dry fire a loud beep is unwelcome, and your eyes are on the target, not the phone. On a range you wear hearing protection and other bays are shooting, so a phone's beep is easy to miss. A buzz from the phone in your pocket or hand is felt, not heard or seen. The drill library (Training) is how the app collects the numbers the stage planner uses, so a start signal that works in both places makes more runs possible.

## Where it is

- **Training → TIMER & BUZZ TEST**: the practice timer with a typed par, and the buzz test below it.
- **Inside each drill → PRACTICE TIMER · BUZZ START**: the same timer, using that drill's par (the PAR TIME field under LOG A RUN).

## Practice timer

1. START: a light knock confirms the press, the screen stays awake, the box reads STANDBY.
2. 1–4 s later (random, as USPSA 8.3.3 and PCSL 5.1 set for the start signal after "Standby"): the start buzz; the box turns orange and counts up from the signal (SCREEN FLASH OFF keeps it dark).
3. At par: the start pattern twice, so it can't be mistaken for the start; the box turns yellow.
4. 1.5 s after par the timer finishes and says when the signal came. Without a par it counts as a stopwatch until STOP (2 min limit). STOP cancels every pending buzz.

Patterns (iPhone impact feedback is one short knock, tens of milliseconds):
- **BURST**: five heavy knocks 40 ms apart, felt as one 0.2 s buzz.
- **TAP**: one heavy knock.

The timer doesn't hear shots. Run times still come from a shot timer or from the run's video (batch 21).

## Buzz test (the experiment)

Two short tests that measure whether the buzz is a usable start signal and which pattern to use. Results are kept on the phone (`psp.buzzTest` device preference, last 400 of each kind) and SHARE RESULTS sends them as plain text with the phone model and iOS version.

**Reaction, phone in hand.** Pick BUZZ ONLY, SCREEN ONLY or BUZZ + SCREEN, and BURST or TAP. Ten trials, each 1.5–4 s after the last. Tap the pad as soon as you get the signal.
- Time = tap − the moment the app asked for the signal. It includes the phone's own delay in starting the buzz (or drawing the orange frame), which is the delay a user lives with.
- The tap is read from the raw touch (the responder grant), not from a button press, because a press inside a scrolling sheet can be held back to tell it from a scroll. The touch event's own timestamp is used when it is on the same clock as the signal time; otherwise the time it was handled.
- Under 100 ms after the signal, or before it, counts as early (a guess) and the trial is redone; no tap within 1.5 s is a miss. A block saves when 10 trials are reacted or missed (at most 20 attempts).
- Results: median, mean ± sample SD, fastest, and the early and missed counts, per signal.

**Pocket, phone put away.** Pick where (front pocket, back pocket, jacket) and BURST or TAP. Press START, put the phone away within 5 s and carry on. Over the next minute it buzzes 4–8 times at random moments, at least 4 s apart, then ends with a long triple burst. You then enter how many you felt; the number sent is shown only after you answer.

## Suggested protocol for the write-up

1. Settings: Low Power Mode off; Settings → Sounds & Haptics → System Haptics on. Note the iPhone model, iOS version and the build number from TestFlight.
2. Reaction: one block each of SCREEN ONLY, BUZZ ONLY (BURST), BUZZ ONLY (TAP), BUZZ + SCREEN (BURST). Alternate the order if you repeat.
3. Pocket: BURST and TAP in the front pocket, then the better one in a back pocket or jacket. Walk around or dry-fire during the minute.
4. Optional: one pocket test with hearing protection on, and one with Low Power Mode on (expect nothing: see below).
5. SHARE RESULTS and paste the text into the write-up.

## Known limits

- iOS plays no haptics in Low Power Mode, with System Haptics off, or while the camera or dictation is active, and doesn't tell the app (Expo Haptics docs, SDK 57). The screens say what to check.
- The buzz strength can't be set beyond iOS's "heavy" impact; a longer, stronger vibration would need Core Haptics in a native module.
- The reaction times measure the whole chain (app timer, iOS, Taptic Engine, the person). They are not a lab measurement and are not the same as reaction to a range officer's beep.
- The screen locks are prevented only while a timer or test runs; a locked phone stops JavaScript timers.
- Untested on a phone so far (needs the next build).
