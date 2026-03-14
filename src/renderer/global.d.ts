import type { DesktopApi } from '../preload'

declare global {
  interface Window {
    runbox: DesktopApi
  }
}

export {}

