import Icon from './Icon'

export type TabKey = 'map' | 'list' | 'add' | 'me'

type TabDef = Readonly<{ key: TabKey; icon: string; label: string }>

const TABS: readonly TabDef[] = [
  { key: 'map', icon: 'map', label: '地图' },
  { key: 'list', icon: 'format_list_bulleted', label: '列表' },
  { key: 'add', icon: 'edit', label: '记一笔' },
  { key: 'me', icon: 'person', label: '我的' },
]

type TabBarProps = Readonly<{
  active: TabKey
  onChange: (t: TabKey) => void
}>

/**
 * 共享底部导航 —— 全站唯一一份，标签固定 地图/列表/记一笔/我的。
 * 「记一笔」做成凸起的橙色圆钮；当前页用实心橙药丸高亮。
 * 这一份复用到所有页 → 从结构上根除 Stitch 逐屏出图的导航飘移。
 */
export default function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="relative w-full z-50 flex justify-around items-center px-2 py-3 bg-surface rounded-t-xl border-t-2 border-on-surface shadow-sticker-top pb-safe shrink-0">
      {TABS.map((t) =>
        t.key === 'add' ? (
          <div key={t.key} className="relative -top-6 w-16 flex justify-center">
            <button
              onClick={() => onChange('add')}
              className="w-14 h-14 bg-primary rounded-full border-[3px] border-on-surface shadow-sticker flex items-center justify-center text-white press z-10"
              aria-label="记一笔"
            >
              <Icon name="edit" className="text-3xl" />
            </button>
            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 font-label font-bold text-xs text-on-surface-variant whitespace-nowrap">
              {t.label}
            </span>
          </div>
        ) : active === t.key ? (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className="flex flex-col items-center justify-center bg-primary text-white rounded-lg border-2 border-on-surface px-4 py-1.5 shadow-sticker-sm press-sm"
          >
            <Icon name={t.icon} />
            <span className="font-label font-bold text-xs mt-0.5">{t.label}</span>
          </button>
        ) : (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className="flex flex-col items-center justify-center text-on-surface-variant px-3 py-1 press-sm"
          >
            <Icon name={t.icon} />
            <span className="font-label font-bold text-xs mt-0.5">{t.label}</span>
          </button>
        )
      )}
    </nav>
  )
}
