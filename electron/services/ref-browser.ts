import { connect } from 'puppeteer-real-browser'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

type LogType = 'success' | 'error' | 'warning' | 'info'

interface RefBrowserOptions {
  headless: boolean
  onLog: (type: LogType, message: string) => void
}

interface RefRegistrationData {
  email: string
  password: string
}

interface PuppeteerBrowser {
  close(): Promise<void>
}

interface PuppeteerPage {
  setViewport(viewport: { width: number; height: number }): Promise<void>
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>
  waitForNavigation(options?: { waitUntil?: string; timeout?: number }): Promise<unknown>
  $(selector: string): Promise<PuppeteerElement | null>
  evaluate<T>(fn: () => T): Promise<T>
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>
}

interface PuppeteerElement {
  click(): Promise<void>
  type(text: string): Promise<void>
}

export interface RefApiKeyResult {
  success: boolean
  apiKey?: string
  error?: string
}

let refBrowser: PuppeteerBrowser | null = null
let refPage: PuppeteerPage | null = null
let isRefRunning = false

const REF_URLS = {
  signup: 'https://ref.tools/signup',
  login: 'https://ref.tools/login',
  keys: 'https://ref.tools/keys'
} as const

const BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-dev-shm-usage',
  '--disable-infobars',
  '--window-size=1920,1080'
]

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const getErrorMessage = (error: unknown): string => 
  error instanceof Error ? error.message : '未知错误'

async function hideChrome(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await execAsync(`powershell -ExecutionPolicy Bypass -Command "
      Add-Type -Name Win -Namespace Native -MemberDefinition '
        [DllImport(\\\"user32.dll\\\")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
        [DllImport(\\\"user32.dll\\\")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
        [DllImport(\\\"user32.dll\\\")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
      ';
      Get-Process -Name chrome,chromium -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
        $h = $_.MainWindowHandle;
        [Native.Win]::MoveWindow($h, -3000, -3000, 1920, 1080, $true);
        $style = [Native.Win]::GetWindowLong($h, -20);
        [Native.Win]::SetWindowLong($h, -20, $style -bor 0x80);
      }
    "`)
  } catch {}
}

async function fillInput(selector: string, value: string, errorMsg: string): Promise<void> {
  if (!refPage) throw new Error('浏览器未初始化')
  const input = await refPage.$(selector)
  if (!input) throw new Error(errorMsg)
  await input.click()
  await input.type(value)
}

async function clickButtonByText(text: string): Promise<boolean> {
  if (!refPage) return false
  return refPage.evaluate((targetText: string) => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === targetText)
    if (btn) { btn.click(); return true }
    return false
  }, text)
}

async function getCurrentUrl(): Promise<string> {
  if (!refPage) return ''
  return refPage.evaluate(() => window.location.href)
}

async function getPageText(): Promise<string> {
  if (!refPage) return ''
  return refPage.evaluate(() => document.body.innerText)
}

export async function initRefBrowser(options: RefBrowserOptions): Promise<void> {
  if (refBrowser) await closeRefBrowser()

  const useHidden = options.headless
  const args = useHidden
    ? [...BROWSER_ARGS, '--window-position=-3000,-3000']
    : [...BROWSER_ARGS, '--start-maximized']

  options.onLog('info', `启动 Ref 浏览器 (${useHidden ? '后台' : '可见'})...`)

  const response = await connect({
    headless: false,
    args,
    customConfig: {},
    turnstile: true,
    fingerprint: true,
    connectOption: { defaultViewport: null },
    disableXvfb: false,
    ignoreAllFlags: false
  } as Parameters<typeof connect>[0])

  refBrowser = response.browser as PuppeteerBrowser
  refPage = response.page as PuppeteerPage

  await refPage.setViewport({ width: 1920, height: 1080 })
  await refPage.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })

  if (useHidden) {
    await delay(1500)
    await hideChrome()
    await delay(500)
    await hideChrome()
  }

  isRefRunning = true
  options.onLog('success', 'Ref 浏览器启动成功')
}

