import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, Download, Upload, Trash2, Eye, EyeOff,
  ChevronLeft, ChevronRight, Copy, Check, Key, X, RefreshCw
} from 'lucide-react'
import type { Account } from '../types'

interface AccountListProps {
  accounts: Account[]
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>
  onRefreshAccount?: (account: Account) => void
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

export default function AccountList({ accounts, setAccounts, onRefreshAccount }: AccountListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({})
  const [copiedField, setCopiedField] = useState<{ id: number; field: 'password' | 'apiKey' | 'refApiKey' } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; ids: number[]; isSingle?: boolean }>({
    isOpen: false,
    ids: [],
    isSingle: false
  })
  const [importResult, setImportResult] = useState<{
    isOpen: boolean
    success: boolean
    message: string
    details?: string
  }>({ isOpen: false, success: false, message: '' })

  const itemsPerPage = 10

  const filteredAccounts = useMemo(() => 
    accounts.filter(account => account.email.toLowerCase().includes(searchTerm.toLowerCase())),
    [accounts, searchTerm]
  )

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredAccounts.length / itemsPerPage)), [filteredAccounts.length])
  
  const paginatedAccounts = useMemo(() => 
    filteredAccounts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredAccounts, currentPage]
  )

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => 
      prev.length === paginatedAccounts.length ? [] : paginatedAccounts.map(a => a.id)
    )
  }, [paginatedAccounts])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }, [])

  const togglePassword = useCallback((id: number) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    const ids = deleteModal.ids
    if (ids.length === 0) return
    
    try {
      await window.electronAPI?.deleteAccounts?.(ids)
    } catch (error) {
      console.error('删除账户失败:', error)
    }
    setAccounts(prev => prev.filter(a => !ids.includes(a.id)))
    setSelectedIds(prev => prev.filter(id => !ids.includes(id)))
  }, [deleteModal.ids, setAccounts])

  const handleDelete = useCallback(() => {
    if (selectedIds.length === 0) return
    setDeleteModal({ isOpen: true, ids: selectedIds, isSingle: false })
  }, [selectedIds])

  const handleSingleDelete = useCallback((id: number) => {
    setDeleteModal({ isOpen: true, ids: [id], isSingle: true })
  }, [])

  const handleCopy = useCallback((account: Account, field: 'password' | 'apiKey' | 'refApiKey') => {
    const value = field === 'password' ? account.password : field === 'apiKey' ? account.apiKey : account.refApiKey
    if (!value) return
    navigator.clipboard.writeText(value)
    setCopiedField({ id: account.id, field })
    setTimeout(() => setCopiedField(null), 2000)
  }, [])

  const handleExport = useCallback(async () => {
    try {
      await window.electronAPI?.exportAccounts?.()
    } catch {
      const blob = new Blob([JSON.stringify(accounts, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'api.json'
      link.click()
      URL.revokeObjectURL(url)
    }
  }, [accounts])

  const handleImport = useCallback(async () => {
    try {
      const result = await window.electronAPI?.importAccounts?.()
      if (!result) return

      if (result.error) {
        setImportResult({ isOpen: true, success: false, message: '导入失败', details: result.error })
        return
      }

      const updatedAccounts = await window.electronAPI?.getAccounts?.()
      if (updatedAccounts) setAccounts(updatedAccounts)

      const details = [
        result.imported && result.imported > 0 ? `成功导入 ${result.imported} 个账户` : '',
        result.skipped && result.skipped > 0 ? `跳过 ${result.skipped} 个重复账户` : '',
        result.errors?.length ? `${result.errors.length} 个错误` : ''
      ].filter(Boolean).join('，')

      setImportResult({
        isOpen: true,
        success: (result.imported ?? 0) > 0,
        message: (result.imported ?? 0) > 0 ? '导入成功' : '无新账户导入',
        details
      })
    } catch (error) {
      setImportResult({
        isOpen: true,
        success: false,
        message: '导入失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }, [setAccounts])

  const formatEmail = useCallback((email: string) => {
    if (email.length <= 10) return email
    const [local, domain] = email.split('@')
    if (!domain || local.length <= 4) return email
    return `${local.slice(0, 4)}****@${domain}`
  }, [])

  const paginationText = useMemo(() => {
    if (filteredAccounts.length === 0) return '暂无数据'
    const start = (currentPage - 1) * itemsPerPage + 1
    const end = Math.min(currentPage * itemsPerPage, filteredAccounts.length)
    return `显示 ${start}-${end} / 共 ${filteredAccounts.length} 条`
  }, [filteredAccounts.length, currentPage])

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
            onClick={handleImport}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/50 bg-background hover:bg-secondary transition-colors text-base font-medium cursor-pointer"
          >
            <Upload size={18} />
            导入
          </motion.button>
          
          <motion.button 
            onClick={handleExport}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/50 bg-background hover:bg-secondary transition-colors text-base font-medium cursor-pointer"
          >
            <Download size={18} />
            导出
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

      <motion.div 
        className="rounded-2xl border border-border/50 bg-card overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead className="bg-secondary/50 text-muted-foreground font-medium">
              <tr>
                <th className="px-4 py-4 text-center w-12">
                  <input
                    type="checkbox"
                    checked={paginatedAccounts.length > 0 && selectedIds.length === paginatedAccounts.length}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                </th>
                <th className="px-4 py-4 text-center">邮箱账户</th>
                <th className="px-4 py-4 text-center">密码</th>
                <th className="px-4 py-4 text-center">context7 API</th>
                <th className="px-4 py-4 text-center">Ref API</th>
                <th className="px-4 py-4 text-center whitespace-nowrap">注册时间</th>
                <th className="px-4 py-4 text-center whitespace-nowrap">操作</th>
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
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(account.id)}
                        onChange={() => toggleSelect(account.id)}
                        className="w-5 h-5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-4 font-medium font-mono text-center" title={account.email}>
                      {formatEmail(account.email)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-muted-foreground">
                          {showPasswords[account.id] ? account.password : '••••••••'}
                        </span>
                        <button
                          onClick={() => togglePassword(account.id)}
                          className="p-1 hover:bg-secondary rounded text-muted-foreground transition-colors cursor-pointer"
                        >
                          {showPasswords[account.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <motion.button
                          onClick={() => handleCopy(account, 'password')}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-1 hover:bg-secondary rounded transition-colors cursor-pointer"
                          title="复制密码"
                        >
                          {copiedField?.id === account.id && copiedField.field === 'password' ? (
                            <Check size={14} className="text-emerald-500" />
                          ) : (
                            <Copy size={14} className="text-muted-foreground" />
                          )}
                        </motion.button>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {account.apiKey ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Key size={14} className="text-emerald-500 shrink-0" />
                          <span className="font-mono text-sm text-muted-foreground">
                            {account.apiKey.slice(0, 3)}****{account.apiKey.slice(-3)}
                          </span>
                          <motion.button
                            onClick={() => handleCopy(account, 'apiKey')}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-1 hover:bg-secondary rounded transition-colors cursor-pointer"
                            title="复制 API Key"
                          >
                            {copiedField?.id === account.id && copiedField.field === 'apiKey' ? (
                              <Check size={14} className="text-emerald-500" />
                            ) : (
                              <Copy size={14} className="text-muted-foreground" />
                            )}
                          </motion.button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {account.refApiKey ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Key size={14} className="text-emerald-500 shrink-0" />
                          <span className="font-mono text-sm text-muted-foreground">
                            {account.refApiKey.slice(0, 3)}****{account.refApiKey.slice(-3)}
                          </span>
                          <motion.button
                            onClick={() => handleCopy(account, 'refApiKey')}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-1 hover:bg-secondary rounded transition-colors cursor-pointer"
                            title="复制 Ref API"
                          >
                            {copiedField?.id === account.id && copiedField.field === 'refApiKey' ? (
                              <Check size={14} className="text-emerald-500" />
                            ) : (
                              <Copy size={14} className="text-muted-foreground" />
                            )}
                          </motion.button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground text-center whitespace-nowrap">
                      {new Date(account.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <motion.button
                          onClick={() => onRefreshAccount?.(account)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-1.5 rounded text-primary bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
                          title="注册 Ref API"
                        >
                          <RefreshCw size={16} />
                        </motion.button>
                        <motion.button
                          onClick={() => handleSingleDelete(account.id)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-1.5 rounded text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors cursor-pointer"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </motion.button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="px-6 py-4 border-t border-border/50 bg-secondary/30 flex items-center justify-between">
          <p className="text-base text-muted-foreground">{paginationText}</p>
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

      <AnimatePresence>
        {importResult.isOpen && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => setImportResult({ ...importResult, isOpen: false })} 
            />
            <motion.div 
              className="relative bg-card border border-border/50 rounded-2xl shadow-2xl p-6 w-full max-w-md"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <button 
                onClick={() => setImportResult({ ...importResult, isOpen: false })}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                <X size={18} />
              </button>
              
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-full ${
                  importResult.success 
                    ? 'bg-emerald-500/10 text-emerald-500' 
                    : 'bg-amber-500/10 text-amber-500'
                }`}>
                  {importResult.success ? <Check size={24} /> : <Upload size={24} />}
                </div>
                <h3 className="text-xl font-semibold">{importResult.message}</h3>
              </div>
              
              {importResult.details && (
                <p className="text-base text-muted-foreground mb-6">{importResult.details}</p>
              )}
              
              <div className="flex justify-end">
                <motion.button
                  onClick={() => setImportResult({ ...importResult, isOpen: false })}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-base font-medium cursor-pointer"
                >
                  确定
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
