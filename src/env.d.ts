/// <reference types="vite/client" />

import type { DevCenterAPI } from '../../electron/preload'

declare global {
  interface Window {
    devcenter: DevCenterAPI
  }
}

export {}
