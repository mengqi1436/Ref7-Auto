import type { AppSettings } from './types'

export function createDefaultAppSettings(): AppSettings {
  return {
    tempMailPlus: { username: '', epin: '', extension: '@mailto.plus' },
    imapMail: { server: 'imap.qq.com', port: 993, user: '', pass: '', dir: 'INBOX', protocol: 'IMAP', domain: '' },
    registration: {
      passwordLength: 12,
      intervalMin: 3,
      intervalMax: 8,
      timeout: 60,
      showBrowser: false,
      defaultBatchCount: 1,
      maxBatchCount: 20,
    },
    defaultEmailType: 'tempmail_plus',
    theme: 'system',
  }
}
