import Imap from 'imap'
import { simpleParser } from 'mailparser'
import type { Readable } from 'stream'

interface ImapMailConfig {
  server: string
  port: number
  user: string
  pass: string
  dir: string
  protocol: 'IMAP' | 'POP3'
}

type ImapSearchCriteria = (string | [string, string | Date])[]

export class ImapMailService {
  private config: ImapMailConfig
  private onLog?: (type: string, message: string) => void

  constructor(config: ImapMailConfig, onLog?: (type: string, message: string) => void) {
    this.config = config
    this.onLog = onLog
  }

  private log(type: string, message: string) {
    this.onLog?.(type, message)
  }

  async testConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(false), 20000)

      try {
        const imap = this.createConnection()

        imap.once('ready', () => {
          clearTimeout(timeoutId)
          try { imap.end() } catch {}
          resolve(true)
        })

        imap.once('error', () => {
          clearTimeout(timeoutId)
          try { imap.end() } catch {}
          resolve(false)
        })

        imap.once('end', () => clearTimeout(timeoutId))
        imap.connect()
      } catch {
        clearTimeout(timeoutId)
        resolve(false)
      }
    })
  }

  async getVerificationCode(targetEmail: string, timeout = 10000): Promise<string | null> {
    try {
      return await Promise.race([
        this.checkLatestMail(targetEmail),
        new Promise<null>(resolve => setTimeout(() => resolve(null), timeout))
      ])
    } catch {
      return null
    }
  }

  private async checkLatestMail(targetEmail: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => resolve(null), 8000)
      const imap = this.createConnection()

      imap.once('ready', () => {
        imap.openBox(this.config.dir || 'INBOX', false, (err) => {
          if (err) {
            clearTimeout(timeoutId)
            imap.end()
            return reject(err)
          }

          const since = new Date(Date.now() - 5 * 60 * 1000)
          // 搜索来自 Context7 的邮件
          const searchCriteria: ImapSearchCriteria = [['FROM', 'notifications@context7.com'], ['SINCE', since]]

          imap.search(searchCriteria, (err, results) => {
            if (err || !results?.length) {
              // 如果没找到，尝试搜索所有最近的未读邮件
              imap.search(['UNSEEN', ['SINCE', since]], (err2, results2) => {
                if (err2 || !results2?.length) {
                  // 最后尝试搜索所有最近邮件
                  imap.search(['ALL', ['SINCE', since]], (err3, results3) => {
                    if (err3 || !results3?.length) {
                      clearTimeout(timeoutId)
                      imap.end()
                      return resolve(null)
                    }
                    this.processLatestMail(imap, results3, targetEmail, timeoutId, resolve)
                  })
                  return
                }
                this.processLatestMail(imap, results2, targetEmail, timeoutId, resolve)
              })
              return
            }

            this.processLatestMail(imap, results, targetEmail, timeoutId, resolve)
          })
        })
      })

      imap.once('error', (err: Error) => {
        clearTimeout(timeoutId)
        reject(err)
      })

      imap.connect()
    })
  }

  private processLatestMail(
    imap: Imap,
    results: number[],
    targetEmail: string,
    timeoutId: NodeJS.Timeout,
    resolve: (value: string | null) => void
  ) {
    // 从最新的邮件开始检查
    const sortedResults = [...results].reverse()

    const checkNext = (index: number) => {
      if (index >= sortedResults.length) {
        clearTimeout(timeoutId)
        imap.end()
        return resolve(null)
      }

      const msgId = sortedResults[index]
      const fetch = imap.fetch([msgId], { bodies: '' })

      fetch.on('message', (msg) => {
        msg.on('body', (stream: Readable) => {
          simpleParser(stream, (err, parsed) => {
            if (err) {
              checkNext(index + 1)
              return
            }

            // 检查是否是 Context7 的邮件
            const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase() || ''
            const fromText = parsed.from?.text?.toLowerCase() || ''
            const subject = parsed.subject?.toLowerCase() || ''
            const isContext7Mail = fromAddress === 'notifications@context7.com' ||
                                   fromText.includes('context7') ||
                                   fromText.includes('clerk') ||
                                   subject.includes('verification') ||
                                   subject.includes('code')

            // 检查收件人匹配或内容包含目标邮箱
            const matchesTarget = this.matchesRecipient(parsed, targetEmail)
            const content = this.extractContent(parsed)
            const contentHasEmail = content.toLowerCase().includes(targetEmail.toLowerCase())

            // 如果是 Context7 邮件，直接提取验证码（不严格检查收件人）
            if (isContext7Mail) {
              const cleanContent = content.replace(new RegExp(targetEmail, 'gi'), '')
              const code = this.extractVerificationCode(cleanContent)

              if (code) {
                clearTimeout(timeoutId)
                imap.addFlags([msgId], ['\\Seen', '\\Deleted'], () => {
                  imap.expunge(() => {
                    imap.end()
                    resolve(code)
                  })
                })
                return
              }
            }

            // 继续检查下一封邮件
            checkNext(index + 1)
          })
        })
      })

      fetch.once('error', () => {
        checkNext(index + 1)
      })
    }

    checkNext(0)
  }

  private createConnection(): Imap {
    return new Imap({
      user: this.config.user,
      password: this.config.pass,
      host: this.config.server || 'imap.qq.com',
      port: this.config.port || 993,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false,
        servername: this.config.server || 'imap.qq.com'
      },
      connTimeout: 10000,
      authTimeout: 10000
    })
  }

  private matchesRecipient(parsed: any, targetEmail: string): boolean {
    const addresses = this.extractEmailAddresses(parsed)

    const headers = parsed.headers
    const originalTo = headers?.get('x-original-to') as string | undefined
    const deliveredTo = headers?.get('delivered-to') as string | undefined

    if (originalTo) addresses.push(originalTo.toLowerCase())
    if (deliveredTo) addresses.push(deliveredTo.toLowerCase())

    return addresses.some(addr => addr.toLowerCase().includes(targetEmail.toLowerCase()))
  }

  private extractEmailAddresses(parsed: any): string[] {
    const addresses: string[] = []

    const processField = (field: any) => {
      if (!field) return

      if (Array.isArray(field)) {
        field.forEach(item => {
          if (item?.value) {
            item.value.forEach((addr: any) => {
              if (addr?.address) addresses.push(addr.address.toLowerCase())
            })
          }
        })
      } else if (field?.value) {
        field.value.forEach((addr: any) => {
          if (addr?.address) addresses.push(addr.address.toLowerCase())
        })
      }
    }

    processField(parsed.to)
    processField(parsed.cc)

    return addresses
  }

  private extractContent(parsed: any): string {
    const text = parsed.text || ''
    const html = typeof parsed.html === 'string' ? parsed.html : ''
    return text + html
  }

  private extractVerificationCode(text: string): string | null {
    const patterns = [
      /(\d{6}) is your verification code/i,
      /verification code[：:\s]*(\d{6})/i,
      /Your (?:verification )?code is[：:\s]*(\d{6})/i,
      /enter (?:the )?(?:following )?(?:verification )?code[：:\s]*(\d{6})/i,
      /code[：:\s]+(\d{6})/i,
      />(\d{6})</,
      /\b(\d{6})\b/
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) return match[1]
    }

    return null
  }

  async getRefVerificationLink(targetEmail: string, timeout = 10000): Promise<string | null> {
    try {
      return await Promise.race([
        this.checkRefVerificationMail(targetEmail),
        new Promise<null>(resolve => setTimeout(() => resolve(null), timeout))
      ])
    } catch {
      return null
    }
  }

  private async checkRefVerificationMail(targetEmail: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => resolve(null), 8000)
      const imap = this.createConnection()

      imap.once('ready', () => {
        imap.openBox(this.config.dir || 'INBOX', false, (err) => {
          if (err) {
            clearTimeout(timeoutId)
            imap.end()
            return reject(err)
          }

          const since = new Date(Date.now() - 10 * 60 * 1000) // 10 分钟内的邮件
          // 搜索来自 Ref 的邮件
          const searchCriteria: ImapSearchCriteria = [['SINCE', since]]

          imap.search(searchCriteria, (err, results) => {
            if (err || !results?.length) {
              clearTimeout(timeoutId)
              imap.end()
              return resolve(null)
            }

            this.processRefVerificationMail(imap, results, targetEmail, timeoutId, resolve)
          })
        })
      })

      imap.once('error', (err: Error) => {
        clearTimeout(timeoutId)
        reject(err)
      })

      imap.connect()
    })
  }

  private processRefVerificationMail(
    imap: Imap,
    results: number[],
    targetEmail: string,
    timeoutId: NodeJS.Timeout,
    resolve: (value: string | null) => void
  ) {
    // 从最新的邮件开始检查
    const sortedResults = [...results].reverse()

    const checkNext = (index: number) => {
      if (index >= sortedResults.length) {
        clearTimeout(timeoutId)
        imap.end()
        return resolve(null)
      }

      const msgId = sortedResults[index]
      const fetch = imap.fetch([msgId], { bodies: '' })

      fetch.on('message', (msg) => {
        msg.on('body', (stream: Readable) => {
          simpleParser(stream, (err, parsed) => {
            if (err) {
              checkNext(index + 1)
              return
            }

            // 检查是否是 Ref 的邮件
            const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase() || ''
            const fromText = parsed.from?.text?.toLowerCase() || ''
            const subject = parsed.subject?.toLowerCase() || ''
            const isRefMail = fromAddress.includes('ref') ||
                              fromText.includes('ref') ||
                              subject.includes('verify') ||
                              subject.includes('email') ||
                              subject.includes('confirm')

            if (isRefMail || true) { // 检查所有邮件，寻找验证链接
              const content = this.extractContent(parsed)
              const link = this.extractRefVerificationLink(content)

              if (link) {
                clearTimeout(timeoutId)
                imap.addFlags([msgId], ['\\Seen'], () => {
                  imap.end()
                  resolve(link)
                })
                return
              }
            }

            // 继续检查下一封邮件
            checkNext(index + 1)
          })
        })
      })

      fetch.once('error', () => {
        checkNext(index + 1)
      })
    }

    checkNext(0)
  }

  private extractRefVerificationLink(text: string): string | null {
    // 查找 Ref 验证链接的模式
    const patterns = [
      /https?:\/\/[^\s"'<>]*ref\.tools[^\s"'<>]*verify[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]*ref\.tools[^\s"'<>]*confirm[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]*ref\.tools[^\s"'<>]*token=[^\s"'<>]*/gi,
      /href="(https?:\/\/[^"]*ref\.tools[^"]*verify[^"]*)"/gi,
      /href="(https?:\/\/[^"]*ref\.tools[^"]*confirm[^"]*)"/gi,
      /href="(https?:\/\/[^"]*ref\.tools[^"]*token[^"]*)"/gi,
      // 通用验证链接模式
      /https?:\/\/[^\s"'<>]*verify[^\s"'<>]*token[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]*confirm[^\s"'<>]*email[^\s"'<>]*/gi,
    ]

    for (const pattern of patterns) {
      const matches = text.match(pattern)
      if (matches && matches.length > 0) {
        // 清理链接
        let link = matches[0]
        // 如果是 href="..." 格式，提取链接
        if (link.startsWith('href="')) {
          link = link.replace(/^href="/, '').replace(/"$/, '')
        }
        // 移除结尾的引号或尖括号
        link = link.replace(/["'<>]+$/, '')
        return link
      }
    }

    return null
  }
}
