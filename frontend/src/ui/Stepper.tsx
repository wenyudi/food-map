type Props = Readonly<{
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  unit?: string
  /** 撑满容器（编辑弹窗里和「和谁」等宽对齐用）；默认内容宽 */
  full?: boolean
}>

/** ± 数字步进器（记一笔人数 / 编辑弹窗人数共用，默认上限 30） */
export default function Stepper({ value, onChange, min = 1, max = 30, unit = '人', full = false }: Props) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))
  return (
    <div className={`${full ? 'flex w-full justify-between' : 'inline-flex gap-3'} items-center rounded-2xl bg-surface-2 p-1.5`}>
      <button
        type="button"
        aria-label="减一"
        onMouseDown={(e) => e.preventDefault()}
        onClick={dec}
        disabled={value <= min}
        className="w-9 h-9 rounded-full bg-white shadow-soft text-lg font-semibold leading-none press-sm disabled:opacity-40"
      >
        −
      </button>
      <span key={value} className="min-w-[3ch] text-center font-semibold font-num tabular-nums animate-pop-in">
        {value}
        {unit}
      </span>
      <button
        type="button"
        aria-label="加一"
        onMouseDown={(e) => e.preventDefault()}
        onClick={inc}
        disabled={value >= max}
        className="w-9 h-9 rounded-full bg-primary text-white shadow-glow text-lg font-semibold leading-none press-sm disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}
