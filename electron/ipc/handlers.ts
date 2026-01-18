import { ipcMain, BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import * as database from '../services/database'
import {
  initBrowser,
  registerAccount,
  inputVerificationCode,
  createContext7ApiKey,
  closeBrowser,
  stopRegistration,
  isRegistrationRunning
} from '../services/browser'
import { TempMailPlusService } from '../services/email/tempmailplus'
import { ImapMailService } from '../services/email/imap'
import type { AccountStatus, EmailType } from '../services/database'

type LogType = 'success' | 'error' | 'warning' | 'info'

interface RegistrationConfig {
  emailType: EmailType
  count: number
  passwordLength: number
  intervalMin: number
  intervalMax: number
  showBrowser: boolean
}

let mainWindow: BrowserWindow | null = null

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const NUMBERS = '0123456789'
const SYMBOLS = '!@#$%^&*'
const ALL_CHARS = UPPERCASE + LOWERCASE + NUMBERS + SYMBOLS

function generateRandomEmail(domain: string): string {
  let username = ''
  for (let i = 0; i < 6; i++) {
    username += CHARS.charAt(Math.floor(Math.random() * CHARS.length))
  }
  return `${username}${domain.startsWith('@') ? domain : `@${domain}`}`
}

function generatePassword(length: number): string {
  const required = [
    UPPERCASE[Math.floor(Math.random() * UPPERCASE.length)],
    LOWERCASE[Math.floor(Math.random() * LOWERCASE.length)],
    NUMBERS[Math.floor(Math.random() * NUMBERS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  ]

  while (required.length < length) {
    required.push(ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)])
  }

  return required.sort(() => Math.random() - 0.5).join('')
}

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function sendLog(type: LogType, message: string): void {
  mainWindow?.webContents.send('register:log', {
    id: Date.now().toString(),
    timestamp: new Date().toLocaleTimeString(),
    type,
    message
  })
}

async function handleRegistration(config: RegistrationConfig): Promise<void> {
  const settings = database.getSettings()
  const browserOptions = { headless: !config.showBrowser, onLog: sendLog }

  try {
    await initBrowser(browserOptions)

    for (let i = 0; i < config.count; i++) {
      if (!isRegistrationRunning()) {
        sendLog('warning', '注册已被用户停止')
        break
      }

      sendLog('info', `[${i + 1}/${config.count}] 开始注册第 ${i + 1} 个账户...`)

      const { email, emailService } = createEmailService(config, settings)
      const password = generatePassword(config.passwordLength)

      const success = await registerAccount({ email, password }, browserOptions)
      if (!success) {
        sendLog('error', `账户 ${email} 注册失败`)
        continue
      }

      sendLog('info', '等待验证码邮件...')
      const verificationCode = await getVerificationCode(emailService, email, config, settings)

      if (!verificationCode) {
        sendLog('error', '获取验证码超时')
        continue
      }

      sendLog('success', `验证码: ${verificationCode}`)

      const verified = await inputVerificationCode(verificationCode, browserOptions)
      if (verified) {
        // 获取 Context7 API Key
        sendLog('info', '开始获取 Context7 API Key...')
        const apiKeyResult = await createContext7ApiKey(browserOptions)
        
        let apiKey: string | undefined
        let apiKeyName: string | undefined
        let requestsLimit: number | undefined
        
        if (apiKeyResult.success) {
          apiKey = apiKeyResult.apiKey
          apiKeyName = apiKeyResult.keyName
          requestsLimit = apiKeyResult.requestsLimit
          
          if (apiKey) {
            sendLog('success', `API Key 创建成功: ${apiKey.slice(0, 12)}****`)
          } else {
            sendLog('warning', 'API Key 已创建但未能获取完整值')
          }
        } else {
          sendLog('warning', '获取 API Key 失败，账户仍然注册成功')
        }

        const account = database.addAccount({
          email,
          password,
          emailType: config.emailType,
          status: 'active',
          apiKey,
          apiKeyName,
          requestsLimit
        })
        
        // 发送完成事件，包含 API Key 信息
        mainWindow?.webContents.send('register:complete', {
          ...account,
          apiKey,
          apiKeyName,
          requestsLimit
        })
        sendLog('success', `账户 ${email} 注册成功！`)
      } else {
        sendLog('error', `账户 ${email} 验证失败`)
      }

      if (i < config.count - 1 && isRegistrationRunning()) {
        const interval = randomInt(config.intervalMin, config.intervalMax)
        sendLog('info', `等待 ${interval} 秒后继续...`)
        await delay(interval * 1000)
      }
    }

    sendLog('success', '批量注册任务完成')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    mainWindow?.webContents.send('register:error', message)
  } finally {
    await closeBrowser()
  }
}

function createEmailService(
  config: RegistrationConfig,
  settings: ReturnType<typeof database.getSettings>
): { email: string; emailService: TempMailPlusService | ImapMailService } {
  if (config.emailType === 'tempmail_plus') {
    const emailService = new TempMailPlusService(settings.tempMailPlus)
    const email = emailService.getEmail()
    sendLog('success', `邮箱: ${email}`)
    return { email, emailService }
  }

  const emailService = new ImapMailService(settings.imapMail)
  const email = generateRandomEmail(settings.domain || settings.imapMail.domain)
  sendLog('info', `生成邮箱: ${email}`)
  return { email, emailService }
}

async function getVerificationCode(
  emailService: TempMailPlusService | ImapMailService,
  email: string,
  config: RegistrationConfig,
  settings: ReturnType<typeof database.getSettings>
): Promise<string | null> {
  if (config.emailType === 'tempmail_plus' && emailService instanceof TempMailPlusService) {
    return emailService.getVerificationCode()
  }

  if (emailService instanceof ImapMailService) {
    const initialWait = 30000
    const maxRetries = 5
    const retryInterval = 10000
    const queryTimeout = 5000

    sendLog('info', `等待 ${initialWait / 1000} 秒后开始获取验证码...`)
    await delay(initialWait)

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      sendLog('info', `第 ${attempt}/${maxRetries} 次尝试获取验证码...`)

      const code = await emailService.getVerificationCode(email, queryTimeout)
      if (code) return code

      if (attempt < maxRetries) {
        sendLog('warning', `未获取到验证码，${retryInterval / 1000} 秒后重试...`)
        await delay(retryInterval)
      }
    }

    return null
  }

  return null
}

