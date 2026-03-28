import { useState, useCallback, type Dispatch, type SetStateAction } from 'react'
import type { LogEntry } from '../types'
import type { NotificationItem, NotificationType } from '../components/Notification'

export function useAppNotifications(setLogs: Dispatch<SetStateAction<LogEntry[]>>) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const addNotification = useCallback(
    (type: NotificationType, message: string, options?: { skipLog?: boolean }) => {
      const notification: NotificationItem = {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        type,
        message,
        timestamp: Date.now()
      }
      setNotifications((prev) => [...prev.slice(-4), notification])

      if (!options?.skipLog) {
        setLogs((prev) => [
          ...prev,
          {
            id: notification.id,
            timestamp: new Date().toLocaleTimeString(),
            type: type as LogEntry['type'],
            message
          }
        ])
      }
    },
    [setLogs]
  )

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  return { notifications, addNotification, dismissNotification }
}