export async function registerRefAccount(data: RefRegistrationData, options: RefBrowserOptions): Promise<boolean> {
  if (!refPage || !isRefRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '打开 Ref 注册页面...')
    await refPage.goto(REF_URLS.signup, { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(1000)

    await refPage.waitForSelector('input[placeholder="Enter your email"]', { timeout: 20000 })
    options.onLog('success', '注册页面加载完成')

    options.onLog('info', `填写邮箱: ${data.email}`)
    await fillInput('input[placeholder="Enter your email"]', data.email, '未找到邮箱输入框')

    options.onLog('info', '填写密码...')
    await fillInput('input[placeholder="Create a password"]', data.password, '未找到密码输入框')

    options.onLog('info', '填写确认密码...')
    await fillInput('input[placeholder="Confirm your password"]', data.password, '未找到确认密码输入框')

    options.onLog('info', '点击注册按钮...')
    await refPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent?.trim().toLowerCase() === 'sign up')
      btn?.click()
    })

    await delay(2000)
    await refPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})

    const pageContent = await getPageText()
    if (pageContent.includes('already exists') || pageContent.includes('An account with this email')) {
      options.onLog('warning', '账户已存在，跳转登录页面...')
      return await loginRefAccount(data, options)
    }

    const url = await getCurrentUrl()
    if (url.includes('/dashboard') || url.includes('/keys') || url.includes('/account')) {
      options.onLog('success', 'Ref 注册成功')
      return true
    }

    options.onLog('success', '注册表单已提交')
    return true
  } catch (error: unknown) {
    options.onLog('error', `注册失败: ${getErrorMessage(error)}`)
    return false
  }
}

async function loginRefAccount(data: RefRegistrationData, options: RefBrowserOptions): Promise<boolean> {
  if (!refPage) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '打开登录页面...')
    await refPage.goto(REF_URLS.login, { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(1000)

    options.onLog('info', '填写登录信息...')
    await fillInput('input[placeholder="Enter your email"]', data.email, '未找到邮箱输入框')
    await fillInput('input[placeholder="Enter your password"]', data.password, '未找到密码输入框')

    options.onLog('info', '点击登录按钮...')
    const clicked = await clickButtonByText('Sign in with Email')

    if (!clicked) {
      options.onLog('warning', '未找到登录按钮，尝试提交表单...')
      await refPage.evaluate(() => document.querySelector('form')?.submit())
    }

    await delay(3000)
    await refPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})

    const url = await getCurrentUrl()
    if (url.includes('/dashboard') || url.includes('/keys') || url.includes('/account')) {
      options.onLog('success', '登录成功')
      return true
    }

    options.onLog('warning', '登录状态未知')
    return true
  } catch (error: unknown) {
    options.onLog('error', `登录失败: ${getErrorMessage(error)}`)
    return false
  }
}

export async function sendRefVerificationEmail(options: RefBrowserOptions): Promise<boolean> {
  if (!refPage || !isRefRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '发送验证邮件...')
    const clicked = await refPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Send Verification Email'))
      if (btn) { btn.click(); return true }
      return false
    })

    if (!clicked) {
      options.onLog('warning', '未找到发送验证邮件按钮')
      return false
    }

    await delay(2000)
    options.onLog('success', '验证邮件发送请求已提交')
    return true
  } catch (error: unknown) {
    options.onLog('error', `发送验证邮件失败: ${getErrorMessage(error)}`)
    return false
  }
}

export async function clickRefVerificationLink(url: string, options: RefBrowserOptions): Promise<boolean> {
  if (!refPage || !isRefRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '访问验证链接...')
    await refPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(3000)

    const content = (await getPageText()).toLowerCase()
    if (content.includes('verified') || content.includes('success') || content.includes('confirmed')) {
      options.onLog('success', '邮箱验证成功')
    } else {
      options.onLog('info', '验证完成')
    }
    return true
  } catch (error: unknown) {
    options.onLog('error', `验证失败: ${getErrorMessage(error)}`)
    return false
  }
}

export async function getRefApiKey(options: RefBrowserOptions): Promise<RefApiKeyResult> {
  if (!refPage || !isRefRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '进入 API Keys 页面...')
    await refPage.goto(REF_URLS.keys, { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(1500)

    options.onLog('info', '获取默认 API Key...')
    const apiKey = await refPage.evaluate(() => {
      const elements = Array.from(document.body.querySelectorAll('*'))
      for (const el of elements) {
        const text = (el as HTMLElement).textContent || ''
        if (/^ref-[a-f0-9]{20}$/i.test(text)) return text
      }
      return null
    })

    if (apiKey) {
      options.onLog('success', `API Key: ${apiKey.slice(0, 15)}****`)
      return { success: true, apiKey }
    }

    options.onLog('warning', '未找到 API Key')
    return { success: false, error: '未找到 API Key' }
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    options.onLog('error', `获取 API Key 失败: ${message}`)
    return { success: false, error: message }
  }
}

export async function closeRefBrowser(): Promise<void> {
  if (refBrowser) {
    try { await refBrowser.close() } catch {}
    refBrowser = null
    refPage = null
  }
  isRefRunning = false
}

export function isRefRegistrationRunning(): boolean {
  return isRefRunning
}
