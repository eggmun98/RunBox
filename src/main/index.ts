import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc'
import type { RunRequest } from '../shared/runner'
import { RunManager } from './run-manager'
import { listLanguages } from './runners/registry'

let mainWindow: BrowserWindow | null = null

const runManager = new RunManager({
  onEvent: (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.runnerEvent, event)
  }
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f3ecdf',
    title: 'Runbox',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.listLanguages, () => {
    return listLanguages()
  })

  ipcMain.handle(IPC_CHANNELS.runCode, (_event, request: RunRequest) => {
    return runManager.run(request)
  })

  ipcMain.handle(IPC_CHANNELS.stopRun, () => {
    return runManager.stop()
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void runManager.dispose()
})

