import type { LanguageDefinition } from '../../shared/runner'

export interface PreparedRun {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  cleanup: () => Promise<void>
}

export interface LanguageRunner {
  definition: LanguageDefinition
  prepare: (code: string) => Promise<PreparedRun>
}
