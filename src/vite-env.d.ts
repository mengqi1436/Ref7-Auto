/// <reference types="vite/client" />

import type {
  Account,
  AccountStatus,
  AppSettings,
  LogEntry,
  RegistrationConfig,
  TempMailConfig,
  QQMailConfig
} from './types'

// 重新导出类型，便于全局使用
export type {
  Account,
  AccountStatus,
  AppSettings,
  LogEntry,
  RegistrationConfig,
  TempMailConfig,
  QQMailConfig
}

interface ElectronAPI {
  // 账户管理
  getAccounts: () => Promise<Account[]>
  addAccount: (account: Omit<Account, 'id' | 'createdAt'>) => Promise<Account>
  deleteAccount: (id: number) => Promise<void>
  deleteAccounts: (ids: number[]) => Promise<void>
  updateAccountStatus: (id: number, status: AccountStatus) => Promise<void>
  exportAccounts: (format: 'csv' | 'json') => Promise<string | null>

  // 注册功能
  startRegistration: (config: RegistrationConfig) => Promise<void>
  stopRegistration: () => Promise<void>

  // 邮箱功能
  testTempMailAPI: (config: TempMailConfig) => Promise<boolean>
  testQQMailIMAP: (config: QQMailConfig) => Promise<boolean>

  // 设置
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>

  // 主题
  getSystemTheme: () => Promise<'dark' | 'light'>
  onSystemThemeChange: (callback: (theme: 'dark' | 'light') => void) => () => void

  // 窗口控制
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void

  // 事件监听
  onRegistrationLog: (callback: (log: LogEntry) => void) => () => void
  onRegistrationComplete: (callback: (account: Account) => void) => () => void
  onRegistrationError: (callback: (error: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
