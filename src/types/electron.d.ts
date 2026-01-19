import type {
  Account,
  AccountStatus,
  AppSettings,
  LogEntry,
  RegistrationConfig,
  RefRegistrationConfig,
  RefRegistrationResult,
  TempMailPlusConfig,
  ImapMailConfig,
  Theme,
} from './index'

export interface IElectronAPI {
  getAccounts: () => Promise<Account[]>
  addAccount: (account: Omit<Account, 'id' | 'createdAt'>) => Promise<Account>
  deleteAccount: (id: number) => Promise<void>
  deleteAccounts: (ids: number[]) => Promise<void>
  updateAccountStatus: (id: number, status: AccountStatus) => Promise<void>
  updateAccountRefApiKey: (id: number, refApiKey: string) => Promise<void>
  exportAccounts: () => Promise<string | null>
  importAccounts: () => Promise<{
    total?: number
    imported?: number
    skipped?: number
    errors?: string[]
    error?: string
  } | null>

  startRegistration: (config: RegistrationConfig) => Promise<void>
  stopRegistration: () => Promise<void>
  startRefRegistration: (config: RefRegistrationConfig) => Promise<RefRegistrationResult>

  testTempMailPlus: (config: TempMailPlusConfig) => Promise<boolean>
  testImapMail: (config: ImapMailConfig) => Promise<boolean>

  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>

  getSystemTheme: () => Promise<Theme>
  onSystemThemeChange: (callback: (theme: Theme) => void) => () => void

  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void

  onRegistrationLog: (callback: (log: LogEntry) => void) => () => void
  onRegistrationComplete: (callback: (account: Account) => void) => () => void
  onRegistrationError: (callback: (error: string) => void) => () => void

  openExternal: (url: string) => Promise<boolean>

  getAppVersion: () => Promise<string>

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
    electronAPI: IElectronAPI
  }
}
