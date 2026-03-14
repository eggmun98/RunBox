import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { app } from 'electron'
import extract from 'extract-zip'
import type { LanguageRuntimeSource, LanguageRuntimeState } from '../../shared/runner'
import { PYTHON_RUNTIME_CONFIG, type PythonRuntimeArtifactConfig } from './python-config'
import type { RuntimeController } from './types'

interface ResolvedPythonRuntime {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  source: LanguageRuntimeSource
  detail: string
  version: string | null
}

const PYTHON_LANGUAGE_ID = 'python'
const DOWNLOAD_PROGRESS_WEIGHT = 88

function getPlatformKey(): string {
  return `${process.platform}-${process.arch}`
}

function getArtifactConfig(): PythonRuntimeArtifactConfig | null {
  return PYTHON_RUNTIME_CONFIG.artifacts[getPlatformKey()] ?? null
}

function getBundledRuntimeRoot(): string {
  return join(
    process.resourcesPath,
    'runtimes',
    'python',
    PYTHON_RUNTIME_CONFIG.version,
    getPlatformKey()
  )
}

function getInstalledRuntimeRoot(): string {
  return join(
    app.getPath('userData'),
    'runtimes',
    'python',
    PYTHON_RUNTIME_CONFIG.version,
    getPlatformKey()
  )
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function resolvePackagedRuntime(
  runtimeRoot: string,
  artifactConfig: PythonRuntimeArtifactConfig
): Promise<ResolvedPythonRuntime | null> {
  const executablePath = join(runtimeRoot, artifactConfig.entryPoint)

  if (!(await pathExists(executablePath))) {
    return null
  }

  return {
    command: executablePath,
    args: [],
    env: artifactConfig.pythonHome
      ? {
          PYTHONHOME: join(runtimeRoot, artifactConfig.pythonHome),
          PYTHONUTF8: '1'
        }
      : {
          PYTHONUTF8: '1'
        },
    source: runtimeRoot === getBundledRuntimeRoot() ? 'bundled' : 'downloaded',
    detail:
      runtimeRoot === getBundledRuntimeRoot()
        ? 'Python runtime is bundled with this Runbox build.'
        : 'Python runtime was installed inside Runbox.',
    version: PYTHON_RUNTIME_CONFIG.version
  }
}

async function commandExists(command: string): Promise<boolean> {
  return new Promise<boolean>((resolveCommand) => {
    const child = spawn(command, ['--version'], {
      stdio: 'ignore'
    })

    const timer = setTimeout(() => {
      child.kill()
      resolveCommand(false)
    }, 1500)

    child.once('error', () => {
      clearTimeout(timer)
      resolveCommand(false)
    })

    child.once('close', (exitCode) => {
      clearTimeout(timer)
      resolveCommand(exitCode === 0)
    })
  })
}

async function resolveDevelopmentRuntime(): Promise<ResolvedPythonRuntime | null> {
  const configuredPath = process.env.RUNBOX_PYTHON_PATH

  if (configuredPath) {
    const absolutePath = resolve(configuredPath)

    if (await pathExists(absolutePath)) {
      return {
        command: absolutePath,
        args: [],
        env: {
          PYTHONUTF8: '1'
        },
        source: 'system',
        detail: 'Using RUNBOX_PYTHON_PATH for development.',
        version: null
      }
    }
  }

  const commandCandidates =
    process.platform === 'win32' ? ['python'] : ['python3', 'python']

  for (const commandCandidate of commandCandidates) {
    if (await commandExists(commandCandidate)) {
      return {
        command: commandCandidate,
        args: [],
        env: {
          PYTHONUTF8: '1'
        },
        source: 'system',
        detail: 'Using a development Python interpreter from your PATH.',
        version: null
      }
    }
  }

  return null
}

async function resolvePythonRuntime(): Promise<ResolvedPythonRuntime | null> {
  const artifactConfig = getArtifactConfig()

  if (artifactConfig) {
    const bundledRuntime = await resolvePackagedRuntime(getBundledRuntimeRoot(), artifactConfig)

    if (bundledRuntime) {
      return bundledRuntime
    }

    const installedRuntime = await resolvePackagedRuntime(getInstalledRuntimeRoot(), artifactConfig)

    if (installedRuntime) {
      return installedRuntime
    }
  }

  if (!app.isPackaged) {
    return resolveDevelopmentRuntime()
  }

  return null
}

function getMissingRuntimeState(): LanguageRuntimeState {
  const artifactConfig = getArtifactConfig()

  if (!artifactConfig) {
    return {
      status: 'error',
      source: 'unknown',
      detail: `Python runtime is not configured for ${getPlatformKey()}.`,
      progress: null,
      version: PYTHON_RUNTIME_CONFIG.version
    }
  }

  if (!artifactConfig.url) {
    return {
      status: 'error',
      source: 'unknown',
      detail: `Python download URL is missing for ${getPlatformKey()}.`,
      progress: null,
      version: PYTHON_RUNTIME_CONFIG.version
    }
  }

  return {
    status: 'missing',
    source: 'unknown',
    detail: 'Python is available to install when you need it.',
    progress: null,
    version: PYTHON_RUNTIME_CONFIG.version
  }
}

async function downloadRuntimeArchive(
  url: string,
  archivePath: string,
  onProgress: (progress: number) => void
): Promise<void> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download Python runtime (${response.status}).`)
  }

  if (!response.body) {
    const runtimeBytes = Buffer.from(await response.arrayBuffer())
    await writeFile(archivePath, runtimeBytes)
    onProgress(DOWNLOAD_PROGRESS_WEIGHT)
    return
  }

  const totalBytesHeader = response.headers.get('content-length')
  const totalBytes =
    totalBytesHeader && Number.isFinite(Number(totalBytesHeader))
      ? Number(totalBytesHeader)
      : null
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let receivedBytes = 0

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    if (!value) {
      continue
    }

    const chunk = Buffer.from(value)
    chunks.push(chunk)
    receivedBytes += chunk.byteLength

    if (totalBytes) {
      const ratio = receivedBytes / totalBytes
      onProgress(Math.min(DOWNLOAD_PROGRESS_WEIGHT, Math.max(4, Math.round(ratio * DOWNLOAD_PROGRESS_WEIGHT))))
    }
  }

  await writeFile(archivePath, Buffer.concat(chunks))
  onProgress(DOWNLOAD_PROGRESS_WEIGHT)
}

async function verifyArchiveHash(
  archivePath: string,
  sha256: string
): Promise<void> {
  if (!sha256.trim()) {
    return
  }

  const archiveBytes = await readFile(archivePath)
  const digest = createHash('sha256').update(archiveBytes).digest('hex')

  if (digest !== sha256.toLowerCase()) {
    throw new Error('Downloaded Python runtime failed the SHA-256 verification check.')
  }
}

async function finalizeRuntimeInstall(
  extractedRoot: string,
  installRoot: string,
  artifactConfig: PythonRuntimeArtifactConfig
): Promise<ResolvedPythonRuntime> {
  const executablePath = join(extractedRoot, artifactConfig.entryPoint)

  if (!(await pathExists(executablePath))) {
    throw new Error('Python runtime archive is missing the expected executable.')
  }

  await mkdir(dirname(installRoot), { recursive: true })
  await rm(installRoot, { recursive: true, force: true })
  await rename(extractedRoot, installRoot)

  const installedExecutablePath = join(installRoot, artifactConfig.entryPoint)

  if (process.platform !== 'win32') {
    await chmod(installedExecutablePath, 0o755).catch(() => undefined)
  }

  const installedRuntime = await resolvePackagedRuntime(installRoot, artifactConfig)

  if (!installedRuntime) {
    throw new Error('Python runtime was installed but could not be activated.')
  }

  return installedRuntime
}

async function installPythonRuntime(
  onState: (state: LanguageRuntimeState) => void
): Promise<LanguageRuntimeState> {
  const existingRuntime = await resolvePythonRuntime()

  if (existingRuntime) {
    return {
      status: 'ready',
      source: existingRuntime.source,
      detail: existingRuntime.detail,
      progress: null,
      version: existingRuntime.version
    }
  }

  const artifactConfig = getArtifactConfig()

  if (!artifactConfig || !artifactConfig.url) {
    return getMissingRuntimeState()
  }

  onState({
    status: 'installing',
    source: 'downloaded',
    detail: 'Downloading Python runtime...',
    progress: 0,
    version: PYTHON_RUNTIME_CONFIG.version
  })

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'runbox-python-'))
  const archivePath = join(temporaryRoot, 'python-runtime.zip')
  const extractedRoot = join(temporaryRoot, 'python-runtime')

  try {
    await downloadRuntimeArchive(artifactConfig.url, archivePath, (progress) => {
      onState({
        status: 'installing',
        source: 'downloaded',
        detail: 'Downloading Python runtime...',
        progress,
        version: PYTHON_RUNTIME_CONFIG.version
      })
    })

    await verifyArchiveHash(archivePath, artifactConfig.sha256)

    onState({
      status: 'installing',
      source: 'downloaded',
      detail: 'Extracting Python runtime...',
      progress: 94,
      version: PYTHON_RUNTIME_CONFIG.version
    })

    await mkdir(extractedRoot, { recursive: true })
    await extract(archivePath, {
      dir: extractedRoot
    })

    const installedRuntime = await finalizeRuntimeInstall(
      extractedRoot,
      getInstalledRuntimeRoot(),
      artifactConfig
    )

    return {
      status: 'ready',
      source: installedRuntime.source,
      detail: installedRuntime.detail,
      progress: null,
      version: installedRuntime.version
    }
  } catch (error) {
    return {
      status: 'error',
      source: 'unknown',
      detail: error instanceof Error ? error.message : String(error),
      progress: null,
      version: PYTHON_RUNTIME_CONFIG.version
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function resolvePythonCommand(): Promise<ResolvedPythonRuntime | null> {
  return resolvePythonRuntime()
}

export const pythonRuntimeController: RuntimeController = {
  languageId: PYTHON_LANGUAGE_ID,
  async getState() {
    const runtime = await resolvePythonRuntime()

    if (!runtime) {
      return getMissingRuntimeState()
    }

    return {
      status: 'ready',
      source: runtime.source,
      detail: runtime.detail,
      progress: null,
      version: runtime.version
    }
  },
  install: installPythonRuntime
}
