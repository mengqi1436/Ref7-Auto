import { motion } from 'framer-motion'
import { Users, CheckCircle, Clock, AlertTriangle, Activity, ArrowRight, Mail, Zap } from 'lucide-react'
import type { Account, LogEntry, EmailType, Page } from '../types'

interface DashboardProps {
  accounts: Account[]
  logs: LogEntry[]
  isRegistering: boolean
  onNavigate: (page: Page, emailType?: EmailType) => void
}

export default function Dashboard({ accounts, logs, isRegistering, onNavigate }: DashboardProps) {
  const activeCount = accounts.filter(a => a.status === 'active').length
  const pendingCount = accounts.filter(a => a.status === 'pending').length
  const invalidCount = accounts.filter(a => a.status === 'invalid').length

  const activeRate = accounts.length > 0 
    ? ((activeCount / accounts.length) * 100).toFixed(1) + '%' 
    : '0%'

  const stats = [
    { 
      label: '总账户数', 
      value: accounts.length, 
      icon: Users,
      trend: `共 ${accounts.length} 个`,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20'
    },
    { 
      label: '有效账户', 
      value: activeCount, 
      icon: CheckCircle, 
      trend: activeRate,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20'
    },
    { 
      label: '待验证', 
      value: pendingCount, 
      icon: Clock, 
      trend: pendingCount > 0 ? '需处理' : '无待处理',
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      borderColor: 'border-accent/20'
    },
    { 
      label: '失效账户', 
      value: invalidCount, 
      icon: AlertTriangle, 
      trend: invalidCount > 0 ? '需关注' : '状态良好',
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      borderColor: 'border-destructive/20'
    },
  ]

  const recentLogs = logs.slice(-8).reverse()

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  }

  return (
    <div className="space-y-8 h-full">
      {/* 头部 */}
      <motion.div 
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">控制</span>面板
          </h2>
          <p className="text-lg text-muted-foreground mt-1">欢迎回来，这里是您的注册任务概览</p>
        </div>
        {isRegistering && (
          <motion.div 
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent/10 text-accent border border-accent/30"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Zap size={18} />
            </motion.div>
            <span className="text-base font-medium">任务运行中</span>
          </motion.div>
        )}
      </motion.div>

      {/* 统计卡片 */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <motion.div 
              key={stat.label}
              variants={itemVariants}
              whileHover={{ scale: 1.02, y: -2 }}
              transition={{ type: 'spring', stiffness: 400 }}
              className={`relative overflow-hidden rounded-2xl border ${stat.borderColor} bg-card p-6 cursor-pointer group`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-3 text-4xl font-bold tracking-tight">{stat.value}</p>
                </div>
                <motion.div 
                  className={`p-3.5 rounded-xl ${stat.bgColor} ${stat.color}`}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <Icon size={26} />
                </motion.div>
              </div>
              <div className="mt-4 flex items-center text-sm text-muted-foreground">
                <span className={`${stat.color} font-medium`}>{stat.trend}</span>
              </div>
              <div className={`absolute inset-0 ${stat.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10`} />
            </motion.div>
          )
        })}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 实时日志 */}
        <motion.div 
          className="lg:col-span-2 rounded-2xl border border-border/50 bg-card overflow-hidden"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-secondary/30">
            <div className="flex items-center gap-3">
              <motion.div
                animate={isRegistering ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Activity className={isRegistering ? 'text-accent' : 'text-muted-foreground'} size={20} />
              </motion.div>
              <h3 className="font-semibold text-lg">实时运行日志</h3>
            </div>
            <span className="text-sm text-muted-foreground font-mono bg-secondary px-3 py-1 rounded-lg">
              LIVE
            </span>
          </div>
          <div className="p-0 overflow-auto max-h-[350px]">
            {recentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Activity className="mb-4 opacity-20" size={52} />
                <p className="text-lg">暂无日志记录</p>
                <p className="text-base mt-2 opacity-60">开始注册任务后将在此显示日志</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentLogs.map((log, index) => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-start gap-4 px-6 py-3.5 text-base hover:bg-secondary/30 transition-colors"
                  >
                    <span className="font-mono text-sm text-muted-foreground mt-0.5 min-w-[85px]">
                      {log.timestamp}
                    </span>
                    <span className={`flex-1 break-all ${
                      log.type === 'error' ? 'text-destructive' :
                      log.type === 'success' ? 'text-emerald-500' :
                      log.type === 'warning' ? 'text-accent' :
                      'text-foreground'
                    }`}>
                      {log.message}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* 快速操作 */}
        <motion.div 
          className="space-y-5"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="rounded-2xl border border-border/50 bg-card p-6">
            <h3 className="font-semibold text-lg mb-5">快捷入口</h3>
            <div className="space-y-3">
              <motion.button 
                onClick={() => onNavigate('register', 'tempmail_plus')}
                whileHover={{ scale: 1.02, x: 5 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background hover:border-primary/50 hover:bg-primary/5 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <Mail size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-base">TempMail+ 注册</p>
                    <p className="text-sm text-muted-foreground">临时邮箱服务</p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </motion.button>
              
              <motion.button 
                onClick={() => onNavigate('register', 'imap')}
                whileHover={{ scale: 1.02, x: 5 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background hover:border-accent/50 hover:bg-accent/5 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                    <Mail size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-base">IMAP 邮箱注册</p>
                    <p className="text-sm text-muted-foreground">使用自有域名</p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-muted-foreground group-hover:text-accent group-hover:translate-x-1 transition-all" />
              </motion.button>
            </div>
          </div>

          <motion.div 
            className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6"
            whileHover={{ scale: 1.01 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Zap className="text-primary" size={20} />
              <h3 className="font-semibold text-lg text-primary">专业提示</h3>
            </div>
            <p className="text-base text-muted-foreground leading-relaxed">
              建议开启"显示浏览器窗口"选项进行首次测试，以确保自动化流程与当前网络环境兼容。
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
