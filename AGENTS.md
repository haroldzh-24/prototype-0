# Project Instructions

This is a class prototype project.

Keep the project simple and working.

When making changes:
- Do not make unrelated changes.
- Explain major changes clearly.
- Keep bugs.md updated with bugs and fixes.
- Keep features.md updated with planned features.
- Move completed features and fixes into changelog.md.
- Remind me about bugs or features that have been unresolved for more than one month.

## Permissions
- Do not add or request app permissions unless a feature clearly requires them.
- Treat permissions as a user-facing product decision, not a default setting.
- Prefer the least-privilege option: only request the exact permission needed for the specific feature.
- For any mobile or Expo-related permission work, check the versioned Expo docs before changing native configuration or API usage.
- If a permission is denied, the app should still work with a graceful fallback or a clear explanation.
- When permission-related code is added, document why it is needed and confirm the matching manifest/native config changes are intentional and minimal.