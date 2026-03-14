# Runbox

Electron desktop playground for running code in one split-screen workspace. Runbox ships with JavaScript ready to go, and now includes the plumbing for on-demand Python runtime installs without requiring the user to manage Python manually.

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
- Persistent tabs and layout restore
- JavaScript execution in an isolated child process
- Python runner support
- In-app runtime installation flow for languages that are not bundled yet
- GitHub Releases auto-update hooks

## Architecture

- `src/renderer`: UI, editor, output panels
- `src/preload`: safe bridge between renderer and Electron main
- `src/main`: window lifecycle, IPC, execution manager, runtime manager
- `src/main/runners`: language adapters
- `src/main/runtimes`: language runtime detection and installation
- `src/shared`: IPC payload and event types

## Adding another language later

1. Create a runner in `src/main/runners`.
2. Return a `PreparedRun` with command, args, and cleanup logic.
3. If the language needs its own runtime, add a controller in `src/main/runtimes`.
4. Register the runner in `src/main/runners/registry.ts`.
5. The UI will pick it up from the shared language registry response.

## Python runtime packages

Runbox expects Python runtime archives to be hosted by you and downloaded from inside the app when the user selects Python.

1. Open `src/main/runtimes/python-config.ts`.
2. Fill in the `url` for each supported platform.
3. Optional but recommended: fill in the `sha256` checksum.
4. Package each archive so the extracted layout matches the configured `entryPoint`.

Expected archive layout examples:

```text
macOS zip
  python/
    bin/
      python3

Windows zip
  python/
    python.exe
```

Notes:

- In development, Runbox will fall back to `RUNBOX_PYTHON_PATH` or a `python3`/`python` command found on your PATH.
- In packaged builds, users can select `Python` in the language dropdown and click the right-side install action to fetch the runtime.
- The same install flow can be reused later for Java, Go, or other languages.

## Auto updates

Runbox now includes an update manager wired for GitHub Releases via `electron-updater`.

1. Set `runboxUpdater.owner` and `runboxUpdater.repo` in `package.json`.
2. Publish packaged builds to that GitHub repository's Releases page.
3. Use `npm run package:mac` and `npm run package:win` to generate installer artifacts.

Notes:

- macOS auto-update needs the `zip` target alongside `dmg`, which is already enabled.
- In dev mode, update checks stay disabled. Test updates with a packaged build.
