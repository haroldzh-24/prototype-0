# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Permission policy
- Keep permissions minimal, explicit, and feature-based.
- Do not request camera, microphone, location, notifications, file/media, contacts, or other native permissions unless the user flow truly needs them.
- Prefer user-initiated actions that trigger permission requests, not silent or automatic requests during app launch.
- If permission access is denied or unavailable, the app must fall back gracefully and continue to function.
- Any permission-related change should be checked against the correct Expo API and the native config in the app manifest; do not assume defaults are safe.
- Avoid broad or background permissions unless the product requirement clearly justifies them and the docs confirm the exact necessity.
