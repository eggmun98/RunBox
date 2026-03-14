import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type {
  LanguageDefinition,
  RunRequest,
  RunStartResult,
  RunnerEvent,
  StopResult
} from '../shared/runner'
import type { UpdateActionResult, UpdateState } from '../shared/update'

export interface DesktopApi {
  getLanguages: () => Promise<LanguageDefinition[]>
  runCode: (request: RunRequest) => Promise<RunStartResult>
  stopRun: () => Promise<StopResult>
  onRunnerEvent: (listener: (event: RunnerEvent) => void) => () => void
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<UpdateActionResult>
  installUpdate: () => Promise<UpdateActionResult>
  onUpdateState: (listener: (state: UpdateState) => void) => () => void
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
  },
  getUpdateState: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.getUpdateState)
  },
  checkForUpdates: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates)
  },
  installUpdate: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.installUpdate)
  },
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, data: UpdateState) => {
      listener(data)
    }

    ipcRenderer.on(IPC_CHANNELS.updateState, wrappedListener)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.updateState, wrappedListener)
    }
  }
}

contextBridge.exposeInMainWorld('runbox', desktopApi)
