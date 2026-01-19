import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  User, Github, RefreshCw, ExternalLink, Zap, Download, RotateCcw
} from 'lucide-react'
import logo from '../assets/logo.png'

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export default function About() {
  const [currentVersion, setCurrentVersion] = useState('--')
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus>('idle')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  const githubUrl = 'https://github.com/mengqi1436/Ref7-Auto'

  useEffect(() => {
    // 获取当前版本
    window.electronAPI?.getAppVersion?.().then((version) => {
      if (version) setCurrentVersion(version)
    })

    // 监听更新状态
    const unsubscribe = window.electronAPI?.onUpdaterStatus?.((status) => {
      setUpdaterStatus(status.status)
      
      if (status.info?.version) {
        setLatestVersion(status.info.version)
      }
      
      if (status.progress) {
        setDownloadProgress(status.progress)
      }
      
      if (status.error) {
        setErrorMessage(status.error)
      }
    })

    return () => unsubscribe?.()
  }, [])

  const handleCheckUpdate = async () => {
    setUpdaterStatus('checking')
    setErrorMessage(null)
    setLatestVersion(null)
    
    try {
      const result = await window.electronAPI?.updaterCheck?.()
      if (!result?.success && result?.error) {
        setUpdaterStatus('error')
        setErrorMessage(result.error)
      }
    } catch {
      setUpdaterStatus('error')
      setErrorMessage('检查更新失败，请检查网络连接')
    }
  }

  const handleDownload = async () => {
    setDownloadProgress(null)
    try {
      const result = await window.electronAPI?.updaterDownload?.()
      if (!result?.success && result?.error) {
        setUpdaterStatus('error')
        setErrorMessage(result.error)
      }
    } catch {
      setUpdaterStatus('error')
      setErrorMessage('下载更新失败')
    }
  }

  const handleInstall = () => {
    window.electronAPI?.updaterInstall?.()
  }

  const handleOpenLink = async (url: string) => {
    try {
      await window.electronAPI?.openExternal?.(url)
    } catch {
      window.open(url, '_blank')
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatBytes(bytesPerSecond)}/s`
  }

  const techStack = [
    { name: 'Electron', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
    { name: 'React 19', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' },
    { name: 'TypeScript', color: 'bg-blue-600/10 text-blue-600 border-blue-600/30' },
  ]

  const containerVariants = { 
    hidden: { opacity: 0 }, 
    show: { opacity: 1, transition: { staggerChildren: 0.08 } } 
  }
  const itemVariants = { 
    hidden: { opacity: 0, y: 20 }, 
    show: { opacity: 1, y: 0 } 
  }

  const renderUpdateSection = () => {
    const isChecking = updaterStatus === 'checking'
    const isDownloading = updaterStatus === 'downloading'
    const isDownloaded = updaterStatus === 'downloaded'
    const hasUpdate = updaterStatus === 'available'
    const noUpdate = updaterStatus === 'not-available'
    const hasError = updaterStatus === 'error'

    return (
      <motion.div className="flex flex-col items-center" variants={itemVariants}>
        {/* 检查更新按钮 - 仅在空闲、无更新、错误状态显示 */}
        {(updaterStatus === 'idle' || noUpdate || hasError) && (
          <motion.button
            onClick={handleCheckUpdate}
            disabled={isChecking}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium shadow-neon disabled:opacity-70 cursor-pointer"
          >
            {isChecking ? (
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Zap size={20} />
              </motion.div>
            ) : (
              <RefreshCw size={20} />
            )}
            {isChecking ? '检测中...' : '检测更新'}
          </motion.button>
        )}

        {/* 检测中状态 */}
        {isChecking && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-muted text-muted-foreground"
          >
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw size={20} />
            </motion.div>
            正在检查更新...
          </motion.div>
        )}

        {/* 发现新版本 - 显示下载按钮 */}
        {hasUpdate && latestVersion && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3"
          >
            <p className="text-accent text-sm font-medium">
              发现新版本: v{latestVersion}
            </p>
            <motion.button
              onClick={handleDownload}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 transition-all font-medium cursor-pointer"
            >
              <Download size={20} />
              立即更新
            </motion.button>
          </motion.div>
        )}

        {/* 下载中 - 显示进度条 */}
        {isDownloading && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 w-full max-w-sm"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Download size={16} />
              </motion.div>
              正在下载更新...
            </div>
            
            {downloadProgress && (
              <>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${downloadProgress.percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flex justify-between w-full text-xs text-muted-foreground">
                  <span>{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</span>
                  <span>{formatSpeed(downloadProgress.bytesPerSecond)}</span>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* 下载完成 - 显示安装按钮 */}
        {isDownloaded && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3"
          >
            <p className="text-emerald-500 text-sm font-medium">
              下载完成，准备安装
            </p>
            <motion.button
              onClick={handleInstall}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all font-medium cursor-pointer"
            >
              <RotateCcw size={20} />
              安装并重启
            </motion.button>
          </motion.div>
        )}

        {/* 无更新 */}
        {noUpdate && (
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-emerald-500 text-sm font-medium"
          >
            已是最新版本
          </motion.p>
        )}

        {/* 错误信息 */}
        {hasError && errorMessage && (
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-destructive text-sm"
          >
            {errorMessage}
          </motion.p>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div 
      className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] py-8"
      variants={containerVariants} 
      initial="hidden" 
      animate="show"
    >
      <motion.div className="flex flex-col items-center mb-8" variants={itemVariants}>
        <div className="relative mb-6">
          <motion.img 
            src={logo} 
            alt="REF7" 
            className="w-28 h-28 rounded-3xl shadow-2xl"
            whileHover={{ scale: 1.05, rotate: 2 }}
            transition={{ type: 'spring', stiffness: 300 }}
          />
          <div className="absolute inset-0 rounded-3xl neon-glow opacity-30" />
        </div>
        
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          <span className="text-primary neon-text">REF7</span>
          <span className="text-foreground ml-2">Auto Register</span>
        </h1>
        
        <div className="flex items-center gap-3 mt-3">
          <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/30">
            v{currentVersion}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground text-sm">Professional Account Management</span>
        </div>
      </motion.div>

      <motion.div 
        className="grid grid-cols-2 gap-4 mb-8 w-full max-w-md"
        variants={itemVariants}
      >
        <motion.div 
          className="flex flex-col items-center p-5 rounded-2xl border border-border/50 bg-card hover:border-primary/30 transition-colors"
          whileHover={{ y: -2 }}
        >
          <div className="p-3 rounded-full bg-primary/10 text-primary mb-3">
            <User size={24} />
          </div>
          <span className="text-sm text-muted-foreground mb-1">作者</span>
          <span className="font-semibold text-foreground">mengqi1436</span>
        </motion.div>

        <motion.button 
          onClick={() => handleOpenLink(githubUrl)}
          className="flex flex-col items-center p-5 rounded-2xl border border-border/50 bg-card hover:border-accent/30 transition-colors cursor-pointer group"
          whileHover={{ y: -2 }}
        >
          <div className="p-3 rounded-full bg-accent/10 text-accent mb-3">
            <Github size={24} />
          </div>
          <span className="text-sm text-muted-foreground mb-1">开源地址</span>
          <span className="font-semibold text-foreground flex items-center gap-1.5 group-hover:text-primary transition-colors">
            查看代码 
            <ExternalLink size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        </motion.button>
      </motion.div>

      <motion.div 
        className="flex items-center gap-3 mb-8"
        variants={itemVariants}
      >
        {techStack.map((tech) => (
          <span 
            key={tech.name}
            className={`px-4 py-2 rounded-full text-sm font-medium border ${tech.color}`}
          >
            {tech.name}
          </span>
        ))}
      </motion.div>

      {renderUpdateSection()}
    </motion.div>
  )
}
