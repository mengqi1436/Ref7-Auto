import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  User, Github, RefreshCw, ExternalLink, Zap
} from 'lucide-react'
import logo from '../assets/logo.png'

interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  error?: string
}

export default function About() {
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [currentVersion, setCurrentVersion] = useState('--')
  const githubUrl = 'https://github.com/mengqi1436/Ref7-Auto'

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then((version) => {
      if (version) setCurrentVersion(version)
    })
  }, [])

  const handleCheckUpdate = async () => {
    setChecking(true)
    setUpdateInfo(null)
    
    try {
      const result = await window.electronAPI?.checkForUpdates?.()
      if (result) {
        setUpdateInfo(result)
      } else {
        setUpdateInfo({
          hasUpdate: false,
          currentVersion,
          error: '检查更新失败，请稍后重试'
        })
      }
    } catch (error) {
      setUpdateInfo({
        hasUpdate: false,
        currentVersion,
        error: '检查更新失败，请检查网络连接'
      })
    } finally {
      setChecking(false)
    }
  }

  const handleOpenLink = async (url: string) => {
    try {
      await window.electronAPI?.openExternal?.(url)
    } catch {
      window.open(url, '_blank')
    }
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

      <motion.div className="flex flex-col items-center" variants={itemVariants}>
        <motion.button
          onClick={handleCheckUpdate}
          disabled={checking}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium shadow-neon disabled:opacity-70 cursor-pointer"
        >
          {checking ? (
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Zap size={20} />
            </motion.div>
          ) : (
            <RefreshCw size={20} />
          )}
          {checking ? '检测中...' : '检测更新'}
        </motion.button>

        {updateInfo && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-center"
          >
            {updateInfo.error ? (
              <p className="text-destructive text-sm">{updateInfo.error}</p>
            ) : updateInfo.hasUpdate ? (
              <div className="space-y-2">
                <p className="text-accent text-sm font-medium">
                  发现新版本: v{updateInfo.latestVersion}
                </p>
                <motion.button
                  onClick={() => updateInfo.releaseUrl && handleOpenLink(updateInfo.releaseUrl)}
                  whileHover={{ scale: 1.02 }}
                  className="text-primary text-sm flex items-center gap-1 hover:underline cursor-pointer mx-auto"
                >
                  前往下载 <ExternalLink size={12} />
                </motion.button>
              </div>
            ) : (
              <p className="text-emerald-500 text-sm font-medium">
                已是最新版本
              </p>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
