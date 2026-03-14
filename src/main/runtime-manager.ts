import type {
  InstallRuntimeResult,
  LanguageDefinition,
  LanguageProfile,
  LanguageRuntimeState,
  LanguageRuntimeStateEvent
} from '../shared/runner'
import { pythonRuntimeController } from './runtimes/python'
import type { RuntimeController } from './runtimes/types'

const runtimeControllers = new Map<string, RuntimeController>([
  [pythonRuntimeController.languageId, pythonRuntimeController]
])

const BUILTIN_READY_STATE: LanguageRuntimeState = {
  status: 'ready',
  source: 'builtin',
  detail: 'Bundled with Runbox.',
  progress: null,
  version: null
}

interface LanguageRuntimeManagerOptions {
  onState?: (event: LanguageRuntimeStateEvent) => void
}

export class LanguageRuntimeManager {
  private readonly stateCache = new Map<string, LanguageRuntimeState>()
  private readonly installPromises = new Map<string, Promise<LanguageRuntimeState>>()

  constructor(private readonly options: LanguageRuntimeManagerOptions = {}) {}

  async listLanguageProfiles(definitions: LanguageDefinition[]): Promise<LanguageProfile[]> {
    return Promise.all(
      definitions.map(async (definition) => ({
        ...definition,
        runtime: await this.getState(definition.id)
      }))
    )
  }

  async getState(languageId: string): Promise<LanguageRuntimeState> {
    const runtimeController = runtimeControllers.get(languageId)

    if (!runtimeController) {
      return BUILTIN_READY_STATE
    }

    const state = await runtimeController.getState()
    this.stateCache.set(languageId, state)

    return state
  }

  async install(languageId: string): Promise<InstallRuntimeResult> {
    const runtimeController = runtimeControllers.get(languageId)

    if (!runtimeController?.install) {
      return {
        languageId,
        state: await this.getState(languageId)
      }
    }

    const activeInstall = this.installPromises.get(languageId)

    if (activeInstall) {
      return {
        languageId,
        state: await activeInstall
      }
    }

    const installPromise = runtimeController
      .install((state) => {
        this.emit(languageId, state)
      })
      .catch((error: unknown) => {
        const failureState: LanguageRuntimeState = {
          status: 'error',
          source: 'unknown',
          detail: error instanceof Error ? error.message : String(error),
          progress: null,
          version: null
        }

        this.emit(languageId, failureState)

        return failureState
      })
      .finally(() => {
        this.installPromises.delete(languageId)
      })

    this.installPromises.set(languageId, installPromise)

    return {
      languageId,
      state: await installPromise
    }
  }

  private emit(languageId: string, state: LanguageRuntimeState): void {
    this.stateCache.set(languageId, state)
    this.options.onState?.({
      languageId,
      state
    })
  }
}
