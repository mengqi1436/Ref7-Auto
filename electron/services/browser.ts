import { connect } from 'puppeteer-real-browser'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

type LogType = 'success' | 'error' | 'warning' | 'info'

interface BrowserServiceOptions {
  headless: boolean
  onLog: (type: LogType, message: string) => void
}

interface RegistrationData {
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

export interface Context7ApiKeyResult {
  success: boolean
  apiKey?: string
  keyName?: string
  requestsUsed?: number
  requestsLimit?: number
}

let browser: PuppeteerBrowser | null = null
let page: PuppeteerPage | null = null
let isRunning = false

const REGISTER_URL = 'https://context7.com/sign-up'
const DASHBOARD_URL = 'https://context7.com/dashboard'
const TURNSTILE_TIMEOUT = 120000

const BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-dev-shm-usage',
  '--disable-infobars',
  '--window-size=1920,1080'
]

const SELECTORS = {
  email: 'input[name="emailAddress"], input[name="identifier"], input[type="email"], input[name="email"], input[autocomplete="email"], input[autocomplete="username"]',
  password: 'input[type="password"], input[name="password"], input[autocomplete="current-password"], input[autocomplete="new-password"]',
  code: 'input[name="code"], input[type="text"][maxlength="6"], input[placeholder*="验证码"], input[placeholder*="code"], input[autocomplete="one-time-code"]'
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const humanDelay = (min: number, max: number) => delay(Math.floor(Math.random() * (max - min + 1)) + min)
const getTypingDelay = () => Math.floor(Math.random() * 80) + 50
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : '未知错误'

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))])
}

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

async function killChromeProcesses(): Promise<void> {
  try {
    const cmd = process.platform === 'win32'
      ? 'taskkill /F /IM chrome.exe /T 2>nul'
      : 'pkill -9 chrome 2>/dev/null || true'
    await execAsync(cmd)
  } catch {}
}

async function simulateHumanBehavior(targetPage: PuppeteerPage): Promise<void> {
  try {
    const x = Math.floor(Math.random() * 800) + 100
    const y = Math.floor(Math.random() * 600) + 100
    await withTimeout(targetPage.mouse.move(x, y), 1000, undefined)
    await humanDelay(50, 150)
  } catch {}
}

async function humanClick(element: PuppeteerElement, targetPage: PuppeteerPage): Promise<void> {
  try {
    const box = await withTimeout(element.boundingBox(), 2000, null)
    if (box) {
      const x = box.x + box.width / 2 + (Math.random() * 10 - 5)
      const y = box.y + box.height / 2 + (Math.random() * 10 - 5)
      await withTimeout(targetPage.mouse.move(x, y), 1000, undefined)
      await humanDelay(50, 150)
    }
  } catch {}
  await element.click()
}

async function clickButtonByText(patterns: string[]): Promise<boolean> {
  if (!page) return false
  return page.evaluate((pats: string[]) => {
    const buttons = Array.from(document.querySelectorAll('button'))
    for (const btn of buttons) {
      const text = (btn.textContent || '').toLowerCase()
      if (pats.some(p => text.includes(p))) {
        btn.click()
        return true
      }
    }
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement
    if (submitBtn) { submitBtn.click(); return true }
    return false
  }, patterns)
}

async function waitForTurnstile(targetPage: PuppeteerPage, options: BrowserServiceOptions): Promise<void> {
  const startTime = Date.now()
  await humanDelay(2000, 4000)

  while (Date.now() - startTime < TURNSTILE_TIMEOUT) {
    await simulateHumanBehavior(targetPage)

    const turnstileFrame = await targetPage.$('iframe[src*="challenges.cloudflare.com"], .cf-turnstile iframe')
    if (!turnstileFrame) return

    const isVerified = await targetPage.evaluate(() => {
      const input = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement
      if (input?.value) return true
      return !!document.querySelector('.cf-turnstile-success, [data-turnstile-success]')
    })

    if (isVerified) {
      options.onLog('success', 'Turnstile 验证完成')
      return
    }

    const hasError = await targetPage.evaluate(() =>
      !!document.querySelector('.cf-turnstile-error, [data-turnstile-error]')
    )
    if (hasError) options.onLog('warning', 'Turnstile 验证出现错误，等待重试...')

    await humanDelay(800, 1500)
  }

  throw new Error('Turnstile验证超时')
}

