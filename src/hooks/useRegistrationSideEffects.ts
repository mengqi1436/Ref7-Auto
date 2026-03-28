import { useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'
import { createDefaultAppSettings } from '@shared/defaultAppSettings'
import type { Account, AppSettings, EmailType, LogEntry, Theme } from '../types'
import type { NotificationType } from '../components/Notification'

type AddNotification = (type: NotificationType, message: string, options?: { skipLog?: boolean }) => void

export function useRegistrationSideEffects(
  addNotification: AddNotification,
  setSettings: Dispatch<SetStateAction<AppSettings | null>>,
  setTheme: Dispatch<SetStateAction<Theme>>,
  setDefaultEmailType: Dispatch<SetStateAction<EmailType>>,
  setAccounts: Dispatch<SetStateAction<Account[]>>,
  setLogs: Dispatch<SetStateAction<LogEntry[]>>
) {
  const loadSettings = useCallback(async () => {
    const defaultSettings = createDefaultAppSettings()
    try {
      const s = await window.electronAPI?.getSettings?.()
      if (s) {
        const merged: AppSettings = {
          tempMailPlus: { ...defaultSettings.tempMailPlus, ...s.tempMailPlus },
          imapMail: { ...defaultSettings.imapMail, ...s.imapMail },
          registration: { ...defaultSettings.registration, ...s.registration },
          defaultEmailType: s.defaultEmailType || 'tempmail_plus',
          theme: s.theme || 'system'
        }
        setSettings(merged)
        setTheme(merged.theme)
        setDefaultEmailType(merged.defaultEmailType)
      } else {
        setSettings(defaultSettings)
      }
    } catch {
      setSettings(defaultSettings)
    }
  }, [setSettings, setTheme, setDefaultEmailType])

  const loadAccounts = useCallback(async () => {
    try {
      const accs = await window.electronAPI?.getAccounts?.()
      if (accs) setAccounts(accs)
    } catch {
      setAccounts([])
    }
  }, [setAccounts])

  useEffect(() => {
    void loadSettings()
    void loadAccounts()
    const unsubLog = window.electronAPI?.onRegistrationLog?.((log) => setLogs((prev) => [...prev, log]))
    const unsubComplete = window.electronAPI?.onRegistrationComplete?.((account) => {
      setAccounts((prev) => [account, ...prev])
      addNotification('success', `账户 ${account.email} 注册成功！`, { skipLog: true })
    })
    const unsubError = window.electronAPI?.onRegistrationError?.((error) => {
      addNotification('error', error)
    })
    return () => {
      unsubLog?.()
      unsubComplete?.()
      unsubError?.()
    }
  }, [addNotification, loadSettings, loadAccounts, setAccounts, setLogs])

  return { loadSettings, loadAccounts }
}
