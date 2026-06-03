type StatTileProps = Readonly<{
  value: string
  label: string
  /** 数字颜色（tailwind 文本类），如 text-primary / text-accent / text-green-accent */
  color?: string
  className?: string
}>

/** 顶部统计小卡：大数字 + 小标签 */
export default function StatTile({ value, label, color = 'text-primary', className = '' }: StatTileProps) {
  return (
    <div
      className={`snap-start shrink-0 flex-1 min-w-[70px] bg-white rounded-xl border-2 border-on-surface shadow-sticker-sm p-2 flex flex-col items-center justify-center ${className}`}
    >
      <span className={`font-num font-bold text-xl leading-none ${color}`}>{value}</span>
      <span className="font-label font-bold text-[10px] text-on-surface mt-1 whitespace-nowrap">{label}</span>
    </div>
  )
}