export async function initBrowser(options: BrowserServiceOptions): Promise<void> {
  if (browser) {
    options.onLog('info', '正在关闭旧浏览器实例...')
    await closeBrowser()
  }

  const useHidden = options.headless
  const args = useHidden
    ? [...BROWSER_ARGS, '--window-position=-3000,-3000']
    : [...BROWSER_ARGS, '--start-maximized']

  options.onLog('info', `正在启动新浏览器 (${useHidden ? '后台模式' : '可见模式'})...`)

  try {
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

    browser = response.browser as PuppeteerBrowser
    page = response.page as PuppeteerPage

    await page.setViewport({ width: 1920, height: 1080 })
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7' })

    if (useHidden) {
      options.onLog('info', '正在隐藏浏览器窗口...')
      await delay(1500)
      await hideChrome()
      await delay(500)
      await hideChrome()
      options.onLog('success', '浏览器启动成功（已隐藏到后台）')
    } else {
      options.onLog('success', '浏览器启动成功（新指纹）')
    }
    isRunning = true
  } catch (error: unknown) {
    options.onLog('error', `浏览器启动失败: ${getErrorMessage(error)}`)
    throw error
  }
}

export async function registerAccount(data: RegistrationData, options: BrowserServiceOptions): Promise<boolean> {
  if (!page || !isRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '正在打开注册页面...')
    await page.goto(REGISTER_URL, { waitUntil: 'networkidle2', timeout: 30000 })
    await humanDelay(2000, 4000)
    await simulateHumanBehavior(page)

    await page.waitForSelector(SELECTORS.email, { timeout: 20000 })
    options.onLog('success', '注册页面加载完成')
    await humanDelay(500, 1500)

    options.onLog('info', `填写邮箱: ${data.email}`)
    const emailInput = await page.$(SELECTORS.email)
    if (!emailInput) throw new Error('未找到邮箱输入框')

    await humanClick(emailInput, page)
    await humanDelay(200, 400)
    await emailInput.click({ clickCount: 3 })
    await humanDelay(100, 300)
    await emailInput.type(data.email, { delay: getTypingDelay() })
    await humanDelay(500, 1000)
    await simulateHumanBehavior(page)

    options.onLog('info', '填写密码...')
    const passwordInputs = await page.$$(SELECTORS.password)
    if (passwordInputs.length === 0) throw new Error('未找到密码输入框')

    for (const input of passwordInputs) {
      await humanClick(input, page)
      await humanDelay(100, 300)
      await input.click({ clickCount: 3 })
      await humanDelay(100, 200)
      await input.type(data.password, { delay: getTypingDelay() })
    }
    await humanDelay(500, 1000)
    await simulateHumanBehavior(page)

    const turnstileExists = await page.$('iframe[src*="challenges.cloudflare.com"], .cf-turnstile')
    if (turnstileExists) {
      options.onLog('warning', '检测到 Turnstile 验证，正在自动处理...')
      await waitForTurnstile(page, options)
      options.onLog('success', 'Turnstile 验证通过！')
    }

    options.onLog('info', '点击注册按钮...')
    await humanDelay(300, 800)

    const clicked = await clickButtonByText(['continue', 'sign up', 'submit'])
    if (!clicked) throw new Error('未找到提交按钮')

    await humanDelay(2000, 4000)
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    options.onLog('success', '表单提交成功，等待验证码...')

    return true
  } catch (error: unknown) {
    options.onLog('error', `注册过程出错: ${getErrorMessage(error)}`)
    return false
  }
}

