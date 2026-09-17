# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Prototype 2 Phase 1

Home opens Stage Planner (New Stage / Saved Stages), Training and Account.
The builder uses an explicit Save button: name the stage, edit, save, and close.
Back navigation warns about unsaved edits. Changes are not automatically saved;
force-closing the app can lose edits since the last successful save.
Saved Stages supports rename, independent copies, and confirmed deletion.

`src/storage/repository.ts` owns parameterized SQL and schema initialization.
`practical-shooting.db` contains stages, training records and local profiles.
Each stage row stores the complete StageDocument and StagePlan in one versioned
JSON payload, so IDs, wall ports, partial faces and ammunition references remain
intact. Duplicate stages keep internal object IDs in a separate stage record.
Storage is local to this installation; there is no cloud backup or account sync.

Training has typed records, six starting types, timing segments and repository
save/list methods. Recording sessions and drills are deferred. Account displays
an independent performance baseline, currently estimates rather than measurements.
Route planning and Apple sign-in are intentionally deferred.

Checks (Node 22.13+; Node 24 recommended for built-in SQLite tests):

```sh
npm test
npm run typecheck
npx expo start
```

Start Expo once after adding routes to refresh `.expo/types/router.d.ts`.
Expo SQLite adds native code: create a new development/TestFlight build.
For web, Metro config supplies WASM support and cross-origin isolation headers.
Production web hosting must also send `Cross-Origin-Embedder-Policy: credentialless`
and `Cross-Origin-Opener-Policy: same-origin` (SQLite web support is experimental).
