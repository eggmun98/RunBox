import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import type { UpdateActionResult, UpdateState } from '../shared/update'

interface RunboxUpdateConfig {
  provider?: 'github'
  owner?: string
  repo?: string
}

interface PackageMetadata {
  runboxUpdater?: RunboxUpdateConfig
}

interface UpdateManagerOptions {
  onState: (state: UpdateState) => void
}

const DEFAULT_DISABLED_MESSAGE =
  'Updates are not configured yet. Add your GitHub owner and repo in package.json.'

function buildInitialState(message = 'Waiting for the first update check.'): UpdateState {
  return {
    status: 'idle',
    configured: false,
    currentVersion: app.getVersion(),
    nextVersion: null,
    progressPercent: null,
    transferredBytes: null,
    totalBytes: null,
    checkedAt: null,
    message
  }
}

function readPackageMetadata(): PackageMetadata {
  try {
    const packagePath = join(app.getAppPath(), 'package.json')
    const rawValue = readFileSync(packagePath, 'utf8')

    return JSON.parse(rawValue) as PackageMetadata
  } catch {
    return {}
  }
}

function normalizeUpdateConfig(): RunboxUpdateConfig | null {
  const packageConfig = readPackageMetadata().runboxUpdater
  const owner = process.env.RUNBOX_UPDATE_OWNER ?? packageConfig?.owner ?? ''
  const repo = process.env.RUNBOX_UPDATE_REPO ?? packageConfig?.repo ?? ''

  if (!owner || !repo) {
    return null
  }

  return {
    provider: 'github',
    owner,
    repo
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return String(error)
}

export class UpdateManager {
  private readonly onState: (state: UpdateState) => void
  private state = buildInitialState()
  private configured = false
  private initialized = false
  private checkInFlight = false

  constructor(options: UpdateManagerOptions) {
    this.onState = options.onState
  }

  initialize(): void {
    if (this.initialized) {
      return
    }

    this.initialized = true

    if (!app.isPackaged) {
      this.setState({
        ...this.state,
        status: 'disabled',
        message: 'Automatic updates are available in packaged builds.',
        configured: false
      })
      return
    }

    const config = normalizeUpdateConfig()

    if (!config) {
      this.setState({
        ...this.state,
        status: 'disabled',
        message: DEFAULT_DISABLED_MESSAGE,
        configured: false
      })
      return
    }

    this.configured = true
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.autoRunAppAfterInstall = true
    autoUpdater.allowPrerelease = false
    autoUpdater.setFeedURL({
      provider: config.provider ?? 'github',
      owner: config.owner ?? '',
      repo: config.repo ?? ''
    })

    autoUpdater.on('checking-for-update', () => {
      this.checkInFlight = true
      this.setState({
        ...this.state,
        status: 'checking',
        configured: true,
        checkedAt: new Date().toISOString(),
        progressPercent: null,
        transferredBytes: null,
        totalBytes: null,
        message: 'Checking GitHub Releases for a newer build.'
      })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.setState({
        ...this.state,
        status: 'available',
        configured: true,
        nextVersion: info.version,
        checkedAt: new Date().toISOString(),
        message: `Update ${info.version} found. Downloading now.`
      })
    })

    autoUpdater.on('download-progress', (info: ProgressInfo) => {
      this.setState({
        ...this.state,
        status: 'downloading',
        configured: true,
        progressPercent: Number(info.percent.toFixed(1)),
        transferredBytes: info.transferred,
        totalBytes: info.total,
        message: `Downloading ${this.state.nextVersion ?? 'the update'}...`
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.checkInFlight = false
      this.setState({
        ...this.state,
        status: 'not-available',
        configured: true,
        nextVersion: null,
        progressPercent: null,
        transferredBytes: null,
        totalBytes: null,
        checkedAt: new Date().toISOString(),
        message: 'You already have the latest Runbox build.'
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.checkInFlight = false
      this.setState({
        ...this.state,
        status: 'downloaded',
        configured: true,
        nextVersion: info.version,
        progressPercent: 100,
        checkedAt: new Date().toISOString(),
        message: `Update ${info.version} is ready. Restart Runbox to install it.`
      })
    })

    autoUpdater.on('error', (error) => {
      this.checkInFlight = false
      this.setState({
        ...this.state,
        status: 'error',
        configured: true,
        progressPercent: null,
        transferredBytes: null,
        totalBytes: null,
        checkedAt: new Date().toISOString(),
        message: `Update check failed: ${formatErrorMessage(error)}`
      })
    })

    this.setState({
      ...this.state,
      configured: true,
      message: 'Ready to check GitHub Releases for updates.'
    })
  }

  getState(): UpdateState {
    return this.state
  }

  async checkForUpdates(): Promise<UpdateActionResult> {
    if (!this.configured) {
      return {
        accepted: false,
        state: this.state
      }
    }

    if (this.checkInFlight || this.state.status === 'downloading') {
      return {
        accepted: false,
        state: this.state
      }
    }

    try {
      await autoUpdater.checkForUpdates()

      return {
        accepted: true,
        state: this.state
      }
    } catch (error) {
      this.checkInFlight = false
      this.setState({
        ...this.state,
        status: 'error',
        checkedAt: new Date().toISOString(),
        message: `Update check failed: ${formatErrorMessage(error)}`
      })

      return {
        accepted: false,
        state: this.state
      }
    }
  }

  installDownloadedUpdate(): UpdateActionResult {
    if (this.state.status !== 'downloaded') {
      return {
        accepted: false,
        state: this.state
      }
    }

    autoUpdater.quitAndInstall()

    return {
      accepted: true,
      state: this.state
    }
  }

  checkForUpdatesOnLaunch(delayMs = 2500): void {
    if (!this.configured) {
      return
    }

    globalThis.setTimeout(() => {
      void this.checkForUpdates()
    }, delayMs)
  }

  private setState(nextState: UpdateState): void {
    this.state = nextState
    this.onState(this.state)
  }
}
