import { useContext } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { PresenceLeaving } from './presenceContext'
import { useDragDismiss } from './useDragDismiss'
import { useBackClose } from '../lib/useBackClose'

type SheetShellProps = Readonly<{
  children: ReactNode
  onClose: () => void
  className?: string
}>

/**
 * 底部抽屉外壳：遮罩淡入 + 面板滑上；拖把手下滑 / 手机返回键 / Esc / 点遮罩 / ✕ 都能关，叠开时只关最上面那层。
 * 渲染到 body（portal），叠开的抽屉互不受父级 transform 影响。
 * 包在 <Presence> 里时，关闭会播滑下 + 淡出的离场动画。
 */
export default function SheetShell({ children, onClose, className = '' }: SheetShellProps) {
  const leaving = useContext(PresenceLeaving)
  const { dragY, dragging, handlers } = useDragDismiss(onClose, leaving)
  useBackClose(!leaving, onClose)

  return createPortal(
    <div className={`fixed inset-0 z-sheet flex items-end justify-center ${leaving ? 'pointer-events-none' : ''}`}>
      <div
        className={`absolute inset-0 bg-[#24190f]/45 ${leaving ? 'animate-fade-out' : 'animate-fade-in'}`}
        style={{ opacity: dragY ? Math.max(0.2, 1 - dragY / 500) : undefined }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full max-w-[440px] max-h-[90dvh] flex flex-col bg-surface rounded-t-[24px] shadow-sheet ${
          leaving ? 'animate-sheet-down' : 'animate-sheet-up'
        }`}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform .45s cubic-bezier(.16,1,.3,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 把手区：可下拉关闭 */}
        <div
          className="shrink-0 h-7 flex items-center justify-center cursor-grab touch-none"
          {...handlers}
        >
          <span className={`h-1.5 rounded-full bg-on-surface/20 transition-all duration-300 ${dragging ? 'w-14 bg-on-surface/35' : 'w-10'}`} />
        </div>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-3 right-3.5 z-20 w-8 h-8 rounded-full bg-surface-2 text-on-surface-variant flex items-center justify-center press-sm hover:text-on-surface"
        >
          <Icon name="close" className="text-[19px]" />
        </button>
        <div
          className={`min-h-0 overflow-y-auto overscroll-contain paper px-5 pt-1 ${className}`}
          style={{ paddingBottom: 'max(1.75rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
