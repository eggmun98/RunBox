import type { LanguageDefinition } from '../../shared/runner'
import { javascriptRunner } from './javascript'
import { pythonRunner } from './python'
import type { LanguageRunner } from './types'

const runners = new Map<string, LanguageRunner>([
  [javascriptRunner.definition.id, javascriptRunner],
  [pythonRunner.definition.id, pythonRunner]
])

export function listLanguages(): LanguageDefinition[] {
  return Array.from(runners.values(), (runner) => runner.definition)
}

export function resolveRunner(languageId: string): LanguageRunner {
  const runner = runners.get(languageId)

  if (!runner) {
    throw new Error(`Language runner "${languageId}" is not registered.`)
  }

  return runner
}
