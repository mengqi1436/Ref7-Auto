import { useState, useEffect, useCallback } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import type { Theme } from '../types'

const THEME_KEY = 'ref7-theme'

function applyThemeToDOM(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

export function useAppTheme() {
  const [theme, setTheme] = useState<Theme>('system')
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>('dark')
  const [appVersion, setAppVersion] = useState('1.0.0')

  const effectiveTheme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    const init = async () => {
      const sysTheme = await window.electronAPI?.getSystemTheme?.()
      if (sysTheme === 'dark' || sysTheme === 'light') setSystemTheme(sysTheme)

      const stored = localStorage.getItem(THEME_KEY)
      if (stored === 'dark' || stored === 'light' || stored === 'system') setTheme(stored)

      const version = await window.electronAPI?.getAppVersion?.()
      if (version) setAppVersion(version)
    }
    void init()
  }, [])

  useEffect(() => {
    applyThemeToDOM(effectiveTheme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme, effectiveTheme])

  useEffect(() => {
    const unsub = window.electronAPI?.onSystemThemeChange?.((newTheme) => {
      if (newTheme === 'dark' || newTheme === 'light') setSystemTheme(newTheme)
    })
    return () => unsub?.()
  }, [])

  const cycleTheme = useCallback(() => {
    setTheme((prev) => {
      if (prev === 'system') return 'light'
      if (prev === 'light') return 'dark'
      return 'system'
    })
  }, [])

  const getThemeIcon = useCallback(() => {
    if (theme === 'system') return <Monitor size={20} />
    if (theme === 'light') return <Sun size={20} />
    return <Moon size={20} />
  }, [theme])

  return {
    theme,
    setTheme,
    cycleTheme,
    getThemeIcon,
    appVersion,
  }
}
