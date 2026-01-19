import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron'
import fs from 'fs'
import * as database from '../services/database'
import {
  initBrowser,
  registerAccount,
  inputVerificationCode,
  createContext7ApiKey,
  closeBrowser,
  startRegistration,
  stopRegistration,
  isRegistrationRunning
} from '../services/browser'
import {
  initRefBrowser,
  registerRefAccount,
  sendRefVerificationEmail,
  clickRefVerificationLink,
  getRefApiKey,
  closeRefBrowser
} from '../services/ref-browser'
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

let mainWindow: BrowserWindow | null = null

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const NUMBERS = '0123456789'
const SYMBOLS = '!@#$%^&*'
const ALL_CHARS = UPPERCASE + LOWERCASE + NUMBERS + SYMBOLS

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : '未知错误'

function generateRandomEmail(domain: string): string {
  const username = Array.from({ length: 6 }, () => CHARS.charAt(Math.floor(Math.random() * CHARS.length))).join('')
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

function sendLog(type: LogType, message: string): void {
  mainWindow?.webContents.send('register:log', {
    id: Date.now().toString(),
    timestamp: new Date().toLocaleTimeString(),
    type,
    message
  })
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
  const email = generateRandomEmail(settings.imapMail.domain)
  sendLog('info', `生成邮箱: ${email}`)
  return { email, emailService }
}

async function getVerificationCode(
  emailService: TempMailPlusService | ImapMailService,
  email: string,
  config: RegistrationConfig
): Promise<string | null> {
  if (config.emailType === 'tempmail_plus' && emailService instanceof TempMailPlusService) {
    return emailService.getVerificationCode()
  }

  if (!(emailService instanceof ImapMailService)) return null

  const initialWait = 30000
  const maxRetries = 5
  const retryInterval = 10000

  sendLog('info', `等待 ${initialWait / 1000} 秒后开始获取验证码...`)
  await delay(initialWait)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    sendLog('info', `第 ${attempt}/${maxRetries} 次尝试获取验证码...`)
    const code = await emailService.getVerificationCode(email, 5000)
    if (code) return code
    if (attempt < maxRetries) {
      sendLog('warning', `未获取到验证码，${retryInterval / 1000} 秒后重试...`)
      await delay(retryInterval)
    }
  }
  return null
}

async function getRefVerificationLink(
  settings: ReturnType<typeof database.getSettings>,
  email: string
): Promise<string | null> {
  sendLog('info', '从邮箱获取验证链接...')
  const imapService = new ImapMailService(settings.imapMail)

  for (let attempt = 1; attempt <= 10; attempt++) {
    sendLog('info', `第 ${attempt}/10 次尝试获取验证链接...`)
    try {
      const link = await imapService.getRefVerificationLink(email, 10000)
      if (link) {
        sendLog('success', '获取到验证链接')
        return link
      }
    } catch {}
    if (attempt < 10) await delay(5000)
  }

  sendLog('error', '获取验证链接超时')
  return null
}

async function handleRegistration(config: RegistrationConfig): Promise<void> {
  const settings = database.getSettings()
  const browserOptions = { headless: !config.showBrowser, onLog: sendLog }

  startRegistration()

  try {
    for (let i = 0; i < config.count; i++) {
      if (!isRegistrationRunning()) {
        sendLog('warning', '注册已被用户停止')
        break
      }

      sendLog('info', `[${i + 1}/${config.count}] 开始注册第 ${i + 1} 个账户...`)

      const { email, emailService } = createEmailService(config, settings)
      const password = generatePassword(config.passwordLength)

      try {
        await initBrowser(browserOptions)
        const success = await registerAccount({ email, password }, browserOptions)

        if (!success) {
          sendLog('error', `账户 ${email} 注册失败`)
          continue
        }

        sendLog('info', '等待验证码邮件...')
        const verificationCode = await getVerificationCode(emailService, email, config)

        if (!verificationCode) {
          sendLog('error', '获取验证码超时')
          continue
        }

        sendLog('success', `验证码: ${verificationCode}`)
        const verified = await inputVerificationCode(verificationCode, browserOptions)

        if (!verified) {
          sendLog('error', `账户 ${email} 验证失败`)
          continue
        }

        sendLog('info', '开始获取 Context7 API Key...')
        const apiKeyResult = await createContext7ApiKey(browserOptions)

        const { apiKey, keyName: apiKeyName, requestsLimit } = apiKeyResult
        if (apiKeyResult.success) {
          sendLog(apiKey ? 'success' : 'warning', 
            apiKey ? `API Key 创建成功: ${apiKey.slice(0, 12)}****` : 'API Key 已创建但未能获取完整值')
        } else {
          sendLog('warning', '获取 API Key 失败，账户仍然注册成功')
        }

        const account = database.addAccount({
          email, password, emailType: config.emailType,
          status: 'active', apiKey, apiKeyName, requestsLimit
        })

        mainWindow?.webContents.send('register:complete', { ...account, apiKey, apiKeyName, requestsLimit })
        sendLog('success', `账户 ${email} 注册成功！`)
      } finally {
        sendLog('info', '正在关闭浏览器...')
        await closeBrowser()
      }

      if (i < config.count - 1 && isRegistrationRunning()) {
        const interval = randomInt(config.intervalMin, config.intervalMax)
        sendLog('info', `等待 ${interval} 秒后继续下一个账户...`)
        await delay(interval * 1000)
      }
    }

    sendLog('success', '批量注册任务完成')
  } catch (error: unknown) {
    mainWindow?.webContents.send('register:error', getErrorMessage(error))
    await closeBrowser()
  } finally {
    stopRegistration()
  }
}

