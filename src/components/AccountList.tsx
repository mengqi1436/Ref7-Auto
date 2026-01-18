import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  Download, 
  Trash2, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Copy,
  X
} from 'lucide-react'
import type { Account, AccountStatus } from '../types'

interface AccountListProps {
  accounts: Account[]
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>
}

function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message,
  confirmText = '确定',
  cancelText = '取消',
  variant = 'danger'
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary'
}) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div 
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div 
          className="relative bg-card border border-border/50 rounded-2xl shadow-2xl p-6 w-full max-w-md"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
        >
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-secondary text-muted-foreground cursor-pointer"
          >
            <X size={18} />
          </button>
          <h3 className="text-xl font-semibold mb-3">{title}</h3>
          <p className="text-base text-muted-foreground mb-6">{message}</p>
          <div className="flex justify-end gap-3">
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-5 py-2.5 rounded-xl border border-border/50 bg-background hover:bg-secondary transition-colors text-base font-medium cursor-pointer"
            >
              {cancelText}
            </motion.button>
            <motion.button
              onClick={() => { onConfirm(); onClose() }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`px-5 py-2.5 rounded-xl text-base font-medium transition-colors cursor-pointer ${
                variant === 'danger' 
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {confirmText}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function DropdownMenu({
  isOpen,
  onClose,
  onCopy,
  onStatusChange,
  onDelete,
  currentStatus
}: {
  isOpen: boolean
  onClose: () => void
  onCopy: () => void
  onStatusChange: (status: AccountStatus) => void
  onDelete: () => void
  currentStatus: AccountStatus
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const statusOptions: { value: AccountStatus; label: string; icon: typeof CheckCircle }[] = [
    { value: 'active', label: '有效', icon: CheckCircle },
    { value: 'pending', label: '待验证', icon: Clock },
    { value: 'invalid', label: '失效', icon: AlertTriangle },
  ]

  return (
    <motion.div 
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: -5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -5 }}
      className="absolute right-0 top-full mt-2 z-50 w-52 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden"
    >
      <button
        onClick={() => { onCopy(); onClose() }}
        className="w-full flex items-center gap-3 px-4 py-3 text-base hover:bg-secondary transition-colors cursor-pointer"
      >
        <Copy size={16} />
        复制账户信息
      </button>
      <div className="border-t border-border/50">
        <p className="px-4 py-2 text-sm text-muted-foreground">修改状态</p>
        {statusOptions.map((opt) => {
          const Icon = opt.icon
          const isActive = currentStatus === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => { onStatusChange(opt.value); onClose() }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-base hover:bg-secondary transition-colors cursor-pointer ${
                isActive ? 'bg-secondary text-foreground' : ''
              }`}
            >
              <Icon size={16} />
              {opt.label}
              {isActive && <span className="ml-auto text-sm text-muted-foreground">当前</span>}
            </button>
          )
        })}
      </div>
      <div className="border-t border-border/50">
        <button
          onClick={() => { onDelete(); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-3 text-base text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
        >
          <Trash2 size={16} />
          删除账户
        </button>
      </div>
    </motion.div>
  )
}

