import type { ReactNode } from 'react'

type EmptyStateProps = Readonly<{
  emoji: string
  title: string
  desc?: ReactNode
  /** 主操作（按钮），可空 */
  action?: ReactNode
  /** 次操作（文字链接），可空 */
  extra?: ReactNode
  /** 浮在地图上时用白卡托底 */
  card?: boolean
}>

/** 空状态 / 出错态：漂浮的大 emoji + 标题 + 说明 + 操作。地图页、列表页共用 */
export default function EmptyState({ emoji, title, desc, action, extra, card = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center animate-fade-up ${card ? 'card px-7 py-8 max-w-[300px]' : 'py-16 px-6'}`}>
      <div className="relative mb-4">
        <span className="absolute inset-x-2 -bottom-1 h-3 rounded-full bg-on-surface/10 blur-[6px]" aria-hidden />
        <div className="relative text-[56px] leading-none animate-bob">{emoji}</div>
      </div>
      <div className="text-xl font-bold tracking-tight mb-1.5">{title}</div>
      {desc && <div className="text-sm text-on-surface-variant leading-relaxed text-balance">{desc}</div>}
      {(action || extra) && (
        <div className="flex flex-col items-center gap-3 mt-5">
          {action}
          {extra}
        </div>
      )}
    </div>
  )
}
