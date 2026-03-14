import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type {
  RunRequest,
  RunStartResult,
  RunnerEvent,
  StopResult
} from '../shared/runner'
import { resolveRunner } from './runners/registry'

const DEFAULT_TIMEOUT_MS = 4000

type StopReason = 'manual' | 'timeout' | null

interface ActiveRunState {
  runId: string
  languageId: string
  child: ChildProcess
  cleanup: () => Promise<void>
  startedAt: number
  timeoutMs: number
  timer: NodeJS.Timeout
  stopReason: StopReason
  finished: boolean
  exitPromise: Promise<void>
  resolveExit: () => void
}

interface RunManagerOptions {
  onEvent: (event: RunnerEvent) => void
}

export class RunManager {
  private currentRun: ActiveRunState | null = null

  constructor(private readonly options: RunManagerOptions) {}

  async run(request: RunRequest): Promise<RunStartResult> {
    await this.stop()

    const runner = resolveRunner(request.languageId)
    const preparedRun = await runner.prepare(request.code)
    const child = spawn(preparedRun.command, preparedRun.args, {
      cwd: preparedRun.cwd,
      env: {
        ...process.env,
        ...preparedRun.env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const runId = randomUUID()
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const startedAt = Date.now()

    let resolveExit = (): void => undefined
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve
    })

    const state: ActiveRunState = {
      runId,
      languageId: request.languageId,
      child,
      cleanup: preparedRun.cleanup,
      startedAt,
      timeoutMs,
      timer: setTimeout(() => {
        state.stopReason = 'timeout'
        state.child.kill()
      }, timeoutMs),
      stopReason: null,
      finished: false,
      exitPromise,
      resolveExit
    }

    this.currentRun = state

    if (!child.stdout || !child.stderr) {
      await preparedRun.cleanup().catch(() => undefined)
      throw new Error('The language runner did not expose stdout/stderr streams.')
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk: string) => {
      this.options.onEvent({
        type: 'stdout',
        runId,
        chunk
      })
    })

    child.stderr.on('data', (chunk: string) => {
      this.options.onEvent({
        type: 'stderr',
        runId,
        chunk
      })
    })

    child.once('error', (error) => {
      void this.finishRun(state, {
        message: error.message
      })
    })

    child.once('close', (exitCode, signal) => {
      void this.finishRun(state, {
        exitCode,
        signal
      })
    })

    this.options.onEvent({
      type: 'started',
      runId,
      languageId: request.languageId,
      startedAt: new Date(startedAt).toISOString()
    })

    return {
      runId,
      timeoutMs
    }
  }

  async stop(): Promise<StopResult> {
    const activeRun = this.currentRun

    if (!activeRun) {
      return { stopped: false }
    }

    activeRun.stopReason = 'manual'
    activeRun.child.kill()
    await activeRun.exitPromise

    return {
      stopped: true,
      runId: activeRun.runId
    }
  }

  async dispose(): Promise<void> {
    await this.stop()
  }

  private async finishRun(
    state: ActiveRunState,
    result: {
      exitCode?: number | null
      signal?: NodeJS.Signals | null
      message?: string
    }
  ): Promise<void> {
    if (state.finished) {
      return
    }

    state.finished = true
    clearTimeout(state.timer)

    if (this.currentRun?.runId === state.runId) {
      this.currentRun = null
    }

    await state.cleanup().catch(() => undefined)

    const durationMs = Date.now() - state.startedAt

    if (result.message) {
      this.options.onEvent({
        type: 'error',
        runId: state.runId,
        message: result.message,
        durationMs
      })
      state.resolveExit()
      return
    }

    if (state.stopReason === 'timeout') {
      this.options.onEvent({
        type: 'error',
        runId: state.runId,
        message: `Execution timed out after ${state.timeoutMs}ms.`,
        durationMs
      })
      state.resolveExit()
      return
    }

    if (state.stopReason === 'manual') {
      this.options.onEvent({
        type: 'stopped',
        runId: state.runId,
        durationMs
      })
      state.resolveExit()
      return
    }

    this.options.onEvent({
      type: 'exit',
      runId: state.runId,
      exitCode: result.exitCode ?? null,
      signal: result.signal ?? null,
      durationMs
    })
    state.resolveExit()
  }
}
