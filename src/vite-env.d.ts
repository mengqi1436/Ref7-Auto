/// <reference types="vite/client" />

import type { IElectronAPI } from './types/electron'

declare global {
  interface Window {
    electronAPI?: IElectronAPI
  }
}

export {}
