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
    <div
      className={`${full ? 'flex w-full justify-between' : 'inline-flex gap-3'} items-center rounded-xl border-2 border-on-surface bg-white px-2 py-1.5 shadow-sticker-sm`}
    >
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={dec} className="w-9 h-9 rounded-full border-2 border-on-surface bg-white text-lg font-bold leading-none press-sm">
        −
      </button>
      <span className="min-w-[3ch] text-center font-bold font-num">
        {value}
        {unit}
      </span>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={inc} className="w-9 h-9 rounded-full border-2 border-on-surface bg-accent text-lg font-bold leading-none press-sm">
        +
      </button>
    </div>
  )
}
