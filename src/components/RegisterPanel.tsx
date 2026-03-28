import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Play,
  Square,
  Mail,
  Settings2,
  Monitor,
  Activity,
  Zap,
  Globe,
  RefreshCw,
  X,
} from 'lucide-react'
import type {
  AppSettings,
  LogEntry,
  EmailType,
  Account,
  BatchRegistrationScope,
} from '../types'

interface RegisterPanelProps {
  settings: AppSettings | null
  isRegistering: boolean
  setIsRegistering: React.Dispatch<React.SetStateAction<boolean>>
  logs: LogEntry[]
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>
  defaultEmailType?: EmailType
  refAccountToRegister?: Account | null
  setRefAccountToRegister?: React.Dispatch<React.SetStateAction<Account | null>>
  ctx7AccountToRegister?: Account | null
  setCtx7AccountToRegister?: React.Dispatch<
    React.SetStateAction<Account | null>
  >
  setAccounts?: React.Dispatch<React.SetStateAction<Account[]>>
}

const LOG_STYLES: Record<LogEntry['type'], string> = {
  error: 'bg-destructive/10 text-destructive border-l-2 border-destructive',
  success: 'bg-emerald-500/10 text-emerald-500 border-l-2 border-emerald-500',
  warning: 'bg-accent/10 text-accent border-l-2 border-accent',
  info: 'text-foreground border-l-2 border-primary/30',
}

function validateSupplementalMailSettings(
  settings: AppSettings | null,
  emailType: EmailType,
): string | null {
  if (!settings) return '请先配置邮箱设置'
  if (emailType === 'tempmail_plus' && !settings.tempMailPlus.username) {
    return '请先在设置中配置 TempMail.Plus（须与注册该账户时收信方式一致）'
  }
  if (
    emailType === 'imap' &&
    (!settings.imapMail.user || !settings.imapMail.domain)
  ) {
    return '请先在设置中配置 IMAP 邮箱与域名（须与注册该账户时一致）'
  }
  return null
}

const REGISTRATION_SCOPE_OPTIONS: {
  value: BatchRegistrationScope
  label: string
}[] = [
  { value: 'context7_only', label: '仅 Context7' },
  { value: 'ref_only', label: '仅 Ref' },
  { value: 'both', label: 'Context7 + Ref' },
]

function registrationScopeButtonClass(
  selected: boolean,
  accent: 'primary' | 'accent',
): string {
  const base =
    'flex-1 min-w-0 py-2.5 px-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed'
  if (selected) {
    return accent === 'primary'
      ? `${base} bg-primary text-primary-foreground shadow-sm`
      : `${base} bg-accent text-accent-foreground shadow-sm`
  }
  return `${base} text-muted-foreground hover:bg-secondary/80 hover:text-foreground`
}

function emailServiceCardClassName(
  isSelected: boolean,
  type: EmailType,
): string {
  const base =
    'flex flex-col items-center justify-center gap-2 p-5 rounded-xl border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  if (type === 'tempmail_plus') {
    if (isSelected) return `${base} bg-primary/10 border-primary text-primary`
    return `${base} bg-background border-border/50 hover:bg-secondary/50 hover:border-primary/50`
  }
  if (isSelected) return `${base} bg-accent/10 border-accent text-accent`
  return `${base} bg-background border-border/50 hover:bg-secondary/50 hover:border-accent/50`
}

