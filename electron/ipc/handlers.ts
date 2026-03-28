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
import { isRefRegistrationRunning } from '../services/ref-browser'
import {
  fetchRefAccountCredits,
  fetchAllRefCredits,
  resolveFirebaseWebApiKey,
  firebaseSignInWithPassword,
  resendRefVerificationEmail
} from '../services/ref-credits'
import {
  refApiRegisterFull,
  refApiCompleteVerification,
  extractOobCodeFromLink,
  createRefApiKey,
  firebaseLookup,
  isInvalidOobCodeError
} from '../services/ref-api'
import {
  fetchContext7AccountRequests,
  fetchAllContext7Requests,
  registerContext7ClerkSendEmailCode,
  registerContext7ClerkVerifyAndSession,
  createContext7DashboardApiKey,
  establishCtx7DashboardCookie
} from '../services/context7-requests'
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

interface Context7RegistrationConfig {
  accountId: number
  email: string
  password: string
  emailType: EmailType
  showBrowser: boolean
}

interface Context7RegistrationResult {
  success: boolean
  apiKey?: string
  apiKeyName?: string
  requestsLimit?: number
  ctx7RequestsUsed?: number
  ctx7RequestsLimit?: number
  ctx7RequestsUpdatedAt?: string
  error?: string
}

