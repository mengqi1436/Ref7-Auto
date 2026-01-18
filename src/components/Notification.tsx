import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

export type NotificationType = 'success' | 'error' | 'info'

export interface NotificationItem {
  id: string
  type: NotificationType
  message: string
  timestamp: number
}

interface NotificationProps {
  notifications: NotificationItem[]
  onDismiss: (id: string) => void
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info
}

const colorMap = {
  success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500',
  error: 'bg-destructive/10 border-destructive/30 text-destructive',
  info: 'bg-primary/10 border-primary/30 text-primary'
}

export default function Notification({ notifications, onDismiss }: NotificationProps) {
  return (
    <div className="fixed top-20 right-6 z-50 space-y-3 max-w-sm">
      <AnimatePresence>
        {notifications.map((notification) => {
          const Icon = iconMap[notification.type]
          return (
            <NotificationCard
              key={notification.id}
              notification={notification}
              Icon={Icon}
              colorClass={colorMap[notification.type]}
              onDismiss={onDismiss}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}

function NotificationCard({
  notification,
  Icon,
  colorClass,
  onDismiss
}: {
  notification: NotificationItem
  Icon: typeof CheckCircle
  colorClass: string
  onDismiss: (id: string) => void
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notification.id)
    }, 5000)

    return () => clearTimeout(timer)
  }, [notification.id, onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-sm ${colorClass}`}
    >
      <Icon size={20} className="flex-shrink-0 mt-0.5" />
      <p className="flex-1 text-sm font-medium text-foreground">{notification.message}</p>
      <button
        onClick={() => onDismiss(notification.id)}
        className="flex-shrink-0 p-1 rounded-lg hover:bg-black/10 transition-colors cursor-pointer"
      >
        <X size={16} />
      </button>
    </motion.div>
  )
}
