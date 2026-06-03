import type { ReactNode } from 'react'
import Icon from './Icon'
import Wordmark from './Wordmark'

type TopBarProps = Readonly<{
  /** 内页：显示页面标题代替「吃了么」字标 */
  title?: string
  subtitle?: string
  /** 右侧动作区（头像 / 齿轮 / 铃铛…），由各页传入 */
  right?: ReactNode
}>

/** 共享顶栏：首页显示吃了么字标；内页传 title 则以页面标题代替 —— 全站一致 */
export default function TopBar({ title, subtitle, right }: TopBarProps) {
  return (
    <header className="sticky top-0 w-full z-40 flex justify-between items-center px-4 py-3 bg-surface border-b-2 border-on-surface shadow-[0_4px_0_0_rgba(61,43,26,1)]">
      <div className="flex items-center gap-2 min-w-0">
        {title ? (
          <div className="flex flex-col min-w-0">
            <h1 className="font-headline text-2xl text-on-surface leading-none">{title}</h1>
            {subtitle && (
              <span className="text-[11px] font-bold text-on-surface-variant truncate mt-1">{subtitle}</span>
            )}
          </div>
        ) : (
          <>
            <Icon name="restaurant" className="text-primary text-2xl shrink-0" />
            <div className="flex flex-col min-w-0">
              <Wordmark className="text-xl" />
              {subtitle && (
                <span className="text-[11px] font-bold text-on-surface-variant truncate">{subtitle}</span>
              )}
            </div>
          </>
        )}
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </header>
  )
}

type AvatarProps = Readonly<{ emoji?: string; onClick?: () => void }>

/** 圆形贴纸头像（金黄底 + emoji），TopBar 右侧常用 */
export function Avatar({ emoji = '😋', onClick }: AvatarProps) {
  return (
    <button
      onClick={onClick}
      className="w-10 h-10 rounded-full border-2 border-on-surface bg-accent flex items-center justify-center shadow-sticker text-xl press shrink-0"
    >
      {emoji}
    </button>
  )
}

type IconBtnProps = Readonly<{ icon: string; onClick?: () => void }>

/** 圆形贴纸图标按钮（白底），TopBar 右侧用于齿轮/铃铛/搜索 */
export function IconBtn({ icon, onClick }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      className="w-10 h-10 rounded-full border-2 border-on-surface bg-white flex items-center justify-center shadow-sticker-sm press-sm text-on-surface shrink-0"
    >
      <Icon name={icon} className="text-xl" />
    </button>
  )
}
