import { ipcMain, BrowserWindow, dialog } from 'electron'
import * as database from '../services/database'
import { 
  initBrowser, 
  registerAccount, 
  inputVerificationCode,
  closeBrowser,
  stopRegistration,
  isRegistrationRunning
} from '../services/browser'
import { TempMailPlusService } from '../services/email/tempmailplus'
import { ImapMailService } from '../services/email/imap'
import fs from 'fs'

type AccountStatus = 'active' | 'pending' | 'invalid'
type LogType = 'success' | 'error' | 'warning' | 'info'
type EmailType = 'tempmail_plus' | 'imap'

interface RegistrationConfig {
  emailType: EmailType
  count: number
  passwordLength: number
  intervalMin: number
  intervalMax: number
  showBrowser: boolean
}

let mainWindow: BrowserWindow | null = null

export async function registerIpcHandlers(window: BrowserWindow): Promise<void> {
  mainWindow = window
  await database.initDatabase()

  ipcMain.handle('accounts:getAll', () => database.getAllAccounts())
  ipcMain.handle('accounts:add', (_, account) => database.addAccount(account))
  ipcMain.handle('accounts:delete', (_, id) => database.deleteAccount(id))
  ipcMain.handle('accounts:deleteMany', (_, ids: number[]) => database.deleteAccounts(ids))
  ipcMain.handle('accounts:updateStatus', (_, id: number, status: AccountStatus) => database.updateAccountStatus(id, status))
  
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
    console.log('收到IMAP测试请求:', { 
      server: config?.server, 
      port: config?.port, 
      user: config?.user,
      passLength: config?.pass?.length 
    })
    try {
      const service = new ImapMailService(config)
      const result = await service.testConnection()
      console.log('IMAP测试结果:', result)
      return result
    } catch (err) {
      console.error('IMAP测试异常:', err)
      return false
    }
  })

  ipcMain.handle('register:start', async (_, config: RegistrationConfig) => {
    const settings = database.getSettings()
    
    const onLog = (type: LogType, message: string) => {
      mainWindow?.webContents.send('register:log', {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type,
        message
      })
    }

    try {
      await initBrowser({ headless: !config.showBrowser, onLog })

      for (let i = 0; i < config.count; i++) {
        if (!isRegistrationRunning()) {
          onLog('warning', '注册已被用户停止')
          break
        }

        onLog('info', `[${i + 1}/${config.count}] 开始注册第 ${i + 1} 个账户...`)

        let email: string
        let emailService: TempMailPlusService | ImapMailService | null = null

        if (config.emailType === 'tempmail_plus') {
          emailService = new TempMailPlusService(settings.tempMailPlus)
          email = emailService.getEmail()
          onLog('success', `邮箱: ${email}`)
        } else {
          emailService = new ImapMailService(settings.imapMail)
          email = generateRandomEmail(settings.domain || settings.imapMail.domain)
          onLog('info', `生成邮箱: ${email}`)
        }

        const password = generatePassword(config.passwordLength)

        const success = await registerAccount({ email, password }, { 
          headless: !config.showBrowser, 
          onLog 
        })

        if (!success) {
          onLog('error', `账户 ${email} 注册失败`)
          continue
        }

        onLog('info', '等待验证码邮件...')
        let verificationCode: string | null = null

        if (config.emailType === 'tempmail_plus' && emailService instanceof TempMailPlusService) {
          verificationCode = await emailService.getVerificationCode()
        } else if (emailService instanceof ImapMailService) {
          verificationCode = await emailService.getVerificationCode(email, settings.registration.timeout * 1000)
        }

        if (!verificationCode) {
          onLog('error', '获取验证码超时')
          continue
        }

        onLog('success', `验证码: ${verificationCode}`)

        const verified = await inputVerificationCode(verificationCode, { 
          headless: !config.showBrowser, 
          onLog 
        })

        if (verified) {
          const account = database.addAccount({
            email,
            password,
            emailType: config.emailType,
            status: 'active'
          })
          
          mainWindow?.webContents.send('register:complete', account)
          onLog('success', `账户 ${email} 注册成功！`)
        } else {
          onLog('error', `账户 ${email} 验证失败`)
        }

        if (i < config.count - 1 && isRegistrationRunning()) {
          const interval = randomInt(config.intervalMin, config.intervalMax)
          onLog('info', `等待 ${interval} 秒后继续...`)
          await delay(interval * 1000)
        }
      }

      onLog('success', '批量注册任务完成')
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误'
      mainWindow?.webContents.send('register:error', message)
    } finally {
      await closeBrowser()
    }
  })

  ipcMain.handle('register:stop', async () => {
    stopRegistration()
    await closeBrowser()
  })
}

function generateRandomEmail(domain: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let username = ''
  for (let i = 0; i < 8; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  username += Date.now().toString(36)
  
  const cleanDomain = domain.startsWith('@') ? domain : `@${domain}`
  return `${username}${cleanDomain}`
}

function generatePassword(length: number): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const symbols = '!@#$%^&*'
  const all = uppercase + lowercase + numbers + symbols
  
  let password = ''
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += symbols[Math.floor(Math.random() * symbols.length)]
  
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
