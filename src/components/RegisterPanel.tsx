import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Play, 
  Square, 
  Mail, 
  Settings2, 
  Monitor,
  Activity,
  Zap,
  Globe
} from 'lucide-react'
import type { AppSettings, LogEntry, EmailType } from '../types'

interface RegisterPanelProps {
  settings: AppSettings | null
  isRegistering: boolean
  setIsRegistering: React.Dispatch<React.SetStateAction<boolean>>
  logs: LogEntry[]
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>
  defaultEmailType?: EmailType
}

export default function RegisterPanel({ 
  settings, 
  isRegistering, 
  setIsRegistering,
  logs,
  setLogs,
  defaultEmailType = 'tempmail_plus'
}: RegisterPanelProps) {
  const [emailType, setEmailType] = useState<EmailType>(defaultEmailType)
  const [batchCount, setBatchCount] = useState(settings?.registration.defaultBatchCount ?? 1)
  const [showBrowser, setShowBrowser] = useState(settings?.registration.showBrowser ?? false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const isRunningRef = useRef(false)

  const maxBatchCount = settings?.registration.maxBatchCount ?? 20

  useEffect(() => {
    setEmailType(defaultEmailType)
  }, [defaultEmailType])

  useEffect(() => {
    if (settings?.registration.defaultBatchCount !== undefined) {
      setBatchCount(settings.registration.defaultBatchCount)
    }
  }, [settings?.registration.defaultBatchCount])

  useEffect(() => {
    if (settings?.registration.showBrowser !== undefined) {
      setShowBrowser(settings.registration.showBrowser)
    }
  }, [settings?.registration.showBrowser])

  useEffect(() => {
    isRunningRef.current = isRegistering
  }, [isRegistering])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleStart = async () => {
    if (!settings) {
      addLog('error', '请先配置邮箱设置')
      return
    }

    if (emailType === 'tempmail_plus' && !settings.tempMailPlus.username) {
      addLog('error', '请先配置 TempMail.Plus')
      return
    }

    if (emailType === 'imap' && (!settings.imapMail.user || !settings.imapMail.domain)) {
      addLog('error', '请先配置 IMAP 邮箱和域名')
      return
    }

    setIsRegistering(true)
    isRunningRef.current = true
    addLog('info', `开始注册 ${batchCount} 个账户...`)
    
    try {
      await window.electronAPI?.startRegistration?.({
        emailType,
        count: batchCount,
        passwordLength: settings.registration.passwordLength,
        intervalMin: settings.registration.intervalMin,
        intervalMax: settings.registration.intervalMax,
        showBrowser
      })
    } catch (error) {
      console.error('注册启动失败:', error)
      await simulateRegistration()
    } finally {
      setIsRegistering(false)
      isRunningRef.current = false
    }
  }

  const simulateRegistration = async () => {
    for (let i = 0; i < batchCount; i++) {
      if (!isRunningRef.current) break
      await delay(1000)
      addLog('info', `[模拟] 开始注册第 ${i + 1} 个账户...`)
      if (!isRunningRef.current) break
      await delay(2000)
      addLog('success', `[模拟] 账户注册成功`)
    }
    addLog('info', '[模拟] 批量注册任务完成')
  }

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const handleStop = async () => {
    isRunningRef.current = false
    setIsRegistering(false)
    try {
      await window.electronAPI?.stopRegistration?.()
    } catch (error) {
      console.error('停止注册失败:', error)
    }
    addLog('warning', '注册任务已停止')
  }

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    }])
  }

  const getLogBgClass = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return 'bg-destructive/10 text-destructive border-l-2 border-destructive'
      case 'success': return 'bg-emerald-500/10 text-emerald-500 border-l-2 border-emerald-500'
      case 'warning': return 'bg-accent/10 text-accent border-l-2 border-accent'
      default: return 'text-foreground border-l-2 border-primary/30'
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-10rem)]">
      <motion.div 
        className="lg:col-span-1 space-y-5"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">开始</span>注册
          </h2>
          <p className="text-lg text-muted-foreground mt-1">配置并运行自动化注册任务</p>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-6">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Settings2 size={20} className="text-primary" />
              任务参数
            </h3>

            <div className="space-y-3">
              <label className="text-base font-medium text-muted-foreground">邮箱服务</label>
              <div className="grid grid-cols-2 gap-3">
                <motion.button
                  onClick={() => setEmailType('tempmail_plus')}
                  disabled={isRegistering}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border transition-all cursor-pointer ${
                    emailType === 'tempmail_plus'
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-background border-border/50 hover:bg-secondary/50 hover:border-primary/50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Globe size={26} />
                  <span className="text-base font-medium">TempMail+</span>
                  <span className="text-xs text-muted-foreground">临时邮箱</span>
                </motion.button>
                <motion.button
                  onClick={() => setEmailType('imap')}
                  disabled={isRegistering}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border transition-all cursor-pointer ${
                    emailType === 'imap'
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'bg-background border-border/50 hover:bg-secondary/50 hover:border-accent/50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Mail size={26} />
                  <span className="text-base font-medium">IMAP</span>
                  <span className="text-xs text-muted-foreground">自有域名</span>
                </motion.button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-base font-medium text-muted-foreground">批量数量</label>
                <span className="text-2xl font-black text-primary font-numeric">{batchCount}</span>
              </div>
              <input
                type="range"
                min="1"
                max={maxBatchCount}
                value={Math.min(batchCount, maxBatchCount)}
                onChange={(e) => setBatchCount(parseInt(e.target.value))}
                disabled={isRegistering}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>1</span>
                <span>{Math.floor(maxBatchCount / 2)}</span>
                <span>{maxBatchCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-5 border-t border-border/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Monitor size={18} className="text-muted-foreground" />
                  <span className="text-base font-medium">调试模式</span>
                </div>
                <p className="text-sm text-muted-foreground">显示浏览器窗口</p>
              </div>
              <motion.button
                onClick={() => setShowBrowser(!showBrowser)}
                disabled={isRegistering}
                whileTap={{ scale: 0.95 }}
                className={`w-14 h-7 rounded-full transition-colors relative cursor-pointer ${
                  showBrowser ? 'bg-primary' : 'bg-secondary'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <motion.span 
                  className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md"
                  animate={{ x: showBrowser ? 26 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </motion.button>
            </div>
          </div>

          {!isRegistering ? (
            <motion.button
              onClick={handleStart}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-3 p-5 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:bg-primary/90 transition-all shadow-neon cursor-pointer"
            >
              <Play size={22} fill="currentColor" />
              启动任务
            </motion.button>
          ) : (
            <motion.button
              onClick={handleStop}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-3 p-5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-lg hover:bg-destructive/90 transition-all shadow-neon-accent cursor-pointer"
            >
              <Square size={22} fill="currentColor" />
              停止任务
            </motion.button>
          )}
        </div>
      </motion.div>

      <motion.div 
        className="lg:col-span-2 flex flex-col rounded-2xl border border-border/50 bg-card overflow-hidden h-full"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="px-6 py-4 border-b border-border/50 bg-secondary/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={isRegistering ? { rotate: 360 } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Activity className={isRegistering ? 'text-accent' : 'text-muted-foreground'} size={20} />
            </motion.div>
            <h3 className="font-semibold text-lg">运行日志</h3>
            {isRegistering && (
              <motion.div
                className="flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Zap size={14} />
                运行中
              </motion.div>
            )}
          </div>
          <button 
            onClick={() => setLogs([])} 
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-3 py-1 rounded-lg hover:bg-secondary"
          >
            清空日志
          </button>
        </div>
        
        <div className="flex-1 p-4 overflow-auto space-y-1 font-mono text-base">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              >
                <Zap className="mb-4 opacity-20" size={52} />
              </motion.div>
              <p className="text-lg">等待任务启动...</p>
            </div>
          ) : (
            <>
              {logs.map((log, index) => (
                <motion.div 
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${getLogBgClass(log.type)}`}
                >
                  <span className="text-sm opacity-60 mt-0.5">{log.timestamp}</span>
                  <span className="flex-1 break-all">{log.message}</span>
                </motion.div>
              ))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