export async function registerIpcHandlers(window: BrowserWindow): Promise<void> {
  mainWindow = window
  await database.initDatabase()

  ipcMain.handle('accounts:getAll', () => database.getAllAccounts())
  ipcMain.handle('accounts:add', (_, account) => database.addAccount(account))
  ipcMain.handle('accounts:delete', (_, id) => database.deleteAccount(id))
  ipcMain.handle('accounts:deleteMany', (_, ids: number[]) => database.deleteAccounts(ids))
  ipcMain.handle('accounts:updateStatus', (_, id: number, status: AccountStatus) =>
    database.updateAccountStatus(id, status)
  )

  ipcMain.handle('accounts:export', async (_, format: 'csv' | 'json') => {
    const content = database.exportAccounts(format)

    const { filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: '导出账户',
      defaultPath: `accounts.${format}`,
      filters: [
        format === 'json'
          ? { name: 'JSON', extensions: ['json'] }
          : { name: 'CSV', extensions: ['csv'] }
      ]
    })

    if (filePath) {
      fs.writeFileSync(filePath, content, 'utf-8')
      return filePath
    }

    return null
  })

  ipcMain.handle('settings:get', () => database.getSettings())
  ipcMain.handle('settings:save', (_, settings) => database.saveSettings(settings))

  ipcMain.handle('email:testTempMailPlus', async (_, config) => {
    try {
      const service = new TempMailPlusService(config)
      return await service.testConnection()
    } catch {
      return false
    }
  })

  ipcMain.handle('email:testImap', async (_, config) => {
    try {
      const service = new ImapMailService(config)
      return await service.testConnection()
    } catch {
      return false
    }
  })

  ipcMain.handle('register:start', (_, config: RegistrationConfig) => handleRegistration(config))

  ipcMain.handle('register:stop', async () => {
    stopRegistration()
    await closeBrowser()
  })
}
