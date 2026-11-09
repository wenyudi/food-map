import Icon from './Icon'

export type TabKey = 'map' | 'list' | 'me'

type TabDef = Readonly<{ key: TabKey; icon: string; label: string }>

const TABS: readonly TabDef[] = [
  { key: 'map', icon: 'map', label: '地图' },
  { key: 'list', icon: 'format_list_bulleted', label: '清单' },
  { key: 'me', icon: 'person', label: '我的' },
]

type TabBarProps = Readonly<{
  active: TabKey
  onChange: (t: TabKey) => void
  /** 「记一笔」是一个动作，不是一个页面：打开全屏录入，关掉回到原处 */
  onCompose: () => void
  /** 圈友新记了几家（清单 Tab 上的小红点） */
  listBadge?: number
}>

/**
 * 全站唯一的底部导航：悬浮毛玻璃胶囊（地图 / 清单 / 我的）+ 右侧橙色「记一笔」圆钮。
 * 选中项背后有一块会滑动的高亮，图标从线性切实心。
 */
export default function TabBar({ active, onChange, onCompose, listBadge = 0 }: TabBarProps) {
  const idx = TABS.findIndex((t) => t.key === active)
  return (
    <nav className="absolute inset-x-0 bottom-0 z-tabbar px-4 pb-safe pointer-events-none">
      {/* 清单类页面：内容滚到导航前先渐隐，文字不透过毛玻璃；地图页不要这层 */}
      {active !== 'map' && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[5.25rem] bg-gradient-to-t from-surface via-surface/80 to-transparent" />}
      <div className="relative flex items-center gap-3 pointer-events-auto">
        <div className="glass !bg-white/90 relative flex-1 flex rounded-full p-1.5">
          {/* 滑动高亮：宽度 = 一格 */}
          <span
            aria-hidden
            className="absolute top-1.5 bottom-1.5 left-1.5 rounded-full bg-primary-soft transition-transform duration-500 ease-spring"
            style={{ width: `calc((100% - 0.75rem) / ${TABS.length})`, transform: `translateX(${idx * 100}%)` }}
          />
          {TABS.map((t) => {
            const on = active === t.key
            return (
              <button
                key={t.key}
                onClick={() => onChange(t.key)}
                aria-current={on ? 'page' : undefined}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-full press-sm transition-colors duration-300 ${
                  on ? 'text-primary' : 'text-on-surface-variant'
                }`}
              >
                <span className="relative flex">
                  <Icon name={t.icon} filled={on} className={`text-[23px] transition-transform duration-500 ease-spring ${on ? '-translate-y-px scale-110' : ''}`} />
                  {t.key === 'list' && listBadge > 0 && !on && (
                    <span aria-label={`${listBadge} 家有新记录`} className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold font-num flex items-center justify-center ring-2 ring-white animate-pop-in">
                      {listBadge}
                    </span>
                  )}
                </span>
                <span className={`text-[11px] leading-none ${on ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
              </button>
            )
          })}
        </div>
        <button onClick={onCompose} aria-label="记一笔" className="shrink-0 w-[60px] h-[60px] rounded-full bg-primary text-white flex items-center justify-center shadow-glow press">
          <Icon name="edit" filled className="text-[27px]" />
        </button>
      </div>
    </nav>
  )
}