export async function inputVerificationCode(code: string, options: BrowserServiceOptions): Promise<boolean> {
  if (!page || !isRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', `输入验证码: ${code}`)
    await delay(2000)

    const codeInput = await page.$(SELECTORS.code)
    if (!codeInput) {
      options.onLog('error', '未找到验证码输入框')
      return false
    }

    await codeInput.click({ clickCount: 3 })
    await delay(200)
    await codeInput.type(code, { delay: 100 })
    await delay(500)

    const verifyButton = await page.$('button[type="submit"]')
    if (verifyButton) {
      await verifyButton.click()
    } else {
      const allButtons = await page.$$('button')
      for (const btn of allButtons) {
        const text = await btn.evaluate(el => el.textContent?.toLowerCase() || '')
        if (['verify', 'confirm', 'continue', '验证'].some(k => text.includes(k))) {
          await btn.click()
          break
        }
      }
    }

    await delay(1000)
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
    options.onLog('success', '验证码提交成功')
    return true
  } catch (error: unknown) {
    options.onLog('error', `验证码输入出错: ${getErrorMessage(error)}`)
    return false
  }
}

export async function createContext7ApiKey(options: BrowserServiceOptions): Promise<Context7ApiKeyResult> {
  if (!page || !isRunning) throw new Error('浏览器未初始化')

  try {
    options.onLog('info', '正在进入 Dashboard 获取 API Key...')
    await humanDelay(2000, 3000)

    const currentUrl = await page.evaluate(() => window.location.href)
    options.onLog('info', `当前页面: ${currentUrl}`)

    if (!currentUrl.includes('/dashboard')) {
      options.onLog('info', '点击 Dashboard 按钮...')
      const dashboardClicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button, a'))
          .find(b => (b.textContent || '').toLowerCase().includes('dashboard'))
        if (btn) { (btn as HTMLElement).click(); return true }
        return false
      })

      if (!dashboardClicked) {
        options.onLog('info', '直接导航到 Dashboard 页面...')
        await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle2', timeout: 30000 })
      }
      await humanDelay(2000, 4000)
    }

    options.onLog('info', 'Dashboard 页面加载中...')
    await delay(3000)

    const quotaInfo = await page.evaluate(() => {
      const text = document.body.innerText
      const match = text.match(/(\d+)\/(\d+,?\d*)/)
      return match
        ? { used: parseInt(match[1]), limit: parseInt(match[2].replace(',', '')) }
        : { used: 0, limit: 1000 }
    })

    options.onLog('info', `API 配额: ${quotaInfo.used}/${quotaInfo.limit}`)
    options.onLog('info', '查找 Create API Key 按钮...')

    const createButtonClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => (b.textContent || '').toLowerCase().includes('create api key'))
      if (btn) { btn.click(); return true }
      return false
    })

    if (!createButtonClicked) {
      options.onLog('error', '未找到 Create API Key 按钮')
      return { success: false }
    }

    options.onLog('info', '已点击 Create API Key 按钮')
    await humanDelay(1500, 2500)

    const keyName = generateRandomName()
    options.onLog('info', `输入 API Key 名称: ${keyName}`)

    const inputFound = await page.evaluate((name: string) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
      for (const input of inputs) {
        const placeholder = (input as HTMLInputElement).placeholder || ''
        const label = input.closest('form')?.querySelector('label')?.textContent || ''
        if (placeholder.toLowerCase().includes('key') || placeholder.toLowerCase().includes('name') ||
            label.toLowerCase().includes('key') || label.toLowerCase().includes('name')) {
          (input as HTMLInputElement).value = name
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        }
      }
      const visibleInput = document.querySelector('dialog input, [role="dialog"] input, .modal input') as HTMLInputElement
      if (visibleInput) {
        visibleInput.value = name
        visibleInput.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      }
      return false
    }, keyName)

    if (!inputFound) {
      const dialogInput = await page.$('input[type="text"], dialog input, [role="dialog"] input')
      if (dialogInput) {
        await dialogInput.click({ clickCount: 3 })
        await humanDelay(100, 200)
        await dialogInput.type(keyName, { delay: getTypingDelay() })
      }
    }

    await humanDelay(500, 800)
    options.onLog('info', '确认创建 API Key...')

    const confirmClicked = await confirmCreateApiKey(options)
    if (!confirmClicked) {
      options.onLog('error', '未找到确认创建按钮')
      return { success: false }
    }

    await delay(500)
    options.onLog('info', '等待 API Key 生成...')

    const apiKeyResult = await extractApiKey(options)

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => ['done', 'close', 'ok'].includes((b.textContent || '').toLowerCase().trim()))
      if (btn) (btn as HTMLElement).click()
    })

    await humanDelay(1000, 2000)

    if (apiKeyResult) {
      options.onLog('success', `API Key 获取成功: ${apiKeyResult.slice(0, 12)}****`)
      return { success: true, apiKey: apiKeyResult, keyName, ...quotaInfo }
    }

    options.onLog('warning', '未能获取到完整的 API Key')
    return { success: true, keyName, ...quotaInfo }
  } catch (error: unknown) {
    options.onLog('error', `获取 API Key 出错: ${getErrorMessage(error)}`)
    return { success: false }
  }
}

