import { useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, Play, Settings as SettingsIcon, Info,
  Minus, Square, X, Zap
} from 'lucide-react'
import Dashboard from './components/Dashboard'
import AccountList from './components/AccountList'
import RegisterPanel from './components/RegisterPanel'
import Settings from './components/Settings'
import About from './components/About'
import Notification from './components/Notification'
import logo from './assets/logo.png'
import type { Page, Account, AppSettings, LogEntry, EmailType } from './types'
import { useAppTheme } from './hooks/useAppTheme'
import { useAppNotifications } from './hooks/useAppNotifications'
import { useRegistrationSideEffects } from './hooks/useRegistrationSideEffects'
import { cn } from '@/utils/cn'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const { theme, setTheme, cycleTheme, getThemeIcon, appVersion } = useAppTheme()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRegistering, setIsRegistering] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [defaultEmailType, setDefaultEmailType] = useState<EmailType>('tempmail_plus')
  const [refAccountToRegister, setRefAccountToRegister] = useState<Account | null>(null)
  const [ctx7AccountToRegister, setCtx7AccountToRegister] = useState<Account | null>(null)

  const { notifications, addNotification, dismissNotification } = useAppNotifications(setLogs)

  const { loadAccounts } = useRegistrationSideEffects(
    addNotification,
    setSettings,
    setTheme,
    setDefaultEmailType,
    setAccounts,
    setLogs
  )

  useEffect(() => {
    if (settings?.defaultEmailType) {
      setDefaultEmailType(settings.defaultEmailType)
    }
  }, [settings?.defaultEmailType])

  const handleNavigate = useCallback((page: Page, emailType?: EmailType) => {
    if (emailType) setDefaultEmailType(emailType)
    setCurrentPage(page)
  }, [])

  const handleRefreshAccount = useCallback(
    async (account: Account) => {
      if (account.apiKey && account.refApiKey) return
      const api = window.electronAPI
      if (!api) return
      const showBrowser = settings?.registration.showBrowser ?? false
      try {
        if (!account.apiKey) {
          const r = await api.startContext7Registration({
            accountId: account.id,
            email: account.email,
            password: account.password,
            emailType: account.emailType,
            showBrowser
          })
          if (r.success) {
            addNotification('success', `Context7 已绑定：${account.email}`)
          } else {
            addNotification('error', r.error || 'Context7 注册失败')
          }
        } else {
          const r = await api.startRefRegistration({
            accountId: account.id,
            email: account.email,
            password: account.password,
            showBrowser
          })
          if (r.success) {
            addNotification('success', `Ref API 已完成验证流程：${account.email}`)
          } else {
            addNotification('error', r.error || 'Ref 验证流程失败')
          }
        }
        await loadAccounts()
      } catch (e) {
        addNotification('error', e instanceof Error ? e.message : '操作失败')
      }
    },
    [settings, addNotification, loadAccounts]
  )

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

  function renderPageContent(): ReactNode {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard accounts={accounts} logs={logs} isRegistering={isRegistering} onNavigate={handleNavigate} />
      case 'accounts':
        return (
          <AccountList
            accounts={accounts}
            setAccounts={setAccounts}
            onRefreshAccount={handleRefreshAccount}
            onReloadAccounts={loadAccounts}
          />
        )
      case 'register':
        return (
          <RegisterPanel
            settings={settings}
            isRegistering={isRegistering}
            setIsRegistering={setIsRegistering}
            logs={logs}
            setLogs={setLogs}
            defaultEmailType={defaultEmailType}
            refAccountToRegister={refAccountToRegister}
            setRefAccountToRegister={setRefAccountToRegister}
            ctx7AccountToRegister={ctx7AccountToRegister}
            setCtx7AccountToRegister={setCtx7AccountToRegister}
            setAccounts={setAccounts}
          />
        )
      case 'settings':
        return <Settings settings={settings} setSettings={setSettings} theme={theme} setTheme={setTheme} onNotify={addNotification} />
      case 'about':
        return <About />
      default:
        return <Dashboard accounts={accounts} logs={logs} isRegistering={isRegistering} onNavigate={handleNavigate} />
    }
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
              <motion.button key={item.id} onClick={() => handleNavigate(item.id)} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }}
                className={cn(
                  'relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-medium transition-all duration-200 cursor-pointer',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                )}>
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
            <motion.div
              className={cn('w-2.5 h-2.5 rounded-full', isRegistering ? 'bg-accent' : 'bg-primary')}
              animate={isRegistering ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
            />
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
          <AnimatePresence mode="wait">
            <motion.div key={currentPage} variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2, ease: 'easeOut' }} className="h-full">
              {renderPageContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <footer className="h-10 flex items-center justify-between px-6 border-t border-border/50 glass text-sm">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>账户总数: <span className="text-foreground font-bold font-numeric">{accounts.length}</span></span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>v{appVersion}</span>
          <span className="text-primary">REF7 Team</span>
        </div>
      </footer>
    </div>
  )
}

export default App
