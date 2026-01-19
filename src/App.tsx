import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  LayoutDashboard, Users, Play, Settings as SettingsIcon, Info,
  Moon, Sun, Monitor, Minus, Square, X, Zap
} from 'lucide-react'
import Dashboard from './components/Dashboard'
import AccountList from './components/AccountList'
import RegisterPanel from './components/RegisterPanel'
import Settings from './components/Settings'
import About from './components/About'
import Notification, { NotificationItem, NotificationType } from './components/Notification'
import logo from './assets/logo.png'
import type { Page, Theme, Account, AppSettings, LogEntry, EmailType } from './types'

const THEME_KEY = 'ref7-theme'

function applyThemeToDOM(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [theme, setTheme] = useState<Theme>('system')
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>('dark')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRegistering, setIsRegistering] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [defaultEmailType, setDefaultEmailType] = useState<EmailType>('tempmail_plus')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [refAccountToRegister, setRefAccountToRegister] = useState<Account | null>(null)

  const handleNavigate = useCallback((page: Page, emailType?: EmailType) => {
    if (emailType) setDefaultEmailType(emailType)
    setCurrentPage(page)
  }, [])

  const handleRefreshAccount = useCallback((account: Account) => {
    setRefAccountToRegister(account)
    setCurrentPage('register')
  }, [])

  const addNotification = useCallback((type: NotificationType, message: string) => {
    const notification: NotificationItem = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      type,
      message,
      timestamp: Date.now()
    }
    setNotifications(prev => [...prev.slice(-4), notification])
    
    setLogs(prev => [...prev, {
      id: notification.id,
      timestamp: new Date().toLocaleTimeString(),
      type: type === 'info' ? 'info' : type,
      message
    }])
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const effectiveTheme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    const init = async () => {
      const sysTheme = await window.electronAPI?.getSystemTheme?.()
      if (sysTheme) setSystemTheme(sysTheme)
      
      const stored = localStorage.getItem(THEME_KEY)
      if (stored === 'dark' || stored === 'light' || stored === 'system') setTheme(stored)
    }
    init()
  }, [])

  useEffect(() => {
    applyThemeToDOM(effectiveTheme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme, effectiveTheme])

  useEffect(() => {
    const unsub = window.electronAPI?.onSystemThemeChange?.((newTheme) => setSystemTheme(newTheme))
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (settings?.defaultEmailType) {
      setDefaultEmailType(settings.defaultEmailType)
    }
  }, [settings?.defaultEmailType])

  useEffect(() => {
    loadSettings()
    loadAccounts()
    
    const unsubLog = window.electronAPI?.onRegistrationLog?.((log) => setLogs(prev => [...prev, log]))
    
    const unsubComplete = window.electronAPI?.onRegistrationComplete?.((account) => {
      setAccounts(prev => [account, ...prev])
      addNotification('success', `账户 ${account.email} 注册成功！`)
    })
    
    const unsubError = window.electronAPI?.onRegistrationError?.((error) => {
      addNotification('error', error)
    })
    
    return () => {
      unsubLog?.()
      unsubComplete?.()
      unsubError?.()
    }
  }, [addNotification])

  const loadSettings = async () => {
    const defaultSettings: AppSettings = {
      tempMailPlus: { username: '', epin: '', extension: '@mailto.plus' },
      imapMail: { server: 'imap.qq.com', port: 993, user: '', pass: '', dir: 'INBOX', protocol: 'IMAP', domain: '' },
      registration: { passwordLength: 12, intervalMin: 3, intervalMax: 8, timeout: 60, showBrowser: false, defaultBatchCount: 1, maxBatchCount: 20 },
      defaultEmailType: 'tempmail_plus',
      theme: 'system'
    }
    
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
  }

  const loadAccounts = async () => {
    try {
      const accs = await window.electronAPI?.getAccounts?.()
      if (accs) setAccounts(accs)
    } catch {
      setAccounts([])
    }
  }

  const cycleTheme = useCallback(() => {
    setTheme(prev => prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system')
  }, [])

  const getThemeIcon = () => {
    if (theme === 'system') return <Monitor size={20} />
    if (theme === 'light') return <Sun size={20} />
    return <Moon size={20} />
  }

  const navItems = [
    { id: 'dashboard' as Page, icon: LayoutDashboard, label: '首页' },
    { id: 'accounts' as Page, icon: Users, label: '账户管理' },
    { id: 'register' as Page, icon: Play, label: '注册' },
    { id: 'settings' as Page, icon: SettingsIcon, label: '设置' },
    { id: 'about' as Page, icon: Info, label: '关于' },
  ]

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  }

  const renderPage = () => {
    const content = (() => {
      switch (currentPage) {
        case 'dashboard':
          return <Dashboard accounts={accounts} logs={logs} isRegistering={isRegistering} onNavigate={handleNavigate} />
        case 'accounts':
          return <AccountList accounts={accounts} setAccounts={setAccounts} onRefreshAccount={handleRefreshAccount} />
        case 'register':
          return <RegisterPanel settings={settings} isRegistering={isRegistering} setIsRegistering={setIsRegistering} logs={logs} setLogs={setLogs} defaultEmailType={defaultEmailType} refAccountToRegister={refAccountToRegister} setRefAccountToRegister={setRefAccountToRegister} setAccounts={setAccounts} />
        case 'settings':
          return <Settings settings={settings} setSettings={setSettings} theme={theme} setTheme={setTheme} onNotify={addNotification} />
        case 'about':
          return <About />
        default:
          return <Dashboard accounts={accounts} logs={logs} isRegistering={isRegistering} onNavigate={handleNavigate} />
      }
    })()

    return (
      <AnimatePresence mode="wait">
        <motion.div key={currentPage} variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2, ease: 'easeOut' }} className="h-full">
          {content}
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden selection:bg-primary/20 selection:text-primary cyber-grid relative">
      <Notification notifications={notifications} onDismiss={dismissNotification} />
      
      <header className="h-16 flex items-center justify-between px-6 border-b border-border/50 glass-strong titlebar-drag select-none z-50 relative">
        <motion.div className="flex items-center gap-3 titlebar-no-drag" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          <div className="relative">
            <img src={logo} alt="REF7" className="w-10 h-10 rounded-xl" />
            <div className="absolute inset-0 rounded-xl neon-glow opacity-50" />
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <h1 className="font-bold text-xl tracking-tight">
              <span className="text-primary neon-text">REF7</span>
              <span className="text-muted-foreground font-normal ml-2">Auto Register</span>
            </h1>
          </div>
        </motion.div>

        <nav className="flex items-center gap-1 titlebar-no-drag">
          {navItems.map((item, index) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            return (
              <motion.button key={item.id} onClick={() => setCurrentPage(item.id)} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }}
                className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-medium transition-all duration-200 cursor-pointer ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
                <Icon size={20} />
                <span>{item.label}</span>
                {isActive && <motion.div layoutId="activeTab" className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/30 -z-10" transition={{ type: 'spring', stiffness: 500, damping: 30 }} />}
                {item.id === 'register' && isRegistering && <motion.span className="w-2.5 h-2.5 rounded-full bg-accent" animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />}
              </motion.button>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 titlebar-no-drag">
          <motion.div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/50 border border-border/50 mr-2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <motion.div className={`w-2.5 h-2.5 rounded-full ${isRegistering ? 'bg-accent' : 'bg-primary'}`} animate={isRegistering ? { scale: [1, 1.3, 1] } : {}} transition={{ duration: 1, repeat: Infinity }} />
            <span className="text-sm font-medium">{isRegistering ? '运行中' : '就绪'}</span>
          </motion.div>

          <motion.button onClick={cycleTheme} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2.5 rounded-xl hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            {getThemeIcon()}
          </motion.button>

          <div className="w-px h-6 bg-border/50 mx-1" />

          <motion.button onClick={() => window.electronAPI?.minimizeWindow?.()} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2.5 rounded-xl hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <Minus size={18} />
          </motion.button>
          <motion.button onClick={() => window.electronAPI?.maximizeWindow?.()} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2.5 rounded-xl hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <Square size={16} />
          </motion.button>
          <motion.button onClick={() => window.electronAPI?.closeWindow?.()} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2.5 rounded-xl hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors cursor-pointer">
            <X size={18} />
          </motion.button>
        </div>
      </header>

      <main className="flex-1 overflow-auto relative">
        <div className="h-full max-w-7xl mx-auto p-8">
          {renderPage()}
        </div>
      </main>

      <footer className="h-10 flex items-center justify-between px-6 border-t border-border/50 glass text-sm">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>账户总数: <span className="text-foreground font-bold font-numeric">{accounts.length}</span></span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>v1.4.0</span>
          <span className="text-primary">REF7 Team</span>
        </div>
      </footer>
    </div>
  )
}

export default App
