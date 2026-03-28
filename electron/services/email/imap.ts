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

const REF_WELCOME_SUBJECT = 'Welcome to Ref.'

/** Ref 验证邮件常见主题（与官方发信一致，避免 broad 的 verify/email 误匹配） */
const REF_VERIFY_SUBJECT_SNIPPETS = ['hello from ref', 'welcome to ref', 'verify your email'] as const

function subjectLooksLikeRefVerification(subjectRaw: string): boolean {
  const s = subjectRaw.trim().toLowerCase()
  if (!s) return false
  return REF_VERIFY_SUBJECT_SNIPPETS.some(sn => s.includes(sn))
}

const REF_TRASH_FOLDER_CANDIDATES = [
  '[Gmail]/Trash',
  'Trash',
  'INBOX.Trash',
  'Deleted',
  'Deleted Items',
  '已删除',
  '[Gmail]/Bin'
] as const

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

  private purgeWelcomeToRefMails(imap: Imap, onDone: () => void): void {
    imap.search([['SUBJECT', REF_WELCOME_SUBJECT]], (err, ids) => {
      if (err || !ids?.length) {
        onDone()
        return
      }
      imap.addFlags(ids, ['\\Seen', '\\Deleted'], () => {
        onDone()
      })
    })
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
                  this.purgeWelcomeToRefMails(imap, () => {
                    imap.expunge(() => {
                      imap.end()
                      resolve(code)
                    })
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

  /** 单次连接内轮询收件箱，避免每次重试重复 TLS/登录；totalBudgetMs 内每 pollEveryMs 搜索一次 */
  async getRefVerificationLink(
    targetEmail: string,
    totalBudgetMs = 90_000,
    pollEveryMs = 1200
  ): Promise<string | null> {
    try {
      return await this.pollRefVerificationLink(targetEmail.trim(), totalBudgetMs, pollEveryMs)
    } catch {
      return null
    }
  }

  private refVerificationLinkableBody(content: string): boolean {
    return (
      /oobCode=/i.test(content) ||
      /ref\.tools/i.test(content) ||
      /firebaseapp\.com\/__\/auth/i.test(content)
    )
  }

  /** 与「Hello from Ref」等官方信一致，且收件/内容指向当前注册邮箱，避免误抓其它 verify 邮件 */
  private parsedIsRefVerificationForTarget(parsed: any, targetEmail: string): boolean {
    const subject = typeof parsed.subject === 'string' ? parsed.subject : ''
    const content = this.extractContent(parsed)
    const contentLower = content.toLowerCase()
    const t = targetEmail.trim().toLowerCase()
    if (!t) return false

    const addrOk =
      this.matchesRecipient(parsed, targetEmail) || contentLower.includes(t)
    if (!addrOk) return false

    const subjHit = subjectLooksLikeRefVerification(subject)
    const bodyHit = this.refVerificationLinkableBody(content)

    if (subjHit && bodyHit) return true
    if (subjHit && this.extractRefVerificationLink(content)) return true
    if (bodyHit && this.extractRefVerificationLink(content)) return true
    return false
  }

  private pollRefVerificationLink(
    targetEmail: string,
    totalBudgetMs: number,
    pollEveryMs: number
  ): Promise<string | null> {
    return new Promise(resolve => {
      const deadline = Date.now() + totalBudgetMs
      const imap = this.createConnection()
      let timer: NodeJS.Timeout | null = null
      const inboxPath = this.config.dir || 'INBOX'

      const finishNull = () => {
        if (timer) clearTimeout(timer)
        try {
          imap.end()
        } catch {}
        resolve(null)
      }

      const scheduleTick = () => {
        if (timer) clearTimeout(timer)
        const wait = Math.min(pollEveryMs, Math.max(0, deadline - Date.now()))
        if (wait <= 0) {
          finishNull()
          return
        }
        timer = setTimeout(tick, wait)
      }

      const searchTiersSince = (since: Date): ImapSearchCriteria[] => [
        [['SINCE', since], ['SUBJECT', 'Hello from Ref']],
        [['SINCE', since], ['SUBJECT', REF_WELCOME_SUBJECT]],
        [['SINCE', since]]
      ]

      const runTieredSearchInOpenBox = (
        tiers: ImapSearchCriteria[],
        tierIdx: number,
        onExhaustedThisBox: () => void
      ): void => {
        if (Date.now() >= deadline) {
          finishNull()
          return
        }
        if (tierIdx >= tiers.length) {
          onExhaustedThisBox()
          return
        }
        imap.search(tiers[tierIdx], (err, results) => {
          if (err) {
            runTieredSearchInOpenBox(tiers, tierIdx + 1, onExhaustedThisBox)
            return
          }
          if (!results?.length) {
            runTieredSearchInOpenBox(tiers, tierIdx + 1, onExhaustedThisBox)
            return
          }
          void this.scanMailsForRefLink(imap, results, targetEmail).then(link => {
            if (link) {
              if (timer) clearTimeout(timer)
              resolve(link)
              return
            }
            runTieredSearchInOpenBox(tiers, tierIdx + 1, onExhaustedThisBox)
          })
        })
      }

      const tryMailboxesSequence = (paths: readonly string[], pathIdx: number): void => {
        if (Date.now() >= deadline) {
          finishNull()
          return
        }
        if (pathIdx >= paths.length) {
          scheduleTick()
          return
        }
        const since = new Date(Date.now() - 10 * 60 * 1000)
        const tiers = searchTiersSince(since)
        imap.openBox(paths[pathIdx], false, err => {
          if (err) {
            tryMailboxesSequence(paths, pathIdx + 1)
            return
          }
          runTieredSearchInOpenBox(tiers, 0, () => tryMailboxesSequence(paths, pathIdx + 1))
        })
      }

      const tick = () => {
        if (Date.now() >= deadline) {
          finishNull()
          return
        }
        const paths = [inboxPath, ...REF_TRASH_FOLDER_CANDIDATES.filter(p => p !== inboxPath)]
        tryMailboxesSequence(paths, 0)
      }

      imap.once('ready', () => tick())

      imap.once('error', () => finishNull())
      imap.connect()
    })
  }

  private scanMailsForRefLink(
    imap: Imap,
    results: number[],
    targetEmail: string
  ): Promise<string | null> {
    return new Promise(resolve => {
      const sortedResults = [...results].reverse()

      const checkNext = (index: number) => {
        if (index >= sortedResults.length) {
          return resolve(null)
        }

        const msgId = sortedResults[index]
        const fetch = imap.fetch([msgId], { bodies: '' })

        fetch.on('message', msg => {
          msg.on('body', (stream: Readable) => {
            simpleParser(stream, (err, parsed) => {
              if (err) {
                checkNext(index + 1)
                return
              }

              const content = this.extractContent(parsed)
              if (!this.parsedIsRefVerificationForTarget(parsed, targetEmail)) {
                checkNext(index + 1)
                return
              }

              const link = this.extractRefVerificationLink(content)
              if (link) {
                imap.addFlags([msgId], ['\\Seen', '\\Deleted'], () => {
                  this.purgeWelcomeToRefMails(imap, () => {
                    imap.expunge(() => {
                      imap.end()
                      resolve(link)
                    })
                  })
                })
                return
              }

              checkNext(index + 1)
            })
          })
        })

        fetch.once('error', () => {
          checkNext(index + 1)
        })
      }

      checkNext(0)
    })
  }

  private sanitizeHrefLink(raw: string): string {
    let link = raw
    if (link.startsWith('href="')) {
      link = link.replace(/^href="/, '').replace(/"$/, '')
    }
    link = link.replace(/["'<>]+$/, '')
    link = link.replace(/[),.;:]+$/g, '')
    return link
  }

  private extractRefVerificationLink(text: string): string | null {
    const oobRe = /https?:\/\/[^\s"'<>]+[?&]oobCode=[^"'<>\s&]+/gi
    for (const m of text.matchAll(oobRe)) {
      let link = this.sanitizeHrefLink(m[0])
      try {
        new URL(link)
        return link
      } catch {
        continue
      }
    }

    const patterns = [
      /https?:\/\/[^\s"'<>]*ref\.tools[^\s"'<>]*verify[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]*ref\.tools[^\s"'<>]*confirm[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]*ref\.tools[^\s"'<>]*token=[^\s"'<>]*/gi,
      /href="(https?:\/\/[^"]*ref\.tools[^"]*verify[^"]*)"/gi,
      /href="(https?:\/\/[^"]*ref\.tools[^"]*confirm[^"]*)"/gi,
      /href="(https?:\/\/[^"]*ref\.tools[^"]*token[^"]*)"/gi,
      /https?:\/\/[^\s"'<>]*confirm[^\s"'<>]*email[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]*verify[^\s"'<>]*token[^\s"'<>]*/gi
    ]

    for (const pattern of patterns) {
      const matches = text.match(pattern)
      if (matches && matches.length > 0) {
        return this.sanitizeHrefLink(matches[0])
      }
    }

    return null
  }
}
