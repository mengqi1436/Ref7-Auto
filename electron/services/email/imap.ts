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

  constructor(config: ImapMailConfig) {
    this.config = config
  }

  async testConnection(): Promise<boolean> {
    console.log('测试IMAP连接:', {
      server: this.config.server,
      port: this.config.port,
      user: this.config.user,
      passLength: this.config.pass?.length || 0
    })

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        console.error('IMAP连接超时')
        resolve(false)
      }, 20000)

      try {
        const imap = new Imap({
          user: this.config.user,
          password: this.config.pass,
          host: this.config.server || 'imap.qq.com',
          port: this.config.port || 993,
          tls: true,
          tlsOptions: { 
            rejectUnauthorized: false,
            servername: this.config.server || 'imap.qq.com'
          },
          connTimeout: 20000,
          authTimeout: 20000,
          debug: (info: string) => console.log('IMAP Debug:', info)
        })

        imap.once('ready', () => {
          console.log('IMAP连接成功!')
          clearTimeout(timeoutId)
          try {
            imap.end()
          } catch {}
          resolve(true)
        })

        imap.once('error', (err: Error) => {
          console.error('IMAP连接错误:', err.message)
          console.error('错误详情:', err)
          clearTimeout(timeoutId)
          try {
            imap.end()
          } catch {}
          resolve(false)
        })

        imap.once('end', () => {
          console.log('IMAP连接已关闭')
          clearTimeout(timeoutId)
        })

        imap.connect()
      } catch (err) {
        console.error('IMAP创建连接异常:', err)
        clearTimeout(timeoutId)
        resolve(false)
      }
    })
  }

  async getVerificationCode(targetEmail: string, timeout = 60000): Promise<string | null> {
    const startTime = Date.now()
    const pollInterval = 5000

    while (Date.now() - startTime < timeout) {
      try {
        const code = await this.checkLatestMail(targetEmail)
        if (code) return code
      } catch (error) {
        console.error('检查邮件失败:', error)
      }
      await this.delay(pollInterval)
    }

    return null
  }

  private async checkLatestMail(targetEmail: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        resolve(null)
      }, 30000)

      const imap = this.createConnection()

      imap.once('ready', () => {
        imap.openBox(this.config.dir || 'INBOX', false, (err) => {
          if (err) {
            clearTimeout(timeoutId)
            imap.end()
            return reject(err)
          }

          const since = new Date(Date.now() - 5 * 60 * 1000)
          const searchCriteria: ImapSearchCriteria = this.isNetEaseMail()
            ? ['UNSEEN', ['SINCE', since]]
            : ['ALL', ['SINCE', since]]

          imap.search(searchCriteria, (err, results) => {
            if (err || !results?.length) {
              clearTimeout(timeoutId)
              imap.end()
              return resolve(null)
            }

            const latest = results[results.length - 1]
            const fetch = imap.fetch([latest], { bodies: '' })

            fetch.on('message', (msg) => {
              msg.on('body', (stream: Readable) => {
                simpleParser(stream, (err, parsed) => {
                  if (err) {
                    clearTimeout(timeoutId)
                    imap.end()
                    return resolve(null)
                  }

                  if (targetEmail && !this.matchesRecipient(parsed, targetEmail)) {
                    clearTimeout(timeoutId)
                    imap.end()
                    return resolve(null)
                  }

                  const content = this.extractContent(parsed)
                  const cleanContent = content.replace(new RegExp(targetEmail, 'gi'), '')
                  const code = this.extractVerificationCode(cleanContent)

                  clearTimeout(timeoutId)
                  if (code) {
                    imap.addFlags([latest], ['\\Seen', '\\Deleted'], () => {
                      imap.expunge(() => {
                        imap.end()
                        resolve(code)
                      })
                    })
                  } else {
                    imap.end()
                    resolve(null)
                  }
                })
              })
            })

            fetch.once('error', () => {
              clearTimeout(timeoutId)
              imap.end()
              resolve(null)
            })
          })
        })
      })

      imap.once('error', (err: Error) => {
        clearTimeout(timeoutId)
        console.error('IMAP错误:', err.message)
        reject(err)
      })

      imap.connect()
    })
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
      connTimeout: 20000,
      authTimeout: 20000,
    })
  }

  private isNetEaseMail(): boolean {
    return this.config.user.endsWith('@163.com') ||
           this.config.user.endsWith('@126.com') ||
           this.config.user.endsWith('@yeah.net')
  }

  private matchesRecipient(parsed: any, targetEmail: string): boolean {
    const addresses = this.extractEmailAddresses(parsed)
    
    const headers = parsed.headers
    const originalTo = headers?.get('x-original-to') as string | undefined
    const deliveredTo = headers?.get('delivered-to') as string | undefined
    
    if (originalTo) addresses.push(originalTo.toLowerCase())
    if (deliveredTo) addresses.push(deliveredTo.toLowerCase())
    
    const content = this.extractContent(parsed)
    
    return addresses.some(addr => addr.toLowerCase().includes(targetEmail.toLowerCase())) ||
           content.toLowerCase().includes(targetEmail.toLowerCase())
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
      /(?<![a-zA-Z@.])\b(\d{6})\b/,
      /验证码[：:]\s*(\d{4,8})/,
      /code[：:]\s*(\d{4,8})/i,
      /verification code[：:]\s*(\d{4,8})/i,
      /Your code is[：:]?\s*(\d{4,8})/i,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) return match[1]
    }

    return null
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
