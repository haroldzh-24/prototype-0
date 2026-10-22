# Dependency advisory review — 2026-10-22

`npm audit` in `mobile/` reports **25 advisories (18 high, 7 moderate, 0 critical)**. The RC1 notes recorded 30 on 2026-10-15; dependencies did not change in between, so the difference comes from updates to the advisory database. No forced fixes or overrides were applied.

## Findings

| Area | Packages | Ships in the app? | Assessment |
| --- | --- | --- | --- |
| Build tooling (high) | `braces`, `micromatch`, `metro*`, `@expo/cli`, `@expo/metro*`, `@react-native/community-cli-plugin`, `@react-native/metro-config` | No: bundler and CLI only | Denial-of-service in glob parsing during builds. Not reachable from the running app. |
| Code signing (high) | `node-forge` via `@expo/code-signing-certificates` | No: build and update signing tooling | Signature-verification weakness in tooling. Not used at runtime by the app. |
| Transitive flags (high) | `react-native`, `react-native-reanimated`, `react-native-worklets`, `@react-native/virtualized-lists`, `expo` | Yes, but flagged only through the tooling packages above | No advisory of their own; each is listed because it depends on the tooling chain. |
| Deep-link parsing (moderate) | `decode-uri-component` via `query-string` via `expo-router` | **Yes** | Malformed percent-encoding in a deep link can make decoding slow (JS-thread denial of service). Only reachable by opening an app link. Mitigated in RC2 by the unique scheme `practicalshootingpartner`; fixed upstream in `expo-router` 58 (Expo SDK 58). |
| Dev tunnel (moderate) | `uuid` via `@expo/ngrok` (devDependency) | No | Only used for `expo start --tunnel`. Remove `@expo/ngrok` if tunnels are not used. |
| Config tooling (moderate) | `@expo/config-plugins`, `xcode` | No | Prebuild-time only. |

`npm audit fix --force` proposes `expo@44` and `react-native@0.72`, which are years-old major **downgrades**. Do not run it.

## Recommendations

1. Ship RC2 as is: no high-severity advisory affects code that runs on the phone.
2. Plan the Expo SDK 58 upgrade after TestFlight is stable; it brings the fixed `expo-router`. Re-run `npm audit` afterwards.
3. Remove `@expo/ngrok` if the tunnel workflow is not needed.
4. Re-check this list before any wider distribution (public TestFlight or App Store).
