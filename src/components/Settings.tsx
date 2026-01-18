import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Mail, Key, Clock, Monitor, Save, RotateCcw, CheckCircle, AlertCircle,
  Globe, Shield, Sun, Moon, Palette, Zap, Server, ChevronDown, Settings2
} from 'lucide-react'
import type { AppSettings, Theme, TempMailPlusConfig, ImapMailConfig, EmailType } from '../types'

interface SettingsProps {
  settings: AppSettings | null
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>
  theme: Theme
  setTheme: React.Dispatch<React.SetStateAction<Theme>>
  onNotify?: (type: 'success' | 'error' | 'info', message: string) => void
}

type TabId = 'general' | 'account' | 'advanced'

const tabs: { id: TabId; label: string; icon: typeof Palette }[] = [
  { id: 'general', label: '通用', icon: Palette },
  { id: 'account', label: '账号', icon: Mail },
  { id: 'advanced', label: '高级', icon: Settings2 },
]

export default function Settings({ settings, setSettings, theme, setTheme, onNotify }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [testingTempMail, setTestingTempMail] = useState(false)
  const [testingImap, setTestingImap] = useState(false)
  const [tempMailStatus, setTempMailStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [imapStatus, setImapStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [saving, setSaving] = useState(false)
  const [showAdvancedImap, setShowAdvancedImap] = useState(false)

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
          <Zap className="mr-3" size={24} />
        </motion.div>
        <span className="text-lg">加载设置...</span>
      </div>
    )
  }

  const updateTempMailPlus = useCallback((key: keyof TempMailPlusConfig, value: string) => {
    setSettings(prev => prev ? { ...prev, tempMailPlus: { ...prev.tempMailPlus, [key]: value } } : null)
    setTempMailStatus('idle')
  }, [setSettings])

  const updateImapMail = useCallback((key: keyof ImapMailConfig, value: string | number) => {
    setSettings(prev => prev ? { ...prev, imapMail: { ...prev.imapMail, [key]: value } } : null)
    setImapStatus('idle')
  }, [setSettings])

  const updateRegistration = useCallback((key: string, value: number | boolean) => {
    setSettings(prev => prev ? { ...prev, registration: { ...prev.registration, [key]: value } } : null)
  }, [setSettings])

  const updateDefaultEmailType = useCallback((value: EmailType) => {
    setSettings(prev => prev ? { ...prev, defaultEmailType: value } : null)
  }, [setSettings])

  const handleThemeChange = useCallback((newTheme: Theme) => {
    setTheme(newTheme)
    setSettings(prev => prev ? { ...prev, theme: newTheme } : null)
  }, [setTheme, setSettings])

  const testTempMailPlus = useCallback(async () => {
    setTestingTempMail(true)
    setTempMailStatus('idle')
    try {
      const result = await window.electronAPI?.testTempMailPlus?.(settings.tempMailPlus)
      setTempMailStatus(result ? 'success' : 'error')
      onNotify?.(result ? 'success' : 'error', result ? 'TempMail+ 连接成功' : 'TempMail+ 连接失败')
    } catch {
      setTempMailStatus('error')
      onNotify?.('error', 'TempMail+ 连接测试出错')
    }
    setTestingTempMail(false)
  }, [settings.tempMailPlus, onNotify])

  const testImapMail = useCallback(async () => {
    setTestingImap(true)
    setImapStatus('idle')
    try {
      const result = await window.electronAPI?.testImapMail?.(settings.imapMail)
      setImapStatus(result ? 'success' : 'error')
      onNotify?.(result ? 'success' : 'error', result ? 'IMAP 连接成功' : 'IMAP 连接失败，请检查账号和授权码')
    } catch {
      setImapStatus('error')
      onNotify?.('error', 'IMAP 连接测试出错')
    }
    setTestingImap(false)
  }, [settings.imapMail, onNotify])

  const saveSettings = useCallback(async () => {
    setSaving(true)
    try {
      await window.electronAPI?.saveSettings?.(settings)
      onNotify?.('success', '设置已保存')
    } catch {
      localStorage.setItem('ref7-settings', JSON.stringify(settings))
      onNotify?.('info', '设置已保存到本地')
    }
    await new Promise(r => setTimeout(r, 500))
    setSaving(false)
  }, [settings, onNotify])

  const resetSettings = useCallback(() => {
    setSettings({
      tempMailPlus: { username: '', epin: '', extension: '@mailto.plus' },
      imapMail: { server: 'imap.qq.com', port: 993, user: '', pass: '', dir: 'INBOX', protocol: 'IMAP', domain: '' },
      registration: { passwordLength: 12, intervalMin: 3, intervalMax: 8, timeout: 60, showBrowser: false, defaultBatchCount: 1, maxBatchCount: 20 },
      defaultEmailType: 'tempmail_plus',
      theme: 'system'
    })
    setTheme('system')
    setTempMailStatus('idle')
    setImapStatus('idle')
    onNotify?.('info', '设置已重置')
  }, [setSettings, setTheme, onNotify])

  const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '系统', icon: Monitor },
  ]

  const emailTypeOptions: { value: EmailType; label: string }[] = [
    { value: 'tempmail_plus', label: 'TempMail+' },
    { value: 'imap', label: 'IMAP 邮箱' },
  ]

  const inputClass = "w-full px-3 py-2 rounded-lg border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-sm"

  return (
    <div className="max-w-4xl mx-auto pb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-6">
          <div className="flex bg-secondary/50 rounded-xl p-1 border border-border/50">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeSettingsTab"
                      className="absolute inset-0 bg-background rounded-lg border border-border/50 -z-10"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <motion.button
            onClick={resetSettings}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border/50 bg-background hover:bg-secondary transition-colors text-sm cursor-pointer"
          >
            <RotateCcw size={14} />
            重置
          </motion.button>
          <motion.button
            onClick={saveSettings}
            disabled={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-medium disabled:opacity-70 cursor-pointer"
          >
            {saving ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                <Zap size={14} />
              </motion.div>
            ) : (
              <Save size={14} />
            )}
            {saving ? '保存中...' : '保存设置'}
          </motion.button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'general' && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border/50 bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Palette size={18} className="text-accent" />
                  <h3 className="font-medium">外观主题</h3>
                </div>
                <div className="flex gap-3">
                  {themeOptions.map((opt) => {
                    const Icon = opt.icon
                    const isActive = theme === opt.value
                    return (
                      <motion.button
                        key={opt.value}
                        onClick={() => handleThemeChange(opt.value)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-background border-border/50 hover:border-primary/50'
                        }`}
                      >
                        <Icon size={16} />
                        <span className="text-sm font-medium">{opt.label}</span>
                        {isActive && <CheckCircle size={14} />}
                      </motion.button>
                    )
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-border/50 bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Mail size={18} className="text-accent" />
                  <h3 className="font-medium">默认邮箱服务</h3>
                </div>
                <div className="flex gap-3">
                  {emailTypeOptions.map((opt) => {
                    const isActive = settings.defaultEmailType === opt.value
                    return (
                      <motion.button
                        key={opt.value}
                        onClick={() => updateDefaultEmailType(opt.value)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-background border-border/50 hover:border-primary/50'
                        }`}
                      >
                        {opt.value === 'tempmail_plus' ? <Globe size={16} /> : <Mail size={16} />}
                        <span className="text-sm font-medium">{opt.label}</span>
                        {isActive && <CheckCircle size={14} />}
                      </motion.button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3">注册时默认使用的邮箱服务类型</p>
              </section>

            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border/50 bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Globe size={18} className="text-primary" />
                    <h3 className="font-medium">TempMail+ 服务</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {tempMailStatus === 'success' && (
                      <span className="text-xs text-emerald-500 flex items-center gap-1">
                        <CheckCircle size={12} /> 已连接
                      </span>
                    )}
                    {tempMailStatus === 'error' && (
                      <span className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle size={12} /> 失败
                      </span>
                    )}
                    <motion.button
                      onClick={testTempMailPlus}
                      disabled={testingTempMail || !settings.tempMailPlus.username}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/50 bg-background hover:bg-secondary disabled:opacity-50 transition-colors text-xs cursor-pointer"
                    >
                      {testingTempMail ? <Zap size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      测试
                    </motion.button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">用户名</label>
                    <input
                      type="text"
                      value={settings.tempMailPlus.username}
                      onChange={(e) => updateTempMailPlus('username', e.target.value)}
                      placeholder="username"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">EPIN 码</label>
                    <input
                      type="password"
                      value={settings.tempMailPlus.epin}
                      onChange={(e) => updateTempMailPlus('epin', e.target.value)}
                      placeholder="epin"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">后缀</label>
                    <input
                      type="text"
                      value={settings.tempMailPlus.extension}
                      onChange={(e) => updateTempMailPlus('extension', e.target.value)}
                      placeholder="@mailto.plus"
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border/50 bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Mail size={18} className="text-accent" />
                    <h3 className="font-medium">IMAP 邮箱服务</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {imapStatus === 'success' && (
                      <span className="text-xs text-emerald-500 flex items-center gap-1">
                        <CheckCircle size={12} /> 已连接
                      </span>
                    )}
                    {imapStatus === 'error' && (
                      <span className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle size={12} /> 失败
                      </span>
                    )}
                    <motion.button
                      onClick={testImapMail}
                      disabled={testingImap || !settings.imapMail.user}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/50 bg-background hover:bg-secondary disabled:opacity-50 transition-colors text-xs cursor-pointer"
                    >
                      {testingImap ? <Zap size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      测试
                    </motion.button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">邮箱账号</label>
                    <input
                      type="email"
                      value={settings.imapMail.user}
                      onChange={(e) => updateImapMail('user', e.target.value)}
                      placeholder="email@qq.com"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">授权码</label>
                    <input
                      type="password"
                      value={settings.imapMail.pass}
                      onChange={(e) => updateImapMail('pass', e.target.value)}
                      placeholder="授权码"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">生成域名</label>
                    <input
                      type="text"
                      value={settings.imapMail.domain}
                      onChange={(e) => updateImapMail('domain', e.target.value)}
                      placeholder="@domain.com"
                      className={inputClass}
                    />
                  </div>
                </div>

                <button
                  onClick={() => setShowAdvancedImap(!showAdvancedImap)}
                  className="flex items-center gap-1 mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <motion.div animate={{ rotate: showAdvancedImap ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={14} />
                  </motion.div>
                  高级设置
                </button>

                <AnimatePresence>
                  {showAdvancedImap && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-3 gap-4 pt-4">
                        <div className="space-y-1.5">
                          <label className="text-sm text-muted-foreground flex items-center gap-1">
                            <Server size={12} />
                            服务器
                          </label>
                          <input
                            type="text"
                            value={settings.imapMail.server}
                            onChange={(e) => updateImapMail('server', e.target.value)}
                            placeholder="imap.qq.com"
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm text-muted-foreground">端口</label>
                          <input
                            type="number"
                            value={settings.imapMail.port}
                            onChange={(e) => updateImapMail('port', parseInt(e.target.value) || 993)}
                            placeholder="993"
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm text-muted-foreground">目录</label>
                          <input
                            type="text"
                            value={settings.imapMail.dir}
                            onChange={(e) => updateImapMail('dir', e.target.value)}
                            placeholder="INBOX"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border/50 bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 size={18} className="text-accent" />
                  <h3 className="font-medium">批量注册</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">默认批量数量</label>
                    <input
                      type="number"
                      min="1"
                      max={settings.registration.maxBatchCount}
                      value={settings.registration.defaultBatchCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1
                        updateRegistration('defaultBatchCount', Math.min(val, settings.registration.maxBatchCount))
                      }}
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-foreground">注册页面的初始批量数量</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">最大批量数量</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={settings.registration.maxBatchCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 20
                        updateRegistration('maxBatchCount', Math.max(1, Math.min(val, 100)))
                      }}
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-foreground">单次最多可注册的账户数量</p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border/50 bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Shield size={18} className="text-accent" />
                  <h3 className="font-medium">注册参数</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Key size={12} />
                      密码长度
                    </label>
                    <input
                      type="number"
                      min="8"
                      max="32"
                      value={settings.registration.passwordLength}
                      onChange={(e) => updateRegistration('passwordLength', parseInt(e.target.value) || 12)}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock size={12} />
                      超时时间 (秒)
                    </label>
                    <input
                      type="number"
                      min="30"
                      max="300"
                      value={settings.registration.timeout}
                      onChange={(e) => updateRegistration('timeout', parseInt(e.target.value) || 60)}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock size={12} />
                      注册间隔 (秒)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={settings.registration.intervalMin}
                        onChange={(e) => updateRegistration('intervalMin', parseInt(e.target.value) || 3)}
                        className={inputClass}
                      />
                      <span className="text-muted-foreground">-</span>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={settings.registration.intervalMax}
                        onChange={(e) => updateRegistration('intervalMax', parseInt(e.target.value) || 8)}
                        className={inputClass}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">两次注册之间的随机等待时间范围</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="flex items-center gap-2">
                    <Monitor size={16} className="text-muted-foreground" />
                    <span className="text-sm">调试模式</span>
                    <span className="text-xs text-muted-foreground">(显示浏览器窗口)</span>
                  </div>
                  <button
                    onClick={() => updateRegistration('showBrowser', !settings.registration.showBrowser)}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      settings.registration.showBrowser ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <motion.span
                      className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                      animate={{ x: settings.registration.showBrowser ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>
              </section>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
