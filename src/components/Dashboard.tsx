import { motion } from 'framer-motion'
import { 
  Play, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle,
  Terminal,
  Activity,
  ArrowRight,
  Mail,
  Server,
  Copy,
  Check,
  Eye,
  EyeOff
} from 'lucide-react'
import { useState } from 'react'
import type { Account, LogEntry, EmailType, Page, AppSettings } from '../types'

interface DashboardProps {
  accounts: Account[]
  logs: LogEntry[]
  isRegistering: boolean
  onNavigate: (page: Page, emailType?: EmailType) => void
  settings: AppSettings | null
}

export default function Dashboard({ accounts, logs, isRegistering, onNavigate, settings: _settings }: DashboardProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(new Set())
  
  const recentLogs = logs.slice(-6).reverse()
  const recentAccounts = accounts.slice(0, 5)
  
  const activeCount = accounts.filter(a => a.status === 'active').length
  const pendingCount = accounts.filter(a => a.status === 'pending').length

  const handleCopy = async (account: Account) => {
    const text = `${account.email}\n${account.password}`
    await navigator.clipboard.writeText(text)
    setCopiedId(account.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const togglePassword = (id: number) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle size={14} className="text-emerald-500" />
      case 'pending': return <Clock size={14} className="text-accent" />
      default: return <XCircle size={14} className="text-destructive" />
    }
  }

  return (
    <div className="h-full flex flex-col gap-6">
      <motion.header 
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              控制面板
            </span>
          </h1>
          <p className="text-muted-foreground mt-1">快速开始您的自动化注册任务</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 px-4 py-2 rounded-xl glass text-sm">
            <span className="flex items-center gap-2">
              <Users size={14} className="text-primary" />
              <span className="font-numeric font-bold">{accounts.length}</span>
              <span className="text-muted-foreground">账户</span>
            </span>
            <div className="w-px h-4 bg-border" />
            <span className="flex items-center gap-2">
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="font-numeric font-bold">{activeCount}</span>
              <span className="text-muted-foreground">有效</span>
            </span>
            {pendingCount > 0 && (
              <>
                <div className="w-px h-4 bg-border" />
                <span className="flex items-center gap-2">
                  <Clock size={14} className="text-accent" />
                  <span className="font-numeric font-bold">{pendingCount}</span>
                  <span className="text-muted-foreground">待验证</span>
                </span>
              </>
            )}
          </div>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0">
        <div className="flex flex-col gap-5">
          <motion.section 
            className="rounded-2xl glass p-6 ring-1 ring-border/50"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Play size={18} className="text-primary" />
              快速开始
            </h2>
            
            <div className="grid grid-cols-2 gap-3">
              <motion.button
                onClick={() => onNavigate('register', 'tempmail_plus')}
                disabled={isRegistering}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="relative overflow-hidden p-5 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full" />
                <div className="relative">
                  <div className="p-2.5 rounded-lg bg-primary/15 text-primary w-fit mb-3 group-hover:scale-110 transition-transform">
                    <Mail size={20} />
                  </div>
                  <p className="font-semibold text-left">TempMail+</p>
                  <p className="text-xs text-muted-foreground text-left mt-1">临时邮箱快速注册</p>
                </div>
                <ArrowRight size={16} className="absolute bottom-5 right-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </motion.button>

              <motion.button
                onClick={() => onNavigate('register', 'imap')}
                disabled={isRegistering}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="relative overflow-hidden p-5 rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 hover:border-accent/40 transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-accent/10 to-transparent rounded-bl-full" />
                <div className="relative">
                  <div className="p-2.5 rounded-lg bg-accent/15 text-accent w-fit mb-3 group-hover:scale-110 transition-transform">
                    <Server size={20} />
                  </div>
                  <p className="font-semibold text-left">IMAP 邮箱</p>
                  <p className="text-xs text-muted-foreground text-left mt-1">使用自有域名注册</p>
                </div>
                <ArrowRight size={16} className="absolute bottom-5 right-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-1 transition-all" />
              </motion.button>
            </div>

            {isRegistering && (
              <motion.div 
                className="mt-4 p-3 rounded-lg bg-accent/10 border border-accent/20 flex items-center gap-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <motion.div
                  className="w-2 h-2 rounded-full bg-accent"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-sm text-accent font-medium">正在执行注册任务...</span>
              </motion.div>
            )}
          </motion.section>

          <motion.section 
            className="flex-1 min-h-0 rounded-2xl glass overflow-hidden ring-1 ring-border/50 flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <header className="px-5 py-3 border-b border-border/50 flex items-center justify-between bg-secondary/20 shrink-0">
              <div className="flex items-center gap-2">
                <Terminal size={16} className={isRegistering ? 'text-accent' : 'text-muted-foreground'} />
                <h2 className="font-semibold text-sm">运行日志</h2>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className={`w-1.5 h-1.5 rounded-full ${isRegistering ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                <span className="text-muted-foreground">{isRegistering ? 'LIVE' : 'IDLE'}</span>
              </div>
            </header>
            <div className="flex-1 overflow-auto">
              {recentLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Activity className="mb-3 opacity-20" size={32} />
                  <p className="text-sm">等待任务开始</p>
                </div>
              ) : (
                <ul className="divide-y divide-border/30">
                  {recentLogs.map((log, index) => (
                    <motion.li 
                      key={log.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-secondary/30 transition-colors"
                    >
                      <time className="font-mono text-xs text-muted-foreground mt-0.5 min-w-[70px] tabular-nums">
                        {log.timestamp}
                      </time>
                      <span className={`flex-1 break-all text-sm ${
                        log.type === 'error' ? 'text-destructive' :
                        log.type === 'success' ? 'text-emerald-500' :
                        log.type === 'warning' ? 'text-accent' :
                        'text-foreground'
                      }`}>
                        {log.message}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>
          </motion.section>
        </div>

        <motion.section 
          className="rounded-2xl glass overflow-hidden ring-1 ring-border/50 flex flex-col"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <header className="px-5 py-3 border-b border-border/50 flex items-center justify-between bg-secondary/20 shrink-0">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-primary" />
              <h2 className="font-semibold text-sm">最近注册</h2>
            </div>
            {accounts.length > 5 && (
              <motion.button
                onClick={() => onNavigate('accounts')}
                whileHover={{ x: 2 }}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 cursor-pointer"
              >
                查看全部 <ArrowRight size={12} />
              </motion.button>
            )}
          </header>
          
          <div className="flex-1 overflow-auto">
            {recentAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                <Users className="mb-3 opacity-20" size={40} />
                <p className="font-medium">暂无账户</p>
                <p className="text-sm mt-1 opacity-60">开始注册后账户将显示在这里</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/30">
                {recentAccounts.map((account, index) => (
                  <motion.li
                    key={account.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(account.status)}
                        <span className="font-medium text-sm truncate max-w-[200px]">{account.email}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <motion.button
                          onClick={() => togglePassword(account.id)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          {visiblePasswords.has(account.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                        </motion.button>
                        <motion.button
                          onClick={() => handleCopy(account)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          {copiedId === account.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </motion.button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">
                        {visiblePasswords.has(account.id) ? account.password : '••••••••••••'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(account.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
          
          {recentAccounts.length > 0 && (
            <footer className="px-4 py-3 border-t border-border/50 bg-secondary/20 shrink-0">
              <motion.button
                onClick={() => onNavigate('accounts')}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors cursor-pointer"
              >
                管理所有账户
              </motion.button>
            </footer>
          )}
        </motion.section>
      </div>
    </div>
  )
}
