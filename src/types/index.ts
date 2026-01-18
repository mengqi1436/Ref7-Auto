export interface Account {
  id: number
  email: string
  password: string
  emailType: EmailType
  status: AccountStatus
  createdAt: string
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

export interface AppSettings {
  tempMailPlus: TempMailPlusConfig
  imapMail: ImapMailConfig
  registration: RegistrationSettings
  domain: string
  theme: Theme
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
