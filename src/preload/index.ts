import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type {
  LanguageDefinition,
  RunRequest,
  RunStartResult,
  RunnerEvent,
  StopResult
} from '../shared/runner'

export interface DesktopApi {
  getLanguages: () => Promise<LanguageDefinition[]>
  runCode: (request: RunRequest) => Promise<RunStartResult>
  stopRun: () => Promise<StopResult>
  onRunnerEvent: (listener: (event: RunnerEvent) => void) => () => void
}

const desktopApi: DesktopApi = {
  getLanguages: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.listLanguages)
  },
  runCode: (request) => {
    return ipcRenderer.invoke(IPC_CHANNELS.runCode, request)
  },
  stopRun: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.stopRun)
  },
  onRunnerEvent: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, data: RunnerEvent) => {
      listener(data)
    }

    ipcRenderer.on(IPC_CHANNELS.runnerEvent, wrappedListener)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.runnerEvent, wrappedListener)
    }
  }
}

contextBridge.exposeInMainWorld('runbox', desktopApi)

