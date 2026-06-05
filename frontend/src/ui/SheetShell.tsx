import type { ReactNode } from 'react'
import Icon from './Icon'

type SheetShellProps = Readonly<{
  children: ReactNode
  onClose: () => void
  className?: string
}>

/** 底部抽屉外壳：半透明遮罩 + 顶部把手 + 统一关闭按钮 + 贴纸上边框 */
export default function SheetShell({ children, onClose, className = '' }: SheetShellProps) {
  return (
    <div
      className="fixed inset-0 z-[1200] bg-on-surface/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-[440px] bg-surface rounded-t-2xl border-2 border-on-surface shadow-[0_-4px_0_0_rgba(61,43,26,1)] max-h-[88vh] overflow-y-auto p-4 animate-pop ${className}`}
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 统一关闭按钮：每个抽屉都有一致的退出方式（除了点遮罩 / 拖把手） */}
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full border-2 border-on-surface bg-white flex items-center justify-center press-sm shadow-sticker-sm"
        >
          <Icon name="close" className="text-lg" />
        </button>
        <div className="w-10 h-1.5 rounded-full bg-on-surface/30 mx-auto mb-3" />
        {children}
      </div>
    </div>
  )
}
