export interface LanguageDefinition {
  id: string
  displayName: string
  monacoLanguage: string
  extension: string
  description: string
  template: string
}

export type LanguageRuntimeStatus = 'ready' | 'missing' | 'installing' | 'error'

export type LanguageRuntimeSource =
  | 'builtin'
  | 'bundled'
  | 'downloaded'
  | 'system'
  | 'unknown'

export interface LanguageRuntimeState {
  status: LanguageRuntimeStatus
  source: LanguageRuntimeSource
  detail: string
  progress?: number | null
  version?: string | null
}

export interface LanguageProfile extends LanguageDefinition {
  runtime: LanguageRuntimeState
}

export interface InstallRuntimeRequest {
  languageId: string
}

export interface InstallRuntimeResult {
  languageId: string
  state: LanguageRuntimeState
}

export interface LanguageRuntimeStateEvent {
  languageId: string
  state: LanguageRuntimeState
}

export interface RunRequest {
  languageId: string
  code: string
  timeoutMs?: number
}

export interface RunStartResult {
  runId: string
  timeoutMs: number
}

export interface StopResult {
  stopped: boolean
  runId?: string
}

export interface RunnerStartedEvent {
  type: 'started'
  runId: string
  languageId: string
  startedAt: string
}

export interface RunnerChunkEvent {
  type: 'stdout' | 'stderr'
  runId: string
  chunk: string
}

export interface RunnerExitEvent {
  type: 'exit'
  runId: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  durationMs: number
}

export interface RunnerStoppedEvent {
  type: 'stopped'
  runId: string
  durationMs: number
}

export interface RunnerErrorEvent {
  type: 'error'
  runId: string
  message: string
  durationMs: number
}

export type RunnerEvent =
  | RunnerStartedEvent
  | RunnerChunkEvent
  | RunnerExitEvent
  | RunnerStoppedEvent
  | RunnerErrorEvent
