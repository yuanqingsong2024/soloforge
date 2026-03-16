import React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
// Layout 组件属性
interface LayoutProps {
  children: React.ReactNode
}
// 主布局组件
export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
      {/* 侧边栏 - 移动端隐藏 */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <Topbar />
        {/* 页面内容 - 响应式内边距 */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
