import { useEffect, useRef } from 'react'

const ITEM = 40 // 每行高度
const H = 200 // 可视高度（5 行）
const PAD = (H - ITEM) / 2 // 让首/尾项也能滚到正中

const pad2 = (n: number) => String(n).padStart(2, '0')
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

type ColumnProps = Readonly<{
  values: number[]
  value: number
  onChange: (v: number) => void
  suffix: string
}>

/** 单列滚轮：CSS scroll-snap 实现，停下时吸附到正中并回调 */
function Column({ values, value, onChange, suffix }: ColumnProps) {
  const ref = useRef<HTMLDivElement>(null)
  const lock = useRef(false) // 外部 value 变化导致的程序化滚动，不要反向触发 onChange
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const i = values.indexOf(value)
    if (i < 0 || !ref.current) return
    lock.current = true
    ref.current.scrollTop = i * ITEM
    const t = window.setTimeout(() => (lock.current = false), 90)
    return () => clearTimeout(t)
  }, [value, values])

  function onScroll() {
    if (lock.current) return
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM)))
      el.scrollTop = i * ITEM
      const v = values[i]
      if (v !== value) onChange(v)
    }, 110)
  }

  return (
    <div className="relative flex-1" style={{ height: H }}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full overflow-y-auto snap-y snap-mandatory hide-scrollbar"
        style={{ paddingTop: PAD, paddingBottom: PAD }}
      >
        {values.map((v) => (
          <div
            key={v}
            style={{ height: ITEM }}
            className={`flex items-center justify-center snap-center font-bold transition-all ${
              v === value ? 'text-on-surface text-xl' : 'text-on-surface-variant/50 text-base'
            }`}
          >
            {v}
            {suffix}
          </div>
        ))}
      </div>
    </div>
  )
}

type DateWheelProps = Readonly<{
  /** YYYY-MM-DD */
  value: string
  onChange: (v: string) => void
}>

/** 滚轮日期选择器（年/月/日，像闹钟 app 那样滚动调整） */
export default function DateWheel({ value, onChange }: DateWheelProps) {
  const now = new Date()
  const valid = value && /^\d{4}-\d{2}-\d{2}/.test(value)
  const [y, m, d] = valid
    ? value.slice(0, 10).split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1, now.getDate()]

  const thisYear = now.getFullYear()
  const years = range(thisYear - 3, thisYear)
  const months = range(1, 12)
  const daysInMonth = new Date(y, m, 0).getDate()
  const days = range(1, daysInMonth)

  function set(ny: number, nm: number, nd: number) {
    const dim = new Date(ny, nm, 0).getDate()
    const cd = Math.min(nd, dim)
    onChange(`${ny}-${pad2(nm)}-${pad2(cd)}`)
  }

  return (
    <div className="relative flex bg-white rounded-xl border-2 border-on-surface overflow-hidden">
      {/* 正中高亮带 */}
      <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-10 rounded-lg bg-primary/10 border-2 border-primary/25 pointer-events-none" />
      <Column values={years} value={y} onChange={(v) => set(v, m, d)} suffix="年" />
      <Column values={months} value={m} onChange={(v) => set(y, v, d)} suffix="月" />
      <Column values={days} value={d} onChange={(v) => set(y, m, v)} suffix="日" />
    </div>
  )
}
