import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron'
import fs from 'fs'
import * as database from '../services/database'
import {
  initBrowser,
  registerAccount,
  inputVerificationCode,
  closeBrowser,
  extractContext7DashboardSessionForFetch,
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
import { userFacingNetworkMessage } from '../utils/describe-fetch-error'
import type { Context7InboxResult } from '../utils/context7-mail'
import {
  fetchContext7AccountRequests,
  fetchAllContext7Requests,
  registerContext7ClerkSendEmailCode,
  registerContext7ClerkVerifyAndSession,
  createContext7DashboardApiKey,
  establishCtx7DashboardCookie,
  rememberContext7DashboardSession
} from '../services/context7-requests'
import { TempMailPlusService } from '../services/email/tempmailplus'
import { ImapMailService } from '../services/email/imap'
import type {
  AccountStatus,
  EmailType,
  RegistrationConfig,
  RefRegistrationConfig,
  Context7RegistrationConfig,
  Context7RegistrationResult,
  RefRegistrationResult,
  LogType,
} from '../../shared/types'

let mainWindow: BrowserWindow | null = null

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const NUMBERS = '0123456789'
const CHARS = LOWERCASE + NUMBERS
const SYMBOLS = '!@#$%^&*'
const ALL_CHARS = UPPERCASE + LOWERCASE + NUMBERS + SYMBOLS

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : '未知错误'

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
  if (process.env.NODE_ENV === 'development') {
    const line = `[register:${type}] ${message}`
    if (type === 'error') console.error(line)
    else if (type === 'warning') console.warn(line)
    else console.log(line)
  }
}

function sendBatchMissLog(label: string, missParts: string[]): void {
  if (!missParts.length) return
  const batch = 6
  for (let i = 0; i < missParts.length; i += batch) {
    const tag = i === 0 ? `${label}：` : `${label}（续）：`
    sendLog('warning', `${tag}${missParts.slice(i, i + batch).join('；')}`)
  }
}

function logAccountBatchStep(
  channel: 'Ref' | 'Context7',
  p: { done: number; total: number; email: string; ok: boolean; error?: string }
): void {
  const tail = p.ok ? '成功' : `未获取${p.error ? `（${p.error}）` : ''}`
  sendLog('info', `[账户管理] ${channel} [${p.done}/${p.total}] ${p.email} ${tail}`)
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

function context7MailService(
  settings: ReturnType<typeof database.getSettings>,
  emailType: EmailType
): TempMailPlusService | ImapMailService {
  return emailType === 'tempmail_plus'
    ? new TempMailPlusService(settings.tempMailPlus)
    : new ImapMailService(settings.imapMail)
}

type Ctx7SessionEntry = { cookieHeader: string; authorization?: string }

async function pollContext7RegistrationMail(
  emailService: TempMailPlusService | ImapMailService,
  email: string,
  config: RegistrationConfig
): Promise<Context7InboxResult | null> {
  if (config.emailType === 'tempmail_plus' && emailService instanceof TempMailPlusService) {
    return emailService.getContext7RegistrationMailResult()
  }
  if (!(emailService instanceof ImapMailService)) return null
  const initialWait = 30000
  const maxRetries = 5
  const retryInterval = 10000
  await delay(initialWait)
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const r = await emailService.getContext7RegistrationMailResult(email, 5000)
    if (r) return r
    if (attempt < maxRetries) {
      sendLog('warning', `未获取到 Context7 邮件，${retryInterval / 1000} 秒后重试...`)
      await delay(retryInterval)
    }
  }
  return null
}

async function sessionFromPasswordLogin(
  email: string,
  password: string
): Promise<Ctx7SessionEntry | null> {
  const est = await establishCtx7DashboardCookie(email, password)
  if ('error' in est) {
    sendLog('warning', userFacingNetworkMessage(est.error))
    return null
  }
  const session: Ctx7SessionEntry = {
    cookieHeader: est.cookieHeader,
    authorization: est.authorization
  }
  rememberContext7DashboardSession(email, session)
  return session
}