async function handleRefRegistration(config: RefRegistrationConfig): Promise<RefRegistrationResult> {
  const settings = database.getSettings()
  const opts = { headless: !config.showBrowser, onLog: sendLog }

  try {
    sendLog('info', `开始为 ${config.email} 注册 Ref API...`)
    await initRefBrowser(opts)

    if (!await registerRefAccount({ email: config.email, password: config.password }, opts)) {
      await closeRefBrowser()
      return { success: false, error: 'Ref 注册失败' }
    }

    await sendRefVerificationEmail(opts)
    await delay(5000)

    const verificationLink = await getRefVerificationLink(settings, config.email)
    if (!verificationLink) {
      await closeRefBrowser()
      return { success: false, error: '获取验证链接超时' }
    }

    await clickRefVerificationLink(verificationLink, opts)
    const result = await getRefApiKey(opts)
    await closeRefBrowser()

    if (result.success && result.apiKey) {
      sendLog('success', `Ref API Key: ${result.apiKey.slice(0, 15)}****`)
      database.updateAccountRefApiKey(config.accountId, result.apiKey)
      return { success: true, refApiKey: result.apiKey }
    }

    return { success: false, error: result.error || '获取 API Key 失败' }
  } catch (error: unknown) {
    await closeRefBrowser()
    const message = getErrorMessage(error)
    sendLog('error', `Ref 注册出错: ${message}`)
    return { success: false, error: message }
  }
}

export async function registerIpcHandlers(window: BrowserWindow): Promise<void> {
  mainWindow = window
  await database.initDatabase()

  ipcMain.handle('accounts:getAll', () => database.getAllAccounts())
  ipcMain.handle('accounts:add', (_, account) => database.addAccount(account))
  ipcMain.handle('accounts:delete', (_, id) => database.deleteAccount(id))
  ipcMain.handle('accounts:deleteMany', (_, ids: number[]) => database.deleteAccounts(ids))
  ipcMain.handle('accounts:updateStatus', (_, id: number, status: AccountStatus) =>
    database.updateAccountStatus(id, status))
  ipcMain.handle('accounts:updateRefApiKey', (_, id: number, refApiKey: string) =>
    database.updateAccountRefApiKey(id, refApiKey))

  ipcMain.handle('accounts:export', async () => {
    const content = database.exportAccounts()
    const { filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: '导出账户',
      defaultPath: 'api.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (filePath) {
      fs.writeFileSync(filePath, content, 'utf-8')
      return filePath
    }
    return null
  })

  ipcMain.handle('accounts:import', async () => {
    const { filePaths } = await dialog.showOpenDialog(mainWindow!, {
      title: '导入账户',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })

    if (!filePaths?.length) return null

    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8')
      const accounts = JSON.parse(content)
      if (!Array.isArray(accounts)) return { error: '导入文件格式错误：应为账户数组' }
      return database.importAccounts(accounts)
    } catch (error) {
      return { error: `导入失败: ${getErrorMessage(error)}` }
    }
  })

  ipcMain.handle('settings:get', () => database.getSettings())
  ipcMain.handle('settings:save', (_, settings) => database.saveSettings(settings))

  ipcMain.handle('email:testTempMailPlus', async (_, config) => {
    try { return await new TempMailPlusService(config).testConnection() }
    catch { return false }
  })

  ipcMain.handle('email:testImap', async (_, config) => {
    try { return await new ImapMailService(config).testConnection() }
    catch { return false }
  })

  ipcMain.handle('register:start', (_, config: RegistrationConfig) => handleRegistration(config))
  ipcMain.handle('register:startRef', (_, config: RefRegistrationConfig) => handleRefRegistration(config))
  ipcMain.handle('register:stop', async () => { stopRegistration(); await closeBrowser() })
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    try { await shell.openExternal(url); return true }
    catch { return false }
  })
  ipcMain.handle('app:getVersion', () => app.getVersion())
}
