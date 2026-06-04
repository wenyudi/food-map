import { useEffect, useRef } from 'react'

const ITEM = 32 // 每行高度
const ROWS = 3 // 可视行数（窄一点）
const H = ITEM * ROWS
const PAD = (H - ITEM) / 2 // 让首/尾项也能滚到正中

const pad2 = (n: number) => String(n).padStart(2, '0')
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

type Item = Readonly<{ v: string | number; label: string }>

/** 单列滚轮：CSS scroll-snap，停下吸附到正中并回调 */
function Column({ items, value, onChange }: { items: Item[]; value: string | number; onChange: (v: string | number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const lock = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const i = items.findIndex((it) => it.v === value)
    if (i < 0 || !ref.current) return
    lock.current = true
    ref.current.scrollTop = i * ITEM
    const t = window.setTimeout(() => (lock.current = false), 90)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items.length])

  function onScroll() {
    if (lock.current) return
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)))
      el.scrollTop = i * ITEM
      if (items[i].v !== value) onChange(items[i].v)
    }, 110)
  }

  return (
    <div className="relative flex-1 min-w-0" style={{ height: H }}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full overflow-y-auto snap-y snap-mandatory hide-scrollbar"
        style={{ paddingTop: PAD, paddingBottom: PAD }}
      >
        {items.map((it) => (
          <div
            key={it.v}
            style={{ height: ITEM }}
            className={`flex items-center justify-center snap-center font-bold whitespace-nowrap transition-all ${
              it.v === value ? 'text-on-surface text-base' : 'text-on-surface-variant/45 text-xs'
            }`}
          >
            {it.label}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 单列数字滚轮（如人数 1–N，复用 Column + 居中高亮带） */
export function NumberWheel({
  value,
  onChange,
  min = 1,
  max = 20,
  unit = '',
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  unit?: string
}) {
  const items: Item[] = range(min, max).map((v) => ({ v, label: `${v}${unit}` }))
  return (
    <div className="relative flex bg-white rounded-xl border-2 border-on-surface overflow-hidden">
      <div className="absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-[32px] rounded-lg bg-primary/10 border-2 border-primary/25 pointer-events-none" />
      <Column items={items} value={value} onChange={(v) => onChange(Number(v))} />
    </div>
  )
}

type Meal = '早' | '中' | '晚'

type Props = Readonly<{
  /** YYYY-MM-DD */
  value: string
  onChange: (v: string) => void
  meal: Meal
  onMealChange: (m: Meal) => void
}>

/** 滚轮日期 + 餐段（年 / 月 / 日 / 早中晚，四列，像闹钟 app 那样滚动） */
export default function DateTimeWheel({ value, onChange, meal, onMealChange }: Props) {
  const now = new Date()
  const valid = value && /^\d{4}-\d{2}-\d{2}/.test(value)
  const [y, m, d] = valid
    ? value.slice(0, 10).split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1, now.getDate()]

  const thisYear = now.getFullYear()
  const years = range(thisYear - 10, thisYear)
  const months = range(1, 12)
  const days = range(1, new Date(y, m, 0).getDate())

  function setDate(ny: number, nm: number, nd: number) {
    const cd = Math.min(nd, new Date(ny, nm, 0).getDate())
    onChange(`${ny}-${pad2(nm)}-${pad2(cd)}`)
  }

  const yItems: Item[] = years.map((v) => ({ v, label: v + '年' }))
  const mItems: Item[] = months.map((v) => ({ v, label: v + '月' }))
  const dItems: Item[] = days.map((v) => ({ v, label: v + '日' }))
  const mealItems: Item[] = [
    { v: '早', label: '🌅早' },
    { v: '中', label: '☀️中' },
    { v: '晚', label: '🌙晚' },
  ]

  return (
    <div className="relative flex bg-white rounded-xl border-2 border-on-surface overflow-hidden">
      {/* 正中高亮带 */}
      <div className="absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-[32px] rounded-lg bg-primary/10 border-2 border-primary/25 pointer-events-none" />
      <Column items={yItems} value={y} onChange={(v) => setDate(Number(v), m, d)} />
      <Column items={mItems} value={m} onChange={(v) => setDate(y, Number(v), d)} />
      <Column items={dItems} value={d} onChange={(v) => setDate(y, m, Number(v))} />
      <Column items={mealItems} value={meal} onChange={(v) => onMealChange(v as Meal)} />
    </div>
  )
}
