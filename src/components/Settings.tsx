import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Mail, Key, Clock, Monitor, Save, RotateCcw, CheckCircle, AlertCircle,
  Globe, Shield, Sun, Moon, Palette, Zap, Server, ChevronDown
} from 'lucide-react'
import type { AppSettings, Theme, TempMailPlusConfig, ImapMailConfig } from '../types'

interface SettingsProps {
  settings: AppSettings | null
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>
  theme: Theme
  setTheme: React.Dispatch<React.SetStateAction<Theme>>
  onNotify?: (type: 'success' | 'error' | 'info', message: string) => void
}

export default function Settings({ settings, setSettings, theme, setTheme, onNotify }: SettingsProps) {
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

  const updateTempMailPlus = (key: keyof TempMailPlusConfig, value: string) => {
    setSettings(prev => prev ? { ...prev, tempMailPlus: { ...prev.tempMailPlus, [key]: value } } : null)
    setTempMailStatus('idle')
  }

  const updateImapMail = (key: keyof ImapMailConfig, value: string | number) => {
    setSettings(prev => prev ? { ...prev, imapMail: { ...prev.imapMail, [key]: value } } : null)
    setImapStatus('idle')
  }

  const updateRegistration = (key: string, value: number | boolean) => {
    setSettings(prev => prev ? { ...prev, registration: { ...prev.registration, [key]: value } } : null)
  }

  const updateDomain = (value: string) => {
    setSettings(prev => prev ? { ...prev, domain: value } : null)
  }

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
    setSettings(prev => prev ? { ...prev, theme: newTheme } : null)
  }

  const testTempMailPlus = async () => {
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
  }

  const testImapMail = async () => {
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
  }

  const saveSettings = async () => {
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
  }

  const resetSettings = () => {
    setSettings({
      tempMailPlus: { username: '', epin: '', extension: '@mailto.plus' },
      imapMail: { server: 'imap.qq.com', port: 993, user: '', pass: '', dir: 'INBOX', protocol: 'IMAP', domain: '' },
      registration: { passwordLength: 12, intervalMin: 3, intervalMax: 8, timeout: 60, showBrowser: false },
      domain: '',
      theme: 'system'
    })
    setTheme('system')
    setTempMailStatus('idle')
    setImapStatus('idle')
    onNotify?.('info', '设置已重置')
  }

  const themeOptions: { value: Theme; label: string; icon: typeof Sun; desc: string }[] = [
    { value: 'light', label: '浅色', icon: Sun, desc: '始终使用浅色主题' },
    { value: 'dark', label: '深色', icon: Moon, desc: '始终使用深色主题' },
    { value: 'system', label: '跟随系统', icon: Monitor, desc: '自动跟随系统设置' },
  ]

  const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }
  const itemVariants = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }

  return (
    <motion.div className="space-y-6 max-w-4xl mx-auto pb-8" variants={containerVariants} initial="hidden" animate="show">
      <motion.div className="flex items-center justify-between" variants={itemVariants}>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">系统</span>设置
          </h2>
          <p className="text-lg text-muted-foreground mt-1">管理邮箱服务和应用偏好</p>
        </div>
        <div className="flex gap-3">
          <motion.button onClick={resetSettings} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/50 bg-background hover:bg-secondary transition-colors text-base font-medium cursor-pointer">
            <RotateCcw size={18} />
            重置
          </motion.button>
          <motion.button onClick={saveSettings} disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-base font-medium shadow-neon disabled:opacity-70 cursor-pointer">
            {saving ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}><Zap size={18} /></motion.div> : <Save size={18} />}
            {saving ? '保存中...' : '保存更改'}
          </motion.button>
        </div>
      </motion.div>

      {/* 外观主题 */}
      <motion.section className="rounded-2xl border border-border/50 bg-card overflow-hidden" variants={itemVariants}>
        <div className="px-6 py-4 border-b border-border/50 bg-secondary/30 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent/10 text-accent"><Palette size={22} /></div>
          <div>
            <h3 className="font-semibold text-lg">外观主题</h3>
            <p className="text-sm text-muted-foreground">选择应用的外观主题</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-4">
            {themeOptions.map((opt) => {
              const Icon = opt.icon
              const isActive = theme === opt.value
              return (
                <motion.button key={opt.value} onClick={() => handleThemeChange(opt.value)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className={`flex flex-col items-center gap-3 p-5 rounded-xl border transition-all cursor-pointer ${isActive ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border/50 hover:bg-secondary/50 hover:border-primary/50'}`}>
                  <div className={`p-3.5 rounded-full ${isActive ? 'bg-primary/20' : 'bg-secondary'}`}><Icon size={26} /></div>
                  <div className="text-center">
                    <p className="font-medium text-base">{opt.label}</p>
                    <p className="text-sm text-muted-foreground mt-1">{opt.desc}</p>
                  </div>
                  {isActive && <CheckCircle size={18} className="text-primary" />}
                </motion.button>
              )
            })}
          </div>
        </div>
      </motion.section>

      {/* TempMail.Plus */}
      <motion.section className="rounded-2xl border border-border/50 bg-card overflow-hidden" variants={itemVariants}>
        <div className="px-6 py-4 border-b border-border/50 bg-secondary/30 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Globe size={22} /></div>
          <div>
            <h3 className="font-semibold text-lg">TempMail.Plus 服务</h3>
            <p className="text-sm text-muted-foreground">使用 tempmail.plus 临时邮箱接收验证码</p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-base font-medium">用户名</label>
              <input type="text" value={settings.tempMailPlus.username} onChange={(e) => updateTempMailPlus('username', e.target.value)} placeholder="your_username"
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
            </div>
            <div className="space-y-2">
              <label className="text-base font-medium">EPIN 码</label>
              <input type="password" value={settings.tempMailPlus.epin} onChange={(e) => updateTempMailPlus('epin', e.target.value)} placeholder="your_epin"
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
            </div>
            <div className="space-y-2">
              <label className="text-base font-medium">后缀</label>
              <input type="text" value={settings.tempMailPlus.extension} onChange={(e) => updateTempMailPlus('extension', e.target.value)} placeholder="@mailto.plus"
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
            </div>
          </div>
          <div className="flex items-center gap-4 pt-4 border-t border-border/50">
            <motion.button onClick={testTempMailPlus} disabled={testingTempMail || !settings.tempMailPlus.username} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/50 bg-background hover:bg-secondary disabled:opacity-50 transition-colors text-base cursor-pointer">
              {testingTempMail ? <Zap size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              测试连接
            </motion.button>
            {tempMailStatus === 'success' && <span className="text-base text-emerald-500 flex items-center gap-2"><CheckCircle size={16}/> 连接成功</span>}
            {tempMailStatus === 'error' && <span className="text-base text-destructive flex items-center gap-2"><AlertCircle size={16}/> 连接失败</span>}
          </div>
        </div>
      </motion.section>

      {/* IMAP 邮箱服务 */}
      <motion.section className="rounded-2xl border border-border/50 bg-card overflow-hidden" variants={itemVariants}>
        <div className="px-6 py-4 border-b border-border/50 bg-secondary/30 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent/10 text-accent"><Mail size={22} /></div>
          <div>
            <h3 className="font-semibold text-lg">IMAP 邮箱服务</h3>
            <p className="text-sm text-muted-foreground">使用自有域名生成邮箱，通过 IMAP 接收验证码</p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-base font-medium">邮箱账号</label>
              <input type="email" value={settings.imapMail.user} onChange={(e) => updateImapMail('user', e.target.value)} placeholder="your_email@qq.com"
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
            </div>
            <div className="space-y-2">
              <label className="text-base font-medium">授权码</label>
              <input type="password" value={settings.imapMail.pass} onChange={(e) => updateImapMail('pass', e.target.value)} placeholder="授权码"
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
            </div>
            <div className="space-y-2">
              <label className="text-base font-medium">生成邮箱域名</label>
              <input type="text" value={settings.imapMail.domain} onChange={(e) => updateImapMail('domain', e.target.value)} placeholder="@yourdomain.com"
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
            </div>
          </div>

          {/* 高级设置折叠 */}
          <div className="border-t border-border/50 pt-4">
            <motion.button onClick={() => setShowAdvancedImap(!showAdvancedImap)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <motion.div animate={{ rotate: showAdvancedImap ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={16} />
              </motion.div>
              高级设置
            </motion.button>
            <AnimatePresence>
              {showAdvancedImap && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                  className="overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4">
                    <div className="space-y-2">
                      <label className="text-base font-medium flex items-center gap-2">
                        <Server size={16} className="text-muted-foreground" />
                        IMAP 服务器
                      </label>
                      <input type="text" value={settings.imapMail.server} onChange={(e) => updateImapMail('server', e.target.value)} placeholder="imap.qq.com"
                        className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-base font-medium">端口</label>
                      <input type="number" value={settings.imapMail.port} onChange={(e) => updateImapMail('port', parseInt(e.target.value) || 993)} placeholder="993"
                        className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-base font-medium">邮箱目录</label>
                      <input type="text" value={settings.imapMail.dir} onChange={(e) => updateImapMail('dir', e.target.value)} placeholder="INBOX"
                        className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-border/50">
            <motion.button onClick={testImapMail} disabled={testingImap || !settings.imapMail.user} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/50 bg-background hover:bg-secondary disabled:opacity-50 transition-colors text-base cursor-pointer">
              {testingImap ? <Zap size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              测试连接
            </motion.button>
            {imapStatus === 'success' && <span className="text-base text-emerald-500 flex items-center gap-2"><CheckCircle size={16}/> 连接成功</span>}
            {imapStatus === 'error' && <span className="text-base text-destructive flex items-center gap-2"><AlertCircle size={16}/> 连接失败</span>}
          </div>
        </div>
      </motion.section>

      {/* 注册参数 */}
      <motion.section className="rounded-2xl border border-border/50 bg-card overflow-hidden" variants={itemVariants}>
        <div className="px-6 py-4 border-b border-border/50 bg-secondary/30 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent/10 text-accent"><Shield size={22} /></div>
          <div>
            <h3 className="font-semibold text-lg">注册参数</h3>
            <p className="text-sm text-muted-foreground">调整自动化行为和安全策略</p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-base font-medium">邮箱域名 (全局)</label>
              <input type="text" value={settings.domain} onChange={(e) => updateDomain(e.target.value)} placeholder="@yourdomain.com"
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono text-base" />
            </div>
            <div className="space-y-2">
              <label className="text-base font-medium flex items-center gap-2">
                <Key size={16} className="text-muted-foreground" />
                密码长度
              </label>
              <input type="number" min="8" max="32" value={settings.registration.passwordLength} onChange={(e) => updateRegistration('passwordLength', parseInt(e.target.value) || 12)}
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-base" />
            </div>
            <div className="space-y-2">
              <label className="text-base font-medium flex items-center gap-2">
                <Clock size={16} className="text-muted-foreground" />
                超时时间 (秒)
              </label>
              <input type="number" min="30" max="300" value={settings.registration.timeout} onChange={(e) => updateRegistration('timeout', parseInt(e.target.value) || 60)}
                className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-base" />
            </div>
            <div className="space-y-2">
              <label className="text-base font-medium flex items-center gap-2">
                <Clock size={16} className="text-muted-foreground" />
                注册间隔 (秒)
              </label>
              <div className="flex items-center gap-3">
                <input type="number" min="1" max="60" value={settings.registration.intervalMin} onChange={(e) => updateRegistration('intervalMin', parseInt(e.target.value) || 3)}
                  className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-base" />
                <span className="text-muted-foreground font-medium text-lg">-</span>
                <input type="number" min="1" max="60" value={settings.registration.intervalMax} onChange={(e) => updateRegistration('intervalMax', parseInt(e.target.value) || 8)}
                  className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-base" />
              </div>
            </div>
            
            <div className="flex items-center justify-between p-5 rounded-xl border border-border/50 bg-secondary/30 md:col-span-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Monitor size={18} />
                  <span className="text-base font-medium">调试模式 (显示浏览器)</span>
                </div>
                <p className="text-sm text-muted-foreground">开启后将显示自动化浏览器的操作窗口</p>
              </div>
              <motion.button onClick={() => updateRegistration('showBrowser', !settings.registration.showBrowser)} whileTap={{ scale: 0.95 }}
                className={`w-14 h-7 rounded-full transition-colors relative cursor-pointer ${settings.registration.showBrowser ? 'bg-primary' : 'bg-muted'}`}>
                <motion.span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md"
                  animate={{ x: settings.registration.showBrowser ? 26 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.section>
    </motion.div>
  )
}