export default function AccountList({ accounts, setAccounts }: AccountListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; ids: number[]; isSingle?: boolean }>({
    isOpen: false,
    ids: [],
    isSingle: false
  })

  const itemsPerPage = 10

  const filteredAccounts = accounts.filter(account => 
    account.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / itemsPerPage))
  const paginatedAccounts = filteredAccounts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedAccounts.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(paginatedAccounts.map(a => a.id))
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const togglePassword = (id: number) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleDeleteConfirm = async () => {
    const ids = deleteModal.ids
    if (ids.length === 0) return
    
    try {
      await window.electronAPI?.deleteAccounts?.(ids)
    } catch (error) {
      console.error('删除账户失败:', error)
    }
    setAccounts(prev => prev.filter(a => !ids.includes(a.id)))
    setSelectedIds(prev => prev.filter(id => !ids.includes(id)))
  }

  const handleDelete = () => {
    if (selectedIds.length === 0) return
    setDeleteModal({ isOpen: true, ids: selectedIds, isSingle: false })
  }

  const handleSingleDelete = (id: number) => {
    setDeleteModal({ isOpen: true, ids: [id], isSingle: true })
  }

  const handleStatusChange = async (id: number, status: AccountStatus) => {
    try {
      await window.electronAPI?.updateAccountStatus?.(id, status)
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    } catch (error) {
      console.error('更新账户状态失败:', error)
    }
  }

  const handleCopyAccount = (account: Account) => {
    const text = `邮箱: ${account.email}\n密码: ${account.password}`
    navigator.clipboard.writeText(text).catch(console.error)
  }

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      await window.electronAPI?.exportAccounts?.(format)
    } catch (error) {
      console.error('导出失败:', error)
      const data = format === 'json' 
        ? JSON.stringify(accounts, null, 2)
        : 'email,password,emailType,status,createdAt\n' + 
          accounts.map(a => `"${a.email}","${a.password}","${a.emailType}","${a.status}","${a.createdAt}"`).join('\n')
      
      const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `accounts.${format}`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const getStatusBadge = (status: AccountStatus) => {
    const config = {
      active: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20', label: '有效', Icon: CheckCircle },
      pending: { bg: 'bg-accent/10', text: 'text-accent', border: 'border-accent/20', label: '待验证', Icon: Clock },
      invalid: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/20', label: '失效', Icon: AlertTriangle }
    }
    const { bg, text, border, label, Icon } = config[status]
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${bg} ${text} ${border}`}>
        <Icon size={14} />
        {label}
      </span>
    )
  }

  const getPaginationText = () => {
    if (filteredAccounts.length === 0) return '暂无数据'
    const start = (currentPage - 1) * itemsPerPage + 1
    const end = Math.min(currentPage * itemsPerPage, filteredAccounts.length)
    return `显示 ${start}-${end} / 共 ${filteredAccounts.length} 条`
  }

  return (
    <div className="space-y-6">
      <motion.div 
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">账户</span>管理
          </h2>
          <p className="text-lg text-muted-foreground mt-1">查看和管理已注册的账户信息</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button 
            onClick={() => handleExport('csv')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/50 bg-background hover:bg-secondary transition-colors text-base font-medium cursor-pointer"
          >
            <Download size={18} />
            导出 CSV
          </motion.button>
          <motion.button 
            onClick={handleDelete}
            disabled={selectedIds.length === 0}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Trash2 size={18} />
            删除 {selectedIds.length > 0 && `(${selectedIds.length})`}
          </motion.button>
        </div>
      </motion.div>

      {/* 搜索栏 */}
      <motion.div 
        className="relative"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input
          type="text"
          placeholder="搜索邮箱地址..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
          className="w-full pl-12 pr-5 py-3.5 rounded-xl border border-border/50 bg-card text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
      </motion.div>

      {/* 表格 */}
      <motion.div 
        className="rounded-2xl border border-border/50 bg-card overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-base text-left">
            <thead className="bg-secondary/50 text-muted-foreground font-medium">
              <tr>
                <th className="px-6 py-4 w-14">
                  <input
                    type="checkbox"
                    checked={paginatedAccounts.length > 0 && selectedIds.length === paginatedAccounts.length}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                </th>
                <th className="px-6 py-4">邮箱账户</th>
                <th className="px-6 py-4">密码</th>
                <th className="px-6 py-4">类型</th>
                <th className="px-6 py-4">注册时间</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4 w-14"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-muted-foreground text-lg">
                    {searchTerm ? '未找到匹配的账户' : '暂无账户数据'}
                  </td>
                </tr>
              ) : (
                paginatedAccounts.map((account, index) => (
                  <motion.tr 
                    key={account.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={`group hover:bg-secondary/30 transition-colors ${
                      selectedIds.includes(account.id) ? 'bg-primary/5' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(account.id)}
                        onChange={() => toggleSelect(account.id)}
                        className="w-5 h-5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4 font-medium font-mono">{account.email}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 group/pass">
                        <span className="font-mono text-muted-foreground">
                          {showPasswords[account.id] ? account.password : '••••••••'}
                        </span>
                        <button
                          onClick={() => togglePassword(account.id)}
                          className="opacity-0 group-hover/pass:opacity-100 p-1.5 hover:bg-secondary rounded-lg text-muted-foreground transition-all cursor-pointer"
                        >
                          {showPasswords[account.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium ${
                        account.emailType === 'tempmail_plus' 
                          ? 'bg-primary/10 text-primary' 
                          : 'bg-accent/10 text-accent'
                      }`}>
                        {account.emailType === 'tempmail_plus' ? 'TempMail+' : 'IMAP'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {new Date(account.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(account.status)}</td>
                    <td className="px-6 py-4 relative">
                      <button 
                        onClick={() => setOpenMenuId(openMenuId === account.id ? null : account.id)}
                        className="p-2 hover:bg-secondary rounded-lg text-muted-foreground transition-colors cursor-pointer"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      <AnimatePresence>
                        {openMenuId === account.id && (
                          <DropdownMenu
                            isOpen={true}
                            onClose={() => setOpenMenuId(null)}
                            onCopy={() => handleCopyAccount(account)}
                            onStatusChange={(status) => handleStatusChange(account.id, status)}
                            onDelete={() => handleSingleDelete(account.id)}
                            currentStatus={account.status}
                          />
                        )}
                      </AnimatePresence>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* 分页 */}
        <div className="px-6 py-4 border-t border-border/50 bg-secondary/30 flex items-center justify-between">
          <p className="text-base text-muted-foreground">{getPaginationText()}</p>
          <div className="flex gap-2">
            <motion.button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2.5 rounded-xl border border-border/50 bg-background hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft size={18} />
            </motion.button>
            <motion.button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || filteredAccounts.length === 0}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2.5 rounded-xl border border-border/50 bg-background hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronRight size={18} />
            </motion.button>
          </div>
        </div>
      </motion.div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, ids: [], isSingle: false })}
        onConfirm={handleDeleteConfirm}
        title="确认删除"
        message={
          deleteModal.isSingle 
            ? '确定要删除这个账户吗？此操作不可撤销。'
            : `确定要删除选中的 ${deleteModal.ids.length} 个账户吗？此操作不可撤销。`
        }
        confirmText="删除"
        cancelText="取消"
        variant="danger"
      />
    </div>
  )
}