async function sessionAfterBrowserVerify(
  email: string,
  browserOptions: { headless: boolean; onLog: typeof sendLog }
): Promise<Ctx7SessionEntry | null> {
  sendLog('info', '正在从浏览器同步会话至接口...')
  const bridged = await extractContext7DashboardSessionForFetch(browserOptions)
  if (bridged) {
    rememberContext7DashboardSession(email, bridged)
    return bridged
  }
  return null
}

async function getRefVerificationLink(
  settings: ReturnType<typeof database.getSettings>,
  email: string
): Promise<string | null> {
  const imapService = new ImapMailService(settings.imapMail)
  try {
    const link = await imapService.getRefVerificationLink(email)
    if (link) {
      sendLog('success', '获取到验证链接')
      return link
    }
  } catch {}
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
    } catch {
      return { success: false, error: '验证链接访问失败' }
    }
  }

  const webApiKey = await resolveFirebaseWebApiKey()

  if (oobCode) {
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
  if (r.error)
    sendLog('warning', `Ref 额度获取失败: ${userFacingNetworkMessage(r.error)}`)
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
  if (r.error)
    sendLog('warning', `Context7 用量获取失败: ${userFacingNetworkMessage(r.error)}`)
  return undefined
}

async function handleRegistration(config: RegistrationConfig): Promise<void> {
  const settings = database.getSettings()
  const browserOptions = { headless: !config.showBrowser, onLog: sendLog }
  const scope = config.registrationScope ?? 'both'

  startRegistration()

  try {
    for (let i = 0; i < config.count; i++) {
      if (!isRegistrationRunning()) {
        sendLog('warning', '注册已被用户停止')
        break
      }

      const { email, emailService } = createEmailService(config, settings)
      const password = generatePassword(config.passwordLength)
      let usedBrowser = false

      try {
        if (scope === 'ref_only') {
          const account = database.addAccount({
            email,
            password,
            emailType: config.emailType,
            status: 'active',
          })
          const refResult = await handleRefRegistration({
            accountId: account.id,
            email,
            password,
            showBrowser: config.showBrowser,
          })
          if (!refResult.success) {
            const err = userFacingNetworkMessage(refResult.error || '未知错误')
            sendLog('warning', `Ref 注册未完成: ${err}，可在账户管理中补全`)
          }
          const synced = database.getAllAccounts().find(a => a.id === account.id) ?? account
          mainWindow?.webContents.send('register:complete', synced)
          sendLog('success', `账户 ${email} 注册成功！`)
        } else {
        let sessionForKey: Ctx7SessionEntry | null = null
        let apiKey: string | undefined
        let apiKeyName: string | undefined

        const apiPrep = await registerContext7ClerkSendEmailCode(email, password)
        let verificationCode: string | null = null

        if (apiPrep.ok && apiPrep.skipVerification && apiPrep.session) {
          sessionForKey = apiPrep.session
          sendLog('success', 'Clerk 注册已完成')
        } else if (apiPrep.ok) {
          const mailResult = await pollContext7RegistrationMail(emailService, email, config)
          if (!mailResult) {
            sendLog('error', '获取 Context7 邮件超时')
            continue
          }
          if (mailResult.kind === 'existing_account') {
            sendLog('info', '检测到邮箱已在 Context7 注册，改为接口登录...')
            sessionForKey = await sessionFromPasswordLogin(email, password)
            if (!sessionForKey) {
              sendLog('error', 'Context7 接口登录失败')
              continue
            }
          } else {
            sendLog('success', `验证码: ${mailResult.code}`)
            const ver = await registerContext7ClerkVerifyAndSession(
              apiPrep.jar,
              apiPrep.signUpId,
              mailResult.code,
              email
            )
            if ('error' in ver) {
              sendLog('warning', `${userFacingNetworkMessage(ver.error)}，改用浏览器`)
            } else {
              sessionForKey = ver
            }
          }
        }

        if (!sessionForKey) {
          if (apiPrep.ok === false) {
            sendLog('warning', userFacingNetworkMessage(apiPrep.error))
          }
          await initBrowser(browserOptions)
          usedBrowser = true
          const success = await registerAccount({ email, password }, browserOptions)
          if (!success) {
            sendLog('error', `账户 ${email} 注册失败`)
            continue
          }
          if (verificationCode === null) {
            const mailResult = await pollContext7RegistrationMail(emailService, email, config)
            if (!mailResult) {
              sendLog('error', '获取 Context7 邮件超时')
              continue
            }
            if (mailResult.kind === 'existing_account') {
              sendLog('info', '检测到邮箱已在 Context7 注册，改为接口登录...')
              await closeBrowser()
              usedBrowser = false
              sessionForKey = await sessionFromPasswordLogin(email, password)
            } else {
              verificationCode = mailResult.code
            }
          }
          if (!sessionForKey && verificationCode) {
            sendLog('success', `验证码: ${verificationCode}`)
            const verified = await inputVerificationCode(verificationCode, browserOptions)
            if (!verified) {
              sendLog('error', `账户 ${email} 验证失败`)
              continue
            }
            sessionForKey = await sessionAfterBrowserVerify(email, browserOptions)
            await closeBrowser()
            usedBrowser = false
            if (!sessionForKey) {
              sendLog('info', '尝试通过邮箱密码建立接口会话...')
              sessionForKey = await sessionFromPasswordLogin(email, password)
            }
          } else if (!sessionForKey) {
            sendLog('error', 'Context7 会话未建立')
            continue
          }
        }

        if (sessionForKey) {
          const kr = await createContext7DashboardApiKey(sessionForKey)
          if (kr.success === false) {
            sendLog('warning', userFacingNetworkMessage(kr.error))
          } else {
            apiKey = kr.apiKey
            apiKeyName = kr.keyName
            sendLog('success', `API Key 创建成功: ${apiKey.slice(0, 12)}****`)
          }
        }

        if (!apiKey) {
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

        if (scope === 'both') {
          const refResult = await handleRefRegistration({
            accountId: account.id,
            email,
            password,
            showBrowser: config.showBrowser
          })
          if (!refResult.success) {
            const err = userFacingNetworkMessage(refResult.error || '未知错误')
            sendLog('warning', `Ref 注册未完成: ${err}，可在账户管理中补全`)
          }
        }

        const synced = database.getAllAccounts().find(a => a.id === account.id) ?? account
        mainWindow?.webContents.send('register:complete', synced)
        sendLog('success', `账户 ${email} 注册成功！`)
        }
      } finally {
        if (usedBrowser) {
          await closeBrowser()
        }
      }

      if (i < config.count - 1 && isRegistrationRunning()) {
        const interval = randomInt(config.intervalMin, config.intervalMax)
        await delay(interval * 1000)
      }
    }

    sendLog('success', '批量注册任务完成')
  } catch (error: unknown) {
    mainWindow?.webContents.send(
      'register:error',
      userFacingNetworkMessage(getErrorMessage(error))
    )
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
    sendLog('success', `邮箱: ${email}`)
  }

  if (!email || !password) {
    return { success: false, error: '缺少邮箱或密码' }
  }

  try {
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

    await delay(2000)

    const verificationLink = await getRefVerificationLink(settings, email)
    if (!verificationLink) {
      return { success: false, error: '获取验证链接超时' }
    }

    return processRefVerificationLink(accountId, email, password, verificationLink, regResult.idToken)
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    const shown = userFacingNetworkMessage(message)
    sendLog('error', `Ref 注册出错: ${shown}`)
    return { success: false, error: shown }
  }
}

async function handleContext7Registration(config: Context7RegistrationConfig): Promise<Context7RegistrationResult> {
  const settings = database.getSettings()
  const browserOptions = { headless: !config.showBrowser, onLog: sendLog }
  let usedBrowser = false
  const email = config.email
  const password = config.password

  try {
    let sessionForKey: Ctx7SessionEntry | null = null
    let apiKey: string | undefined
    let apiKeyName: string | undefined

    const apiPrep = await registerContext7ClerkSendEmailCode(email, password)
    let verificationCode: string | null = null
    const ctx7RegConfig = { emailType: config.emailType } as RegistrationConfig

    if (apiPrep.ok && apiPrep.skipVerification && apiPrep.session) {
      sessionForKey = apiPrep.session
      sendLog('success', 'Clerk 注册已完成')
    } else if (apiPrep.ok) {
      const emailService = context7MailService(settings, config.emailType)
      const mailResult = await pollContext7RegistrationMail(emailService, email, ctx7RegConfig)
      if (!mailResult) {
        return { success: false, error: '获取 Context7 邮件超时' }
      }
      if (mailResult.kind === 'existing_account') {
        sendLog('info', '检测到邮箱已在 Context7 注册，改为接口登录...')
        sessionForKey = await sessionFromPasswordLogin(email, password)
        if (!sessionForKey) {
          return { success: false, error: 'Context7 接口登录失败' }
        }
      } else {
        sendLog('success', `验证码: ${mailResult.code}`)
        const ver = await registerContext7ClerkVerifyAndSession(apiPrep.jar, apiPrep.signUpId, mailResult.code, email)
        if ('error' in ver) {
          sendLog('warning', `${userFacingNetworkMessage(ver.error)}，改用浏览器`)
        } else {
          sessionForKey = ver
        }
      }
    }

    if (!sessionForKey) {
      if (apiPrep.ok === false) {
        sendLog('warning', userFacingNetworkMessage(apiPrep.error))
      }
      await initBrowser(browserOptions)
      usedBrowser = true
      const success = await registerAccount({ email, password }, browserOptions)
      if (!success) {
        await closeBrowser()
        return { success: false, error: 'Context7 注册失败' }
      }
      const emailService = context7MailService(settings, config.emailType)
      if (verificationCode === null) {
        const mailResult = await pollContext7RegistrationMail(emailService, email, ctx7RegConfig)
        if (!mailResult) {
          await closeBrowser()
          return { success: false, error: '获取 Context7 邮件超时' }
        }
        if (mailResult.kind === 'existing_account') {
          sendLog('info', '检测到邮箱已在 Context7 注册，改为接口登录...')
          await closeBrowser()
          usedBrowser = false
          sessionForKey = await sessionFromPasswordLogin(email, password)
        } else {
          verificationCode = mailResult.code
        }
      }
      if (!sessionForKey && verificationCode) {
        sendLog('success', `验证码: ${verificationCode}`)
        const verified = await inputVerificationCode(verificationCode, browserOptions)
        if (!verified) {
          await closeBrowser()
          return { success: false, error: '验证失败' }
        }
        sessionForKey = await sessionAfterBrowserVerify(email, browserOptions)
        await closeBrowser()
        usedBrowser = false
        if (!sessionForKey) {
          sendLog('info', '尝试通过邮箱密码建立接口会话...')
          sessionForKey = await sessionFromPasswordLogin(email, password)
        }
      } else if (!sessionForKey) {
        await closeBrowser()
        return { success: false, error: 'Context7 会话未建立' }
      }
    }

    if (sessionForKey) {
      const kr = await createContext7DashboardApiKey(sessionForKey)
      if (kr.success === false) {
        sendLog('warning', userFacingNetworkMessage(kr.error))
      } else {
        apiKey = kr.apiKey
        apiKeyName = kr.keyName
        sendLog('success', `API Key 创建成功: ${apiKey.slice(0, 12)}****`)
      }
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

    if (!apiKey) {
      sendLog('warning', '未能通过接口创建 API Key，可稍后在 Dashboard 补绑')
    }
    return { success: false, error: '获取 API Key 失败' }
  } catch (error: unknown) {
    if (usedBrowser) await closeBrowser()
    const message = getErrorMessage(error)
    const shown = userFacingNetworkMessage(message)
    sendLog('error', `Context7 注册出错: ${shown}`)
    return { success: false, error: shown }
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
        const sent = await resendRefVerificationEmail({ email: acc.email, password: acc.password })
        if ('error' in sent) {
          const err = userFacingNetworkMessage(sent.error)
          sendLog('error', `发送验证邮件失败: ${err}`)
          return {
            credits: r.credits,
            emailVerified: r.emailVerified,
            error: `发送验证邮件失败: ${err}`
          }
        }
        verificationEmailSent = true
        sendLog('success', '验证邮件已发送')
        await delay(2000)
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
        const webApiKey = await resolveFirebaseWebApiKey()
        const signIn = await firebaseSignInWithPassword(webApiKey, acc.email, acc.password)
        if ('error' in signIn) {
          const err = userFacingNetworkMessage(signIn.error)
          sendLog('error', `Firebase 登录失败: ${err}`)
          return {
            credits: r.credits,
            emailVerified: r.emailVerified,
            error: err,
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
          const err = userFacingNetworkMessage(fin.error || 'Ref 验证失败')
          sendLog('error', err)
          return {
            credits: r.credits,
            emailVerified: false,
            error: err,
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
      sendLog('warning', '[账户管理] 批量刷新 Ref 额度已跳过：Ref 注册进行中')
      return { results: {}, error: 'Ref 注册进行中' }
    }
    const withRef = database.getAllAccounts().filter(a => a.refApiKey)
    sendLog('info', `[账户管理] 批量刷新 Ref 额度：${withRef.length} 个账号`)
    if (withRef.length > 0) {
      sendLog('info', '[账户管理] Ref：开始并行拉取（Firebase / 会话 / 额度）…')
    }
    const results = await fetchAllRefCredits(
      withRef.map(a => ({ id: a.id, email: a.email, password: a.password })),
      p => logAccountBatchStep('Ref', p)
    )
    if (withRef.length > 0) {
      sendLog('info', '[账户管理] Ref：拉取结束，写入本地数据库…')
    }
    for (const [idStr, r] of Object.entries(results)) {
      const id = Number(idStr)
      if (r.credits !== null) database.updateAccountRefCredits(id, r.credits)
      if (r.emailVerified === true || r.emailVerified === false) {
        database.updateAccountRefEmailVerified(id, r.emailVerified)
      }
    }
    const emailById = new Map(withRef.map(a => [a.id, a.email] as const))
    const missParts: string[] = []
    let ok = 0
    let miss = 0
    for (const [idStr, r] of Object.entries(results)) {
      if (r.credits !== null) {
        ok++
        continue
      }
      miss++
      const email = emailById.get(Number(idStr)) ?? `#${idStr}`
      missParts.push(r.error ? `${email}（${r.error}）` : email)
    }
    sendLog('success', `[账户管理] Ref 额度刷新完成：${ok} 成功，${miss} 未获取`)
    sendBatchMissLog('[账户管理] Ref 未获取', missParts)
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
      sendLog('warning', '[账户管理] 批量刷新 Context7 用量已跳过：Context7 注册进行中')
      return { results: {}, error: 'Context7 注册进行中' }
    }
    const withCtx = database.getAllAccounts().filter(a => a.apiKey)
    sendLog('info', `[账户管理] 批量刷新 Context7 用量：${withCtx.length} 个账号`)
    if (withCtx.length > 0) {
      sendLog('info', '[账户管理] Context7：开始并行拉取（会话校验 / Clerk / Dashboard 统计）…')
    }
    const results = await fetchAllContext7Requests(
      withCtx.map(a => ({ id: a.id, email: a.email, password: a.password })),
      p => logAccountBatchStep('Context7', p)
    )
    if (withCtx.length > 0) {
      sendLog('info', '[账户管理] Context7：拉取结束，写入本地数据库…')
    }
    for (const [idStr, r] of Object.entries(results)) {
      if (r.used !== null && r.limit !== null) {
        database.updateAccountContext7Requests(Number(idStr), r.used, r.limit)
      }
    }
    const emailById = new Map(withCtx.map(a => [a.id, a.email] as const))
    const missParts: string[] = []
    let ok = 0
    let miss = 0
    for (const [idStr, r] of Object.entries(results)) {
      if (r.used !== null && r.limit !== null) {
        ok++
        continue
      }
      miss++
      const email = emailById.get(Number(idStr)) ?? `#${idStr}`
      missParts.push(r.error ? `${email}（${r.error}）` : email)
    }
    sendLog('success', `[账户管理] Context7 用量刷新完成：${ok} 成功，${miss} 未获取`)
    sendBatchMissLog('[账户管理] Context7 未获取', missParts)
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
