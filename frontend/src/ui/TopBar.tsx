import type { ReactNode } from 'react'
import Icon from './Icon'
import Wordmark from './Wordmark'

type TopBarProps = Readonly<{
  /** 内页大标题；不传则显示「吃了么」品牌字标（首页/地图） */
  title?: string
  /** 副标题（标题下方小字） */
  subtitle?: string
  /** 前导图标（Material Symbol），默认餐具；传 null 可隐藏 */
  icon?: string | null
  /** 右侧动作区（头像 / 齿轮 / 铃铛…） */
  right?: ReactNode
  /** 传了则右侧显示返回按钮（替代 right）—— 用于子页面 */
  onBack?: () => void
}>

/**
 * 全站统一顶栏：[前导图标] [大标题 / 吃了么字标 + 副标题] …… [右侧动作 / 返回钮]
 * 首页传 wordmark（不传 title）；内页传 title；子页面传 onBack 让右侧变返回钮。
 */
export default function TopBar({ title, subtitle, icon = 'restaurant', right, onBack }: TopBarProps) {
  return (
    <header className="sticky top-0 w-full z-40 flex justify-between items-center px-4 py-3 bg-surface border-b-2 border-on-surface shadow-[0_4px_0_0_rgba(61,43,26,1)]">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <Icon name={icon} className="text-primary text-2xl shrink-0" />}
        <div className="flex flex-col min-w-0">
          {title ? (
            <h1 className="font-headline text-2xl text-on-surface leading-none">{title}</h1>
          ) : (
            <Wordmark className="text-xl" />
          )}
          {subtitle && (
            <span className="text-[11px] font-bold text-on-surface-variant truncate mt-1">{subtitle}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="返回"
            className="w-10 h-10 rounded-full border-2 border-on-surface bg-white flex items-center justify-center shadow-sticker-sm press-sm text-on-surface"
          >
            <Icon name="arrow_back" className="text-xl" />
          </button>
        ) : (
          right
        )}
      </div>
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