async function confirmCreateApiKey(options: BrowserServiceOptions): Promise<boolean> {
  if (!page) return false

  const result = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    
    const cancelBtn = buttons.find(btn => (btn.textContent || '').trim().toLowerCase() === 'cancel')
    if (cancelBtn?.parentElement) {
      const sibling = Array.from(cancelBtn.parentElement.querySelectorAll('button'))
        .find(b => {
          const t = (b.textContent || '').trim().toLowerCase()
          return t !== 'cancel' && t.includes('create')
        })
      if (sibling) { (sibling as HTMLElement).click(); return { clicked: true, text: sibling.textContent } }
    }

    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase()
      const isPrimary = btn.className.toLowerCase().match(/primary|success|green|bg-/)
      if (text === 'create api key' && isPrimary) {
        btn.click()
        return { clicked: true, text }
      }
    }

    const createBtns = buttons.filter(btn => (btn.textContent || '').trim().toLowerCase() === 'create api key')
    if (createBtns.length > 0) {
      const lastBtn = createBtns[createBtns.length - 1]
      ;(lastBtn as HTMLElement).click()
      return { clicked: true, text: 'create api key' }
    }

    return { clicked: false, text: '' }
  })

  if (result.clicked) {
    options.onLog('info', `点击按钮: "${result.text}"`)
    return true
  }

  const allButtons = await page.$$('button')
  for (const btn of allButtons) {
    const info = await btn.evaluate(el => ({
      text: (el.textContent || '').trim(),
      visible: (el as HTMLElement).offsetParent !== null
    }))
    if (info.text.toLowerCase() === 'create api key' && info.visible) {
      await humanClick(btn, page)
      options.onLog('info', `Puppeteer 点击: "${info.text}"`)
      return true
    }
  }

  return false
}

async function extractApiKey(options: BrowserServiceOptions): Promise<string | null> {
  if (!page) return null

  for (let attempt = 0; attempt < 5; attempt++) {
    await humanDelay(1500, 2000)

    const apiKey = await page.evaluate(() => {
      const text = document.body.innerText
      const match = text.match(/ctx7sk-[a-zA-Z0-9-]{20,}/)
      if (match) return match[0]

      const elements = Array.from(document.querySelectorAll('code, pre, input[readonly], input[type="text"], .api-key, [class*="key"]'))
      for (const el of elements) {
        const content = (el as HTMLElement).innerText || (el as HTMLInputElement).value || ''
        const keyMatch = content.match(/ctx7sk-[a-zA-Z0-9-]{20,}/)
        if (keyMatch) return keyMatch[0]
      }
      return null
    })

    if (apiKey) {
      options.onLog('info', `第 ${attempt + 1} 次尝试获取成功`)
      return apiKey
    }
    options.onLog('info', `第 ${attempt + 1} 次尝试未获取到 API Key，继续等待...`)
  }

  return null
}

function generateRandomName(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 5 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('')
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    try { await browser.close() } catch {}
    browser = null
    page = null
  }
  await killChromeProcesses()
  await delay(2000)
}

export function startRegistration(): void { isRunning = true }
export function stopRegistration(): void { isRunning = false }
export function isRegistrationRunning(): boolean { return isRunning }
