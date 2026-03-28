import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AccountStatus,
  Theme,
  RegistrationConfig,
  RefRegistrationConfig,
  Context7RegistrationConfig,
  Context7RegistrationResult,
  RefRegistrationResult,
  RefCreditsFetchResult,
  RefCreditsAllResponse,
  Context7RequestsFetchResult,
  Context7RequestsAllResponse,
  TempMailPlusConfig,
  ImapMailConfig,
  AppSettings,
  LogEntry,
} from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  getAccounts: (): Promise<Account[]> => ipcRenderer.invoke('accounts:getAll'),
  addAccount: (account: Omit<Account, 'id' | 'createdAt'>): Promise<Account> =>
    ipcRenderer.invoke('accounts:add', account),
  deleteAccount: (id: number): Promise<void> => ipcRenderer.invoke('accounts:delete', id),
  deleteAccounts: (ids: number[]): Promise<void> => ipcRenderer.invoke('accounts:deleteMany', ids),
  updateAccountStatus: (id: number, status: AccountStatus): Promise<void> =>
    ipcRenderer.invoke('accounts:updateStatus', id, status),
  updateAccountRefApiKey: (id: number, refApiKey: string): Promise<void> =>
    ipcRenderer.invoke('accounts:updateRefApiKey', id, refApiKey),
  fetchRefCredits: (
    accountId: number,
    options?: { resendVerificationIfUnverified?: boolean }
  ): Promise<RefCreditsFetchResult> =>
    ipcRenderer.invoke('accounts:fetchRefCredits', accountId, options),
  fetchRefCreditsAll: (): Promise<RefCreditsAllResponse> =>
    ipcRenderer.invoke('accounts:fetchRefCreditsAll'),
  fetchContext7Requests: (accountId: number): Promise<Context7RequestsFetchResult> =>
    ipcRenderer.invoke('accounts:fetchContext7Requests', accountId),
  fetchContext7RequestsAll: (): Promise<Context7RequestsAllResponse> =>
    ipcRenderer.invoke('accounts:fetchContext7RequestsAll'),
  exportAccounts: (): Promise<string | null> => ipcRenderer.invoke('accounts:export'),
  importAccounts: (): Promise<{
    total?: number
    imported?: number
    skipped?: number
    errors?: string[]
    error?: string
  } | null> => ipcRenderer.invoke('accounts:import'),

  startRegistration: (config: RegistrationConfig): Promise<void> =>
    ipcRenderer.invoke('register:start', config),
  stopRegistration: (): Promise<void> => ipcRenderer.invoke('register:stop'),
  startRefRegistration: (config: RefRegistrationConfig): Promise<RefRegistrationResult> =>
    ipcRenderer.invoke('register:startRef', config),
  startContext7Registration: (config: Context7RegistrationConfig): Promise<Context7RegistrationResult> =>
    ipcRenderer.invoke('register:startContext7', config),

  testTempMailPlus: (config: TempMailPlusConfig): Promise<boolean> =>
    ipcRenderer.invoke('email:testTempMailPlus', config),
  testImapMail: (config: ImapMailConfig): Promise<boolean> =>
    ipcRenderer.invoke('email:testImap', config),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke('settings:save', settings),

  getSystemTheme: (): Promise<Theme> => ipcRenderer.invoke('theme:getSystem'),
  onSystemThemeChange: (callback: (theme: Theme) => void): (() => void) => {
    const handler = (_: unknown, theme: Theme) => callback(theme)
    ipcRenderer.on('theme:systemChanged', handler)
    return () => ipcRenderer.removeListener('theme:systemChanged', handler)
  },

  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window:maximize'),
  closeWindow: (): void => ipcRenderer.send('window:close'),

  onRegistrationLog: (callback: (log: LogEntry) => void): (() => void) => {
    const handler = (_: unknown, log: LogEntry) => callback(log)
    ipcRenderer.on('register:log', handler)
    return () => ipcRenderer.removeListener('register:log', handler)
  },
  onRegistrationComplete: (callback: (account: Account) => void): (() => void) => {
    const handler = (_: unknown, account: Account) => callback(account)
    ipcRenderer.on('register:complete', handler)
    return () => ipcRenderer.removeListener('register:complete', handler)
  },
  onRegistrationError: (callback: (error: string) => void): (() => void) => {
    const handler = (_: unknown, error: string) => callback(error)
    ipcRenderer.on('register:error', handler)
    return () => ipcRenderer.removeListener('register:error', handler)
  },

  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:openExternal', url),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  updaterCheck: (): Promise<{ success: boolean; updateInfo?: unknown; error?: string }> =>
    ipcRenderer.invoke('updater:check'),
  updaterDownload: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('updater:download'),
  updaterInstall: (): void => {
    ipcRenderer.invoke('updater:install')
  },
  onUpdaterStatus: (callback: (status: {
    status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    info?: { version: string }
    progress?: { percent: number; bytesPerSecond: number; transferred: number; total: number }
    error?: string
  }) => void): (() => void) => {
    const handler = (_: unknown, status: Parameters<typeof callback>[0]) => callback(status)
    ipcRenderer.on('updater:status', handler)
    return () => ipcRenderer.removeListener('updater:status', handler)
  },
})

