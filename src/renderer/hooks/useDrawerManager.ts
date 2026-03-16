import { useEffect, useState } from 'react'

interface UseDrawerOptions {
  isOpen: boolean
  onClose: () => void
  /** 传入当前选中的数据 ID，用于保持动画期间的快照 */
  activeId?: string | null
}

/**
 * Drawer 状态与生命周期管理 Hook
 * 
 * 功能：
 * - 锁定底层滚动（防止滚动穿透）
 * - ESC 键关闭
 * - 保持关闭动画期间的数据快照（防止内容突然消失）
 */
export function useDrawerManager({ isOpen, onClose, activeId }: UseDrawerOptions) {
  // 用于在关闭动画期间保留数据，防止内容突然消失
  const [snapshotId, setSnapshotId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && activeId) {
      setSnapshotId(activeId)
    }
  }, [isOpen, activeId])

  useEffect(() => {
    // 锁定底层滚动
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    // 监听 ESC 键关闭
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return { snapshotId }
}
