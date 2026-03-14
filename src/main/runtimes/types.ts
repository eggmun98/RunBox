import type { LanguageRuntimeState } from '../../shared/runner'

export interface RuntimeController {
  languageId: string
  getState: () => Promise<LanguageRuntimeState>
  install?: (
    onState: (state: LanguageRuntimeState) => void
  ) => Promise<LanguageRuntimeState>
}
