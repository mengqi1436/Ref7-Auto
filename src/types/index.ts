export interface Account {
  id: number
  email: string
  password: string
  emailType: EmailType
  status: AccountStatus
  createdAt: string
  apiKey?: string
  apiKeyName?: string
  requestsLimit?: number
}

export type AccountStatus = 'active' | 'pending' | 'invalid'
export type EmailType = 'tempmail_plus' | 'imap'
export type EmailProtocol = 'IMAP' | 'POP3'

export interface RegistrationConfig {
  emailType: EmailType
  count: number
  passwordLength: number
  intervalMin: number
  intervalMax: number
  showBrowser: boolean
}

export interface TempMailPlusConfig {
  username: string
  epin: string
  extension: string
}

export interface ImapMailConfig {
  server: string
  port: number
  user: string
  pass: string
  dir: string
  protocol: EmailProtocol
  domain: string
}

export interface RegistrationSettings {
  passwordLength: number
  intervalMin: number
  intervalMax: number
  timeout: number
  showBrowser: boolean
}

export interface Context7ApiKey {
  name: string
  key: string
  createdAt: string
  lastUsed: string | null
}

export interface Context7Info {
  requestsUsed: number
  requestsLimit: number
  parsingTokens: number
  seats: number
  cost: string
  apiKeys: Context7ApiKey[]
}

export interface AppSettings {
  tempMailPlus: TempMailPlusConfig
  imapMail: ImapMailConfig
  registration: RegistrationSettings
  domain: string
  theme: Theme
  context7?: Context7Info
}

export type Theme = 'dark' | 'light' | 'system'
export type LogType = 'success' | 'error' | 'warning' | 'info'

export interface LogEntry {
  id: string
  timestamp: string
  type: LogType
  message: string
}

export type Page = 'dashboard' | 'accounts' | 'register' | 'settings'
