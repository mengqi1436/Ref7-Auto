/// <reference types="vite/client" />

import type {
  Account,
  AccountStatus,
  AppSettings,
  LogEntry,
  RegistrationConfig,
  TempMailPlusConfig,
  ImapMailConfig
} from './types'

export type {
  Account,
  AccountStatus,
  AppSettings,
  LogEntry,
  RegistrationConfig,
  TempMailPlusConfig,
  ImapMailConfig
}

interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  error?: string
}

interface ImportResult {
  total?: number
  imported?: number
  skipped?: number
  errors?: string[]
  error?: string
}

interface ElectronAPI {
  getAccounts: () => Promise<Account[]>
  addAccount: (account: Omit<Account, 'id' | 'createdAt'>) => Promise<Account>
  deleteAccount: (id: number) => Promise<void>
  deleteAccounts: (ids: number[]) => Promise<void>
  updateAccountStatus: (id: number, status: AccountStatus) => Promise<void>
  exportAccounts: () => Promise<string | null>
  importAccounts: () => Promise<ImportResult | null>

  startRegistration: (config: RegistrationConfig) => Promise<void>
  stopRegistration: () => Promise<void>

  testTempMailPlus: (config: TempMailPlusConfig) => Promise<boolean>
  testImapMail: (config: ImapMailConfig) => Promise<boolean>

  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>

  getSystemTheme: () => Promise<'dark' | 'light'>
  onSystemThemeChange: (callback: (theme: 'dark' | 'light') => void) => () => void

  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void

  onRegistrationLog: (callback: (log: LogEntry) => void) => () => void
  onRegistrationComplete: (callback: (account: Account) => void) => () => void
  onRegistrationError: (callback: (error: string) => void) => () => void

  openExternal: (url: string) => Promise<boolean>
  checkForUpdates: () => Promise<UpdateInfo>
  getAppVersion: () => Promise<string>

  // 自动更新 API
  updaterCheck: () => Promise<{ success: boolean; updateInfo?: unknown; error?: string }>
  updaterDownload: () => Promise<{ success: boolean; error?: string }>
  updaterInstall: () => void
  onUpdaterStatus: (callback: (status: {
    status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    info?: { version: string }
    progress?: { percent: number; bytesPerSecond: number; transferred: number; total: number }
    error?: string
  }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
