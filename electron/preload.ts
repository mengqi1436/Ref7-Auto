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
}

interface RegistrationConfig {
  emailType: EmailType
  count: number
  passwordLength: number
  intervalMin: number
  intervalMax: number
  showBrowser: boolean
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

interface AppSettings {
  tempMailPlus: TempMailPlusConfig
  imapMail: ImapMailConfig
  registration: {
    passwordLength: number
    intervalMin: number
    intervalMax: number
    timeout: number
    showBrowser: boolean
  }
  domain: string
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
  
  checkForUpdates: (): Promise<{
    hasUpdate: boolean
    currentVersion: string
    latestVersion?: string
    releaseUrl?: string
    error?: string
  }> => ipcRenderer.invoke('app:checkForUpdates'),
})
