import path from 'path'
import fs from 'fs'
import os from 'os'

export type AccountStatus = 'active' | 'pending' | 'invalid'
export type EmailType = 'tempmail_plus' | 'imap'
export type EmailProtocol = 'IMAP' | 'POP3'
export type Theme = 'dark' | 'light' | 'system'

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
  defaultBatchCount: number
  maxBatchCount: number
}

export interface AppSettings {
  tempMailPlus: TempMailPlusConfig
  imapMail: ImapMailConfig
  registration: RegistrationSettings
  defaultEmailType: EmailType
  theme: Theme
}

interface AccountsData {
  nextId: number
  accounts: Account[]
}

const DATA_DIR = path.join(os.homedir(), '.ref7')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json')

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    }
  } catch {
    return defaultValue
  }
  return defaultValue
}

function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDataDir()
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function getDefaultSettings(): AppSettings {
  return {
    tempMailPlus: {
      username: '',
      epin: '',
      extension: '@mailto.plus'
    },
    imapMail: {
      server: 'imap.qq.com',
      port: 993,
      user: '',
      pass: '',
      dir: 'INBOX',
      protocol: 'IMAP',
      domain: ''
    },
    registration: {
      passwordLength: 12,
      intervalMin: 3,
      intervalMax: 8,
      timeout: 60,
      showBrowser: false,
      defaultBatchCount: 1,
      maxBatchCount: 20
    },
    defaultEmailType: 'tempmail_plus',
    theme: 'system'
  }
}

function getDefaultAccountsData(): AccountsData {
  return { nextId: 1, accounts: [] }
}

function migrateSettings(saved: Partial<AppSettings> & { domain?: string }): AppSettings {
  const defaults = getDefaultSettings()

  return {
    tempMailPlus: {
      username: saved.tempMailPlus?.username ?? '',
      epin: saved.tempMailPlus?.epin ?? '',
      extension: saved.tempMailPlus?.extension ?? '@mailto.plus'
    },
    imapMail: {
      server: saved.imapMail?.server ?? 'imap.qq.com',
      port: saved.imapMail?.port ?? 993,
      user: saved.imapMail?.user ?? '',
      pass: saved.imapMail?.pass ?? '',
      dir: saved.imapMail?.dir ?? 'INBOX',
      protocol: saved.imapMail?.protocol ?? 'IMAP',
      domain: saved.imapMail?.domain ?? saved.domain ?? ''
    },
    registration: {
      passwordLength: saved.registration?.passwordLength ?? defaults.registration.passwordLength,
      intervalMin: saved.registration?.intervalMin ?? defaults.registration.intervalMin,
      intervalMax: saved.registration?.intervalMax ?? defaults.registration.intervalMax,
      timeout: saved.registration?.timeout ?? defaults.registration.timeout,
      showBrowser: saved.registration?.showBrowser ?? defaults.registration.showBrowser,
      defaultBatchCount: saved.registration?.defaultBatchCount ?? defaults.registration.defaultBatchCount,
      maxBatchCount: saved.registration?.maxBatchCount ?? defaults.registration.maxBatchCount
    },
    defaultEmailType: saved.defaultEmailType ?? defaults.defaultEmailType,
    theme: saved.theme ?? defaults.theme
  }
}

export async function initDatabase(): Promise<void> {
  ensureDataDir()
}

export function getAllAccounts(): Account[] {
  const data = readJsonFile<AccountsData>(ACCOUNTS_FILE, getDefaultAccountsData())
  return data.accounts.slice().sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export function addAccount(account: Omit<Account, 'id' | 'createdAt'>): Account {
  const data = readJsonFile<AccountsData>(ACCOUNTS_FILE, getDefaultAccountsData())
  
  const newAccount: Account = {
    id: data.nextId,
    email: account.email,
    password: account.password,
    emailType: account.emailType,
    status: account.status,
    createdAt: new Date().toISOString(),
    apiKey: account.apiKey,
    apiKeyName: account.apiKeyName,
    requestsLimit: account.requestsLimit
  }
  
  data.nextId++
  data.accounts.push(newAccount)
  writeJsonFile(ACCOUNTS_FILE, data)
  
  return newAccount
}

export function deleteAccount(id: number): void {
  const data = readJsonFile<AccountsData>(ACCOUNTS_FILE, getDefaultAccountsData())
  data.accounts = data.accounts.filter(a => a.id !== id)
  writeJsonFile(ACCOUNTS_FILE, data)
}

export function deleteAccounts(ids: number[]): void {
  const data = readJsonFile<AccountsData>(ACCOUNTS_FILE, getDefaultAccountsData())
  const idSet = new Set(ids)
  data.accounts = data.accounts.filter(a => !idSet.has(a.id))
  writeJsonFile(ACCOUNTS_FILE, data)
}

export function updateAccountStatus(id: number, status: AccountStatus): void {
  const data = readJsonFile<AccountsData>(ACCOUNTS_FILE, getDefaultAccountsData())
  const account = data.accounts.find(a => a.id === id)
  if (account) {
    account.status = status
    writeJsonFile(ACCOUNTS_FILE, data)
  }
}

export function exportAccounts(): string {
  return JSON.stringify(getAllAccounts(), null, 2)
}

export interface ImportResult {
  total: number
  imported: number
  skipped: number
  errors: string[]
}

export function importAccounts(accountsToImport: Partial<Account>[]): ImportResult {
  const data = readJsonFile<AccountsData>(ACCOUNTS_FILE, getDefaultAccountsData())
  const existingEmails = new Set(data.accounts.map(a => a.email.toLowerCase()))
  const result: ImportResult = { total: accountsToImport.length, imported: 0, skipped: 0, errors: [] }

  for (const account of accountsToImport) {
    if (!account.email || !account.password) {
      result.errors.push(`缺少必填字段: ${account.email || '未知邮箱'}`)
      continue
    }

    if (existingEmails.has(account.email.toLowerCase())) {
      result.skipped++
      continue
    }

    data.accounts.push({
      id: data.nextId++,
      email: account.email,
      password: account.password,
      emailType: account.emailType || 'tempmail_plus',
      status: account.status || 'active',
      createdAt: account.createdAt || new Date().toISOString(),
      apiKey: account.apiKey,
      apiKeyName: account.apiKeyName,
      requestsLimit: account.requestsLimit
    })
    existingEmails.add(account.email.toLowerCase())
    result.imported++
  }

  if (result.imported > 0) writeJsonFile(ACCOUNTS_FILE, data)
  return result
}

export function getSettings(): AppSettings {
  const saved = readJsonFile<Partial<AppSettings>>(SETTINGS_FILE, {})
  return migrateSettings(saved)
}

export function saveSettings(settings: AppSettings): void {
  writeJsonFile(SETTINGS_FILE, settings)
}

export function closeDatabase(): void {}
