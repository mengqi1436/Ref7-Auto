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
  $$(selector: string): Promise<PuppeteerElement[]>
  evaluate<T>(fn: () => T): Promise<T>
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>
  mouse: { move(x: number, y: number): Promise<void> }
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>
}

interface PuppeteerElement {
  click(options?: { clickCount?: number }): Promise<void>
  type(text: string, options?: { delay?: number }): Promise<void>
  evaluate<T>(fn: (el: Element) => T): Promise<T>
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>
}

export interface RefApiKeyResult {
  success: boolean
  apiKey?: string
  error?: string
}

let refBrowser: PuppeteerBrowser | null = null
let refPage: PuppeteerPage | null = null
let isRefRunning = false

const REF_SIGNUP_URL = 'https://ref.tools/signup'
const REF_LOGIN_URL = 'https://ref.tools/login'
const REF_API_KEYS_URL = 'https://ref.tools/keys'

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

async function hideChrome(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    const cmd = `powershell -ExecutionPolicy Bypass -Command "
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
    "`
    await execAsync(cmd)
  } catch {}
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
    await refPage.goto(REF_SIGNUP_URL, { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(1000)

    const emailSelector = 'input[placeholder="Enter your email"]'
    await refPage.waitForSelector(emailSelector, { timeout: 20000 })
    options.onLog('success', '注册页面加载完成')

    // 填写邮箱 - 直接输入，不模拟
    options.onLog('info', `填写邮箱: ${data.email}`)
    const emailInput = await refPage.$(emailSelector)
    if (!emailInput) throw new Error('未找到邮箱输入框')
    await emailInput.click()
    await emailInput.type(data.email)

    // 填写密码
    options.onLog('info', '填写密码...')
    const passwordInput = await refPage.$('input[placeholder="Create a password"]')
    if (!passwordInput) throw new Error('未找到密码输入框')
    await passwordInput.click()
    await passwordInput.type(data.password)

    // 填写确认密码
    options.onLog('info', '填写确认密码...')
    const confirmInput = await refPage.$('input[placeholder="Confirm your password"]')
    if (!confirmInput) throw new Error('未找到确认密码输入框')
    await confirmInput.click()
    await confirmInput.type(data.password)

    // 点击注册按钮
    options.onLog('info', '点击注册按钮...')
    await refPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const signupBtn = buttons.find(btn => btn.textContent?.trim().toLowerCase() === 'sign up')
      signupBtn?.click()
    })

    await delay(2000)
    await refPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})

    // 检查是否账户已存在
    const pageContent = await refPage.evaluate(() => document.body.innerText)
    if (pageContent.includes('already exists') || pageContent.includes('An account with this email')) {
      options.onLog('warning', '账户已存在，跳转登录页面...')
      return await loginRefAccount(data, options)
    }

    const url = await refPage.evaluate(() => window.location.href)
    if (url.includes('/dashboard') || url.includes('/keys') || url.includes('/account')) {
      options.onLog('success', 'Ref 注册成功')
      return true
    }

    options.onLog('success', '注册表单已提交')
    return true
  } catch (error: unknown) {
    options.onLog('error', `注册失败: ${error instanceof Error ? error.message : '未知错误'}`)
    return false
  }
}

async function loginRefAccount(data: RefRegistrationData, options: RefBrowserOptions): Promise<boolean> {
  if (!refPage) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '打开登录页面...')
    await refPage.goto(REF_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(1000)

    // 填写登录信息 - 使用精确的 placeholder 选择器
    options.onLog('info', '填写登录信息...')
    const emailInput = await refPage.$('input[placeholder="Enter your email"]')
    const passwordInput = await refPage.$('input[placeholder="Enter your password"]')

    if (!emailInput || !passwordInput) throw new Error('未找到登录表单')

    await emailInput.click()
    await emailInput.type(data.email)

    await passwordInput.click()
    await passwordInput.type(data.password)

    // 点击 "Sign in with Email" 按钮 - 使用精确文本匹配
    options.onLog('info', '点击登录按钮...')
    const clicked = await refPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      // 精确查找文本为 "Sign in with Email" 的按钮
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i]
        const text = btn.textContent?.trim() || ''
        // 精确匹配，排除 GitHub/Google/SSO 按钮
        if (text === 'Sign in with Email') {
          btn.click()
          return true
        }
      }
      return false
    })

    if (!clicked) {
      options.onLog('warning', '未找到 Sign in with Email 按钮，尝试提交表单...')
      // 备选：直接按 Enter 提交表单
      await refPage.evaluate(() => {
        const form = document.querySelector('form')
        if (form) form.submit()
      })
    }

    await delay(3000)
    await refPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})

    const url = await refPage.evaluate(() => window.location.href)
    if (url.includes('/dashboard') || url.includes('/keys') || url.includes('/account')) {
      options.onLog('success', '登录成功')
      return true
    }

    options.onLog('warning', '登录状态未知')
    return true
  } catch (error: unknown) {
    options.onLog('error', `登录失败: ${error instanceof Error ? error.message : '未知错误'}`)
    return false
  }
}

export async function sendRefVerificationEmail(options: RefBrowserOptions): Promise<boolean> {
  if (!refPage || !isRefRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '发送验证邮件...')

    const clicked = await refPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const btn = buttons.find(b => b.textContent?.includes('Send Verification Email'))
      if (btn) {
        btn.click()
        return true
      }
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
    options.onLog('error', `发送验证邮件失败: ${error instanceof Error ? error.message : '未知错误'}`)
    return false
  }
}

export async function clickRefVerificationLink(url: string, options: RefBrowserOptions): Promise<boolean> {
  if (!refPage || !isRefRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '访问验证链接...')
    await refPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(3000)

    const content = await refPage.evaluate(() => document.body.innerText.toLowerCase())
    if (content.includes('verified') || content.includes('success') || content.includes('confirmed')) {
      options.onLog('success', '邮箱验证成功')
      return true
    }

    options.onLog('info', '验证完成')
    return true
  } catch (error: unknown) {
    options.onLog('error', `验证失败: ${error instanceof Error ? error.message : '未知错误'}`)
    return false
  }
}

export async function getRefApiKey(options: RefBrowserOptions): Promise<RefApiKeyResult> {
  if (!refPage || !isRefRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '进入 API Keys 页面...')

    // 直接访问 API Keys 页面
    await refPage.goto(REF_API_KEYS_URL, { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(1500)

    options.onLog('info', '获取默认 API Key...')

    // 查找页面中以 ref- 开头的完整 API Key (格式: ref- + 20位十六进制 = 24字符)
    const apiKey = await refPage.evaluate(() => {
      const elements = Array.from(document.body.querySelectorAll('*'))
      for (let i = 0; i < elements.length; i++) {
        const text = (elements[i] as HTMLElement).textContent || ''
        if (text.startsWith('ref-') && text.length === 24 && /^ref-[a-f0-9]{20}$/i.test(text)) {
          return text
        }
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
    const message = error instanceof Error ? error.message : '未知错误'
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