export default function RegisterPanel({
  settings,
  isRegistering,
  setIsRegistering,
  logs,
  setLogs,
  defaultEmailType = 'tempmail_plus',
  refAccountToRegister,
  setRefAccountToRegister,
  ctx7AccountToRegister,
  setCtx7AccountToRegister,
  setAccounts,
}: RegisterPanelProps) {
  const [emailType, setEmailType] = useState<EmailType>(defaultEmailType)
  const [batchCount, setBatchCount] = useState(
    settings?.registration.defaultBatchCount ?? 1,
  )
  const [showBrowser, setShowBrowser] = useState(
    settings?.registration.showBrowser ?? false,
  )
  const [registrationScope, setRegistrationScope] =
    useState<BatchRegistrationScope>('both')
  const logsEndRef = useRef<HTMLDivElement>(null)
  const isRunningRef = useRef(false)

  const isCtx7Mode = !!ctx7AccountToRegister
  const isRefMode = !!refAccountToRegister
  const maxBatchCount = settings?.registration.maxBatchCount ?? 20

  useEffect(() => {
    setEmailType(defaultEmailType)
  }, [defaultEmailType])
  useEffect(() => {
    if (settings?.registration.defaultBatchCount !== undefined)
      setBatchCount(settings.registration.defaultBatchCount)
  }, [settings?.registration.defaultBatchCount])
  useEffect(() => {
    if (settings?.registration.showBrowser !== undefined)
      setShowBrowser(settings.registration.showBrowser)
  }, [settings?.registration.showBrowser])
  useEffect(() => {
    isRunningRef.current = isRegistering
  }, [isRegistering])
  useEffect(() => {
    if (ctx7AccountToRegister && registrationScope === 'ref_only') {
      setRegistrationScope('both')
    }
  }, [ctx7AccountToRegister, registrationScope])
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = useCallback(
    (type: LogEntry['type'], message: string) => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          timestamp: new Date().toLocaleTimeString(),
          type,
          message,
        },
      ])
    },
    [setLogs],
  )

  const runRefRegistrationForAccount = useCallback(
    async (account: Account): Promise<boolean> => {
      const mailErr = validateSupplementalMailSettings(settings, account.emailType)
      if (mailErr) {
        addLog('error', mailErr)
        return false
      }
      addLog('info', `开始为账户 ${account.email} 注册 Ref API...`)
      try {
        const result = await window.electronAPI?.startRefRegistration?.({
          accountId: account.id,
          email: account.email,
          password: account.password,
          showBrowser,
        })
        if (result?.success && result.refApiKey) {
          addLog('success', 'Ref API 注册成功！')
          addLog('success', `API Key: ${result.refApiKey.slice(0, 12)}****`)
          setAccounts?.((prev) =>
            prev.map((acc) =>
              acc.id === account.id
                ? {
                    ...acc,
                    refApiKey: result.refApiKey,
                    ...(result.refCredits != null
                      ? {
                          refCredits: result.refCredits,
                          refCreditsUpdatedAt: result.refCreditsUpdatedAt,
                        }
                      : {}),
                  }
                : acc,
            ),
          )
          setRefAccountToRegister?.(null)
          return true
        }
        addLog('error', `Ref API 注册失败: ${result?.error || '未知错误'}`)
        setRefAccountToRegister?.(account)
        return false
      } catch (error) {
        addLog(
          'error',
          `Ref 注册失败: ${error instanceof Error ? error.message : '未知错误'}`,
        )
        setRefAccountToRegister?.(account)
        return false
      }
    },
    [settings, showBrowser, addLog, setAccounts, setRefAccountToRegister],
  )

  const handleStart = useCallback(async () => {
    if (!settings) {
      addLog('error', '请先配置邮箱设置')
      return
    }
    if (emailType === 'tempmail_plus' && !settings.tempMailPlus.username) {
      addLog('error', '请先配置 TempMail.Plus')
      return
    }
    if (
      emailType === 'imap' &&
      (!settings.imapMail.user || !settings.imapMail.domain)
    ) {
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
        showBrowser,
        registrationScope,
      })
    } catch (error) {
      console.error('注册启动失败:', error)
    } finally {
      setIsRegistering(false)
      isRunningRef.current = false
    }
  }, [
    settings,
    emailType,
    batchCount,
    showBrowser,
    registrationScope,
    setIsRegistering,
    addLog,
  ])

  const handleStop = useCallback(async () => {
    isRunningRef.current = false
    setIsRegistering(false)
    try {
      await window.electronAPI?.stopRegistration?.()
    } catch (error) {
      console.error('停止注册失败:', error)
    }
    addLog('warning', '注册任务已停止')
  }, [setIsRegistering, addLog])

  const handleStartRefRegistration = useCallback(async () => {
    if (!refAccountToRegister) return
    setIsRegistering(true)
    isRunningRef.current = true
    try {
      await runRefRegistrationForAccount(refAccountToRegister)
    } finally {
      setIsRegistering(false)
      isRunningRef.current = false
    }
  }, [refAccountToRegister, runRefRegistrationForAccount, setIsRegistering])

  const handleStartContext7Registration = useCallback(async () => {
    if (!ctx7AccountToRegister) return
    const mailErr = validateSupplementalMailSettings(
      settings,
      ctx7AccountToRegister.emailType,
    )
    if (mailErr) {
      addLog('error', mailErr)
      return
    }

    setIsRegistering(true)
    isRunningRef.current = true
    addLog('info', `开始为账户 ${ctx7AccountToRegister.email} 注册 Context7...`)

    try {
      const result = await window.electronAPI?.startContext7Registration?.({
        accountId: ctx7AccountToRegister.id,
        email: ctx7AccountToRegister.email,
        password: ctx7AccountToRegister.password,
        emailType: ctx7AccountToRegister.emailType,
        showBrowser,
      })

      if (result?.success && result.apiKey) {
        addLog('success', 'Context7 注册成功！')
        addLog('success', `API Key: ${result.apiKey.slice(0, 12)}****`)
        const updatedAccount = {
          ...ctx7AccountToRegister,
          apiKey: result.apiKey,
          apiKeyName: result.apiKeyName,
          requestsLimit: result.requestsLimit,
          ...(result.ctx7RequestsUsed != null &&
          result.ctx7RequestsLimit != null
            ? {
                ctx7RequestsUsed: result.ctx7RequestsUsed,
                ctx7RequestsLimit: result.ctx7RequestsLimit,
                ctx7RequestsUpdatedAt: result.ctx7RequestsUpdatedAt,
              }
            : {}),
        }
        setAccounts?.((prev) =>
          prev.map((acc) =>
            acc.id === ctx7AccountToRegister.id
              ? { ...acc, ...updatedAccount }
              : acc,
          ),
        )
        setCtx7AccountToRegister?.(null)

        if (
          registrationScope === 'both' &&
          !updatedAccount.refApiKey
        ) {
          addLog('info', 'Context7 已完成，自动继续注册 Ref API...')
          await runRefRegistrationForAccount(updatedAccount)
        }
      } else {
        addLog('error', `Context7 注册失败: ${result?.error || '未知错误'}`)
      }
    } catch (error) {
      addLog(
        'error',
        `Context7 注册失败: ${error instanceof Error ? error.message : '未知错误'}`,
      )
    } finally {
      setIsRegistering(false)
      isRunningRef.current = false
    }
  }, [
    ctx7AccountToRegister,
    settings,
    showBrowser,
    setIsRegistering,
    addLog,
    setCtx7AccountToRegister,
    setRefAccountToRegister,
    setAccounts,
    runRefRegistrationForAccount,
    registrationScope,
  ])

  const ToggleSwitch = ({
    active,
    color,
    togglable,
  }: {
    active: boolean
    color: string
    togglable: boolean
  }) => (
    <motion.button
      type="button"
      onClick={() => {
        if (togglable) setShowBrowser(!showBrowser)
      }}
      disabled={!togglable || isRegistering}
      whileTap={{ scale: togglable ? 0.95 : 1 }}
      className={`w-14 h-7 rounded-full transition-colors relative ${
        togglable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
      } ${active ? color : 'bg-secondary'} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <motion.span
        className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md"
        animate={{ x: active ? 26 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  )

  const supplementalMailHint = (account: Account) => (
    <p className="text-xs text-muted-foreground pt-1">
      收验证码 / Ref 验证邮件依赖设置中的邮箱服务，且须与该账户的收信方式（
      {account.emailType === 'tempmail_plus' ? 'TempMail+' : 'IMAP'}
      ）一致。
    </p>
  )

  let startButtonClass =
    'w-full flex items-center justify-center gap-3 p-5 rounded-xl font-semibold text-lg transition-all cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-neon'
  let startButtonIcon = <Play size={22} fill="currentColor" />
  let startButtonLabel = '启动任务'
  if (isCtx7Mode) {
    startButtonClass =
      'w-full flex items-center justify-center gap-3 p-5 rounded-xl font-semibold text-lg transition-all cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-neon'
    startButtonIcon = <Zap size={22} />
    startButtonLabel = '开始 Context7 注册'
  } else if (isRefMode) {
    startButtonClass =
      'w-full flex items-center justify-center gap-3 p-5 rounded-xl font-semibold text-lg transition-all cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90 shadow-neon-accent'
    startButtonIcon = <RefreshCw size={22} />
    startButtonLabel = '开始 Ref 注册'
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
            <span
              className={
                isCtx7Mode
                  ? 'text-primary'
                  : isRefMode
                    ? 'text-accent'
                    : 'text-primary'
              }
            >
              {isCtx7Mode ? 'Context7' : isRefMode ? 'Ref' : '开始'}
            </span>
            {isCtx7Mode || isRefMode ? ' 注册' : '注册'}
          </h2>
          <p className="text-lg text-muted-foreground mt-1">
            {isCtx7Mode
              ? '为已有账户注册 Context7 API'
              : isRefMode
                ? '为已有账户绑定 Ref API'
                : '配置并运行自动化注册任务'}
          </p>
        </div>

        <div className="space-y-5">
          {isCtx7Mode ? (
            <div className="rounded-2xl border border-primary/50 bg-card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Zap size={20} className="text-primary" />
                  Context7 注册
                </h3>
                <motion.button
                  type="button"
                  onClick={() => setCtx7AccountToRegister?.(null)}
                  disabled={isRegistering}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X size={18} />
                </motion.button>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground">
                  注册范围
                </label>
                <div className="flex rounded-xl border border-primary/30 bg-primary/5 p-1 gap-1">
                  {REGISTRATION_SCOPE_OPTIONS.map((opt) => (
                    <motion.button
                      key={opt.value}
                      type="button"
                      disabled={isRegistering || opt.value === 'ref_only'}
                      title={
                        opt.value === 'ref_only'
                          ? '当前为 Context7 补绑，不可选择仅 Ref'
                          : undefined
                      }
                      onClick={() => setRegistrationScope(opt.value)}
                      whileHover={{
                        scale: isRegistering || opt.value === 'ref_only' ? 1 : 1.01,
                      }}
                      whileTap={{
                        scale: isRegistering || opt.value === 'ref_only' ? 1 : 0.99,
                      }}
                      className={registrationScopeButtonClass(
                        registrationScope === opt.value,
                        'primary',
                      )}
                    >
                      {opt.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-1">目标账户</p>
                  <p className="font-mono text-base font-medium">
                    {ctx7AccountToRegister?.email}
                  </p>
                  {ctx7AccountToRegister
                    ? supplementalMailHint(ctx7AccountToRegister)
                    : null}
                </div>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>将执行以下操作：</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>在浏览器中打开 Context7 注册流程</li>
                    <li>使用账户邮箱与密码提交注册</li>
                    <li>从邮箱读取验证码并完成验证</li>
                    <li>创建 Context7 API Key</li>
                    {registrationScope === 'both' &&
                      !ctx7AccountToRegister?.refApiKey && (
                        <li>
                          若无 Ref API，将在 Context7 成功后自动继续 Ref 注册
                        </li>
                      )}
                  </ol>
                </div>
              </div>

              <div className="flex items-center justify-between pt-5 border-t border-border/50">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Monitor size={18} className="text-muted-foreground" />
                    <span className="text-base font-medium">调试模式</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    显示自动化浏览器窗口
                  </p>
                </div>
                <ToggleSwitch
                  active={showBrowser}
                  color="bg-primary"
                  togglable={!isRegistering}
                />
              </div>
            </div>
          ) : isRefMode ? (
            <div className="rounded-2xl border border-accent/50 bg-card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <RefreshCw size={20} className="text-accent" />
                  Ref API 注册
                </h3>
                <motion.button
                  type="button"
                  onClick={() => setRefAccountToRegister?.(null)}
                  disabled={isRegistering}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X size={18} />
                </motion.button>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
                  <p className="text-sm text-muted-foreground mb-1">目标账户</p>
                  <p className="font-mono text-base font-medium">
                    {refAccountToRegister?.email}
                  </p>
                  {refAccountToRegister
                    ? supplementalMailHint(refAccountToRegister)
                    : null}
                </div>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    将执行以下操作（主进程通过 Firebase / Ref 服务端
                    API，非页面自动化）：
                  </p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>使用邮箱与密码调用 Ref 注册接口</li>
                    <li>发送验证邮件并从设置中的邮箱读取验证链接或代码</li>
                    <li>完成邮箱验证并获取 Ref API Key</li>
                  </ol>
                </div>
              </div>

              <div className="flex items-center justify-between pt-5 border-t border-border/50">
                <div className="space-y-1 max-w-[calc(100%-5rem)]">
                  <div className="flex items-center gap-2">
                    <Monitor size={18} className="text-muted-foreground" />
                    <span className="text-base font-medium">调试模式</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ref 补绑不使用浏览器窗口；此开关仅对 Context7
                    与批量任务有效。
                  </p>
                </div>
                <ToggleSwitch
                  active={showBrowser}
                  color="bg-accent"
                  togglable={false}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-6">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Settings2 size={20} className="text-primary" />
                任务参数
              </h3>

              <div className="space-y-3">
                <label className="text-base font-medium text-muted-foreground">
                  邮箱服务
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    type="button"
                    onClick={() => setEmailType('tempmail_plus')}
                    disabled={isRegistering}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={emailServiceCardClassName(
                      emailType === 'tempmail_plus',
                      'tempmail_plus',
                    )}
                  >
                    <Globe size={26} />
                    <span className="text-base font-medium">TempMail+</span>
                    <span className="text-xs text-muted-foreground">
                      临时邮箱
                    </span>
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setEmailType('imap')}
                    disabled={isRegistering}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={emailServiceCardClassName(
                      emailType === 'imap',
                      'imap',
                    )}
                  >
                    <Mail size={26} />
                    <span className="text-base font-medium">IMAP</span>
                    <span className="text-xs text-muted-foreground">
                      自有域名
                    </span>
                  </motion.button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-base font-medium text-muted-foreground">
                  注册范围
                </label>
                <div className="flex rounded-xl border border-border/50 bg-secondary/30 p-1 gap-1">
                  {REGISTRATION_SCOPE_OPTIONS.map((opt) => (
                    <motion.button
                      key={opt.value}
                      type="button"
                      disabled={isRegistering}
                      onClick={() => setRegistrationScope(opt.value)}
                      whileHover={{ scale: isRegistering ? 1 : 1.01 }}
                      whileTap={{ scale: isRegistering ? 1 : 0.99 }}
                      className={registrationScopeButtonClass(
                        registrationScope === opt.value,
                        'primary',
                      )}
                    >
                      {opt.label}
                    </motion.button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  仅 Ref 将跳过 Context7，仅创建账户并执行 Ref 注册；收验证码与 Ref
                  验证邮件仍依赖所选邮箱服务与设置。
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-base font-medium text-muted-foreground">
                    批量数量
                  </label>
                  <span className="text-2xl font-black text-primary font-numeric">
                    {batchCount}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max={maxBatchCount}
                  value={Math.min(batchCount, maxBatchCount)}
                  onChange={(e) => setBatchCount(parseInt(e.target.value, 10))}
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
                  <p className="text-sm text-muted-foreground">
                    显示浏览器窗口
                  </p>
                </div>
                <ToggleSwitch
                  active={showBrowser}
                  color="bg-primary"
                  togglable={!isRegistering}
                />
              </div>
            </div>
          )}

          {!isRegistering ? (
            <motion.button
              type="button"
              onClick={
                isCtx7Mode
                  ? handleStartContext7Registration
                  : isRefMode
                    ? handleStartRefRegistration
                    : handleStart
              }
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={startButtonClass}
            >
              {startButtonIcon}
              {startButtonLabel}
            </motion.button>
          ) : (
            <motion.button
              type="button"
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
              <Activity
                className={
                  isRegistering ? 'text-accent' : 'text-muted-foreground'
                }
                size={20}
              />
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
            type="button"
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
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${LOG_STYLES[log.type]}`}
                >
                  <span className="text-sm opacity-60 mt-0.5">
                    {log.timestamp}
                  </span>
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