interface RefRegistrationResult {
  success: boolean
  refApiKey?: string
  refCredits?: number
  refCreditsUpdatedAt?: string
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

/** 所有注册 IPC（Context7 批量 / Ref）共用一条队列，严格按调用顺序串行执行 */
let registrationQueueTail: Promise<void> = Promise.resolve()

function enqueueRegistrationTask<T>(task: () => Promise<T>): Promise<T> {
  const run = registrationQueueTail.then(() => task())
  registrationQueueTail = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

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

async function processRefVerificationLink(
  accountId: number,
  email: string,
  password: string,
  verificationLink: string,
  idTokenForOob: string
): Promise<RefRegistrationResult> {
  let oobCode = extractOobCodeFromLink(verificationLink)
  if (!oobCode) {
    sendLog('warning', '无法从链接提取 oobCode，尝试直接访问验证链接...')
    try {
      const linkUrl = new URL(verificationLink)
      if (linkUrl.protocol !== 'https:') {
        return { success: false, error: '验证链接协议不安全' }
      }
      await fetch(verificationLink, { redirect: 'follow' })
      sendLog('info', '已访问验证链接')
    } catch {
      return { success: false, error: '验证链接访问失败' }
    }
  }

  const webApiKey = await resolveFirebaseWebApiKey()

  if (oobCode) {
    sendLog('info', '提交验证并完成 Ref 绑定...')
    const completion = await refApiCompleteVerification(webApiKey, oobCode, idTokenForOob)
    if (!completion.success || !completion.apiKey) {
      const errMsg = completion.error || '验证完成但获取 API Key 失败'
      if (isInvalidOobCodeError(errMsg)) {
        sendLog(
          'warning',
          '验证链接可能无效或已过期，尝试通过密码登录检查邮箱验证状态...'
        )
        const signIn = await firebaseSignInWithPassword(webApiKey, email, password)
        if ('error' in signIn) {
          return {
            success: false,
            error: `${errMsg}；密码登录失败: ${signIn.error}`
          }
        }
        const lookup = await firebaseLookup(webApiKey, signIn.idToken)
        if ('error' in lookup) {
          return {
            success: false,
            error: `${errMsg}；账户查询失败: ${lookup.error}`
          }
        }
        if (!lookup.emailVerified) {
          return {
            success: false,
            error: '验证链接无效或已过期，且邮箱仍未完成验证'
          }
        }
        const keyResult = await createRefApiKey(signIn.idToken)
        if ('error' in keyResult) {
          return { success: false, error: keyResult.error }
        }
        sendLog('success', `Ref API Key: ${keyResult.apiKey.slice(0, 15)}****`)
        database.updateAccountRefApiKey(accountId, keyResult.apiKey)
        database.updateAccountRefEmailVerified(accountId, true)
        const refSnap = await persistRefCreditsAfterBind(accountId, email, password)
        return {
          success: true,
          refApiKey: keyResult.apiKey,
          ...refSnap
        }
      }
      return { success: false, error: errMsg }
    }
    sendLog('success', `Ref API Key: ${completion.apiKey.slice(0, 15)}****`)
    database.updateAccountRefApiKey(accountId, completion.apiKey)
    database.updateAccountRefEmailVerified(accountId, true)
    const refSnap = await persistRefCreditsAfterBind(accountId, email, password)
    return {
      success: true,
      refApiKey: completion.apiKey,
      ...refSnap
    }
  }

  sendLog('info', '等待验证生效后获取 API Key...')
  await delay(3000)
  const signIn = await firebaseSignInWithPassword(webApiKey, email, password)
  if ('error' in signIn) {
    return { success: false, error: `重新登录失败: ${signIn.error}` }
  }
  const keyResult = await createRefApiKey(signIn.idToken)
  if ('error' in keyResult) {
    return { success: false, error: keyResult.error }
  }
  sendLog('success', `Ref API Key: ${keyResult.apiKey.slice(0, 15)}****`)
  database.updateAccountRefApiKey(accountId, keyResult.apiKey)
  database.updateAccountRefEmailVerified(accountId, true)
  const refSnap = await persistRefCreditsAfterBind(accountId, email, password)
  return {
    success: true,
    refApiKey: keyResult.apiKey,
    ...refSnap
  }
}

async function persistRefCreditsAfterBind(
  accountId: number,
  email: string,
  password: string
): Promise<{ refCredits: number; refCreditsUpdatedAt: string } | undefined> {
  const r = await fetchRefAccountCredits({ email, password })
  if (r.emailVerified === true || r.emailVerified === false) {
    database.updateAccountRefEmailVerified(accountId, r.emailVerified)
  }
  if (r.credits !== null) {
    database.updateAccountRefCredits(accountId, r.credits)
    const row = database.getAllAccounts().find(a => a.id === accountId)
    if (row?.refCredits != null && row.refCreditsUpdatedAt) {
      return { refCredits: row.refCredits, refCreditsUpdatedAt: row.refCreditsUpdatedAt }
    }
    return { refCredits: r.credits, refCreditsUpdatedAt: new Date().toISOString() }
  }
  if (r.error) sendLog('warning', `Ref 额度获取失败: ${r.error}`)
  return undefined
}

async function persistContext7RequestsAfterBind(
  accountId: number,
  email: string,
  password: string
): Promise<{ used: number; limit: number; updatedAt: string } | undefined> {
  const r = await fetchContext7AccountRequests({ email, password })
  if (r.used != null && r.limit != null) {
    database.updateAccountContext7Requests(accountId, r.used, r.limit)
    sendLog('success', `Context7 用量已保存: ${r.used} / ${r.limit}`)
    return { used: r.used, limit: r.limit, updatedAt: new Date().toISOString() }
  }
  if (r.error) sendLog('warning', `Context7 用量获取失败: ${r.error}`)
  return undefined
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
      let usedBrowser = false

      try {
        let sessionForKey: { cookieHeader: string; authorization?: string } | null = null
        let apiKey: string | undefined
        let apiKeyName: string | undefined

        const apiPrep = await registerContext7ClerkSendEmailCode(email, password)
        let verificationCode: string | null = null

        if (apiPrep.ok && apiPrep.skipVerification && apiPrep.session) {
          sessionForKey = apiPrep.session
          sendLog('success', 'Clerk 注册已完成')
        } else if (apiPrep.ok) {
          sendLog('info', '等待验证码邮件...')
          verificationCode = await getVerificationCode(emailService, email, config)
          if (!verificationCode) {
            sendLog('error', '获取验证码超时')
            continue
          }
          sendLog('success', `验证码: ${verificationCode}`)
          const ver = await registerContext7ClerkVerifyAndSession(
            apiPrep.jar,
            apiPrep.signUpId,
            verificationCode,
            email
          )
          if ('error' in ver) {
            sendLog('warning', `API 验证失败: ${ver.error}，改用浏览器`)
            verificationCode = null
          } else {
            sessionForKey = ver
          }
        }

        if (!sessionForKey) {
          if (apiPrep.ok === false) {
            sendLog(
              'info',
              apiPrep.needsBrowserFallback
                ? '使用浏览器注册（人机验证）'
                : `Clerk API: ${apiPrep.error}`
            )
          }
          await initBrowser(browserOptions)
          usedBrowser = true
          const success = await registerAccount({ email, password }, browserOptions)
          if (!success) {
            sendLog('error', `账户 ${email} 注册失败`)
            continue
          }
          if (verificationCode === null) {
            sendLog('info', '等待验证码邮件...')
            verificationCode = await getVerificationCode(emailService, email, config)
          }
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
          const est = await establishCtx7DashboardCookie(email, password)
          if (!('error' in est)) {
            sessionForKey = { cookieHeader: est.cookieHeader, authorization: est.authorization }
          }
        }

        if (sessionForKey) {
          const kr = await createContext7DashboardApiKey(sessionForKey)
          if (kr.success === false) {
            sendLog('warning', kr.error)
          } else {
            apiKey = kr.apiKey
            apiKeyName = kr.keyName
            sendLog('success', `API Key 创建成功: ${apiKey.slice(0, 12)}****`)
          }
        }

        if (!apiKey && usedBrowser) {
          sendLog('info', '使用浏览器创建 API Key...')
          const apiKeyResult = await createContext7ApiKey(browserOptions)
          apiKey = apiKeyResult.apiKey
          apiKeyName = apiKeyResult.keyName
          if (apiKeyResult.success) {
            sendLog(
              apiKey ? 'success' : 'warning',
              apiKey ? `API Key 创建成功: ${apiKey.slice(0, 12)}****` : 'API Key 已创建但未能获取完整值'
            )
          } else {
            sendLog('warning', '获取 API Key 失败，账户仍然注册成功')
          }
        } else if (!apiKey && !usedBrowser) {
          sendLog('warning', '未能通过接口创建 API Key，可稍后在 Dashboard 补绑')
        }

        const account = database.addAccount({
          email,
          password,
          emailType: config.emailType,
          status: 'active',
          apiKey,
          apiKeyName
        })

        await persistContext7RequestsAfterBind(account.id, email, password)
        const synced = database.getAllAccounts().find(a => a.id === account.id) ?? account

        mainWindow?.webContents.send('register:complete', {
          ...synced,
          apiKey,
          apiKeyName
        })
        sendLog('success', `账户 ${email} 注册成功！`)
      } finally {
        if (usedBrowser) {
          sendLog('info', '正在关闭浏览器...')
          await closeBrowser()
        }
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

  let email = config.email
  let password = config.password
  const accountId = config.accountId

  if (!email && settings.imapMail.domain) {
    email = generateRandomEmail(settings.imapMail.domain)
    password = generatePassword(settings.registration.passwordLength)
    sendLog('info', `生成随机邮箱: ${email}`)
  }

  if (!email || !password) {
    return { success: false, error: '缺少邮箱或密码' }
  }

  try {
    sendLog('info', `开始为 ${email} 通过 API 注册 Ref...`)

    const regResult = await refApiRegisterFull(email, password, sendLog)
    if (!regResult.success || !regResult.idToken) {
      return { success: false, error: regResult.error || 'Ref API 注册失败' }
    }

    if (regResult.skipVerificationFlow) {
      const keyResult = await createRefApiKey(regResult.idToken)
      if ('error' in keyResult) {
        return { success: false, error: keyResult.error }
      }
      sendLog('success', `Ref API Key: ${keyResult.apiKey.slice(0, 15)}****`)
      database.updateAccountRefApiKey(accountId, keyResult.apiKey)
      database.updateAccountRefEmailVerified(accountId, true)
      const refSnap = await persistRefCreditsAfterBind(accountId, email, password)
      return {
        success: true,
        refApiKey: keyResult.apiKey,
        ...refSnap
      }
    }

    sendLog('success', 'Ref 账户注册成功，等待验证邮件...')
    await delay(5000)

    const verificationLink = await getRefVerificationLink(settings, email)
    if (!verificationLink) {
      return { success: false, error: '获取验证链接超时' }
    }

    return processRefVerificationLink(accountId, email, password, verificationLink, regResult.idToken)
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    sendLog('error', `Ref 注册出错: ${message}`)
    return { success: false, error: message }
  }
}

async function handleContext7Registration(config: Context7RegistrationConfig): Promise<Context7RegistrationResult> {
  const settings = database.getSettings()
  const browserOptions = { headless: !config.showBrowser, onLog: sendLog }
  let usedBrowser = false
  const email = config.email
  const password = config.password

  try {
    sendLog('info', `开始为 ${email} 注册 Context7...`)
    let sessionForKey: { cookieHeader: string; authorization?: string } | null = null
    let apiKey: string | undefined
    let apiKeyName: string | undefined

    const apiPrep = await registerContext7ClerkSendEmailCode(email, password)
    let verificationCode: string | null = null

    if (apiPrep.ok && apiPrep.skipVerification && apiPrep.session) {
      sessionForKey = apiPrep.session
      sendLog('success', 'Clerk 注册已完成')
    } else if (apiPrep.ok) {
      const emailService =
        config.emailType === 'tempmail_plus'
          ? new TempMailPlusService(settings.tempMailPlus)
          : new ImapMailService(settings.imapMail)
      sendLog('info', '等待验证码邮件...')
      verificationCode = await getVerificationCode(emailService, email, {
        emailType: config.emailType
      } as RegistrationConfig)
      if (!verificationCode) {
        return { success: false, error: '获取验证码超时' }
      }
      sendLog('success', `验证码: ${verificationCode}`)
      const ver = await registerContext7ClerkVerifyAndSession(apiPrep.jar, apiPrep.signUpId, verificationCode, email)
      if ('error' in ver) {
        sendLog('warning', `API 验证失败: ${ver.error}，改用浏览器`)
        verificationCode = null
      } else {
        sessionForKey = ver
      }
    }

    if (!sessionForKey) {
      if (apiPrep.ok === false) {
        sendLog(
          'info',
          apiPrep.needsBrowserFallback ? '使用浏览器注册（人机验证）' : `Clerk API: ${apiPrep.error}`
        )
      }
      await initBrowser(browserOptions)
      usedBrowser = true
      const success = await registerAccount({ email, password }, browserOptions)
      if (!success) {
        await closeBrowser()
        return { success: false, error: 'Context7 注册失败' }
      }
      const emailService =
        config.emailType === 'tempmail_plus'
          ? new TempMailPlusService(settings.tempMailPlus)
          : new ImapMailService(settings.imapMail)
      if (verificationCode === null) {
        sendLog('info', '等待验证码邮件...')
        verificationCode = await getVerificationCode(emailService, email, {
          emailType: config.emailType
        } as RegistrationConfig)
      }
      if (!verificationCode) {
        await closeBrowser()
        return { success: false, error: '获取验证码超时' }
      }
      sendLog('success', `验证码: ${verificationCode}`)
      const verified = await inputVerificationCode(verificationCode, browserOptions)
      if (!verified) {
        await closeBrowser()
        return { success: false, error: '验证失败' }
      }
      const est = await establishCtx7DashboardCookie(email, password)
      if (!('error' in est)) {
        sessionForKey = { cookieHeader: est.cookieHeader, authorization: est.authorization }
      }
    }

    if (sessionForKey) {
      const kr = await createContext7DashboardApiKey(sessionForKey)
      if (kr.success === false) {
        sendLog('warning', kr.error)
      } else {
        apiKey = kr.apiKey
        apiKeyName = kr.keyName
        sendLog('success', `API Key 创建成功: ${apiKey.slice(0, 12)}****`)
      }
    }

    if (!apiKey && usedBrowser) {
      sendLog('info', '使用浏览器创建 API Key...')
      const apiKeyResult = await createContext7ApiKey(browserOptions)
      apiKey = apiKeyResult.apiKey
      apiKeyName = apiKeyResult.keyName
    }

    if (usedBrowser) {
      await closeBrowser()
    }

    if (apiKey) {
      database.updateAccountApiKey(config.accountId, apiKey, apiKeyName)
      const usage = await persistContext7RequestsAfterBind(
        config.accountId,
        config.email,
        config.password
      )
      return {
        success: true,
        apiKey,
        apiKeyName,
        ...(usage
          ? {
              requestsLimit: usage.limit,
              ctx7RequestsUsed: usage.used,
              ctx7RequestsLimit: usage.limit,
              ctx7RequestsUpdatedAt: usage.updatedAt
            }
          : {})
      }
    }

    return { success: false, error: '获取 API Key 失败' }
  } catch (error: unknown) {
    if (usedBrowser) await closeBrowser()
    const message = getErrorMessage(error)
    sendLog('error', `Context7 注册出错: ${message}`)
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

  ipcMain.handle(
    'accounts:fetchRefCredits',
    async (
      _,
      accountId: number,
      options?: { resendVerificationIfUnverified?: boolean }
    ) => {
      if (isRefRegistrationRunning()) {
        return {
          credits: null as number | null,
          emailVerified: null as boolean | null,
          error: 'Ref 注册进行中'
        }
      }
      const acc = database.getAllAccounts().find(a => a.id === accountId)
      if (!acc) {
        return { credits: null as number | null, emailVerified: null as boolean | null, error: '账户不存在' }
      }
      if (!acc.refApiKey) {
        return { credits: null as number | null, emailVerified: null as boolean | null, error: '未绑定 Ref API' }
      }
      const r = await fetchRefAccountCredits({ email: acc.email, password: acc.password })
      if (r.credits !== null) database.updateAccountRefCredits(accountId, r.credits)
      if (r.emailVerified === true || r.emailVerified === false) {
        database.updateAccountRefEmailVerified(accountId, r.emailVerified)
      }
      let verificationEmailSent: boolean | undefined
      if (
        options?.resendVerificationIfUnverified &&
        acc.refApiKey &&
        r.emailVerified === false
      ) {
        sendLog('info', `[账户管理] Ref 邮箱未验证，开始补全验证: ${acc.email}`)
        sendLog('info', '发送验证邮件...')
        const sent = await resendRefVerificationEmail({ email: acc.email, password: acc.password })
        if ('error' in sent) {
          sendLog('error', `发送验证邮件失败: ${sent.error}`)
          return {
            credits: r.credits,
            emailVerified: r.emailVerified,
            error: `发送验证邮件失败: ${sent.error}`
          }
        }
        verificationEmailSent = true
        sendLog('success', '验证邮件已发送')
        sendLog('info', '等待验证邮件投递…')
        await delay(5000)
        const settings = database.getSettings()
        const link = await getRefVerificationLink(settings, acc.email)
        if (!link) {
          sendLog('error', '获取验证链接超时')
          return {
            credits: r.credits,
            emailVerified: r.emailVerified,
            error: '获取验证链接超时',
            verificationEmailSent
          }
        }
        sendLog('info', '登录 Firebase 并提交邮箱验证…')
        const webApiKey = await resolveFirebaseWebApiKey()
        const signIn = await firebaseSignInWithPassword(webApiKey, acc.email, acc.password)
        if ('error' in signIn) {
          sendLog('error', `Firebase 登录失败: ${signIn.error}`)
          return {
            credits: r.credits,
            emailVerified: r.emailVerified,
            error: signIn.error,
            verificationEmailSent
          }
        }
        const fin = await processRefVerificationLink(
          accountId,
          acc.email,
          acc.password,
          link,
          signIn.idToken
        )
        if (!fin.success) {
          sendLog('error', fin.error || 'Ref 验证失败')
          return {
            credits: r.credits,
            emailVerified: false,
            error: fin.error,
            verificationEmailSent
          }
        }
        const r2 = await fetchRefAccountCredits({ email: acc.email, password: acc.password })
        if (r2.credits !== null) database.updateAccountRefCredits(accountId, r2.credits)
        if (r2.emailVerified === true || r2.emailVerified === false) {
          database.updateAccountRefEmailVerified(accountId, r2.emailVerified)
        }
        sendLog('success', '[账户管理] Ref 邮箱验证与额度已更新')
        return { ...r2, verificationEmailSent: true }
      }
      return { ...r, verificationEmailSent }
    }
  )

  ipcMain.handle('accounts:fetchRefCreditsAll', async () => {
    if (isRefRegistrationRunning()) {
      return { results: {}, error: 'Ref 注册进行中' }
    }
    const withRef = database.getAllAccounts().filter(a => a.refApiKey)
    const results = await fetchAllRefCredits(
      withRef.map(a => ({ id: a.id, email: a.email, password: a.password }))
    )
    for (const [idStr, r] of Object.entries(results)) {
      const id = Number(idStr)
      if (r.credits !== null) database.updateAccountRefCredits(id, r.credits)
      if (r.emailVerified === true || r.emailVerified === false) {
        database.updateAccountRefEmailVerified(id, r.emailVerified)
      }
    }
    return { results }
  })

  ipcMain.handle('accounts:fetchContext7Requests', async (_, accountId: number) => {
    if (isRegistrationRunning()) {
      return { used: null as number | null, limit: null as number | null, error: 'Context7 注册进行中' }
    }
    const acc = database.getAllAccounts().find(a => a.id === accountId)
    if (!acc) return { used: null as number | null, limit: null as number | null, error: '账户不存在' }
    if (!acc.apiKey) return { used: null as number | null, limit: null as number | null, error: '未绑定 context7 API' }
    const r = await fetchContext7AccountRequests({ email: acc.email, password: acc.password })
    if (r.used !== null && r.limit !== null) database.updateAccountContext7Requests(accountId, r.used, r.limit)
    return r
  })

  ipcMain.handle('accounts:fetchContext7RequestsAll', async () => {
    if (isRegistrationRunning()) {
      return { results: {}, error: 'Context7 注册进行中' }
    }
    const withCtx = database.getAllAccounts().filter(a => a.apiKey)
    const results = await fetchAllContext7Requests(
      withCtx.map(a => ({ id: a.id, email: a.email, password: a.password }))
    )
    for (const [idStr, r] of Object.entries(results)) {
      if (r.used !== null && r.limit !== null) {
        database.updateAccountContext7Requests(Number(idStr), r.used, r.limit)
      }
    }
    return { results }
  })

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

  ipcMain.handle('register:start', (_, config: RegistrationConfig) =>
    enqueueRegistrationTask(() => handleRegistration(config)))
  ipcMain.handle('register:startRef', (_, config: RefRegistrationConfig) =>
    enqueueRegistrationTask(() => handleRefRegistration(config)))
  ipcMain.handle('register:startContext7', (_, config: Context7RegistrationConfig) =>
    enqueueRegistrationTask(() => handleContext7Registration(config)))
  ipcMain.handle('register:stop', async () => { stopRegistration(); await closeBrowser() })
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    try { await shell.openExternal(url); return true }
    catch { return false }
  })
  ipcMain.handle('app:getVersion', () => app.getVersion())
}
