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

