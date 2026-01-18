import https from 'https'

interface TempMailPlusConfig {
  username: string
  epin: string
  extension: string
}

interface MailListResponse {
  result: boolean
  first_id?: string
  mail_list?: Array<{
    mail_id: string
    from: string
    subject: string
  }>
}

interface MailDetailResponse {
  result: boolean
  text?: string
  subject?: string
}

export class TempMailPlusService {
  private config: TempMailPlusConfig

  constructor(config: TempMailPlusConfig) {
    this.config = config
  }

  getEmail(): string {
    return `${this.config.username}${this.config.extension}`
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.getMailList()
      return response.result !== undefined
    } catch {
      return false
    }
  }

  async getVerificationCode(maxRetries = 5, retryInterval = 2000): Promise<string | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const mailList = await this.getMailList()
        if (!mailList.result || !mailList.first_id) {
          await this.delay(retryInterval)
          continue
        }

        const mailDetail = await this.getMailDetail(mailList.first_id)
        if (!mailDetail.result || !mailDetail.text) {
          await this.delay(retryInterval)
          continue
        }

        const code = this.extractVerificationCode(mailDetail.text)
        if (code) {
          await this.deleteMail(mailList.first_id)
          return code
        }

        await this.delay(retryInterval)
      } catch (error) {
        console.error('获取验证码失败:', error)
        await this.delay(retryInterval)
      }
    }

    return null
  }

  private async getMailList(): Promise<MailListResponse> {
    const email = this.getEmail()
    const url = `https://tempmail.plus/api/mails?email=${encodeURIComponent(email)}&limit=20&epin=${this.config.epin}`
    return this.request<MailListResponse>(url)
  }

  private async getMailDetail(mailId: string): Promise<MailDetailResponse> {
    const email = this.getEmail()
    const url = `https://tempmail.plus/api/mails/${mailId}?email=${encodeURIComponent(email)}&epin=${this.config.epin}`
    return this.request<MailDetailResponse>(url)
  }

  private async deleteMail(firstId: string): Promise<boolean> {
    const email = this.getEmail()
    
    for (let i = 0; i < 5; i++) {
      try {
        const result = await this.requestDelete(
          'https://tempmail.plus/api/mails/',
          { email, first_id: firstId, epin: this.config.epin }
        )
        if (result.result) return true
      } catch {
        // 继续重试
      }
      await this.delay(500)
    }
    
    return false
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

  private request<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T)
          } catch {
            reject(new Error('Invalid JSON response'))
          }
        })
      }).on('error', reject)
    })
  }

  private requestDelete(url: string, payload: Record<string, string>): Promise<{ result: boolean }> {
    return new Promise((resolve, reject) => {
      const data = new URLSearchParams(payload).toString()
      const urlObj = new URL(url)
      
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data)
        }
      }

      const req = https.request(options, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('end', () => {
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error('Invalid JSON response'))
          }
        })
      })

      req.on('error', reject)
      req.write(data)
      req.end()
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
