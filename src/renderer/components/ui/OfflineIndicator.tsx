/**
 * 离线状态指示器组件
 * 
 * 功能：
 * - 显示在线/离线状态
 * - 显示待处理操作数量
 * - 提供手动同步按钮
 */

import { useOfflineStatus } from '../../hooks/useOfflineMode'

export function OfflineIndicator() {
  const { isOnline, pendingCount, retrySync, clearPending } = useOfflineStatus()

  // 只在离线或有待处理操作时显示
  if (isOnline && pendingCount === 0) {
    return null
  }

  return (
    <div
      className={`
        fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg
        transition-all duration-300
        ${isOnline 
          ? 'bg-blue-50 border border-blue-200 text-blue-800' 
          : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
        }
      `}
    >
      {/* 状态图标 */}
      <div className="flex items-center gap-2">
        {isOnline ? (
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
        )}
        
        <span className="font-medium">
          {isOnline ? '已恢复连接' : '离线模式'}
        </span>
      </div>

      {/* 待处理操作数量 */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full">
            {pendingCount} 个待同步
          </span>
          
          <button
            onClick={() => retrySync()}
            className="px-2 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            立即同步
          </button>
          
          <button
            onClick={() => clearPending()}
            className="px-2 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition-colors"
          >
            忽略
          </button>
        </div>
      )}

      {/* 自动消失提示（仅离线时） */}
      {!isOnline && pendingCount === 0 && (
        <span className="text-sm text-yellow-700">
          操作将在恢复连接后自动同步
        </span>
      )}
    </div>
  )
}
