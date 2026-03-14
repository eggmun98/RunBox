export type UpdateStatus =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  configured: boolean
  currentVersion: string
  nextVersion: string | null
  progressPercent: number | null
  transferredBytes: number | null
  totalBytes: number | null
  checkedAt: string | null
  message: string
}

export interface UpdateActionResult {
  accepted: boolean
  state: UpdateState
}
