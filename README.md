# Runbox

Electron desktop playground for running code in one split-screen workspace. The first version ships with a JavaScript runner and keeps the execution layer extensible so more languages can be added later.

## Stack

- Electron
- React
- TypeScript
- Monaco Editor

## Scripts

```bash
npm install
npm run dev
npm run build
npm run package:mac
npm run package:win
```

## Current capabilities

- Split editor/output layout
- Monaco-based code editor
- Manual run and auto-run
- Separate stdout and stderr panels
- Timeout and stop controls
- JavaScript execution in an isolated child process
- Update status card with GitHub Releases auto-update hooks

## Architecture

- `src/renderer`: UI, editor, output panels
- `src/preload`: safe bridge between renderer and Electron main
- `src/main`: window lifecycle, IPC, execution manager
- `src/main/runners`: language adapters
- `src/shared`: IPC payload and event types

## Adding another language later

1. Create a runner in `src/main/runners`.
2. Return a `PreparedRun` with command, args, and cleanup logic.
3. Register the runner in `src/main/runners/registry.ts`.
4. The UI will pick it up from the shared language registry response.

## Auto updates

Runbox now includes an update manager wired for GitHub Releases via `electron-updater`.

1. Set `runboxUpdater.owner` and `runboxUpdater.repo` in `package.json`.
2. Publish packaged builds to that GitHub repository's Releases page.
3. Use `npm run package:mac` and `npm run package:win` to generate installer artifacts.

Notes:

- macOS auto-update needs the `zip` target alongside `dmg`, which is already enabled.
- In dev mode, update checks stay disabled. Test updates with a packaged build.
