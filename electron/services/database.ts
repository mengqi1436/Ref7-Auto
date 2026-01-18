// @ts-ignore
import initSqlJs from 'sql.js'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

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

let db: any = null
let dbPath = ''

function getDbPath(): string {
  const userDataPath = app?.getPath?.('userData') || process.cwd()
  const dbDir = path.join(userDataPath, 'data')
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  
  return path.join(dbDir, 'ref7.db')
}

export async function initDatabase(): Promise<void> {
  if (db) return

  const SQL = await initSqlJs()
  dbPath = getDbPath()

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      emailType TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  saveDatabase()
}

function saveDatabase(): void {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

export function getAllAccounts(): Account[] {
  if (!db) return []
  
  const stmt = db.prepare('SELECT * FROM accounts ORDER BY createdAt DESC')
  const accounts: Account[] = []
  
  while (stmt.step()) {
    const row = stmt.getAsObject()
    accounts.push({
      id: row.id,
      email: row.email,
      password: row.password,
      emailType: row.emailType,
      status: row.status,
      createdAt: row.createdAt
    })
  }
  stmt.free()
  
  return accounts
}

export function addAccount(account: Omit<Account, 'id' | 'createdAt'>): Account {
  if (!db) throw new Error('Database not initialized')
  
  const createdAt = new Date().toISOString()
  db.run(
    'INSERT INTO accounts (email, password, emailType, status, createdAt) VALUES (?, ?, ?, ?, ?)',
    [account.email, account.password, account.emailType, account.status, createdAt]
  )
  
  const result = db.exec('SELECT last_insert_rowid() as id')
  const id = result[0]?.values[0]?.[0] as number
  
  saveDatabase()
  
  return { id, ...account, createdAt }
}

export function deleteAccount(id: number): void {
  if (!db) return
  db.run('DELETE FROM accounts WHERE id = ?', [id])
  saveDatabase()
}

export function deleteAccounts(ids: number[]): void {
  if (!db) return
  const placeholders = ids.map(() => '?').join(',')
  db.run(`DELETE FROM accounts WHERE id IN (${placeholders})`, ids)
  saveDatabase()
}

export function updateAccountStatus(id: number, status: AccountStatus): void {
  if (!db) return
  db.run('UPDATE accounts SET status = ? WHERE id = ?', [status, id])
  saveDatabase()
}

export function exportAccounts(format: 'csv' | 'json'): string {
  const accounts = getAllAccounts()
  
  if (format === 'json') {
    return JSON.stringify(accounts, null, 2)
  }
  
  const header = 'email,password,emailType,status,createdAt'
  const rows = accounts.map(a => 
    `"${a.email}","${a.password}","${a.emailType}","${a.status}","${a.createdAt}"`
  )
  return [header, ...rows].join('\n')
}

export function getSettings(): AppSettings {
  if (!db) return getDefaultSettings()
  
  try {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
    stmt.bind(['appSettings'])
    
    if (stmt.step()) {
      const row = stmt.getAsObject()
      stmt.free()
      const saved = JSON.parse(row.value)
      return migrateSettings(saved)
    }
    stmt.free()
  } catch {
    // 返回默认设置
  }
  
  return getDefaultSettings()
}

function migrateSettings(saved: any): AppSettings {
  const defaults = getDefaultSettings()
  
  return {
    tempMailPlus: {
      username: saved.tempMailPlus?.username || saved.tempMail?.apiKey?.split('@')[0] || '',
      epin: saved.tempMailPlus?.epin || '',
      extension: saved.tempMailPlus?.extension || '@mailto.plus'
    },
    imapMail: {
      server: saved.imapMail?.server || 'imap.qq.com',
      port: saved.imapMail?.port || 993,
      user: saved.imapMail?.user || saved.qqMail?.email || '',
      pass: saved.imapMail?.pass || saved.qqMail?.authCode || '',
      dir: saved.imapMail?.dir || 'INBOX',
      protocol: saved.imapMail?.protocol || 'IMAP',
      domain: saved.imapMail?.domain || saved.qqMail?.domain || ''
    },
    registration: saved.registration || defaults.registration,
    domain: saved.domain || saved.qqMail?.domain || '',
    theme: saved.theme || defaults.theme
  }
}

export function saveSettings(settings: AppSettings): void {
  if (!db) return
  
  db.run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['appSettings', JSON.stringify(settings)]
  )
  
  saveDatabase()
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
      showBrowser: false
    },
    domain: '',
    theme: 'system'
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase()
    db.close()
    db = null
  }
}
