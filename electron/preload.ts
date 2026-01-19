import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

type AccountStatus = 'active' | 'pending' | 'invalid'
type EmailType = 'tempmail_plus' | 'imap'
type EmailProtocol = 'IMAP' | 'POP3'
type Theme = 'dark' | 'light' | 'system'

interface Account {
  id: number
  email: string
  password: string
  emailType: EmailType
  status: AccountStatus
  createdAt: string
  apiKey?: string
  apiKeyName?: string
  requestsLimit?: number
  refApiKey?: string
}

interface RegistrationConfig {
  emailType: EmailType
  count: number
  passwordLength: number
  intervalMin: number
  intervalMax: number
  showBrowser: boolean
}

interface RefRegistrationConfig {
  accountId: number
  email: string
  password: string
  showBrowser: boolean
}

interface RefRegistrationResult {
  success: boolean
  refApiKey?: string
  error?: string
}

interface TempMailPlusConfig {
  username: string
  epin: string
  extension: string
}

interface ImapMailConfig {
  server: string
  port: number
  user: string
  pass: string
  dir: string
  protocol: EmailProtocol
  domain: string
}

interface RegistrationSettings {
  passwordLength: number
  intervalMin: number
  intervalMax: number
  timeout: number
  showBrowser: boolean
  defaultBatchCount: number
  maxBatchCount: number
}

interface AppSettings {
  tempMailPlus: TempMailPlusConfig
  imapMail: ImapMailConfig
  registration: RegistrationSettings
  defaultEmailType: EmailType
  theme: Theme
}

interface LogEntry {
  id: string
  timestamp: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

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

  testTempMailPlus: (config: TempMailPlusConfig): Promise<boolean> => 
    ipcRenderer.invoke('email:testTempMailPlus', config),
  testImapMail: (config: ImapMailConfig): Promise<boolean> => 
    ipcRenderer.invoke('email:testImap', config),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings): Promise<void> => 
    ipcRenderer.invoke('settings:save', settings),

  getSystemTheme: (): Promise<Theme> => ipcRenderer.invoke('theme:getSystem'),
  onSystemThemeChange: (callback: (theme: Theme) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, theme: Theme) => callback(theme)
    ipcRenderer.on('theme:systemChanged', handler)
    return () => ipcRenderer.removeListener('theme:systemChanged', handler)
  },

  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window:maximize'),
  closeWindow: (): void => ipcRenderer.send('window:close'),

  onRegistrationLog: (callback: (log: LogEntry) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, log: LogEntry) => callback(log)
    ipcRenderer.on('register:log', handler)
    return () => ipcRenderer.removeListener('register:log', handler)
  },
  onRegistrationComplete: (callback: (account: Account) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, account: Account) => callback(account)
    ipcRenderer.on('register:complete', handler)
    return () => ipcRenderer.removeListener('register:complete', handler)
  },
  onRegistrationError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, error: string) => callback(error)
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
  updaterInstall: (): void => { ipcRenderer.invoke('updater:install') },
  onUpdaterStatus: (callback: (status: {
    status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    info?: { version: string }
    progress?: { percent: number; bytesPerSecond: number; transferred: number; total: number }
    error?: string
  }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status)
    ipcRenderer.on('updater:status', handler)
    return () => ipcRenderer.removeListener('updater:status', handler)
  },
})
