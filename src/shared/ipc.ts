export const IPC_CHANNELS = {
  listLanguages: 'languages:list',
  installLanguageRuntime: 'languages:install-runtime',
  languageRuntimeState: 'languages:runtime-state',
  runCode: 'runner:run',
  stopRun: 'runner:stop',
  runnerEvent: 'runner:event',
  getUpdateState: 'updates:get-state',
  checkForUpdates: 'updates:check',
  installUpdate: 'updates:install',
  updateState: 'updates:state'
} as const
