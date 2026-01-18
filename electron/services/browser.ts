import { connect } from 'puppeteer-real-browser'

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
}

interface PuppeteerElement {
  click(options?: { clickCount?: number }): Promise<void>
  type(text: string, options?: { delay?: number }): Promise<void>
  evaluate<T>(fn: (el: Element) => T): Promise<T>
}

let browser: PuppeteerBrowser | null = null
let page: PuppeteerPage | null = null
let isRunning = false

const REGISTER_URL = 'https://context7.com/sign-up'

export async function initBrowser(options: BrowserServiceOptions): Promise<void> {
  if (browser) {
    await closeBrowser()
  }

  options.onLog('info', '正在启动浏览器...')
  
  try {
    // Turnstile 不支持 headless 模式，强制使用可见模式
    // 参考: https://github.com/chengazhen/cursor-auto-free
    // 使用 ignoreAllFlags: true 让库使用自己的优化参数，避免触发检测
    const response = await connect({
      headless: false, // 强制非 headless 模式，Turnstile 要求可见浏览器
      args: [], // 不传递额外参数，避免触发警告
      customConfig: {},
      turnstile: true,
      connectOption: {
        defaultViewport: null // 使用窗口大小作为视口
      },
      disableXvfb: false,
      ignoreAllFlags: true, // 使用库的默认参数，更好地绕过检测
    })

    browser = response.browser as PuppeteerBrowser
    page = response.page as PuppeteerPage

    // 设置视口大小
    await page.setViewport({ width: 1280, height: 800 })
    
    options.onLog('success', '浏览器启动成功')
    isRunning = true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    options.onLog('error', `浏览器启动失败: ${message}`)
    throw error
  }
}

export async function registerAccount(
  data: RegistrationData,
  options: BrowserServiceOptions
): Promise<boolean> {
  if (!page || !isRunning) {
    throw new Error('浏览器未初始化')
  }

  // Clerk 认证系统选择器
  const EMAIL_SELECTORS = [
    'input[name="emailAddress"]',
    'input[name="identifier"]', 
    'input[type="email"]',
    'input[name="email"]',
    'input[autocomplete="email"]',
    'input[autocomplete="username"]'
  ].join(', ')

  const PASSWORD_SELECTORS = [
    'input[type="password"]',
    'input[name="password"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]'
  ].join(', ')

  try {
    options.onLog('info', '正在打开注册页面...')
    await page.goto(REGISTER_URL, { waitUntil: 'networkidle2', timeout: 30000 })
    
    // Clerk 使用客户端渲染，等待更长时间确保组件加载完成
    await delay(3000)
    
    await page.waitForSelector(EMAIL_SELECTORS, { timeout: 20000 })
    options.onLog('success', '注册页面加载完成')

    await delay(1000)

    options.onLog('info', `填写邮箱: ${data.email}`)
    const emailInput = await page.$(EMAIL_SELECTORS)
    if (emailInput) {
      await emailInput.click({ clickCount: 3 })
      await delay(300)
      await emailInput.type(data.email, { delay: 80 })
    } else {
      throw new Error('未找到邮箱输入框')
    }

    await delay(800)

    options.onLog('info', '填写密码...')
    const passwordInputs = await page.$$(PASSWORD_SELECTORS)
    if (passwordInputs.length === 0) {
      throw new Error('未找到密码输入框')
    }
    for (const input of passwordInputs) {
      await input.click({ clickCount: 3 })
      await delay(300)
      await input.type(data.password, { delay: 80 })
    }

    await delay(800)

    const turnstileExists = await page.$('iframe[src*="challenges.cloudflare.com"], .cf-turnstile')
    if (turnstileExists) {
      options.onLog('warning', '检测到 Turnstile 验证，正在自动处理...')
      await waitForTurnstile(page, options)
      options.onLog('success', 'Turnstile 验证通过！')
    }

    options.onLog('info', '点击注册按钮...')
    
    // 使用 evaluate 在浏览器中直接点击按钮
    const clicked = await page.evaluate(() => {
      // 查找 Continue 按钮
      const buttons = Array.from(document.querySelectorAll('button'))
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i]
        const text = (btn.textContent || '').toLowerCase()
        if (text.includes('continue') || text.includes('sign up') || text.includes('submit')) {
          btn.click()
          return true
        }
      }
      // 查找 submit 类型按钮
      const submitBtn = document.querySelector('button[type="submit"]')
      if (submitBtn && submitBtn instanceof HTMLButtonElement) {
        submitBtn.click()
        return true
      }
      return false
    })
    
    if (!clicked) {
      throw new Error('未找到提交按钮')
    }

    await delay(3000)
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    
    options.onLog('success', '表单提交成功，等待验证码...')
    
    return true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    options.onLog('error', `注册过程出错: ${message}`)
    return false
  }
}

async function waitForTurnstile(targetPage: PuppeteerPage, options: BrowserServiceOptions): Promise<void> {
  const maxWait = 120000 // 增加到 120 秒
  const startTime = Date.now()

  // 等待 Turnstile 加载
  await delay(3000)

  while (Date.now() - startTime < maxWait) {
    // 检查是否有 Turnstile iframe
    const turnstileFrame = await targetPage.$('iframe[src*="challenges.cloudflare.com"], .cf-turnstile iframe')
    
    if (!turnstileFrame) {
      // 没有找到 Turnstile，可能已经验证通过或不需要验证
      return
    }

    // 检查是否已验证
    const isVerified = await targetPage.evaluate(() => {
      // 检查多种验证完成的标志
      const turnstileInput = document.querySelector('input[name="cf-turnstile-response"]')
      if (turnstileInput && turnstileInput instanceof HTMLInputElement) {
        return turnstileInput.value && turnstileInput.value.length > 0
      }
      // 检查是否有成功标志
      const successIndicator = document.querySelector('.cf-turnstile-success, [data-turnstile-success]')
      return !!successIndicator
    })

    if (isVerified) {
      options.onLog('success', 'Turnstile 验证完成')
      return
    }

    // 检查是否有错误
    const hasError = await targetPage.evaluate(() => {
      const errorIndicator = document.querySelector('.cf-turnstile-error, [data-turnstile-error]')
      return !!errorIndicator
    })

    if (hasError) {
      options.onLog('warning', 'Turnstile 验证出现错误，等待重试...')
    }

    await delay(1000)
  }

  throw new Error('Turnstile验证超时')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function inputVerificationCode(code: string, options: BrowserServiceOptions): Promise<boolean> {
  if (!page || !isRunning) {
    throw new Error('浏览器未初始化')
  }

  try {
    options.onLog('info', `输入验证码: ${code}`)
    
    await delay(2000)
    
    const codeInput = await page.$('input[name="code"], input[type="text"][maxlength="6"], input[placeholder*="验证码"], input[placeholder*="code"], input[autocomplete="one-time-code"]')
    
    if (codeInput) {
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
          if (text.includes('verify') || text.includes('confirm') || text.includes('continue') || text.includes('验证')) {
            await btn.click()
            break
          }
        }
      }

      await delay(2000)
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
      
      options.onLog('success', '验证码提交成功')
      return true
    } else {
      options.onLog('error', '未找到验证码输入框')
      return false
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    options.onLog('error', `验证码输入出错: ${message}`)
    return false
  }
}

export async function closeBrowser(): Promise<void> {
  isRunning = false
  if (browser) {
    try {
      await browser.close()
    } catch {
      // ignore
    }
    browser = null
    page = null
  }
}

export function stopRegistration(): void {
  isRunning = false
}

export function isRegistrationRunning(): boolean {
  return isRunning
}
